// SBS Armor Models v3 — standalone replacement — Foundry v13, dnd5e 5.2.x, published EFA Armorer.
await (async () => {
async function sbsSyncArmorEntries(a) {
  // SBS_ARMOR_FEATURES_V2
  const KEY="sbsArmorModels",OWN="sbsArmorManaged";
  const s=foundry.utils.deepClone(a.getFlag("world",KEY)??{});
  if(!["dreadnaught","guardian","infiltrator"].includes(s.model))throw Error("Choose an armor model in this macro first.");
  const armor=a.items.get(s.armorId);
  if(!armor)throw Error("The chosen armor item is missing. Choose/refresh the armor model first.");
  const tagged=(i,role)=>i.getFlag("world",OWN)?.role===role;
  const flag=(role,key)=>({world:{[OWN]:{role,model:s.model,key}}});
  const cls=Object.values(a.classes??{}).find(c=>String(c.system?.identifier??c.name).toLowerCase()==="artificer")
    ??a.items.find(i=>i.type==="class"&&i.name.toLowerCase()==="artificer");
  const level=Number(cls?.system.levels??0);
  if(level<3)throw Error("This actor needs at least three Artificer levels.");
  const ranged=s.model==="infiltrator";
  const weaponName=ranged?"Lightning Launcher":s.model==="guardian"?"Thunder Pulse":"Force Demolisher";
  let weapon=a.items.get(s.weaponId);
  if(!weapon||weapon.type!=="weapon"||!tagged(weapon,"weapon"))
    weapon=a.items.find(i=>i.type==="weapon"&&tagged(i,"weapon")&&i.getFlag("world",OWN).model===s.model);
  if(!weapon) {
    const id=foundry.utils.randomID(16),jolt=foundry.utils.randomID(16);
    const type=ranged?"lightning":s.model==="guardian"?"thunder":"force";
    const die=level>=15?(s.model==="guardian"?10:6):(ranged?6:s.model==="guardian"?8:10);
    const reach=s.model==="dreadnaught"?10:5;
    const activities={[id]:{_id:id,name:"Attack",type:"attack",activation:{type:"action",value:1},consumption:{targets:[],spellSlot:false},attack:{ability:"int",type:{value:ranged?"ranged":"melee",classification:"weapon"}},damage:{includeBase:true,parts:[]}}};
    if(ranged)activities[jolt]={_id:jolt,name:"Lightning Jolt — once on your turn",type:"damage",activation:{type:"special",value:1},consumption:{targets:[],spellSlot:false},damage:{parts:[{number:1,denomination:6,types:["lightning"]}]}};
    const giant=s.model==="dreadnaught"&&s.buff?.kind==="giant"&&armor.effects.get(s.buff.effectId);
    const bonusReach=giant?(level>=15?10:5):0;
    [weapon]=await a.createEmbeddedDocuments("Item",[{
      name:`[Armor] ${weaponName}`,type:"weapon",img:"icons/equipment/chest/breastplate-cuirass-steel-grey.webp",flags:flag("weapon","weapon"),
      system:{source:{rules:"2024",custom:"EFA Armorer; SBS automation"},description:{value:"Use while wearing the selected Arcane Armor. Resolve conditional target effects with the GM."},quantity:1,weight:{value:0,units:"lb"},container:null,equipped:true,proficient:1,type:{value:ranged?"simpleR":"simpleM"},properties:s.model==="dreadnaught"?["rch"]:[],magicalBonus:level>=9?1:0,range:{value:ranged?90:null,long:ranged?300:null,reach:ranged?null:reach+bonusReach,units:"ft"},damage:{base:{number:level>=15&&s.model!=="guardian"?2:1,denomination:die,types:[type]}},activities}
    }]);
    if(giant)Object.assign(s.buff,{weaponId:weapon.id,reachBase:reach,reachSet:reach+bonusReach});
  }
  const list=typeof weapon.system.activities?.values==="function"?[...weapon.system.activities.values()]:Object.values(weapon.system.activities??{});
  if(!list.some(x=>x.type==="attack"))throw Error("The model weapon has no Attack activity. Choose/refresh the armor model to rebuild it.");
  // Keep the managed weapon at the top level of Inventory, not inside a container.
  await weapon.update({"system.container":null,"system.equipped":Boolean(armor.system.equipped),"system.quantity":1});
  s.weaponId=weapon.id;await a.setFlag("world",KEY,s);
  // Keep exactly one worn-armor Infiltrator effect; never stack it on refresh.
  let passive;
  for(const item of a.items) {
    const effects=item.effects.filter(e=>tagged(e,"passive"));
    const keep=s.model==="infiltrator"&&item.id===armor.id?effects[0]:null;
    if(keep)passive=keep;
    const extra=effects.filter(e=>e.id!==keep?.id).map(e=>e.id);
    if(extra.length)await item.deleteEmbeddedDocuments("ActiveEffect",extra);
  }
  if(s.model==="infiltrator") {
    const effect={name:"Armorer: Infiltrator",img:weapon.img,origin:armor.uuid,transfer:true,disabled:false,changes:[{key:"system.attributes.movement.walk",mode:2,value:"5",priority:20},{key:"system.skills.ste.roll.mode",mode:2,value:"1",priority:20}],flags:flag("passive","infiltrator")};
    if(passive)await passive.update(effect);
    else await armor.createEmbeddedDocuments("ActiveEffect",[effect]);
  }
  const link=`@UUID[${weapon.uuid}]{Open ${weaponName} weapon}`;
  const defs=s.model==="infiltrator"?[
    ["launcher","Lightning Launcher",`${link}<p>Attack from this weapon in Inventory, or choose Use armor weapon in the macro. Lightning Jolt is a separate damage activity; use it only when eligible.</p>`],
    ["steps","Powered Steps","<p>The armor's managed passive effect supplies the walking-speed bonus while worn.</p>"],
    ["dampening","Dampening Field","<p>The armor's managed passive effect supplies Stealth advantage while worn. Normal advantage/disadvantage cancellation still applies.</p>"]
  ]:s.model==="guardian"?[
    ["pulse","Thunder Pulse",`${link}<p>Resolve the target-dependent attack penalty with the GM.</p>`],
    ["field","Defensive Field","<p>Use Armor Models → Defensive Field to check eligibility and gain temporary HP.</p>"]
  ]:[
    ["demolisher","Force Demolisher",`${link}<p>Resolve size-dependent pushes and pulls with the GM.</p>`],
    ["stature","Giant Stature","<p>Use Armor Models → Giant Stature to spend a use and apply the temporary size/reach benefits.</p>"]
  ];
  if(level>=15)defs.push(["perfected","Perfected Armor",`<p>${s.model==="infiltrator"?"Use the macro for flight; adjudicate glimmer effects with the GM.":s.model==="guardian"?"Use the macro to spend the reaction use; resolve its save, pull and attack with the GM.":"Weapon damage is scaled; Giant Stature offers the enhanced size/reach and Strength benefits."}</p>`]);
  const keep=[];
  for(const [key,name,description] of defs) {
    const data={name,type:"feat",img:weapon.img,flags:flag("feature",key),system:{type:{value:"class"},source:{rules:"2024",custom:"EFA Armorer; SBS automation"},description:{value:description},activities:{}}};
    const existing=a.items.find(i=>tagged(i,"feature")&&i.getFlag("world",OWN).model===s.model&&i.getFlag("world",OWN).key===key);
    let feature;
    if(existing) {await existing.update(data);feature=existing;}
    else [feature]=await a.createEmbeddedDocuments("Item",[data]);
    keep.push(feature.id);
  }
  const stale=a.items.filter(i=>tagged(i,"feature")&&!keep.includes(i.id)).map(i=>i.id);
  if(stale.length)await a.deleteEmbeddedDocuments("Item",stale);
  for(const [key] of defs) {
    if(!a.items.some(i=>tagged(i,"feature")&&i.getFlag("world",OWN).model===s.model&&i.getFlag("world",OWN).key===key))
      throw Error(`Foundry did not retain the ${key} feature entry.`);
  }
  await a.sheet?.render?.(true);
  return {weapon,features:defs.map(x=>x[1])};
}

async function sbsUseArmorWeapon(a) {
  const s=a.getFlag("world","sbsArmorModels")??{};
  const armor=a.items.get(s.armorId),weapon=a.items.get(s.weaponId);
  if(!armor?.system.equipped)throw Error("Equip the selected Arcane Armor first.");
  if(!weapon)throw Error("The model weapon is missing. Choose/refresh the armor model first.");
  const acts=typeof weapon.system.activities?.values==="function"?[...weapon.system.activities.values()]:Object.values(weapon.system.activities??{});
  const attack=acts.find(x=>x.type==="attack");
  if(!attack)throw Error("The model weapon has no Attack activity.");
  const mod=game.modules?.get("midi-qol"),api=mod?.active?(mod.api??globalThis.MidiQOL):null;
  if(typeof api?.completeItemUse==="function")
    return api.completeItemUse(weapon,{midiOptions:{activityId:attack.id??attack._id,workflowOptions:{autoRollAttack:true,fastForwardAttack:false}}},{},{});
  if(typeof attack.use!=="function")throw Error("Foundry did not prepare the weapon activity; refresh the model first.");
  return attack.use({legacy:false});
}

  const KEY = "sbsArmorModels", OWN = "sbsArmorManaged";
  const copy = x => foundry.utils.deepClone(x);
  const tag = (role, extra = {}) => ({world:{[OWN]:{role,...extra}}});
  const managed = (d, role) => d.getFlag("world", OWN)?.role === role;
  const stateOf = a => copy(a.getFlag("world", KEY) ?? {});
  const esc = x => foundry.utils.escapeHTML(String(x ?? ""));
  const choose = async (title, content, options) => {
    return new Promise(resolve => {
      let done = false;
      new Dialog({title,content,buttons:Object.fromEntries(options.map(([id,label]) => [id,{label,callback:html=>{
        done=true;const el=html[0]??html;
        resolve({id,values:Object.fromEntries([...el.querySelectorAll("select, input")].map(e=>[e.name,e.type==="checkbox"?e.checked:e.value]))});
      }}])),close:()=>{if(!done)resolve(null);}}).render(true);
    });
  };
  const change = (key,value,mode=2) => ({key,value:String(value),mode,priority:20});
  const sizes = ["tiny","sm","med","lg","huge","grg"];
  const sizeIndex = size => Math.max(0,sizes.indexOf(size));

  // Reversible cleanup only touches this macro's effects, weapon, and token size.
  async function endBuff(a) {
    const s=stateOf(a), b=s.buff;
    clearTimeout(globalThis.SBSArmorerRuntime?.timers.get(a.uuid));
    globalThis.SBSArmorerRuntime?.timers.delete(a.uuid);
    if(!b)return;
    const armor=a.items.get(b.armorId);
    if(armor?.effects.get(b.effectId))await armor.deleteEmbeddedDocuments("ActiveEffect",[b.effectId]);
    const weapon=a.items.get(b.weaponId);
    if(weapon && managed(weapon,"weapon") && Number(weapon._source.system.range.reach)===b.reachSet)
      await weapon.update({"system.range.reach":b.reachBase});
    const token=b.tokenUuid?await fromUuid(b.tokenUuid):null;
    if(token?.isOwner && b.tokenAfter && token.width===b.tokenAfter.width && token.height===b.tokenAfter.height)
      await token.update(b.tokenBefore);
    delete s.buff;await a.setFlag("world",KEY,s);
  }
  async function cleanup(a) {
    if(!a?.isOwner)return;
    let s=stateOf(a), b=s.buff;
    if(b) {
      const c=game.combat;
      const armor=a.items.get(b.armorId);
      if(!b.combatId && c?.started) {
        const remaining=Math.min(b.until-game.time.worldTime, (b.realUntil-Date.now())/1000);
        if(remaining>0) {
          Object.assign(b,{combatId:c.id,round:c.round,turn:c.turn,roundLimit:Math.ceil(remaining/6)});
          await a.setFlag("world",KEY,s);
          clearTimeout(globalThis.SBSArmorerRuntime?.timers.get(a.uuid));
        }
      }
      if(b.kind==="giant" && b.combatId && (!c?.started || c.id!==b.combatId)) {
        const left=Math.max(0,Math.min(b.until-game.time.worldTime, ((b.roundLimit??10)-Math.max(0,(b.lastRound??b.round)-b.round))*6));
        if(left>0) {
          Object.assign(b,{combatId:null,until:game.time.worldTime+left,realUntil:Date.now()+left*1000});
          await a.setFlag("world",KEY,s);
          const rt=globalThis.SBSArmorerRuntime;
          clearTimeout(rt.timers.get(a.uuid));
          rt.timers.set(a.uuid,setTimeout(async()=>{try{if(stateOf(a).buff?.effectId===b.effectId){if(game.combat?.started)await cleanup(a);else await endBuff(a);}}catch(e){console.error("Armorer expiry",e);}},left*1000));
        }
      }
      if(b.combatId && c?.id===b.combatId && b.lastRound!==c.round) {
        b.lastRound=c.round;await a.setFlag("world",KEY,s);
      }
      const endedTurn=b.kind==="flight" && b.combatId && c?.id===b.combatId && (c.round!==b.round||c.turn!==b.turn);
      const endedRounds=b.kind==="giant" && b.combatId && c?.id===b.combatId &&
        ((c.round-b.round)>(b.roundLimit??10) || ((c.round-b.round)===(b.roundLimit??10) && c.turn>=b.turn));
      const expired=!b.combatId ? game.time.worldTime>=b.until : !c?.started || c.id!==b.combatId || endedTurn || endedRounds;
      if(!armor?.system.equipped || !armor.effects.get(b.effectId) || expired)await endBuff(a);
    }
    s=stateOf(a);
    if(s.field && !a.items.get(s.field.armorId)?.system.equipped) {
      if(Number(a.system.attributes.hp.temp)===s.field.amount)await a.update({"system.attributes.hp.temp":0});
      delete s.field;await a.setFlag("world",KEY,s);
    }
  }
  // Hooks last for this session. Running the macro again also repairs expired buffs.
  const runtime=globalThis.SBSArmorerRuntime??={busy:new Set(),actors:new Map(),installed:false,timers:new Map()};
  if(!runtime.installed) {
    runtime.installed=true;
    const sweep=async()=>{
      for(const a of runtime.actors.values()) {
        if(runtime.busy.has(a.uuid))continue;
        runtime.busy.add(a.uuid);
        try{await cleanup(a);}catch(e){console.error("Armorer cleanup",e);}finally{runtime.busy.delete(a.uuid);}
      }
    };
    Hooks.on("updateWorldTime",sweep);Hooks.on("updateCombat",sweep);Hooks.on("deleteCombat",sweep);
    Hooks.on("updateItem",item=>{if(item.parent?.documentName==="Actor")sweep();});
  }
  const selected=canvas?.tokens?.controlled??[];
  if(selected.length>1)return ui.notifications.warn("Select just the artificer's token.");
  const a=selected[0]?.actor??game.user.character;
  if(!a?.isOwner)return ui.notifications.warn("Select the artificer's token, or assign your character first.");
  const cls=Object.values(a.classes??{}).find(c=>String(c.system?.identifier??c.name).toLowerCase()==="artificer")
    ??a.items.find(i=>i.type==="class"&&i.name.toLowerCase()==="artificer");
  const level=Number(cls?.system.levels??0);
  if(level<3)return ui.notifications.warn("This character needs at least 3 Artificer levels and the Armorer subclass.");
  if(!a.items.some(i=>(i.type==="subclass"&&/armorer/i.test(i.name))||/armor model|arcane armor/i.test(i.name)))
    return ui.notifications.warn("Import the Armorer subclass or its Armor Model feature first.");
  if(runtime.busy.has(a.uuid))return ui.notifications.warn("The armor menu is already open for this character.");
  runtime.busy.add(a.uuid);runtime.actors.set(a.uuid,a);
  const artInt=Math.max(1,Number(a.system.abilities.int.mod)||0);
  const counter=async key=>{
    let item=a.items.find(i=>managed(i,"resource")&&i.getFlag("world",OWN).key===key)
      ??a.items.find(i=>i.type==="feat" && String(i.name).toLowerCase().replace(/[^a-z0-9]/g,"").endsWith(key.toLowerCase().replace(/[^a-z0-9]/g,"")) && i._source.system.uses?.max);
    if(!item)[item]=await a.createEmbeddedDocuments("Item",[{name:`Armorer Uses: ${key}`,type:"feat",img:"icons/equipment/chest/breastplate-cuirass-steel-grey.webp",
      system:{description:{value:"Long-rest counter managed by Armor Models. Use the macro to activate the ability."},uses:{max:"max(1, @abilities.int.mod)",spent:0,recovery:[{period:"lr",type:"recoverAll"}]}},flags:tag("resource",{key})}]);
    return item;
  };
  const spend=async item=>{
    const spent=Number(item._source.system.uses.spent)||0;
    if(spent>=artInt)throw Error("No uses remain. Finish a normal Foundry Long Rest to recover them.");
    await item.update({"system.uses.spent":spent+1});return spent;
  };
  const requireArmor=()=>{
    const s=stateOf(a),armor=a.items.get(s.armorId);
    if(!armor?.system.equipped)throw Error("Equip the selected Arcane Armor first.");
    return {s,armor};
  };
  try {
    await cleanup(a);
    let s=stateOf(a);
    if(s.model&&a.items.get(s.armorId)) {await sbsSyncArmorEntries(a);s=stateOf(a);}
    const options=[["switch","Choose / refresh armor model"]];
    if(s.model==="guardian")options.push(["field","Defensive Field"]);
    if(s.model==="dreadnaught")options.push(["giant","Giant Stature"]);
    if(s.model==="infiltrator"&&level>=15)options.push(["flight","Perfected Armor: Flight"]);
    if(s.model==="guardian"&&level>=15)options.push(["reaction","Spend Perfected Guardian reaction"]);
    if(s.buff)options.push(["end","End current temporary buff"]);
    if(s.model)options.push(["remove","Remove macro's armor setup"]);
    options.push(["cancel","Close"]);
    if(s.weaponId)options.splice(1,0,["armor-attack","Use armor weapon"]);
    const menu=await choose(`${a.name}: Armor Models`, `<p>Current model: <b>${esc(s.model??"not configured")}</b></p><p>Use model abilities here. Use the <b>[Armor]</b> weapon on the sheet for attacks.</p>`,options);
    if(!menu||menu.id==="cancel")return;
    if(menu.id==="armor-attack"){requireArmor();await sbsUseArmorWeapon(a);return;}
    if(menu.id==="end"){await endBuff(a);return;}
    if(menu.id==="remove") {
      await endBuff(a);
      for(const item of a.items) {
        const ids=item.effects.filter(e=>managed(e,"passive")).map(e=>e.id);
        if(ids.length)await item.deleteEmbeddedDocuments("ActiveEffect",ids);
      }
      const ids=a.items.filter(i=>managed(i,"weapon")||managed(i,"feature")).map(i=>i.id);
      if(ids.length)await a.deleteEmbeddedDocuments("Item",ids);
      // Retain resource counters so removing/reinstalling cannot refill uses.
      s=stateOf(a);delete s.model;delete s.armorId;delete s.weaponId;await a.setFlag("world",KEY,s);
      ui.notifications.info("Armorer setup removed; long-rest counters were preserved.");return;
    }
    if(menu.id==="switch") {
      const armors=a.items.filter(i=>i.type==="equipment"&&["light","medium","heavy"].includes(i.system.type?.value));
      if(!armors.length)throw Error("Add the character's actual armor item to the sheet first.");
      const picked=await choose("Configure Arcane Armor",`<p>Change models after a Short or Long Rest with Smith's Tools. Refreshing the same model does not restore uses.</p><label>Model <select name="model">${["dreadnaught","guardian","infiltrator"].map(m=>`<option value="${m}" ${s.model===m?"selected":""}>${esc(m[0].toUpperCase()+m.slice(1))}</option>`).join("")}</select></label><br><label>Armor <select name="armor">${armors.map(i=>`<option value="${i.id}" ${i.id===s.armorId||(!s.armorId&&i.system.equipped)?"selected":""}>${esc(i.name)}</option>`).join("")}</select></label><p><label><input name="rest" type="checkbox"> Initial setup, or rest finished; Smith's Tools available.</label></p>`,[["apply","Apply"],["cancel","Cancel"]]);
      if(!picked||picked.id!=="apply")return;
      const model=picked.values.model,armor=a.items.get(picked.values.armor);
      if(!armor?.system.equipped)throw Error("Equip that armor first, then run the macro again.");
      if(s.model&&(s.model!==model||s.armorId!==armor.id)&&!picked.values.rest)throw Error("Confirm the rest and tools before changing models.");
      const conflicts=[...a.allApplicableEffects()].filter(e=>!e.disabled&&!e.isSuppressed&&!e.getFlag("world",OWN)&&/powered steps|dampening field|giant stature/i.test(e.name));
      if(conflicts.length)throw Error(`Disable existing model effects first to avoid stacking: ${conflicts.map(e=>e.name).join(", ")}`);
      const ranged=model==="infiltrator",die=level>=15?(model==="guardian"?10:6):(model==="dreadnaught"?10:model==="guardian"?8:6);
      const count=level>=15&&model!=="guardian"?2:1;
      const name=model==="dreadnaught"?"Force Demolisher":model==="guardian"?"Thunder Pulse":"Lightning Launcher";
      const type=model==="dreadnaught"?"force":model==="guardian"?"thunder":"lightning";
      const attackId=foundry.utils.randomID(16),joltId=foundry.utils.randomID(16);
      const activities={[attackId]:{_id:attackId,name:"Attack",type:"attack",activation:{type:"action",value:1},consumption:{targets:[],spellSlot:false},attack:{ability:"int",type:{value:ranged?"ranged":"melee",classification:"weapon"}},damage:{includeBase:true,parts:[]}}};
      if(ranged)activities[joltId]={_id:joltId,name:"Lightning Jolt — once on your turn",type:"damage",activation:{type:"special",value:1},consumption:{targets:[],spellSlot:false},damage:{parts:[{number:1,denomination:6,types:["lightning"]}]}};
      const desc=model==="dreadnaught"?"Size-dependent push/pull: resolve target movement with the GM.":model==="guardian"?"Resolve the target-dependent attack penalty with the GM.":"Jolt is a separate once-per-turn damage roll; it is not included in the normal attack damage.";
      const data={name:`[Armor] ${name}`,type:"weapon",img:"icons/equipment/chest/breastplate-cuirass-steel-grey.webp",flags:tag("weapon",{model}),
        system:{description:{value:`<p>${desc}</p><p>Requires the selected, worn Arcane Armor. Do not use this weapon when that armor is unequipped.</p>`},source:{rules:"2024",custom:"EFA Armorer; SBS automation"},quantity:1,weight:{value:0,units:"lb"},equipped:true,proficient:1,type:{value:ranged?"simpleR":"simpleM"},properties:model==="dreadnaught"?["rch"]:[],magicalBonus:level>=9?1:0,range:{value:ranged?90:null,long:ranged?300:null,reach:ranged?null:model==="dreadnaught"?10:5,units:"ft"},damage:{base:{number:count,denomination:die,types:[type]}},activities}};
      if(model==="dreadnaught")await counter("Giant Stature");
      if(level>=15&&model==="guardian")await counter("Perfected Guardian");
      if(level>=15&&model==="infiltrator")await counter("Perfected Flight");
      const backupState=stateOf(a);
      const backupItems=a.items.filter(i=>managed(i,"weapon")||managed(i,"feature")).map(i=>i.toObject());
      const backupEffects=[...a.items].flatMap(i=>i.effects.filter(e=>managed(e,"passive")).map(e=>({parentId:i.id,data:e.toObject()})));
      if(backupState.buff) {
        const old=backupItems.find(i=>i._id===backupState.buff.weaponId);
        if(old)old.system.range.reach=backupState.buff.reachBase;
        delete backupState.buff;
      }
      // Stage valid documents first; preserve the previous setup on creation errors.
      const [newWeapon]=await a.createEmbeddedDocuments("Item",[data]);
      let newEffect;
      try {
        if(model==="infiltrator")[newEffect]=await armor.createEmbeddedDocuments("ActiveEffect",[{name:"Armorer: Infiltrator",img:newWeapon.img,origin:armor.uuid,transfer:true,disabled:false,changes:[change("system.attributes.movement.walk",5),change("system.skills.ste.roll.mode",1)],flags:tag("passive")}]);
      } catch(error){await a.deleteEmbeddedDocuments("Item",[newWeapon.id]);throw error;}
      try {
        await endBuff(a);
        for(const item of a.items) {
          const ids=item.effects.filter(e=>managed(e,"passive")&&e.id!==newEffect?.id).map(e=>e.id);
          if(ids.length)await item.deleteEmbeddedDocuments("ActiveEffect",ids);
        }
        const ids=a.items.filter(i=>(managed(i,"weapon")||managed(i,"feature"))&&i.id!==newWeapon.id).map(i=>i.id);
        if(ids.length)await a.deleteEmbeddedDocuments("Item",ids);
        const next=stateOf(a);Object.assign(next,{model,armorId:armor.id,weaponId:newWeapon.id});await a.setFlag("world",KEY,next);
      } catch(error){
        try {
          if(armor.effects.get(newEffect?.id))await armor.deleteEmbeddedDocuments("ActiveEffect",[newEffect.id]);
          if(a.items.get(newWeapon.id))await a.deleteEmbeddedDocuments("Item",[newWeapon.id]);
          const missing=backupItems.filter(i=>!a.items.get(i._id));
          if(missing.length)await a.createEmbeddedDocuments("Item",missing,{keepId:true});
          for(const saved of backupEffects) {
            const parent=a.items.get(saved.parentId);
            if(parent&&!parent.effects.get(saved.data._id))await parent.createEmbeddedDocuments("ActiveEffect",[saved.data],{keepId:true});
          }
          await a.setFlag("world",KEY,backupState);
        }catch(rollbackError){console.error("Armorer rollback failed",rollbackError,backupState);}
        throw error;
      }
      ui.notifications.info(`${a.name}: ${model} ready. Use [Armor] ${name} for attacks; run this macro for model abilities.`);
      await sbsSyncArmorEntries(a);
      a.sheet?.render(false);return;
    }
    const current=requireArmor();s=current.s;const armor=current.armor;
    if(menu.id==="field") {
      const hp=a.system.attributes.hp;
      if(s.model!=="guardian"||hp.value<=0||hp.value>Math.floor(hp.max/2))throw Error("Defensive Field requires Guardian armor and a conscious, Bloodied artificer.");
      if(Number(hp.temp||0)>=level)return ui.notifications.info("Your current temporary HP are already as high or higher.");
      await a.update({"system.attributes.hp.temp":level});s.field={armorId:armor.id,amount:level};await a.setFlag("world",KEY,s);return;
    }
    if(menu.id==="reaction") {
      if(s.model!=="guardian"||level<15)throw Error("Perfected Guardian requires Artificer 15.");
      await spend(await counter("Perfected Guardian"));
      ui.notifications.info("Reaction use spent. Resolve the target's save, pull, and possible attack with the GM.");return;
    }
    if(!["giant","flight"].includes(menu.id))return;
    if(s.buff)throw Error("End the current temporary buff before activating another.");
    const giant=menu.id==="giant";
    if(giant?s.model!=="dreadnaught":s.model!=="infiltrator"||level<15)throw Error("That ability is not available for the current model and level.");
    let chosenSize=a.system.traits.size;
    if(giant) {
      const pick=await choose("Giant Stature",`<p>Choose a size that fits in the available space.</p><select name="size"><option value="lg">Large</option>${level>=15?'<option value="huge">Huge</option>':""}<option value="keep">Keep current size (no room)</option></select>`,[["use","Use Bonus Action"],["cancel","Cancel"]]);
      if(!pick||pick.id!=="use")return;
      if(pick.values.size!=="keep"&&sizeIndex(pick.values.size)>sizeIndex(chosenSize))chosenSize=pick.values.size;
    }
    const res=await counter(giant?"Giant Stature":"Perfected Flight"),oldSpent=await spend(res);
    const token=selected[0]?.document;
    const c=game.combat,weapon=a.items.get(s.weaponId),reach=Number(weapon?._source.system.range.reach)||10;
    const changes=giant?[change("system.traits.size",chosenSize,5)]:[change("system.attributes.movement.fly",Number(a.system.attributes.movement.walk)*2,4)];
    if(giant&&level>=15)changes.push(change("system.abilities.str.check.roll.mode",1),change("system.abilities.str.save.roll.mode",1));
    const seconds=giant?60:6,kind=giant?"giant":"flight";
    let effect;
    try {
      [effect]=await armor.createEmbeddedDocuments("ActiveEffect",[{name:`Armorer: ${giant?"Giant Stature":"Perfected Flight"}`,img:"icons/magic/control/buff-strength-muscle-damage-red.webp",transfer:true,origin:armor.uuid,changes,duration:{seconds,startTime:game.time.worldTime,rounds:giant?10:1,startRound:c?.round,startTurn:c?.turn},flags:tag("buff")}]);
      s.buff={kind,armorId:armor.id,effectId:effect.id,until:game.time.worldTime+seconds,realUntil:Date.now()+seconds*1000,combatId:c?.started?c.id:null,round:c?.round,turn:c?.turn};
      if(giant&&weapon) {s.buff.weaponId=weapon.id;s.buff.reachBase=reach;s.buff.reachSet=reach+(level>=15?10:5);}
      if(giant&&token&&sizeIndex(chosenSize)>sizeIndex(a._source.system.traits.size)) {
        const dim=chosenSize==="huge"?3:2;
        s.buff.tokenUuid=token.uuid;s.buff.tokenBefore={width:token.width,height:token.height};s.buff.tokenAfter={width:Math.max(token.width,dim),height:Math.max(token.height,dim)};
      }
      // Save cleanup data before applying reversible item/token changes.
      await a.setFlag("world",KEY,s);
      if(s.buff.weaponId)await weapon.update({"system.range.reach":s.buff.reachSet});
      if(s.buff.tokenUuid)await token.update(s.buff.tokenAfter);
    } catch(error) {
      if(stateOf(a).buff)await endBuff(a);
      else if(effect)await armor.deleteEmbeddedDocuments("ActiveEffect",[effect.id]);
      await res.update({"system.uses.spent":oldSpent});throw error;
    }
    if(!c?.started) {
      clearTimeout(runtime.timers.get(a.uuid));
      runtime.timers.set(a.uuid,setTimeout(async()=>{try{if(stateOf(a).buff?.effectId!==effect.id)return;if(game.combat?.started)await cleanup(a);else await endBuff(a);}catch(e){console.error("Armorer expiry",e);}},seconds*1000));
    }
    ui.notifications.info(`${giant?"Giant Stature":"Perfected Flight"} activated. Run the macro to end it early.`);
  } catch(error) {console.error("Armor Models",error);ui.notifications.error(error.message??String(error));}
  finally {runtime.busy.delete(a.uuid);}
})();
