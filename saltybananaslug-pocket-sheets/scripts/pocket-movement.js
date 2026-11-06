/** Bridge phone gestures to the assigned Token's v13 drag workflow and native ruler.
 * No document.update fallback: snapping, collision, cost, and commit belong to Foundry.
 */
export class PocketTokenDrag {
  constructor(actorId) { this.actorId = actorId; this.active = null; }

  allowed(token) {
    return Boolean(globalThis.canvas?.ready && token && token.actor?.id === this.actorId
      && token.isOwner && (token.isVisible ?? token.visible) && !token.document.hidden && !token.destroyed
      && (!game.paused || game.user.isGM) && token.can(game.user, "control")
      && token.can(game.user, "drag") && token.document.canUserModify(game.user, "update"));
  }

  valid() {
    const a = this.active;
    return Boolean(a && this.allowed(a.token) && canvas.scene.id === a.sceneId
      && a.token.document.x === a.x && a.token.document.y === a.y
      && a.token.document.elevation === a.elevation
      && canvas.tokens.controlled.length === 1 && canvas.tokens.controlled[0] === a.token);
  }

  event(nativeEvent, point, type = "pointermove") {
    const a = this.active;
    const event = new PIXI.FederatedPointerEvent(canvas.app.renderer.events.rootBoundary);
    event.type = type;
    event.nativeEvent = nativeEvent;
    event.originalEvent = nativeEvent;
    event.target = a.token;
    event.currentTarget = a.token;
    event.pointerId = nativeEvent.pointerId ?? 1;
    event.pointerType = "mouse";
    event.isPrimary = true;
    event.button = 0;
    event.buttons = type === "pointerup" ? 0 : 1;
    event.client.set(nativeEvent.clientX ?? 0, nativeEvent.clientY ?? 0);
    event.global.copyFrom(canvas.stage.toGlobal(point));
    // Use normal constrained movement, regardless of mobile keyboard modifiers.
    event.altKey = event.ctrlKey = event.metaKey = event.shiftKey = false;
    event.interactionData = a.manager.interactionData;
    event.interactionData.destination = {...point};
    return event;
  }

  begin(token, origin, nativeEvent) {
    this.cancel();
    if (!this.allowed(token)) return false;
    const manager = token.mouseInteractionManager;
    if (!manager?.callback || !manager?.can || !manager?.reset || !manager.states
      || !globalThis.PIXI?.FederatedPointerEvent || manager.isDragging) return false;
    canvas.tokens.activate();
    if (!token.control({releaseOthers: true})) return false;
    if (canvas.tokens.controlled.length !== 1 || canvas.tokens.controlled[0] !== token) return false;
    manager.reset({interactionData: true, state: true});
    manager.interactionData.origin = {...origin};
    manager.interactionData.destination = {...origin};
    this.active = {token, manager, sceneId: canvas.scene.id, x: token.document.x,
      y: token.document.y, elevation: token.document.elevation, event: null, started: false};
    try {
      const event = this.event(nativeEvent, origin, "pointerdown");
      this.active.event = event;
      if (!manager.can("dragStart", event) || !manager.can("dragLeftStart", event)) { this.cancel(); return false; }
      this.active.started = true;
      manager.state = manager.states.GRABBED;
      if (manager.callback("dragLeftStart", event) === false) { this.cancel(); return false; }
      manager.state = manager.states.DRAG;
      return true;
    } catch (error) { this.cancel(); throw error; }
  }

  move(point, nativeEvent) {
    if (!this.valid()) { this.cancel(); return false; }
    try {
      const event = this.event(nativeEvent, point);
      this.active.event = event;
      this.active.manager.callback("dragLeftMove", event);
      return true;
    } catch (error) { this.cancel(); throw error; }
  }

  drop(point, nativeEvent) {
    if (!this.valid()) { this.cancel(); return false; }
    const a = this.active;
    try {
      const event = this.event(nativeEvent, point, "pointerup");
      a.event = event;
      a.manager.state = a.manager.states.DROP;
      if (a.manager.callback("dragLeftDrop", event) === false) { this.cancel(); return false; }
      this.active = null;
      a.manager.reset({interactionData: true, state: true});
      return true;
    } catch (error) { this.cancel(); throw error; }
  }

  cancel() {
    const a = this.active;
    if (!a) return;
    this.active = null;
    try { if (a.started) a.manager.callback("dragLeftCancel", a.event); }
    catch (error) { console.error("Pocket Sheets | Native drag cleanup failed", error); }
    finally { a.manager.reset({interactionData: true, state: true}); }
  }
}
