/* SaltyBananaSlug — Grim Hollow 2024, Stage 1 Wolf Lycanthropy
 * Foundry v13 / dnd5e 5.x. Create a SCRIPT macro and paste this entire file.
 * Run once after EVERY reload: GM for automatic checks; affected players for
 * local spell/equipment guards. Effects and items persist; hooks do not.
 * Run with exactly one controlled token to apply/manage its curse.
 * No selection: starts this client's automation without changing an actor.
 *
 * Rules requiring DM adjudication: sensing/nearest target, compelled movement,
 * Attack action/bonus action economy, and class features used outside activities.
 * Additional Monstrosity type is recorded in the curse and feature description;
 * core's single creature-type field is NOT overwritten. Adjudicate type targeting.
 * No blanket resistances/immunities, silver vulnerability, or later-stage boons.
 * Timers use WORLD/game time, not the real-world clock. Manual rest/recovery and
 * Remove Curse controls are included. Remove Curse ends form, not this curse.
 */
await (async () => {
  if (game.system.id !== "dnd5e") return ui.notifications.error("This macro requires the D&D 5e system.");
  const KEY = "sbsLycanthropy";
  const ICON = "icons/creatures/mammals/wolf-howl-moon-gray.webp";
  const U = foundry.utils;
  const tag = d => d?.getFlag("world", KEY);
  const effect = (a, role) => a?.effects.find(e => tag(e)?.role === role && !e.disabled);
  const cursed = a => effect(a, "curse");
  const hybrid = a => effect(a, "hybrid");
  const feral = a => effect(a, "feral");
  const esc = s => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const flag = (role, extra = {}) => ({world:{[KEY]:{role,...extra}}});
  const rules = `<h2>Lycanthropy — Stage 1 (Wolf)</h2>
  <p>Grim Hollow: Player's Guide (2024), pp.154–156. You are also a Monstrosity; retain your original creature types. Ordinary Remove Curse cannot cure this transformation.</p>
  <h3>Hybrid Wolf Form</h3><p>Magic action to enter voluntarily; Magic action to revert voluntarily. Duration: 1 hour at Stage 1. Strength is at least 18; Speed +10 feet; Bonus Action Dash. No spellcasting or concentration; speech is limited to short, guttural responses. Equipment works normally unless feral.</p>
  <p>Proficient Claw/Bite: 1d8 + Strength or Dexterity modifier Slashing. These replace weapon attacks, not Unarmed Strikes. After taking the Attack action, you may make one Claw/Bite attack as a Bonus Action that turn.</p>
  <h3>Lust for the Hunt</h3><p>The first time you become Bloodied (half HP or less) after a Short or Long Rest: DC 10 Wisdom save. Full-moon light causes automatic failure. Failure forces hybrid form and a feral state: no equipment or class features.</p>
  <p>Move toward the closest creature you can sense, prioritizing Bloodied creatures. Dash if no creature is within 5 feet after movement. If a creature is within 5 feet and your action remains, take the Attack action with Claw. If you damage a creature without reducing it to 0 HP, direct remaining attacks that turn at it.</p>
  <p>At the start of your turn at full HP, DC 10 Wisdom save; success returns you to normal. Remove Curse also returns you to normal, as does 1 hour passing. The underlying curse remains.</p>
  <p><b>Automation:</b> run the SBS macro after each reload. DM handles sensing, targeting, movement, and action economy. Additional creature type is recorded here rather than replacing your original type.</p>`;
  const actors = () => [...new Map([
    ...game.actors.contents,
    ...game.scenes.contents.flatMap(s => s.tokens.contents.map(t => t.actor).filter(Boolean))
  ].map(a => [a.uuid,a])).values()];
  const chat = (a, message) => ChatMessage.create({speaker:ChatMessage.getSpeaker({actor:a}),content:`<h3>Lycanthropy</h3><p>${message}</p>`});
  const error = e => { console.error("SBS Lycanthropy",e); ui.notifications.error(`Lycanthropy: ${e.message}`); };
  const authority = () => game.user.isGM && game.users.activeGM?.id === game.user.id;
  const queues = new Map();
  const serial = (a, fn) => {
    const p = (queues.get(a.uuid) ?? Promise.resolve()).then(fn).catch(error);
    queues.set(a.uuid,p); p.finally(() => {if(queues.get(a.uuid) === p) queues.delete(a.uuid);});
    return p;
  };
  async function save(a, reason) {
    await chat(a, `${esc(reason)} — DC 10 Wisdom saving throw.`);
    let result;
    if (typeof a.rollSavingThrow === "function") result = await a.rollSavingThrow({ability:"wis",target:10});
    else result = await a.rollAbilitySave("wis",{flavor:reason});
    const roll = Array.isArray(result) ? result[0] : result;
    if (!Number.isFinite(roll?.total)) return null;
    return roll.total >= 10;
  }
  async function endForm(a, why) {
    const ids = a.effects.filter(e => ["hybrid","feral"].includes(tag(e)?.role)).map(e => e.id);
    if (ids.length) await a.deleteEmbeddedDocuments("ActiveEffect",ids);
    const attacks = a.items.filter(i => ["attack","formAction"].includes(tag(i)?.role)).map(i => i.id);
    if (attacks.length) await a.deleteEmbeddedDocuments("Item",attacks);
    await chat(a, `${esc(why)} Normal form restored; Lycanthropy remains.`);
  }
  async function attacks(a) {
    // System-native weapon activities: normal attack, damage, critical and module workflows.
    const ability = a.system.abilities.dex.mod > a.system.abilities.str.mod ? "dex" : "str";
    const rows = ["Claw","Bite"].map(name => ({name:`Lycanthropy — ${name}`,type:"weapon",img:ICON,
      flags:flag("attack"),system:{
        description:{value:`<p>Hybrid only. Proficient melee weapon attack; 5-foot reach. 1d8 + Strength or Dexterity modifier Slashing. Not an Unarmed Strike. ${name === "Claw" ? "Use this attack for the feral compulsory Attack action." : "Feral compulsory Attack action uses Claw."}</p>`},
        type:{value:"natural",baseItem:""},equipped:true,proficient:1,
        damage:{base:{number:1,denomination:8,bonus:"",types:["slashing"]}},
        activities:{sbsWolfAttack001:{type:"attack",name,activation:{type:"action",value:1},
          attack:{ability,type:{value:"melee",classification:"weapon"}},
          damage:{includeBase:true},range:{value:5,units:"ft"},target:{affects:{type:"creature",count:"1"}}}}
      }}));
    for(const row of rows) {
      row.system.activities.sbsWolfBonus0001 = U.deepClone(row.system.activities.sbsWolfAttack001);
      row.system.activities.sbsWolfBonus0001.name = `${row.name} (Bonus Action after Attack action)`;
      row.system.activities.sbsWolfBonus0001.activation.type = "bonus";
    }
    rows.push({name:"Lycanthropy — Bonus Action Dash",type:"feat",img:ICON,flags:flag("formAction"),
      system:{description:{value:"<p>Hybrid wolf form: take the Dash action as a Bonus Action. Track the added movement and Bonus Action normally.</p>"},
        activities:{sbsWolfDash00001:{type:"utility",name:"Dash",activation:{type:"bonus",value:1}}}}});
    const old = a.items.filter(i => ["attack","formAction"].includes(tag(i)?.role)).map(i => i.id);
    if(old.length) await a.deleteEmbeddedDocuments("Item",old);
    await a.createEmbeddedDocuments("Item",rows);
  }
  async function transform(a, forced = false) {
    if(!cursed(a)) throw new Error("Apply Lycanthropy first.");
    if(feral(a)) return ui.notifications.warn("Already feral.");
    if(hybrid(a) && !forced) return ui.notifications.info("Already in hybrid form.");
    if(typeof a.endConcentration === "function") await a.endConcentration();
    else {
      const ids = a.effects.filter(e => e.statuses?.has("concentrating")).map(e => e.id);
      if(ids.length) await a.deleteEmbeddedDocuments("ActiveEffect",ids);
      ui.notifications.warn("Verify that all concentration and dependent spell effects have ended.");
    }
    const now = game.time.worldTime;
    if(forced && hybrid(a)) await hybrid(a).update({
      [`flags.world.${KEY}.expires`]:now+3600,duration:{startTime:now,seconds:3600}
    });
    if(!hybrid(a)) await a.createEmbeddedDocuments("ActiveEffect",[{
      name:"Lycanthropy — Hybrid Wolf Form",img:ICON,flags:flag("hybrid",{expires:now+3600}),
      description:rules,duration:{startTime:now,seconds:3600},changes:[
        {key:"system.abilities.str.value",mode:CONST.ACTIVE_EFFECT_MODES.UPGRADE,value:"18",priority:90},
        {key:"system.attributes.movement.walk",mode:CONST.ACTIVE_EFFECT_MODES.ADD,value:"10",priority:90}
      ]}]);
    await attacks(a);
    if(forced) await a.createEmbeddedDocuments("ActiveEffect",[{
      name:"Lycanthropy — Feral",img:ICON,description:rules,
      flags:flag("feral",{expires:now+3600}),duration:{startTime:now,seconds:3600},changes:[]}]);
    await chat(a,`${forced ? "Lust for the Hunt: forced hybrid form. No equipment or class features; follow the feral movement and Claw attack rules." : "Hybrid form entered (Magic action). Bonus Action Dash; after the Attack action, one Bonus Action Claw or Bite."} No spellcasting or concentration. Speech is limited. Strength and walking speed are adjusted automatically.`);
  }
  async function hunt(a) {
    const c = cursed(a); if(!c || tag(c).huntUsed) return;
    if(tag(c).fullMoon) {
      await c.setFlag("world",`${KEY}.huntUsed`,true);
      await chat(a,"Full-moon light: Lust for the Hunt save automatically fails.");
      return transform(a,true);
    }
    const passed = await save(a,"Lust for the Hunt");
    if(passed === null) return chat(a,"Save canceled. Use Check Bloodied / Hunt from the macro to resolve it.");
    await c.setFlag("world",`${KEY}.huntUsed`,true);
    if(!passed) await transform(a,true);
    else await chat(a,"Lust for the Hunt resisted. No further Bloodied trigger until after a Short or Long Rest.");
  }
  async function recover(a) {
    if(!feral(a)) return ui.notifications.warn("Not feral.");
    const hp = a.system.attributes.hp;
    if(hp.value < hp.max) return ui.notifications.warn("Recovery requires full HP at the START of your turn.");
    if(await save(a,"Full-HP recovery (start of turn)") === true) await endForm(a,"Recovery save succeeded.");
  }
  async function expire(a) {
    const f = feral(a) ?? hybrid(a);
    if(f && game.time.worldTime >= tag(f).expires) await endForm(a,"One hour elapsed.");
  }
  function guard(item) {
    const a = item?.actor;
    if(!a || !hybrid(a)) return;
    if(item.type === "spell" || (feral(a) && !["attack","formAction"].includes(tag(item)?.role))) {
      ui.notifications.warn("Lycanthropy: no spells in hybrid form; no equipment or class features while feral.");
      return false;
    }
  }
  // Re-running replaces this client's hooks instead of registering duplicates.
  for(const [event,id] of globalThis.SBS_LYCANTHROPY?.hooks ?? []) Hooks.off(event,id);
  const runtime = {hooks:[], hp:new Map()}; globalThis.SBS_LYCANTHROPY = runtime;
  const on = (event,fn) => runtime.hooks.push([event,Hooks.on(event,fn)]);
  for(const a of actors()) runtime.hp.set(a.uuid,{value:a.system.attributes.hp?.value,max:a.system.attributes.hp?.max});
  on("dnd5e.preUseActivity",activity => guard(activity.item));
  on("dnd5e.preUseItem",item => guard(item));
  on("dnd5e.preBeginConcentrating",a => {if(hybrid(a)) {ui.notifications.warn("Hybrid form cannot concentrate.");return false;}});
  on("updateActor",(a,changes) => {
    const hp = a.system.attributes.hp; if(!hp) return;
    const old = runtime.hp.get(a.uuid); runtime.hp.set(a.uuid,{value:hp.value,max:hp.max});
    const hpChanged = Object.keys(changes).some(k => k.startsWith("system.attributes.hp")) || U.hasProperty(changes,"system.attributes.hp");
    if(!authority() || !cursed(a) || !hpChanged || !old) return;
    if(old.value > old.max/2 && hp.value <= hp.max/2) serial(a,() => hunt(a));
  });
  on("dnd5e.restCompleted",a => {
    if(authority() && cursed(a)) serial(a,async () => {
      await cursed(a).setFlag("world",`${KEY}.huntUsed`,false);
      await chat(a,"Rest completed: the next time you become Bloodied can trigger Lust for the Hunt.");
    });
  });
  on("updateCombat",(combat,changes) => {
    if(!authority() || !("turn" in changes || "round" in changes)) return;
    const a = combat.combatant?.actor;
    if(a && feral(a)) serial(a,async () => {
      await expire(a); if(!feral(a)) return;
      await chat(a,"Feral turn: pursue the closest sensed creature, prioritizing Bloodied creatures. Dash if needed; use Claw for the compulsory Attack action. Keep further attacks on a creature you damaged if it survived.");
      if(a.system.attributes.hp.value >= a.system.attributes.hp.max) await recover(a);
    });
  });
  on("updateWorldTime",() => {if(authority()) for(const a of actors()) if(hybrid(a) || feral(a)) serial(a,() => expire(a));});
  if(authority()) for(const a of actors()) if(hybrid(a) || feral(a)) await serial(a,() => expire(a));
  ui.notifications.info("SBS Lycanthropy controls active on this client until reload.");
  const selected = canvas.tokens.controlled;
  if(!selected.length) return;
  if(selected.length !== 1) return ui.notifications.warn("Select exactly one token.");
  const a = selected[0].actor;
  if(!a?.isOwner) return ui.notifications.warn("You need ownership of the selected actor.");
  const c = cursed(a);
  const choices = c ? [
    ["transform","Transform voluntarily (Magic action)"],["revert","Revert voluntarily (Magic action)"],
    ["hunt","Check Bloodied / Hunt"],["recovery","Full-HP recovery save (start of turn only)"],
    ["removeSpell","Remove Curse cast — end form only"],["rest","Record completed Short / Long Rest"],
    ["settings","Save full-moon setting"],["rules","Show rules"],
    ...(game.user.isGM ? [["force","GM: force feral (failed save)"],["undo","GM: undo/remove entire curse"]] : [])
  ] : [["apply","Apply Stage 1 Wolf Lycanthropy"]];
  const answer = await new Promise(resolve => new Dialog({title:`SBS Lycanthropy — ${a.name}`,
    content:`<form><p><b>Stage 1 Wolf</b> · ${feral(a) ? "Feral" : hybrid(a) ? "Hybrid" : "Normal form"}</p>
    <p>Run this macro after every reload. GM runs checks; players run it for their local activity guards.</p>
    <div class="form-group"><label>Action</label><select name="action">${choices.map(([v,l]) => `<option value="${v}">${esc(l)}</option>`).join("")}</select></div>
    <div class="form-group"><label>In full-moon light</label><input type="checkbox" name="moon" ${tag(c)?.fullMoon ? "checked" : ""}></div>
    <p>Full-moon light auto-fails the initial Hunt save. It does not auto-fail full-HP recovery.</p></form>`,
    buttons:{go:{label:"Execute",callback:html => resolve({action:html.find('[name="action"]').val(),moon:html.find('[name="moon"]')[0].checked})},cancel:{label:"Cancel",callback:() => resolve(null)}},default:"go",close:() => resolve(null)
  },{width:520}).render(true));
  if(!answer) return;
  await serial(a,async () => {
    if(cursed(a)) await cursed(a).setFlag("world",`${KEY}.fullMoon`,answer.moon);
    switch(answer.action) {
      case "apply": {
        if(cursed(a)) break;
        await a.createEmbeddedDocuments("ActiveEffect",[{name:"Lycanthropy",img:ICON,description:rules,
          flags:flag("curse",{stage:1,kind:"wolf",additionalCreatureTypes:["monstrosity"],huntUsed:false,fullMoon:answer.moon}),changes:[]}]);
        if(!a.items.some(i => tag(i)?.role === "rules")) await a.createEmbeddedDocuments("Item",[{
          name:"Lycanthropy — Hybrid Wolf & Lust for the Hunt",type:"feat",img:ICON,flags:flag("rules"),system:{description:{value:rules}}}]);
        await chat(a,"Stage 1 Wolf Lycanthropy applied. Remain in normal form until transforming or failing Lust for the Hunt. Also counts as a Monstrosity; retain existing types (DM adjudicates targeting).");
        break;
      }
      case "transform": await transform(a); break;
      case "revert":
        if(feral(a)) ui.notifications.warn("Feral form cannot end voluntarily. Full-HP recovery, Remove Curse, or one hour must end it.");
        else if(hybrid(a)) await endForm(a,"Voluntary reversion (Magic action).");
        break;
      case "hunt": {
        const hp = a.system.attributes.hp;
        if(tag(cursed(a)).huntUsed) ui.notifications.info("Bloodied trigger already resolved since the last rest.");
        else if(hp.value > hp.max/2) ui.notifications.warn("Not Bloodied.");
        else await hunt(a);
        break;
      }
      case "recovery": await recover(a); break;
      case "removeSpell": await endForm(a,"Remove Curse cast."); break;
      case "rest": await cursed(a).setFlag("world",`${KEY}.huntUsed`,false); ui.notifications.info("Hunt trigger reset after completed rest."); break;
      case "settings": ui.notifications.info("Full-moon setting saved."); break;
      case "rules": await chat(a,rules); break;
      case "force": if(game.user.isGM) {await cursed(a).setFlag("world",`${KEY}.huntUsed`,true);await transform(a,true);} break;
      case "undo":
        if(game.user.isGM && await Dialog.confirm({title:"Remove the entire curse?",content:"<p>This is a GM undo / exceptional cure, not the Remove Curse spell. Delete this macro's curse, forms, and features?</p>"})) {
          await endForm(a,"GM removal.");
          const eids = a.effects.filter(e => tag(e)).map(e => e.id);
          if(eids.length) await a.deleteEmbeddedDocuments("ActiveEffect",eids);
          const iids = a.items.filter(i => tag(i)).map(i => i.id);
          if(iids.length) await a.deleteEmbeddedDocuments("Item",iids);
        }
        break;
    }
  });
})().catch(e => {console.error("SBS Lycanthropy",e);ui.notifications.error(`Lycanthropy: ${e.message}`);});
