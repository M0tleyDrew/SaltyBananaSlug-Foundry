/** A transparent viewport onto this client's native, permission-filtered canvas. */
export function renderPocketMap() {
  return `<div class="sbs-pocket-map-toolbar"><button type="button" data-action="map-zoom-out" aria-label="Zoom out">−</button><output class="sbs-pocket-map-scale">100%</output><button type="button" data-action="map-zoom-in" aria-label="Zoom in">+</button><button type="button" data-action="map-center">Center on me</button></div><div class="sbs-pocket-map-viewport" role="img" aria-label="Live map centered on your character"><p class="sbs-pocket-map-message" role="status">Waiting for the map…</p></div><p class="sbs-pocket-map-note">Following your character • The GM moves your token</p>`;
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
    root.classList.add("sbs-pocket-map-open");
    this.abort = new AbortController();
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
    message.textContent = visible ? "" : game.settings.get("core", "noCanvas")
      ? "The canvas is disabled on this device. Enable it in Foundry settings, then reload to view the map."
      : !c?.ready ? "Waiting for the GM to open a scene…"
      : "Your assigned character has no visible token on this scene. Ask the GM to place or reveal it.";
    this.root.querySelectorAll("[data-action^='map-']").forEach((b) => { b.disabled = !visible; });
    if (!visible) { this.signature = null; return; }
    if (this.sceneId !== c.scene.id) {
      this.sceneId = c.scene.id;
      this.saved = { x: c.stage.pivot.x, y: c.stage.pivot.y, scale: c.stage.scale.x };
      this.signature = null;
    }
    this.scale ??= c.stage.scale.x;
    this.tokenId = token.id;
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
    this.root.querySelector(".sbs-pocket-map-scale").textContent = `${Math.round(this.scale * 100)}%`;
    this.failed = false;
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
    this.root?.classList.remove("sbs-pocket-map-open");
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
