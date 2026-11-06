await (async () => {
async function sbsSyncArmorEntries(a) {
  // SBS_ARMOR_FEATURES_V2
  const KEY="sbsArmorModels",OWN="sbsArmorManaged";
  const s=foundry.utils.deepClone(a.getFlag("world",KEY)??{});
  if(!["dreadnaught","guardian","infiltrator"].includes(s.model))throw Error("Choose an armor model with the original macro first.");
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

  // SBS ARMOR REPAIR V2
  if(!game.user.isGM)return ui.notifications.warn("Run this repair once as GM with the artificer's token selected.");
  const selected=canvas?.tokens?.controlled??[];
  if(selected.length!==1||!selected[0].actor)return ui.notifications.warn("Select only the artificer's token, then run this repair.");
  const a=selected[0].actor;
  const candidates=game.macros.filter(m=>m.type==="script"&&m.command.includes("sbsArmorModels")&&m.command.includes("sbsArmorManaged")&&m.command.includes("Choose / refresh armor model")&&!m.command.includes("SBS ARMOR REPAIR V2"));
  try {
    if(!candidates.length)throw Error("The original Armor Models macro was not found. Create/save it as a Script macro first.");
    let macro=candidates[0];
    if(candidates.length>1) {
      const id=await new Promise(resolve=>{
        let done=false;
        new Dialog({title:"Which Armor Models macro should be fixed?",content:`<select>${candidates.map(m=>`<option value="${m.id}">${foundry.utils.escapeHTML(m.name)}</option>`).join("")}</select>`,buttons:{fix:{label:"Fix this macro",callback:html=>{done=true;resolve((html[0]??html).querySelector("select").value);}},cancel:{label:"Cancel"}},close:()=>{if(!done)resolve(null);}}).render(true);
      });
      if(!id)return;
      macro=candidates.find(m=>m.id===id);
    }
    let command=macro.command;
    if(!command.includes("SBS_ARMOR_FEATURES_V2")) {
      const start=/await\s*\(\s*async\s*\(\s*\)\s*=>\s*\{/g;
      const render=/a\s*\.\s*sheet\s*\?\.\s*render\s*\(\s*false\s*\)\s*;/g;
      const menu=/const\s+menu\s*=\s*await\s+choose\s*\(/g;
      const cancel=/if\s*\(\s*!menu\s*\|\|\s*menu\.id\s*===\s*"cancel"\s*\)\s*return\s*;/g;
      for(const pattern of [start,render,menu,cancel]) {
        if([...command.matchAll(pattern)].length!==1)throw Error("This copy differs from the original macro. Replace it using the updated full armor-models.js instead.");
      }
      command=command.replace(start,match=>`${match}\n${sbsSyncArmorEntries.toString()}\n${sbsUseArmorWeapon.toString()}\n`)
        .replace(render,match=>`await sbsSyncArmorEntries(a);\n${match}`)
        .replace(menu,match=>`if(s.weaponId)options.splice(1,0,["armor-attack","Use armor weapon"]);\n${match}`)
        .replace(cancel,match=>`${match}\nif(menu.id==="armor-attack"){requireArmor();await sbsUseArmorWeapon(a);return;}\n`);
      const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
      new AsyncFunction("speaker","actor","token","character","scope",command);
      if(!macro.getFlag("world","sbsArmorBeforeFeatureFix"))await macro.setFlag("world","sbsArmorBeforeFeatureFix",macro.command);
      await macro.update({command});
    }
    const result=await sbsSyncArmorEntries(a);
    ui.notifications.info(`${a.name}: repaired ${result.weapon.name}; Features now include ${result.features.join(", ")}. No ability uses were reset.`);
    result.weapon.sheet?.render(true);
  }catch(error){console.error("Armorer feature repair",error);ui.notifications.error(error.message??String(error));}

})();
