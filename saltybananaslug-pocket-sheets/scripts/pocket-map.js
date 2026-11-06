const setText = (element, text) => { if (element.textContent !== text) element.textContent = text; };

/** A transparent viewport onto this client's native, permission-filtered canvas. */
export function renderPocketMap() {
  return `<div class="sbs-pocket-map-toolbar"><button type="button" data-action="map-zoom-out" aria-label="Zoom out">−</button><output class="sbs-pocket-map-scale">100%</output><button type="button" data-action="map-zoom-in" aria-label="Zoom in">+</button><button type="button" data-action="map-center">Center on me</button><label>Tap to <select class="sbs-pocket-map-mode" aria-label="Map tap action"><option value="target">Target</option><option value="select">Select owned token</option></select></label><button type="button" data-action="map-clear-targets">Clear targets</button><output class="sbs-pocket-map-target-count" aria-live="polite">0 targeted</output></div><div class="sbs-pocket-map-viewport" role="group" aria-label="Live map; tap a visible token to target or select it"><p class="sbs-pocket-map-message" role="status">Waiting for the map…</p></div><p class="sbs-pocket-map-note">Tap to toggle targets • The GM moves your token</p>`;
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
    t.actor?.id === actorId && t.isOwner && !t.document.hidden && t.visible !== false);
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
    this.scale = null;
    this.frame = null;
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
    let down = null;
    viewport.addEventListener("pointerdown", (e) => { down = e.isPrimary && e.button === 0 ? {id: e.pointerId, x: e.clientX, y: e.clientY} : null; }, {signal: this.abort.signal});
    viewport.addEventListener("pointermove", (e) => { if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 9) down = null; }, {signal: this.abort.signal});
    viewport.addEventListener("pointercancel", () => { down = null; }, {signal: this.abort.signal});
    viewport.addEventListener("pointerup", (e) => {
      if (down?.id === e.pointerId) this.tap(e.clientX, e.clientY);
      down = null;
    }, {signal: this.abort.signal});
    // Canvas pointer events are blocked by CSS; block native movement hotkeys too.
    const blockMovement = (event) => {
      if (event.target?.closest?.("input, textarea, select, [contenteditable='true'], .dialog, .dialog-v2")) return;
      if (/^(Arrow|Numpad)/.test(event.code) || ["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE", "KeyZ", "KeyC", "Space"].includes(event.code)) {
        if (event.code === "Space" && event.target?.closest?.("button")) return;
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    for (const type of ["keydown", "keyup"]) window.addEventListener(type, blockMovement, { capture: true, signal: this.abort.signal });
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
    this.scale ??= c.stage.scale.x;
    this.tokenId = token.id;
    setText(this.root.querySelector(".sbs-pocket-map-note"), this.root.querySelector(".sbs-pocket-map-mode").value === "select" ? "Tap your token to select it • The GM handles movement" : "Tap to toggle targets • The GM moves your token");
    setText(this.root.querySelector(".sbs-pocket-map-scale"), `${Math.round(this.scale * 100)}%`);
    setText(this.root.querySelector(".sbs-pocket-map-target-count"), `${game.user.targets?.size ?? 0} targeted`);
    const rect = viewport.getBoundingClientRect();
    const screen = { width: window.innerWidth, height: window.innerHeight };
    // Clip the original full-screen board rather than reparenting/resizing WebGL.
    board.style.setProperty("--sbs-pocket-map-clip", `inset(${rect.top}px ${Math.max(0, screen.width - rect.right)}px ${Math.max(0, screen.height - rect.bottom)}px ${rect.left}px)`);
    const camera = mapCamera(token.center, rect, screen, this.scale);
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
    if (!c?.ready || !document.body.classList.contains("sbs-pocket-map-visible")) return;
    const token = mapTokenAt(c, c.canvasCoordinatesFromClient({x, y}));
    if (!token) return;
    if (this.root.querySelector(".sbs-pocket-map-mode").value === "select") {
      if (!token.isOwner || !token.can(game.user, "control")) {
        ui.notifications.warn("You can only select tokens you own and are allowed to control. Use Target for other creatures.");
        return;
      }
      token.control({releaseOthers: true});
      this.center();
    } else token.setTarget(!game.user.targets.has(token), {releaseOthers: false});
    this.update();
  }

  clearTargets() {
    for (const token of [...game.user.targets]) token.setTarget(false, {releaseOthers: false});
    this.update();
  }

  zoom(factor) {
    this.scale = Math.min(CONFIG.Canvas?.maxZoom ?? 3, Math.max(0.1, (this.scale ?? 1) * factor));
    this.signature = null;
    this.update();
  }

  center() { this.signature = null; this.update(); }

  stop() {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
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
