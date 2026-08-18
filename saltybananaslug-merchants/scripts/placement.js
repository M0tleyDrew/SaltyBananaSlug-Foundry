import {MODULE_ID} from "./constants.js";

function eventWorldPoint(event) {
  try {
    if (typeof event?.getLocalPosition === "function") {
      const p = event.getLocalPosition(canvas.stage);
      if (Number.isFinite(p?.x) && Number.isFinite(p?.y)) return {x:p.x, y:p.y};
    }
    if (event?.global && canvas?.stage?.toLocal) {
      const p = canvas.stage.toLocal(event.global);
      if (Number.isFinite(p?.x) && Number.isFinite(p?.y)) return {x:p.x, y:p.y};
    }
  } catch (_) {}
  return null;
}

function viewportCenterWorldPoint() {
  try {
    const view = canvas?.app?.view ?? canvas?.app?.canvas;
    const rect = view?.getBoundingClientRect?.();
    if (rect && canvas?.stage?.worldTransform?.applyInverse) {
      const globalPoint = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      };
      return canvas.stage.worldTransform.applyInverse(globalPoint);
    }
  } catch (_) {}
  return {x:0, y:0};
}

function tokenTopLeftFromPointer(point) {
  const size = Number(canvas?.grid?.size ?? canvas?.scene?.grid?.size ?? 100) || 100;
  const centerMode = CONST.GRID_SNAPPING_MODES?.CENTER;
  const gridless = canvas?.scene?.grid?.type === CONST.GRID_TYPES?.GRIDLESS || Number(canvas?.scene?.grid?.type) === 0;

  if (!gridless && canvas?.grid?.getSnappedPoint && centerMode !== undefined) {
    try {
      const center = canvas.grid.getSnappedPoint(point, {mode:centerMode});
      return {x:Math.round(center.x - size / 2), y:Math.round(center.y - size / 2)};
    } catch (_) {}
  }

  if (!gridless) {
    return {
      x: Math.round((point.x - size / 2) / size) * size,
      y: Math.round((point.y - size / 2) / size) * size
    };
  }

  return {x:Math.round(point.x - size / 2), y:Math.round(point.y - size / 2)};
}

function makePlacementHud(name) {
  const hud = document.createElement("div");
  hud.className = "sbsm-placement-hud";
  hud.innerHTML = `<strong><i class="fas fa-crosshairs"></i> Place ${foundry.utils.escapeHTML(name || "Merchant")}</strong><span>Move over the scene and left-click to place. Right-click or press Esc to cancel.</span>`;
  document.body.appendChild(hud);
  return hud;
}

function makeGhost(src) {
  try {
    const SpriteClass = globalThis.PIXI?.Sprite;
    if (!SpriteClass) return null;
    const ghost = SpriteClass.from(src);
    ghost.anchor?.set?.(0.5);
    const size = Number(canvas?.grid?.size ?? canvas?.scene?.grid?.size ?? 100) || 100;
    ghost.width = size;
    ghost.height = size;
    ghost.alpha = 0.68;
    ghost.eventMode = "none";
    ghost.interactive = false;
    ghost.zIndex = 999999;
    canvas.stage.addChild(ghost);
    return ghost;
  } catch (err) {
    console.warn(`${MODULE_ID} | Could not create placement ghost`, err);
    return null;
  }
}

/**
 * Let the current user choose a one-token location on the active scene.
 * Returns {sceneId, x, y} or null when cancelled.
 */
export async function chooseMerchantPlacement({name="Merchant", image=""}={}) {
  if (!canvas?.ready || !canvas?.scene || !canvas?.stage) throw new Error("Open an active scene before placing a merchant.");

  try { await canvas.tokens?.activate?.(); } catch (_) {}

  const sceneId = canvas.scene.id;
  const stage = canvas.stage;
  const hud = makePlacementHud(name);
  const ghost = makeGhost(image);
  let point = tokenTopLeftFromPointer(viewportCenterWorldPoint());

  const positionGhost = topLeft => {
    if (!ghost) return;
    const size = Number(canvas?.grid?.size ?? canvas?.scene?.grid?.size ?? 100) || 100;
    ghost.position.set(topLeft.x + size / 2, topLeft.y + size / 2);
  };
  positionGhost(point);

  ui.notifications.info(`Place ${name}: left-click the scene. Esc or right-click cancels.`);

  return new Promise(resolve => {
    let finished = false;

    const cleanup = () => {
      if (finished) return;
      finished = true;
      try { stage.off("pointermove", onMove); } catch (_) {}
      try { stage.off("pointerdown", onDown); } catch (_) {}
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("contextmenu", onContextMenu, true);
      try { ghost?.destroy?.(); } catch (_) { try { ghost?.parent?.removeChild?.(ghost); } catch(__){} }
      hud.remove();
    };

    const cancel = () => {
      cleanup();
      ui.notifications.info("Merchant placement cancelled.");
      resolve(null);
    };

    const onMove = event => {
      if (canvas.scene?.id !== sceneId) return cancel();
      const world = eventWorldPoint(event);
      if (!world) return;
      point = tokenTopLeftFromPointer(world);
      positionGhost(point);
    };

    const onDown = event => {
      const button = Number(event?.button ?? event?.data?.button ?? 0);
      if (button === 2) {
        event?.stopPropagation?.();
        event?.preventDefault?.();
        return cancel();
      }
      if (button !== 0) return;
      if (canvas.scene?.id !== sceneId) return cancel();
      const world = eventWorldPoint(event);
      if (world) point = tokenTopLeftFromPointer(world);
      event?.stopPropagation?.();
      event?.preventDefault?.();
      const result = {sceneId, x:point.x, y:point.y};
      cleanup();
      resolve(result);
    };

    const onKeyDown = event => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      cancel();
    };

    const onContextMenu = event => {
      const view = canvas?.app?.view ?? canvas?.app?.canvas;
      if (!view) return;
      const rect = view.getBoundingClientRect();
      const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
      if (!inside) return;
      event.preventDefault();
    };

    stage.on("pointermove", onMove);
    stage.on("pointerdown", onDown);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("contextmenu", onContextMenu, true);
  });
}
