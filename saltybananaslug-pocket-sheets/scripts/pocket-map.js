import { PocketTokenDrag } from "./pocket-movement.js";

const setText = (element, text) => { if (element.textContent !== text) element.textContent = text; };

/** A transparent viewport onto this client's native, permission-filtered canvas. */
export function renderPocketMap() {
  return `<div class="sbs-pocket-map-toolbar"><button type="button" data-action="map-center" aria-label="Center on me" title="Center on me and follow my token" aria-pressed="true"><i class="fa-solid fa-crosshairs" aria-hidden="true"></i><span>Center</span></button><select class="sbs-pocket-map-mode" aria-label="Map tap action" title="What tapping a token does"><option value="target">Target</option><option value="select">Select mine</option><option value="move">Move</option></select><button type="button" data-action="map-clear-targets" aria-label="Clear targets" title="Clear all targets">× <output class="sbs-pocket-map-target-count" aria-label="Target count" aria-live="polite">0</output></button></div><div class="sbs-pocket-map-viewport" role="group" aria-label="Live map; drag to pan, pinch to zoom, tap a token to target or select"><p class="sbs-pocket-map-message" role="status">Waiting for the map…</p></div><p class="sbs-pocket-map-note">Drag to look • Pinch to zoom • Tap to target</p>`;
}

export function mapTokenAt(canvas, point) {
  return [...(canvas?.tokens?.placeables ?? [])].reverse()
    .filter((t) => t.visible === true && !t.document.hidden)
    .sort((a, b) => (b.mesh?.zIndex ?? b.zIndex ?? 0) - (a.mesh?.zIndex ?? a.zIndex ?? 0))
    .find((t) => point.x >= t.x && point.y >= t.y && point.x < t.x + t.w && point.y < t.y + t.h) ?? null;
}

// Floating launchers only: never suppress sheet/dialog controls or notifications.
export class MapOverlayGuard {
  start(root) {
    this.root = root;
    this.hidden = new Set();
    this.scan();
    this.observer = new MutationObserver((records) => {
      if (records.some((r) => !root.contains(r.target)) && !this.pending) this.pending = requestAnimationFrame(() => { this.pending = null; this.scan(); });
    });
    this.observer.observe(document.body, {childList: true, subtree: true});
  }
  scan() {
    for (const button of document.querySelectorAll("button, a, [role='button'], .sbs-lore-launcher")) {
      if (this.root.contains(button) || button.closest(".application, .app, .notifications, #notifications, #board")) continue;
      let candidate = button;
      for (let i = 0; candidate && candidate !== document.body && i < 4; i++, candidate = candidate.parentElement) {
        const style = getComputedStyle(candidate);
        const rect = candidate.getBoundingClientRect();
        if (["fixed", "absolute"].includes(style.position) && rect.width > 0 && rect.height > 0
          && rect.width <= 320 && rect.height <= 240) {
          candidate.classList.add("sbs-pocket-map-hidden-launcher");
          this.hidden.add(candidate);
          break;
        }
      }
    }
  }
  stop() {
    this.observer?.disconnect();
    if (this.pending) cancelAnimationFrame(this.pending);
    this.pending = null;
    for (const element of this.hidden ?? []) element.classList.remove("sbs-pocket-map-hidden-launcher");
    this.hidden?.clear();
    this.root = null;
  }
}

export function findMapToken(canvas, actorId, previousId) {
  const tokens = (canvas?.tokens?.placeables ?? []).filter((t) =>
    t.actor?.id === actorId && t.isOwner && !t.document.hidden && (t.isVisible ?? t.visible) !== false);
  return tokens.find((t) => t.id === previousId)
    ?? tokens.find((t) => t.controlled) ?? tokens[0] ?? null;
}

export function mapCamera(center, viewport, screen, scale) {
  return {
    x: center.x + (screen.width / 2 - viewport.left - viewport.width / 2) / scale,
    y: center.y + (screen.height / 2 - viewport.top - viewport.height / 2) / scale,
    scale
  };
}

export class PocketMap {
  constructor(actorId) {
    this.actorId = actorId;
    this.drag = new PocketTokenDrag(actorId);
    this.mode = "target";
    this.scale = null;
    this.frame = null;
    this.following = true;
    this.viewCenter = null;
    this.viewSceneId = null;
  }

  start(root) {
    this.stop();
    this.root = root;
    // Build the panel only on entry; all handlers/observers are scoped to this visit.
    root.querySelector("[data-panel='map']").innerHTML = renderPocketMap();
    root.classList.add("sbs-pocket-map-open");
    this.abort = new AbortController();
    this.overlays = new MapOverlayGuard();
    this.overlays.start(root);
    const viewport = root.querySelector(".sbs-pocket-map-viewport");
    const modeSelect = root.querySelector(".sbs-pocket-map-mode");
    modeSelect.value = this.mode;
    if (this.mode === "move") { this.following = true; this.viewCenter = null; }
    modeSelect.addEventListener("change", () => {
      this.cancelGesture?.();
      this.mode = modeSelect.value;
      if (this.mode === "move") this.center();
      else this.update();
    }, {signal: this.abort.signal});
    const pointers = new Map();
    let pan = null, pinch = null, suppressTap = false, gestureSceneId = null;
    let moveCandidate = null, moveOrigin = null, moveDown = null, moveBlocked = false;
    const midpoint = (a, b) => ({x: (a.x + b.x) / 2, y: (a.y + b.y) / 2});
    const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const rebase = () => {
      const c = globalThis.canvas;
      const points = [...pointers.entries()];
      pan = null; pinch = null;
      if (!c?.ready || !points.length) return;
      if (points.length === 1) {
        const rect = viewport.getBoundingClientRect();
        pan = {id: points[0][0], start: points[0][1], center: c.canvasCoordinatesFromClient({x: rect.left + rect.width / 2, y: rect.top + rect.height / 2}), scale: c.stage.scale.x, dragged: false};
      } else {
        suppressTap = true;
        const a = points[0][1], b = points[1][1];
        pinch = {distance: Math.max(1, distance(a, b)), scale: c.stage.scale.x, anchor: c.canvasCoordinatesFromClient(midpoint(a, b))};
      }
    };
    const release = (id) => { if (viewport.hasPointerCapture(id)) viewport.releasePointerCapture(id); };
    this.cancelGesture = () => {
      const ids = [...pointers.keys()];
      pointers.clear(); pan = null; pinch = null; suppressTap = true; moveBlocked = true; moveCandidate = null;
      this.drag.cancel(); ids.forEach(release);
      viewport.classList.remove("is-panning");
    };
    const movementError = (error) => {
      this.cancelGesture();
      console.error("Pocket Sheets | Native movement failed", error);
      ui.notifications.error("Pocket Sheets could not start or finish Foundry's token drag. Movement was cancelled; see the console for details.");
    };
    viewport.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || !globalThis.canvas?.ready || !document.body.classList.contains("sbs-pocket-map-visible")) return;
      e.preventDefault();
      if (!pointers.size) {
        suppressTap = false; gestureSceneId = canvas.scene.id; moveBlocked = false;
        moveOrigin = canvas.canvasCoordinatesFromClient({x: e.clientX, y: e.clientY});
        moveDown = e;
        const hit = mapTokenAt(canvas, moveOrigin);
        moveCandidate = this.mode === "move" && hit?.id === this.tokenId ? hit : null;
      }
      pointers.set(e.pointerId, {x: e.clientX, y: e.clientY});
      viewport.setPointerCapture(e.pointerId);
      if (pointers.size > 1) { this.drag.cancel(); moveCandidate = null; moveBlocked = true; }
      rebase();
    }, {signal: this.abort.signal});
    viewport.addEventListener("pointermove", (e) => {
      if (!pointers.has(e.pointerId)) return;
      e.preventDefault();
      const c = globalThis.canvas;
      if (!c?.ready || c.scene.id !== gestureSceneId || !document.body.classList.contains("sbs-pocket-map-visible")) {
        this.cancelGesture();
        return;
      }
      pointers.set(e.pointerId, {x: e.clientX, y: e.clientY});
      if (pinch) {
        const [a, b] = [...pointers.values()];
        this.zoomAt(pinch.scale * distance(a, b) / pinch.distance, midpoint(a, b), pinch.anchor);
      } else if (pan?.id === e.pointerId) {
        const point = pointers.get(e.pointerId);
        if (!pan.dragged && distance(point, pan.start) <= 9) return;
        pan.dragged = true; suppressTap = true;
        if (this.mode === "move") {
          if (!moveCandidate || moveBlocked) return;
          try {
            if (!this.drag.active && !this.drag.begin(moveCandidate, moveOrigin, moveDown)) {
              moveBlocked = true;
              ui.notifications.warn("Foundry is not allowing movement for your assigned token right now.");
              return;
            }
            if (!this.drag.move(c.canvasCoordinatesFromClient(point), e)) moveBlocked = true;
            this.signature = null; this.update();
          } catch (error) { movementError(error); }
          return;
        }
        this.following = false;
        this.viewCenter = {x: pan.center.x - (point.x - pan.start.x) / pan.scale, y: pan.center.y - (point.y - pan.start.y) / pan.scale};
        this.signature = null;
        this.update();
      }
      viewport.classList.add("is-panning");
    }, {signal: this.abort.signal});
    const finish = (e, cancelled = false) => {
      if (!pointers.has(e.pointerId)) return;
      const tap = !cancelled && !suppressTap && pointers.size === 1 && pan?.id === e.pointerId && distance({x: e.clientX, y: e.clientY}, pan.start) <= 9;
      if (this.drag.active) {
        const rect = viewport.getBoundingClientRect();
        const inside = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
        try {
          if (!cancelled && !moveBlocked && inside && this.mode === "move") this.drag.drop(canvas.canvasCoordinatesFromClient({x: e.clientX, y: e.clientY}), e);
          else this.drag.cancel();
        } catch (error) { movementError(error); }
      }
      pointers.delete(e.pointerId);
      if (cancelled) suppressTap = true;
      release(e.pointerId);
      rebase();
      if (!pointers.size) viewport.classList.remove("is-panning");
      if (tap) this.tap(e.clientX, e.clientY);
    };
    viewport.addEventListener("pointerup", (e) => finish(e), {signal: this.abort.signal});
    viewport.addEventListener("pointercancel", (e) => finish(e, true), {signal: this.abort.signal});
    viewport.addEventListener("lostpointercapture", (e) => finish(e, true), {signal: this.abort.signal});
    viewport.addEventListener("wheel", (e) => {
      if (!globalThis.canvas?.ready || !document.body.classList.contains("sbs-pocket-map-visible")) return;
      e.preventDefault();
      this.cancelGesture?.();
      this.zoomAt(canvas.stage.scale.x * Math.exp(-e.deltaY * 0.002), {x: e.clientX, y: e.clientY});
    }, {passive: false, signal: this.abort.signal});
    // Canvas pointer events are blocked by CSS; block native movement hotkeys too.
    const blockMovement = (event) => {
      if (event.target?.closest?.("input, textarea, select, [contenteditable='true'], .dialog, .dialog-v2")) return;
      if (event.code === "Escape" && this.drag.active) { this.cancelGesture?.(); event.preventDefault(); event.stopImmediatePropagation(); return; }
      if (/^(Arrow|Numpad)/.test(event.code) || ["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE", "KeyZ", "KeyC", "Space"].includes(event.code)) {
        if (event.code === "Space" && event.target?.closest?.("button")) return;
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    for (const type of ["keydown", "keyup"]) window.addEventListener(type, blockMovement, { capture: true, signal: this.abort.signal });
    window.addEventListener("blur", () => this.cancelGesture?.(), {signal: this.abort.signal});
    let last = -Infinity;
    const tick = (time) => {
      this.frame = requestAnimationFrame(tick);
      if (time - last < 40) return;
      last = time;
      try { this.update(); }
      catch (error) {
        document.body.classList.remove("sbs-pocket-map-visible");
        root.querySelector(".sbs-pocket-map-message").textContent = "The map could not open. Try another tab and return to Map.";
        if (!this.failed) console.error("Pocket Sheets | Map view failed", error);
        this.failed = true;
      }
    };
    this.frame = requestAnimationFrame(tick);
  }

  update() {
    const c = globalThis.canvas;
    if (this.drag.active && !this.drag.valid()) this.drag.cancel();
    const viewport = this.root.querySelector(".sbs-pocket-map-viewport");
    const message = this.root.querySelector(".sbs-pocket-map-message");
    const token = c?.ready ? findMapToken(c, this.actorId, this.tokenId) : null;
    const board = document.getElementById("board");
    const visible = Boolean(token && board && viewport);
    document.body.classList.toggle("sbs-pocket-map-visible", visible);
    const status = visible ? "" : game.settings.get("core", "noCanvas")
      ? "The canvas is disabled on this device. Enable it in Foundry settings, then reload to view the map."
      : !c?.ready ? "Waiting for the GM to open a scene…"
      : "Your assigned character has no visible token on this scene. Ask the GM to place or reveal it.";
    setText(message, status);
    this.root.querySelectorAll("[data-action^='map-']").forEach((b) => { b.disabled = !visible; });
    if (!visible) { this.signature = null; return; }
    if (this.sceneId !== c.scene.id) {
      this.sceneId = c.scene.id;
      this.saved = { x: c.stage.pivot.x, y: c.stage.pivot.y, scale: c.stage.scale.x };
      this.signature = null;
    }
    if (this.viewSceneId !== c.scene.id) {
      this.viewSceneId = c.scene.id;
      this.following = true;
      this.viewCenter = null;
    }
    this.scale ??= c.stage.scale.x;
    this.tokenId = token.id;
    const selecting = this.mode === "select";
    setText(this.root.querySelector(".sbs-pocket-map-note"), this.mode === "move" ? "Drag your token to move • Pinch to zoom" : `${this.following ? "Following" : "Exploring"} • Pinch to zoom • Tap to ${selecting ? "select" : "target"}`);
    this.root.querySelector("[data-action='map-center']").setAttribute("aria-pressed", String(this.following));
    setText(this.root.querySelector(".sbs-pocket-map-target-count"), String(game.user.targets?.size ?? 0));
    const rect = viewport.getBoundingClientRect();
    const screen = { width: window.innerWidth, height: window.innerHeight };
    // Clip the original full-screen board rather than reparenting/resizing WebGL.
    board.style.setProperty("--sbs-pocket-map-clip", `inset(${rect.top}px ${Math.max(0, screen.width - rect.right)}px ${Math.max(0, screen.height - rect.bottom)}px ${rect.left}px)`);
    const camera = mapCamera(this.following ? token.center : (this.viewCenter ?? token.center), rect, screen, this.scale);
    const signature = [this.sceneId, token.id, camera.x, camera.y, camera.scale, rect.width, rect.height].join(":");
    if (signature !== this.signature) {
      c.pan(camera);
      // Retain Foundry's own scale limits after pan constrains the requested zoom.
      this.scale = c.stage.scale.x;
      this.signature = [this.sceneId, token.id, camera.x, camera.y, this.scale, rect.width, rect.height].join(":");
    }
    this.failed = false;
  }

  tap(x, y) {
    const c = globalThis.canvas;
    if (this.mode === "move" || !c?.ready || !document.body.classList.contains("sbs-pocket-map-visible")) return;
    const token = mapTokenAt(c, c.canvasCoordinatesFromClient({x, y}));
    if (!token) return;
    if (this.root.querySelector(".sbs-pocket-map-mode").value === "select") {
      if (!token.isOwner || !token.can(game.user, "control")) {
        ui.notifications.warn("You can only select tokens you own and are allowed to control. Use Target for other creatures.");
        return;
      }
      token.control({releaseOthers: true});
      this.signature = null;
    } else token.setTarget(!game.user.targets.has(token), {releaseOthers: false});
    this.update();
  }

  clearTargets() {
    for (const token of [...game.user.targets]) token.setTarget(false, {releaseOthers: false});
    this.update();
  }

  zoomAt(scale, point, anchor) {
    const c = globalThis.canvas;
    if (!c?.ready || !this.root) return;
    anchor ??= c.canvasCoordinatesFromClient(point);
    this.scale = Math.min(CONFIG.Canvas?.maxZoom ?? 3, Math.max(0.1, scale));
    const rect = this.root.querySelector(".sbs-pocket-map-viewport").getBoundingClientRect();
    this.following = this.mode === "move";
    this.viewCenter = this.following ? null : {x: anchor.x - (point.x - rect.left - rect.width / 2) / this.scale, y: anchor.y - (point.y - rect.top - rect.height / 2) / this.scale};
    this.signature = null;
    this.update();
  }

  center() { this.following = true; this.viewCenter = null; this.signature = null; this.update(); }

  stop() {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.cancelGesture?.();
    this.cancelGesture = null;
    this.drag.cancel();
    this.abort?.abort();
    this.overlays?.stop();
    this.root?.classList.remove("sbs-pocket-map-open");
    // Preserve native user targets and token control; discard just the map UI.
    this.root?.querySelector("[data-panel='map']")?.replaceChildren();
    document.body.classList.remove("sbs-pocket-map-visible");
    document.getElementById("board")?.style.removeProperty("--sbs-pocket-map-clip");
    const c = globalThis.canvas;
    if (this.saved && c?.ready && c.scene.id === this.sceneId) c.pan(this.saved);
    this.saved = null;
    this.sceneId = null;
    this.signature = null;
    this.root = null;
  }
}
