// Foundry v13 / dnd5e 5.2.x / Midi-QOL. Run as a SCRIPT macro.
await (async () => {
  const token = canvas.tokens.controlled[0];
  if (canvas.tokens.controlled.length !== 1 || !token?.actor?.isOwner)
    return ui.notifications.warn("Select only your bard's token first.");
  const bard = token.actor, tag = foundry.utils.randomID();
  const midi = globalThis.MidiQOL;
  if (!midi?.socket || !game.users.some(u => u.active && u.isGM))
    return ui.notifications.error("Moon's Inspiration needs Midi-QOL and an online GM.");
  globalThis.SBSMoonBusy ??= new Set();
  if (SBSMoonBusy.has(bard.uuid)) return;
  SBSMoonBusy.add(bard.uuid);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const items = bard.items.filter(i => i.system.identifier === "bardic-inspiration" || /^bardic inspiration(?:$|\s*\()/i.test(i.name));
  const item = items.find(i => Number(i.system.uses?.max) > 0);
  const resource = Object.entries(bard.system.resources ?? {}).find(([, r]) => /bardic inspiration/i.test(r.label ?? ""));
  const pool = item ? {
    left: () => Number(item.system.uses.value ?? (Number(item.system.uses.max) - Number(item.system.uses.spent ?? 0))),
    spend: n => item.update({"system.uses.spent": Math.max(0, Number(item.system.uses.spent ?? 0) + n)})
  } : resource ? {
    left: () => Number(bard.system.resources[resource[0]].value),
    spend: n => bard.update({[`system.resources.${resource[0]}.value`]: Number(bard.system.resources[resource[0]].value) - n})
  } : null;
  const sheets = [...new Set([...Object.values(bard.apps ?? {}), bard.sheet])]
    .filter(s => s?.rendered && !s._minimized && !s.minimized && s.minimize);
  const original = {x: token.document.x, y: token.document.y};
  let invisible, moved = false, spent = false, granted = false, chosen;
  const cancel = Symbol("cancel");
  const ask = (title, content, button = "Choose") => new Promise(resolve => {
    let picked = false;
    new Dialog({title, content, buttons: {
      cancel: {label: "Cancel"},
      choose: {label: button, callback: html => {picked = true; resolve((html[0] ?? html).querySelector("select").value);}}
    }, default: "choose", close: () => {if (!picked) resolve(null);}}).render(true);
  });
  const distance = (a, b) => {
    const d = canvas.grid.measurePath([a, b]).distance;
    return /^(m|meters?|metres?)$/i.test(canvas.scene.grid.units ?? "") ? d * 3.28084 : d;
  };
  const center = p => ({x: p.x + token.w / 2, y: p.y + token.h / 2});
  const alreadyInspired = actor => actor.effects.some(e => !e.disabled &&
    (e.flags?.world?.sbsMoonInspiration || /^(?:inspired|bardic inspiration)(?:$|\s*\()/i.test(e.name)));
  try {
    if (!pool) throw Error("No tracked Bardic Inspiration uses found. Give the Bardic Inspiration feature its normal uses, or use a resource labeled Bardic Inspiration.");
    if (!(pool.left() > 0)) throw Error("No Bardic Inspiration uses remaining.");
    for (const sheet of sheets) await sheet.minimize();
    ui.notifications.info("Click your teleport destination, up to 30 feet. Esc cancels. You must be able to see the space.");
    const destination = await new Promise(resolve => {
      const stage = canvas.stage, sceneId = canvas.scene.id;
      const hud = document.createElement("div");
      hud.style.cssText = "position:fixed;top:65px;left:30%;z-index:10000;padding:12px;background:#171d2d;color:white;border:1px solid #afb9ef;border-radius:6px;pointer-events:none";
      hud.textContent = "Moon's Inspiration: click a visible empty space within 30 ft • Esc cancels";
      document.body.appendChild(hud);
      let timer;
      const finish = value => {stage.off("pointerdown", click);window.removeEventListener("keydown", key, true);clearTimeout(timer);hud.remove();resolve(value);};
      const key = e => {if (e.key === "Escape") {e.preventDefault();e.stopPropagation();finish(null);}};
      const click = e => {
        if (e.button === 2) return finish(null);
        if (e.button !== 0) return;
        e.stopPropagation?.();
        if (canvas.scene.id !== sceneId) return finish(null);
        const point = e.getLocalPosition(stage);
        let p = {x: point.x - token.w / 2, y: point.y - token.h / 2};
        if (canvas.scene.grid.type !== 0) p = canvas.grid.getSnappedPoint(p, {mode: CONST.GRID_SNAPPING_MODES.TOP_LEFT_CORNER});
        const c = center(p), rect = canvas.dimensions.sceneRect;
        if (rect && (!rect.contains(p.x, p.y) || !rect.contains(p.x + token.w - 1, p.y + token.h - 1))) return ui.notifications.warn("Choose a space inside the scene.");
        if (distance(center(original), c) > 30.01) return ui.notifications.warn("That destination is more than 30 feet away.");
        if (CONFIG.Canvas.polygonBackends.sight.testCollision(token.center, c, {type: "sight", mode: "any"})) return ui.notifications.warn("A sight-blocking wall hides that destination.");
        const occupied = canvas.tokens.placeables.some(t => t.id !== token.id && Number(t.document.elevation) === Number(token.document.elevation) && p.x < t.x + t.w - 1 && p.x + token.w > t.x + 1 && p.y < t.y + t.h - 1 && p.y + token.h > t.y + 1);
        if (occupied) return ui.notifications.warn("Choose an unoccupied space.");
        finish(p);
      };
      stage.on("pointerdown", click);window.addEventListener("keydown", key, true);
      timer = setTimeout(() => finish(null), 120000);
    });
    if (!destination) throw cancel;
    await token.document.update(destination, {animate: false});moved = true;
    [invisible] = await bard.createEmbeddedDocuments("ActiveEffect", [{
      name: "Moon's Inspiration — Invisible", img: "icons/magic/perception/silhouette-stealth-shadow.webp",
      origin: item?.uuid ?? bard.uuid, transfer: false, statuses: ["invisible"],
      flags: {world: {sbsMoonEclipse: tag}, dae: {specialDuration: ["turnStartSource", "1Attack", "1Spell", "DamageDealt"]}}
    }]);
    if (!invisible) throw Error("Could not apply invisibility.");
    const allies = canvas.tokens.placeables.filter(t => t.actor && t.actor.uuid !== bard.uuid && t.actor.type === "character" && (game.user.isGM || t.isVisible) && distance(token.center, t.center) <= 60.01 && !alreadyInspired(t.actor));
    if (!allies.length) throw Error("No visible player character within 60 feet is eligible. A creature can have only one Bardic Inspiration die.");
    const id = await ask("Give Bardic Inspiration", `<p>Choose a character within 60 feet who can see or hear you. This spends one Bardic Inspiration use.</p><select style="width:100%">${allies.map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join("")}</select>`, "Give Inspiration");
    if (!id) throw cancel;
    chosen = canvas.tokens.get(id);
    if (!chosen?.actor || distance(token.center, chosen.center) > 60.01 || alreadyInspired(chosen.actor)) throw Error("That character is no longer eligible.");
    if (!(pool.left() > 0)) throw Error("No Bardic Inspiration uses remaining.");
    const level = Number(bard.classes?.bard?.system.levels ?? bard.items.find(i => i.type === "class" && (i.system.identifier === "bard" || /^bard$/i.test(i.name)))?.system.levels ?? 1);
    const die = level >= 15 ? "d12" : level >= 10 ? "d10" : level >= 5 ? "d8" : "d6";
    const combatId = game.combat?.id, startRound = game.combat?.round, startTurn = game.combat?.turn;
    await invisible.update({duration: {startTime: game.time.worldTime, ...(combatId ? {combat: combatId, startRound, startTurn, rounds: 1} : {seconds: 6})}});
    await pool.spend(1);spent = true;
    const effects = await midi.socket().executeAsGM("createEffects", {actorUuid: chosen.actor.uuid, effects: [{
      name: `Bardic Inspiration (${die})`, img: "icons/magic/light/hand-sparks-smoke-green.webp", origin: item?.uuid ?? bard.uuid,
      disabled: false, transfer: false, duration: {seconds: item?.system.source?.rules === "2014" ? 600 : 3600, startTime: game.time.worldTime},
      description: `<p>${esc(bard.name)} grants Bardic Inspiration: ${die}. Use once on an eligible D20 Test, then remove this effect. This is Bardic Inspiration, not Heroic Inspiration.</p>`,
      flags: {world: {sbsMoonInspiration: tag, die, bard: bard.uuid}}
    }], options: {}});
    if (!Array.isArray(effects) || !effects.length) throw Error("The GM could not apply Bardic Inspiration.");
    granted = true;
    // Track only this macro's Invisible effect; never remove another source's invisibility.
    const hooks = [];let timer;
    const cleanup = () => {for (const [name, id] of hooks) Hooks.off(name, id);clearTimeout(timer);};
    const expire = async () => {cleanup();try {const e = bard.effects.get(invisible.id);if (e) await e.delete();}catch(e) {console.error("Moon's Inspiration expiry", e);}};
    const listen = (name, fn) => hooks.push([name, Hooks.on(name, fn)]);
    const isBard = subject => (subject?.actor ?? subject?.item?.actor ?? subject?.parent?.actor)?.uuid === bard.uuid;
    listen("updateCombat", combat => {if (combat.id === combatId && combat.combatant?.tokenId === token.id && (combat.round !== startRound || combat.turn !== startTurn)) expire();});
    listen("deleteCombat", combat => {if (combat.id === combatId) expire();});
    listen("midi-qol.AttackRollComplete", workflow => {if (workflow.actor?.uuid === bard.uuid) expire();});
    listen("dnd5e.rollAttackV2", (rolls, data) => {if (isBard(data?.subject)) expire();});
    listen("dnd5e.postUseActivity", activity => {if (isBard(activity) && activity.item?.type === "spell") expire();});
    listen("midi-qol.RollComplete", workflow => {if (workflow.actor?.uuid === bard.uuid && workflow.damageList?.some(d => Number(d.appliedDamage) > 0)) expire();});
    listen("deleteActiveEffect", effect => {if (effect.uuid === invisible.uuid) cleanup();});
    if (!combatId) timer = setTimeout(expire, 6000);
    ui.notifications.info(`${chosen.name} gains Bardic Inspiration (${die}). ${pool.left()} use(s) left.`);
    try {await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: bard, token: token.document}), content: `<p><strong>${esc(bard.name)}</strong> uses Inspired Eclipse: teleports, becomes Invisible, and gives <strong>${esc(chosen.name)}</strong> Bardic Inspiration (<strong>${die}</strong>). One use spent.</p>`});}catch(e) {console.error(e);}
  } catch (error) {
    if (!granted) {
      if (spent) try {await pool.spend(-1);}catch(e) {ui.notifications.error("Refund failed: restore one Bardic Inspiration use manually.");}
      if (invisible) try {await invisible.delete();}catch(e) {console.error(e);}
      if (moved) try {await token.document.update(original, {animate: false});}catch(e) {ui.notifications.error("Could not restore the original token position.");}
      for (const sheet of sheets) try {await sheet.maximize();}catch(e) {}
    }
    if (error !== cancel) {console.error("Moon's Inspiration", error);ui.notifications.error(error.message ?? String(error));}
  } finally {SBSMoonBusy.delete(bard.uuid);}
})();

// Midi-QOL preItemRoll: the macro already handles the action and resource.
return false;
