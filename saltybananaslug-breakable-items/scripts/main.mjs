import {ID,PHYSICAL_TYPES,UNBREAKABLE_PROPERTY,numeric,tracked,stateFor,usable,condition,damagePercent,protectionFor,hasItemProperty,attackHits,isBodyArmor} from './core.mjs';
import {registerSettings,settings,migrateUseProfiles} from './settings.mjs';
import {registerSocket,request,primaryGM,inCombat,canManage,toolInfo,esc} from './service.mjs';
import {EquipmentTracker,BreakableSetup,defaultActor,run,refreshWindows,bar,badgeText,configureItemDialog,damageDialog,protectionDialog,protectionLabel,repairDialog,recordUseDialog,approvePaid,approveBatchDialog,toolRolesDialog,castMendingDialog,mendingTargetPrompt} from './ui.mjs';
import {damageDicePenaltyActive,prepareWeaponDamageConfig,adjustWeaponRollConfig,finalizeWeaponDamageDice,weaponDamageSummary} from './damage-dice.mjs';
import {toolSupport,isAttuned,migrateRepairerTokens} from './repairers.mjs';
import {TOOLS} from './core.mjs';
import {isMendingSource} from './mending.mjs';
import {maybeShowReleaseNotice,closeReleaseNotice} from './notices.mjs';

let tracker;
const seenRolls=new WeakSet();
const pendingRenders=new Map();
const observedSheets=new Set();
const nativeConsumption=new Set();
const seenArmorUpdates=new WeakSet();
const seenMendingCasts=new Set();
export function openTracker(actor,itemId){
 const chosen=(actor?.actor??actor)??defaultActor();
 if(chosen&&!canManage(game.user,chosen))return ui.notifications.warn('You cannot manage that character’s equipment.');
 if(!tracker||!tracker.rendered||tracker.durabilityClosing)tracker=new EquipmentTracker({...(chosen?{actorUuid:chosen.uuid}:{}),...(itemId?{itemId}:{})});
 else{tracker.actorUuid=chosen?.uuid??null;if(itemId)tracker.selected=itemId;}
 void tracker.render({force:true});return tracker;
}
let tokenSelectionTimer;
Hooks.on('controlToken',()=>{
 clearTimeout(tokenSelectionTimer);tokenSelectionTimer=setTimeout(()=>{
  if(!tracker?.rendered||tracker.durabilityClosing)return;
  const actor=defaultActor();if((actor?.uuid??null)!==tracker.actorUuid){tracker.actorUuid=actor?.uuid??null;tracker.selected=null;void tracker.render({force:false});}
 },0);
});
export async function createMacro(){
 if(!game.user.isGM)return null;
 const command=`const module = game.modules.get("${ID}");\nif (!module?.active || !module.api) {\n  ui.notifications.warn("Enable SaltyBananaSlug's Breakable Items first.");\n} else {\n  module.api.open();\n}`;
 const existing=[...game.macros].find(m=>m.flags?.[ID]?.launcher);
 const data={name:'SBS — Equipment Tracker',type:'script',img:'icons/skills/trades/smithing-anvil-silver-red.webp',command,ownership:{default:2},flags:{[ID]:{launcher:true}}};
 if(existing){if(existing.command!==command)await existing.update({command});return existing;}
 return Macro.create(data);
}
function registerHub(hub=game.sbsHub){hub?.register({id:`${ID}:tracker`,moduleId:ID,label:'Equipment Tracker',gmOnly:false,open:()=>openTracker()});}
export function registerUnbreakableProperty(){
 const cfg=globalThis.CONFIG?.DND5E;if(!cfg)return;
 cfg.itemProperties??={};cfg.itemProperties[UNBREAKABLE_PROPERTY]={label:'Unbreakable',isPhysical:true,icon:'icons/svg/shield.svg'};
 for(const type of PHYSICAL_TYPES)cfg.validProperties?.[type]?.add?.(UNBREAKABLE_PROPERTY);
}
Hooks.once('init',()=>{
 registerUnbreakableProperty();
 registerSettings(EquipmentTracker,BreakableSetup);
 const api={open:openTracker,openTracker,setup:()=>new BreakableSetup().render({force:true}),createMacro,inspect:item=>({state:stateFor(item,settings().profiles,settings().durability),tracked:tracked(item,settings().rules)}),
  damage:(item,amount,reason)=>request('damage',typeof item==='string'?item:item.uuid,{amount,reason}),
  recordUse:(item,amount=1,options={})=>request('wear',typeof item==='string'?item:item.uuid,{...options,amount,kind:'use',eventId:foundry.utils.randomID(24)}),
  mending:item=>castMendingDialog(item),
  toolRoles:item=>toolRolesDialog(item),
  help:()=>maybeShowReleaseNotice({force:true,open:()=>openTracker(),setup:()=>new BreakableSetup().render({force:true})}),
  repair:(item,hp,options={})=>request('repair',typeof item==='string'?item:item.uuid,{hp,repairerUuid:typeof options.repairer==='string'?options.repairer:options.repairer?.uuid??options.repairerUuid}),
  setUnbreakable:(item,options={})=>request('protection',typeof item==='string'?item:item.uuid,options),
  armorHit:actor=>request('armorHit',typeof actor==='string'?actor:actor.uuid,{eventId:foundry.utils.randomID(24),reason:'GM recorded a confirmed hit'})};
 game.modules.get(ID).api=api;game.sbsBreakableItems=api;
});
Hooks.once('ready',async()=>{
 if(game.system.id!=='dnd5e'){ui.notifications.error('Breakable Items requires the D&D5e system.');return;}
 registerSocket();registerHub();
 if(game.user.isGM&&primaryGM()?.id===game.user.id){await migrateUseProfiles();await migrateRepairerTokens();}
 if(game.user.isGM&&primaryGM()?.id===game.user.id&&game.settings.get(ID,'createMacro'))void run(createMacro);
 maybeShowReleaseNotice({open:()=>openTracker(),setup:()=>new BreakableSetup().render({force:true})});
});
Hooks.on(`${ID}.notices`,enabled=>{if(!enabled)closeReleaseNotice();});
Hooks.on('sbsHubReady',registerHub);
Hooks.once('setup',registerUnbreakableProperty);

export function guardUse(subject){
 const item=subject?.item??(subject?.documentName==='Item'?subject:null);if(!item||!tracked(item,settings().rules))return;
 const s=stateFor(item,settings().profiles,settings().durability);if(!usable(s)){ui.notifications.warn(`${item.name} is ${s.destroyed?'destroyed':'broken'} and cannot be used.`);return false;}
}
Hooks.on('dnd5e.preUseActivity',activity=>guardUse(activity));
for(const event of ['dnd5e.preRollAttack','dnd5e.preRollDamage','dnd5e.preRollFormula'])Hooks.on(event,config=>guardUse(config?.subject??config));
Hooks.on('dnd5e.preRollDamage',process=>{if(guardUse(process?.subject)===false)return false;prepareWeaponDamageConfig(process,settings());});
Hooks.on('dnd5e.postBuildDamageRollConfig',(process,roll)=>adjustWeaponRollConfig(process,roll,settings()));
Hooks.on('dnd5e.postDamageRollConfiguration',(rolls,process)=>{if(guardUse(process?.subject)===false)return false;finalizeWeaponDamageDice(rolls,process,settings());});
Hooks.on('dnd5e.postRollConfiguration',(_rolls,process)=>guardUse(process?.subject??process));
Hooks.on('preUpdateItem',(item,changed,options)=>{
 if(!options?.sbsBreakable&&!game.user.isGM){
  const properties=changed['system.properties']??changed.system?.properties,p=properties===undefined?undefined:{system:{properties}};
  if(p&&hasItemProperty(p,UNBREAKABLE_PROPERTY)!==hasItemProperty(item,UNBREAKABLE_PROPERTY)||changed[`flags.${ID}.protection`]!==undefined||changed.flags?.[ID]?.protection!==undefined){ui.notifications.warn('The GM controls Unbreakable protection.');return false;}
 }
 if(options?.sbsBreakable||!tracked(item,settings().rules)||usable(stateFor(item,settings().profiles,settings().durability)))return;
 const equipped=changed['system.equipped']??changed.system?.equipped;
 if(equipped===true){ui.notifications.warn(`${item.name} cannot be equipped while broken or destroyed.`);return false;}
});
export function damageRollData(rolls,{subject}={}) {
 const item=subject?.item;
 if(!item||item.type!=='weapon'||!Array.isArray(rolls)||!rolls.length)return null;
 if(rolls.some(r=>r&&seenRolls.has(r)))return null;
 for(const r of rolls)if(r&&typeof r==='object')seenRolls.add(r);
 const cfg=settings();if(!tracked(item,cfg.rules))return null;
 const s=stateFor(item,cfg.profiles,cfg.durability),c={...cfg.profiles[s.profile],...s.config};
 if(c.mode!=='damage'||!usable(s))return null;
 const critical=rolls.some(r=>r.isCritical===true||r.options?.isCritical===true);
 const amount=rolls.filter(r=>!['healing','temphp'].includes(r.options?.type)).reduce((n,r)=>n+Math.max(0,numeric(r.total)),0);
 return {item,amount,critical,eventId:foundry.utils.randomID(24)};
}
Hooks.on('dnd5e.rollDamage',(rolls,data)=>{
 const event=damageRollData(rolls,data);if(event)void run(()=>request('wear',event.item.uuid,{amount:event.amount,critical:event.critical,eventId:event.eventId,kind:'damage'}));
});
Hooks.on('dnd5e.postUseActivity',(activity,_usage,results)=>{
 const item=activity?.item,cfg=settings();if(!item||!results)return;
 if(isMendingSource(item,activity)){const id=results.message?.id;if(id&&!seenMendingCasts.has(id)){seenMendingCasts.add(id);if(seenMendingCasts.size>200)seenMendingCasts.delete(seenMendingCasts.values().next().value);void run(()=>mendingTargetPrompt(activity,_usage,results));}}
 if(!tracked(item,cfg.rules))return;
 const s=stateFor(item,cfg.profiles,cfg.durability),c={...cfg.profiles[s.profile],...s.config};
 if(c.mode!=='manual'&&(item.type!=='weapon'||!['attack','damage'].includes(activity.type))&&(item.type!=='tool'||activity.type!=='check')&&item.actor?.items?.has(item.id))void run(()=>request('wear',item.uuid,{amount:1,kind:'use',eventId:`use:${results.message?.id??foundry.utils.randomID(24)}:${item.id}`}));
});
Hooks.on('dnd5e.rollAttack',(rolls,{subject}={})=>{
 const cfg=settings(),item=subject?.item;if(!item||!tracked(item,cfg.rules))return;
 const s=stateFor(item,cfg.profiles,cfg.durability),c={...cfg.profiles[s.profile],...s.config};
 if(item.type==='weapon'&&c.mode==='use')void run(()=>request('wear',item.uuid,{amount:1,kind:'use',critical:rolls?.some(r=>r.isCritical===true),eventId:foundry.utils.randomID(24)}));
 if(!cfg.rules.fumblePrompt)return;
 const fumble=rolls?.some(r=>r.dice?.some(d=>d.faces===20&&d.results?.some(v=>v.active!==false&&v.result===1)));
 if(fumble)void run(()=>request('fumble',item.uuid));
});
Hooks.on('dnd5e.rollAttack',(_rolls,{subject,ammoUpdate}={})=>{
 const ammo=subject?.actor?.items?.get(ammoUpdate?.id);if(!ammo||ammo.id===subject.item?.id||!tracked(ammo,settings().rules))return;
 void run(()=>request('wear',ammo.uuid,{amount:1,kind:'use',eventId:foundry.utils.randomID(24),reason:'Ammunition used'}));
});
Hooks.on('dnd5e.rollToolCheck',(rolls,data)=>{
 const actor=data?.subject;if(actor?.documentName!=='Actor'||!Array.isArray(rolls)||!rolls.length||seenRolls.has(rolls[0]))return;
 if(rolls[0].options?.sbsBreakableRepair||rolls[0].parent?.flags?.[ID]?.repairCheck)return;
 seenRolls.add(rolls[0]);const cfg=settings();
 const item=toolInfo(actor,data.tool).tool;if(!item||!tracked(item,cfg.rules))return;
 const s=stateFor(item,cfg.profiles,cfg.durability),c={...cfg.profiles[s.profile],...s.config};
 if(c.mode!=='manual')void run(()=>request('wear',item.uuid,{amount:1,kind:'use',eventId:foundry.utils.randomID(24)}));
});
Hooks.on('dnd5e.activityConsumption',(activity,_usage,_message,updates)=>{for(const update of updates.item??[])nativeConsumption.add(`${activity.actor?.uuid}:${update._id}`);});
Hooks.on('dnd5e.postActivityConsumption',(activity,_usage,_message,updates)=>{
 for(const update of updates.item??[]){const key=`${activity.actor?.uuid}:${update._id}`;nativeConsumption.delete(key);const item=activity.actor?.items?.get(update._id);if(!item||item.id===activity.item?.id||!tracked(item,settings().rules))continue;void run(()=>request('wear',item.uuid,{amount:1,kind:'use',eventId:foundry.utils.randomID(24),reason:'Item resource used by an activity'}));}
});
Hooks.on('preUpdateItem',(item,changed,options)=>{
 if(options?.sbsBreakable||nativeConsumption.has(`${item.actor?.uuid}:${item.id}`)||!tracked(item,settings().rules))return;
 const spent=changed['system.uses.spent']??changed.system?.uses?.spent,value=changed['system.uses.value']??changed.system?.uses?.value;
 if(spent!==undefined&&numeric(spent)>numeric(item.system?.uses?.spent)||value!==undefined&&numeric(value)<numeric(item.system?.uses?.value))options.sbsRecordedUse=foundry.utils.randomID(24);
});
Hooks.on('updateItem',(item,_changed,options,userId)=>{if(options?.sbsRecordedUse&&userId===game.user.id)void run(()=>request('wear',item.uuid,{amount:1,kind:'use',eventId:options.sbsRecordedUse,reason:'Item charges used'}));});

export async function processArmorAttack(message){
 if(!game.user.isGM||primaryGM()?.id!==game.user.id||settings().rules.armorTrigger!=='attack')return;
 const flags=message.flags?.dnd5e;if(flags?.roll?.type!=='attack'||!message.id||!Array.isArray(flags.targets))return;
 const targets=new Map(flags.targets.filter(t=>t.uuid).map(t=>[t.uuid,t]));
 for(const [index,roll]of [...(message.rolls??[])].entries())for(const target of targets.values()){
  if(!attackHits(roll,target.ac))continue;
  const doc=await fromUuid(target.uuid),actor=doc?.documentName==='Actor'?doc:doc?.actor;if(actor?.documentName!=='Actor')continue;
  await request('armorHit',actor.uuid,{eventId:`armor:${message.id}:${index}:${actor.uuid}`,reason:`Attack hit (${message.speaker?.alias??'native attack'}); roll ${numeric(roll.total)}`});
 }
}
Hooks.on('createChatMessage',message=>{if(game.user.isGM&&primaryGM()?.id===game.user.id)void run(()=>processArmorAttack(message));});
export async function processArmorDamage(actor,changes,update){
 if(!game.user.isGM||primaryGM()?.id!==game.user.id||settings().rules.armorTrigger!=='damage'||actor?.documentName!=='Actor'||numeric(changes?.total)>=0)return;
 const key=update&&typeof update==='object'?update:changes;if(key&&typeof key==='object'){if(seenArmorUpdates.has(key))return;seenArmorUpdates.add(key);}
 return request('armorHit',actor.uuid,{eventId:`armor-damage:${foundry.utils.randomID(24)}:${actor.uuid}`,reason:'Wear from damage received (HP or temporary HP)'});
}
Hooks.on('dnd5e.damageActor',(actor,changes,update)=>{void run(()=>processArmorDamage(actor,changes,update));});

function rootElement(html){return html?.querySelector?html:html?.[0];}
export function decorateSheet(app,html){
 const root=rootElement(html);if(!root)return;const doc=app.document??app.actor??app.item;
 if(['Actor','Item'].includes(doc?.documentName))observedSheets.add(app);
 if(doc?.documentName==='Actor')decorateActor(app,doc,root);
 if(doc?.documentName==='Item')decorateItem(doc,root);
}
function decorateActor(app,actor,root){
 if(!actor.items||!canManage(game.user,actor))return;
 const cfg=settings();root.querySelectorAll('.sbs-bi-actor-tools').forEach(e=>e.remove());
 const items=[...actor.items].filter(i=>tracked(i,cfg.rules)),states=items.map(i=>stateFor(i,cfg.profiles,cfg.durability)),damaged=states.filter(s=>s.hp<s.max).length,broken=states.filter(s=>!usable(s)).length;
 const tools=document.createElement('div');tools.className='sbs-bi-actor-tools';tools.innerHTML=`<button type="button" data-bi-actor-tracker>Equipment durability</button><span>${items.length} tracked · ${damaged} damaged · ${broken} broken/destroyed</span>`;
 tools.querySelector('button').addEventListener('click',event=>{event.preventDefault();event.stopPropagation();openTracker(actor);});
 const host=root.querySelector('.sheet-header, .actor-header');if(host)host.insertAdjacentElement('afterend',tools);else(root.querySelector('.window-content')??root).prepend(tools);
 if(!cfg.rules.showBadges){root.querySelectorAll('.sbs-bi-badge').forEach(e=>e.remove());return;}
 for(const row of root.querySelectorAll('[data-item-id]')){
  const item=actor.items.get(row.dataset.itemId);if(!item)continue;
  const old=row.querySelector(':scope .sbs-bi-badge');if(old)old.remove();
  if(!tracked(item,cfg.rules)&&!protectionFor(item).active)continue;
  const s=stateFor(item,cfg.profiles,cfg.durability),anchor=row.querySelector('.item-name .name, .item-name .name-stacked, .item-name h4, .item-name h3, .item-name');if(!anchor)continue;
  const penalty=damageDicePenaltyActive(item,s,cfg.rules),badge=document.createElement('button');badge.type='button';badge.className=`sbs-bi-badge ${s.destroyed?'is-destroyed':s.hp===0?'is-broken':s.breaks===2||penalty?'is-warning':''}`;badge.textContent=badgeText(s)+(penalty?' · Reduced damage dice':'');badge.title=`${condition(s)}. ${weaponDamageSummary(item,s,cfg.rules)} Open Equipment Tracker.${s.breaks===2&&!s.destroyed?' Next break destroys this item permanently.':''}`;
  badge.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();openTracker(actor,item.id);});anchor.append(badge);
 }
}
function decorateItem(item,root){
 if(!PHYSICAL_TYPES.has(item.type))return;
 const cfg=settings(),enabled=tracked(item,cfg.rules),s=stateFor(item,cfg.profiles,cfg.durability);
 root.querySelectorAll('.sbs-bi-item-panel').forEach(e=>e.remove());
 if(!enabled&&!game.user.isGM&&!s.unbreakable)return;
 const panel=document.createElement('section');panel.className='sbs-bi-item-panel';
 const owned=item.actor&&canManage(game.user,item.actor),bodyArmor=isBodyArmor(item),profile={...(cfg.profiles[s.profile]??{}),...s.config};
 const support=toolSupport(item),roles=[...(support.allArtisan?['All artisan’s tools']:[]),...support.keys.map(k=>TOOLS[k]??k)];
 panel.innerHTML=`<strong>Breakable Items</strong>${roles.length?`<p data-bi-tool-roles><strong>Also works as:</strong> ${esc(roles.join(', '))}. ${support.grantProficiency?'Grants proficiency for these tool roles.':'Requires the user’s own tool proficiency.'}${support.requiresAttunement?isAttuned(item)?' Attuned.':' Requires attunement.':''}</p>`:''}${s.unbreakable?`<p class="sbs-bi-protected">${esc(protectionLabel(item))}</p>`:''}${enabled?`<p data-bi-item-tracking>Automatic tracking active · ${s.uses} recorded uses${profile.mode==='damage'?` · ${s.wear}/${profile.damagePerWear} damage wear progress`:profile.mode==='use'?` · ${s.useProgress}/${profile.usesPerWear} use wear progress`:' · GM manual wear override'}. Works with all sheets and the tracker closed.</p>${bar(s)}<p>${esc(condition(s))} · ${s.breaks}/3 lifetime breaks${s.breaks===2&&!s.destroyed?' · <strong>Next break destroys</strong>':''}</p>${bodyArmor?`<p>Armor events: ${s.hitsTaken} · wear progress ${s.armorProgress.toFixed(2)}/1 HP · ${cfg.rules.armorTrigger==='attack'?'Targeted attack hits':'Damage received'}${item.system.equipped?'':' · Not equipped: no incoming wear'}</p>`:''}`:'<p>Durability not enabled.</p>'}${damageDicePenaltyActive(item,s,cfg.rules)?`<p><strong>Reduced damage dice:</strong> ${esc(weaponDamageSummary(item,s,cfg.rules))}</p>`:''}<div class="sbs-bi-panel-actions">${owned?`<button type="button" data-bi-item-tracker>Equipment Tracker</button>${enabled&&usable(s)?'<button type="button" data-bi-item-use>Record Use</button>':''}${enabled&&!s.destroyed&&s.hp<s.max?`<button type="button" data-bi-item-repair>Repair</button>${cfg.rules.mendingEnabled?'<button type="button" data-bi-item-mending>Cast Mending</button>':''}`:''}`:''}${game.user.isGM?'<button type="button" data-bi-item-configure>Configure durability</button><button type="button" data-bi-item-tool-roles>Tool roles / All-Purpose Tool</button><button type="button" data-bi-item-protection>Unbreakable</button>':''}</div>`;
 panel.addEventListener('click',event=>{const b=event.target.closest('button');if(!b)return;event.preventDefault();event.stopPropagation();if(b.hasAttribute('data-bi-item-tracker'))openTracker(item.actor,item.id);if(b.hasAttribute('data-bi-item-configure'))void run(()=>configureItemDialog(item));if(b.hasAttribute('data-bi-item-tool-roles'))void run(()=>toolRolesDialog(item));if(b.hasAttribute('data-bi-item-mending'))void run(()=>castMendingDialog(item));if(b.hasAttribute('data-bi-item-protection'))void run(()=>protectionDialog(item));if(b.hasAttribute('data-bi-item-use'))void run(()=>recordUseDialog(item));if(b.hasAttribute('data-bi-item-repair'))void run(()=>repairDialog(item));});
 // Stay outside tab panels: adding a tab would depend on the sheet's own tab controller.
 const host=root.querySelector('.sheet-header, header.sheet-header, .item-header, .header');if(host)host.insertAdjacentElement('afterend',panel);else(root.querySelector('.window-content')??root).prepend(panel);
}
Hooks.on('renderApplicationV2',decorateSheet);Hooks.on('renderDocumentSheetV2',decorateSheet);Hooks.on('renderApplication',decorateSheet);
Hooks.on('renderActorSheet',(app,html)=>decorateSheet(app,html));
Hooks.on('renderItemSheet',(app,html)=>decorateSheet(app,html));
function scheduleRefresh(item){
 refreshWindows();const actor=item?.actor;
 if(actor?.sheet?.rendered&&!pendingRenders.has(actor.uuid)){pendingRenders.set(actor.uuid,setTimeout(()=>{pendingRenders.delete(actor.uuid);if(actor.sheet.rendered)decorateSheet(actor.sheet,actor.sheet.element);},80));}
 if(item?.sheet?.rendered)decorateSheet(item.sheet,item.sheet.element);
}
Hooks.on('updateItem',scheduleRefresh);Hooks.on('createItem',scheduleRefresh);Hooks.on('deleteItem',scheduleRefresh);
for(const event of ['updateActor','createCombat','updateCombat','deleteCombat','createCombatant','deleteCombatant','userConnected',`${ID}.refresh`])Hooks.on(event,refreshWindows);
Hooks.on('updateWorldTime',()=>{
 refreshWindows();for(const app of observedSheets){if(app.rendered)decorateSheet(app,app.element);else observedSheets.delete(app);}
});
function decorateChat(_message,html){
 const root=rootElement(html);if(!root)return;
 for(const b of root.querySelectorAll('[data-bi-approve],[data-bi-gm-damage],[data-bi-approve-batch]')){
  if(!game.user.isGM){b.remove();continue;}if(b.dataset.biBound)continue;b.dataset.biBound='true';
  b.addEventListener('click',event=>{event.preventDefault();void run(async()=>{if(b.dataset.biApproveBatch){const actor=await fromUuid(b.dataset.biApproveBatch);if(actor)await approveBatchDialog(actor,b.dataset.biRequest);}else if(b.dataset.biApprove){const item=await fromUuid(b.dataset.biApprove);if(item)await approvePaid(item,b.dataset.biRequest);}else{const item=await fromUuid(b.dataset.biGmDamage);if(item)await damageDialog(item);}});});
 }
}
Hooks.on('renderChatMessageHTML',decorateChat);Hooks.on('renderChatMessage',decorateChat);

Hooks.on('preCreateToken',(token,data)=>{if(game.actors?.get?.(data.actorId??token.actorId)?.flags?.[ID]?.repairServiceId)token.updateSource({actorLink:false});});
