import {ID,BREAK_LIMIT,PHYSICAL_TYPES,TOOLS,MATERIALS,COINS,UNBREAKABLE_PROPERTY,clone,numeric,normal,tracked,stateFor,durabilityFactors,usable,condition,protectionFor,isBodyArmor,applyDamage,applyWear,applyArmorHit,restore,history,withEvent,repairQuote,inventoryPlan,eligibleRepair,spendCurrency,moneyCP} from './core.mjs';
import {settings} from './settings.mjs';
import {inspectTool,repairService} from './repairers.mjs';
import {isMendingSource,mendingReasons} from './mending.mjs';

const waiting=new Map(),queues=new Map();
export const primaryGM=()=>[...(game.users??[])].filter(u=>u.isGM&&u.active).sort((a,b)=>a.id.localeCompare(b.id))[0];
export const canManage=(user,doc)=>!!user&&(user.isGM||doc?.testUserPermission?.(user,'OWNER'));
export const canMendTarget=(user,actor)=>canManage(user,actor)||actor?.testUserPermission?.(user,'OBSERVER')===true;
export function inCombat(actor) {
 if(!actor)return false;const synthetic=actor.isToken||actor.uuid?.includes('.Token.'),tokenId=actor.token?.id??actor.uuid?.match(/\.Token\.([^.]+)/)?.[1],sceneId=actor.token?.parent?.id??actor.uuid?.match(/^Scene\.([^.]+)/)?.[1];
 return [...(game.combats??[])].some(c=>(c.started||numeric(c.round)>0)&&[...(c.combatants??[])].some(x=>x.actor?x.actor.uuid===actor.uuid:synthetic?x.tokenId===tokenId&&(!(x.sceneId??c.scene?.id)||(x.sceneId??c.scene.id)===sceneId):x.actorId===actor.id));
}
export function assertPeace(...actors) {if(actors.some(inCombat))throw Error('Repairs are unavailable while the owner or repairer is participating in combat.');}
export function toolInfo(actor,key){return inspectTool(actor,key,settings());}
export function quoteView(item,{hp,repairer=item.actor,shop,supplyParts=false}={}) {
 const cfg=settings(),s=stateFor(item,cfg.profiles,cfg.durability),quote=repairQuote(item,s,{...cfg,hp,shop});
 const plan=inventoryPlan([...(item.actor?.items??[])],quote.requirements,{excludeId:item.id});
 const ti=toolInfo(repairer,quote.tool);
 let credit=0;
 if(supplyParts){for(const a of plan.allocations){const mat=item.actor?.items?.get(a.id);credit+=numeric(mat?.flags?.[ID]?.material?.valueGP,0)*a.quantity;}}
 const paidQuote=supplyParts?repairQuote(item,s,{...cfg,hp,shop,supplyCreditGP:credit}):quote;
 return {s,quote:paidQuote,plan,tool:ti,reasons:eligibleRepair({s,quote,toolPresent:ti.present,proficient:ti.proficient,arcanaProficient:ti.arcana,missing:plan.missing,inCombat:inCombat(item.actor)||inCombat(repairer)})};
}
function serialize(key,fn) {
 const before=queues.get(key)??Promise.resolve();const next=before.catch(()=>{}).then(fn);queues.set(key,next);
 void next.finally(()=>{if(queues.get(key)===next)queues.delete(key);}).catch(()=>{});return next;
}
export function request(action,uuid,args={}) {
 const gm=primaryGM();if(!gm)return Promise.reject(Error('A GM must be connected to update durability or complete repairs.'));
 const packet={kind:'request',id:foundry.utils.randomID(24),recipient:gm.id,userId:game.user.id,action,uuid,args};
 if(gm.id===game.user.id)return handleRequest(packet);
 return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{waiting.delete(packet.id);reject(Error('The GM did not respond. Check the tracker before retrying; the action may have completed.'));},['repairAll','approvePaidAll'].includes(action)?60000:20000);waiting.set(packet.id,{resolve,reject,timer});game.socket.emit(`module.${ID}`,packet);});
}
export function registerSocket() {
 game.socket.on(`module.${ID}`,async packet=>{
  if(!packet||packet.recipient!==game.user.id)return;
  if(packet.kind==='response'){const pending=waiting.get(packet.id);if(!pending)return;clearTimeout(pending.timer);waiting.delete(packet.id);packet.error?pending.reject(Error(packet.error)):pending.resolve(packet.result);return;}
  if(packet.kind!=='request'||!game.user.isGM||primaryGM()?.id!==game.user.id)return;
  let result,error;try{result=await handleRequest(packet);}catch(e){console.warn('SBS Breakable Items',e);error=e.message;}
  game.socket.emit(`module.${ID}`,{kind:'response',recipient:packet.userId,id:packet.id,result,error});
 });
}
export async function handleRequest(packet) {
 const user=game.users.get(packet.userId);if(!user?.active)throw Error('The requesting user is no longer connected.');
 const doc=await fromUuid(packet.uuid);if(!doc)throw Error('That item or character no longer exists.');
 const actor=doc.documentName==='Actor'?doc:doc.actor;
 const helper=packet.action==='mend'?await fromUuid(packet.args?.casterUuid):['repair','repairAll'].includes(packet.action)&&packet.args?.repairerUuid?await fromUuid(packet.args.repairerUuid):actor;
 if(helper&&(!canManage(user,helper)||helper.documentName!=='Actor'))throw Error('You do not own the chosen repairing character. Ask the GM to perform this repair.');
 if(['repair','repairAll','mend'].includes(packet.action)&&!helper)throw Error('The chosen repairing character no longer exists.');
 const shopId=packet.args?.shopId??(packet.action==='approvePaid'?doc.flags?.[ID]?.durability?.pending?.shopId:packet.action==='approvePaidAll'?doc.flags?.[ID]?.batchRepair?.shopId:null);
 const keys=[...new Set([actor?.uuid??doc.uuid,...(helper?[helper.uuid]:[]),...(shopId?.startsWith('token:')?[`repairer:${shopId}`]:[])])].sort();
 const lock=(index,fn)=>index===keys.length?fn():serialize(keys[index],()=>lock(index+1,fn));
 return lock(0,async()=>{
  const item=await fromUuid(packet.uuid);if(!item)throw Error('The item no longer exists.');
  if(!canManage(user,item.actor??item)&&!(packet.action==='mend'&&canMendTarget(user,item.actor)))throw Error('You do not own this equipment.');
  const cfg=settings(),s=item.documentName==='Item'?stateFor(item,cfg.profiles,cfg.durability):null,args=packet.args??{};
  if(['damage','destroy','configure','markMaterial','protection','armorHit','recalculate','toolRoles'].includes(packet.action)&&!user.isGM)throw Error('Only the GM can change durability rules or apply direct item damage.');
  if(args.expectedRevision!==undefined&&s?.revision!==args.expectedRevision)throw Error('The item changed since this window opened. Refresh and review the repair again.');
  if(packet.action==='mend')return mendItem(item,s,args,user,cfg,helper);
  if(packet.action==='toolRoles'){
   if(!PHYSICAL_TYPES.has(item.type))throw Error('Choose a physical item.');const t=args.toolSupport;if(!t||!Array.isArray(t.keys)||t.keys.some(k=>!TOOLS[k]))throw Error('Choose valid tool roles.');
   const support={keys:[...new Set(t.keys)],allArtisan:t.allArtisan===true,grantProficiency:t.grantProficiency===true,requiresAttunement:t.requiresAttunement===true},next=history({...s,revision:s.revision+1},{kind:'configuration',reason:'Updated additional tool roles',by:user.name});delete next.pending;await persist(item,next,{[`flags.${ID}.toolSupport`]:support});return support;
  }
  if(packet.action==='configure')return configureItem(item,s,args,user);
  if(packet.action==='protection')return setProtection(item,s,args,user);
  if(packet.action==='armorHit')return armorHit(item,args,user,cfg);
  if(packet.action==='markMaterial')return markMaterial(item,args);
  if(packet.action==='recalculate'){
   const entries=item.documentName==='Actor'?[...item.items]:[item],results=[];
   for(const entry of entries){if(!tracked(entry,cfg.rules))continue;const old=stateFor(entry,cfg.profiles,cfg.durability),calculated=durabilityFactors(entry,cfg.profiles,cfg.durability).max;const next={...old,max:calculated,hp:old.hp===0?0:Math.max(1,Math.round(old.hp/old.max*calculated)),revision:old.revision+1};delete next.pending;history(next,{kind:'configuration',reason:'Recalculated maximum HP; damage percentage and breaks preserved',by:user.name});await persist(entry,next);results.push(entry.uuid);}return results.length;
  }
  if(packet.action==='damage'||packet.action==='destroy'){
   requireTracked(item,cfg);if(s.unbreakable)throw Error('This item is Unbreakable. Remove its protection before applying damage or destruction.');let next;
   if(packet.action==='destroy'){next=clone(s);next.destroyed=true;next.hp=0;next.revision++;history(next,{kind:'destroyed',reason:args.reason??'GM designation',by:user.name});}
   else next=applyDamage(s,args.amount,{reason:args.reason??'GM damage',by:user.name});
   delete next.pending;await persist(item,next);await reportBreak(item,s,next);return next;
  }
  if(packet.action==='wear'){
   requireTracked(item,cfg);if(!args.eventId||s.events.includes(args.eventId))return s;
   const profile=cfg.profiles[s.profile],factor=durabilityFactors(item,cfg.profiles,cfg.durability);const next=applyWear(s,args.amount,{profile,rules:cfg.rules,wearMultiplier:factor.wearMultiplier,useWeight:cfg.durability.useWeights[args.intensity??'normal']??1,critical:args.critical===true,eventId:args.eventId,kind:args.kind==='use'?'use':'damage',by:user.name,...(args.reason?{reason:args.reason}:{})});
   if(next.revision===s.revision)return s;delete next.pending;await persist(item,next);await reportBreak(item,s,next);return next;
  }
  if(packet.action==='repair')return repairSelf(item,s,args,user,cfg,helper);
  if(packet.action==='repairAll')return repairAll(item,args,user,cfg,helper);
  if(packet.action==='requestPaidAll')return requestPaidAll(item,args,user,cfg);
  if(packet.action==='approvePaidAll'){if(!user.isGM)throw Error('The GM must approve paid repairs.');return approvePaidAll(item,args,user,cfg);}
  if(packet.action==='cancelPaidAll'){await item.update({[`flags.${ID}.batchRepair`]:null},{sbsBreakable:true});return true;}
  if(packet.action==='requestPaid')return requestPaid(item,s,args,user,cfg);
  if(packet.action==='cancelPaid'){delete s.pending;s.revision++;await persist(item,s);return s;}
  if(packet.action==='approvePaid'){
   if(!user.isGM)throw Error('The GM must approve paid repairs.');return completePaid(item,s,args,user,cfg);
  }
  if(packet.action==='fumble'){
   if(!cfg.rules.fumblePrompt||!tracked(item,cfg.rules)||!usable(s)||s.unbreakable)return false;
   await ChatMessage.create({content:`<div class="sbs-bi-chat"><b>${esc(item.name)}: natural 1</b><p>${esc(item.actor?.name??'')} rolled a natural 1. No automatic fumble damage was applied.</p><button type="button" data-bi-gm-damage="${esc(item.uuid)}">Apply item damage</button></div>`,whisper:game.users.filter(u=>u.isGM).map(u=>u.id)});return true;
  }
  if(packet.action==='bulkTrack'){
   if(!user.isGM)throw Error('Only the GM can enable a whole category.');
   const updates=[...item.items].filter(i=>PHYSICAL_TYPES.has(i.type)&&!i.flags?.[ID]?.material&&(!args.type||i.type===args.type)&&!i.flags?.[ID]?.durability).map(i=>({_id:i.id,[`flags.${ID}.durability`]:stateFor(i,cfg.profiles,cfg.durability)}));
   if(updates.length)await item.updateEmbeddedDocuments('Item',updates,{sbsBreakable:true});return updates.length;
  }
  throw Error('Unknown equipment action.');
 });
}
export function esc(value) {return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function requireTracked(item,cfg) {if(!tracked(item,cfg.rules))throw Error('Enable durability tracking for this item first.');}
async function persist(item,s,extra={}) {
 const update={...extra,[`flags.${ID}.durability`]:s};if(!usable(s)&&item.system?.equipped)update['system.equipped']=false;
 await item.update(update,{sbsBreakable:true});Hooks.callAll(`${ID}.updated`,item);return s;
}
async function configureItem(item,s,args,user) {
 if(!PHYSICAL_TYPES.has(item.type))throw Error('Only physical equipment can have durability.');
 let next=clone(s),newHP=Math.max(0,Math.floor(numeric(args.hp,s.hp))),newMax=Math.max(1,Math.floor(numeric(args.max,s.max)));
 if(s.unbreakable&&newHP<s.hp)throw Error('Remove Unbreakable before lowering this item’s HP.');
 if(s.unbreakable&&numeric(args.breaks,s.breaks)>s.breaks)throw Error('Remove Unbreakable before adding breaks or destroying this item.');
 next.max=newMax;
 if(newHP<s.hp)next=applyDamage(next,s.hp-newHP,{reason:'GM HP adjustment',by:user.name});else next.hp=Math.min(newMax,newHP);
 if(args.breaks!==undefined&&numeric(args.breaks)!==s.breaks)next.breaks=Math.max(0,Math.min(BREAK_LIMIT,Math.floor(numeric(args.breaks))));
 if(args.clearDestroyed===true&&next.breaks<BREAK_LIMIT)next.destroyed=false;
 if(next.breaks>=BREAK_LIMIT)next.destroyed=true;
 if(next.destroyed)next.hp=0;
 next.enabled=args.enabled!==false;next.profile=args.profile??s.profile;next.rarity=args.rarity||undefined;next.config=clone(args.config??s.config);next.revision++;
 delete next.pending;history(next,{kind:'configuration',reason:'GM configuration',by:user.name});
 const extra={};if(args.toolSupport!==undefined){const t=args.toolSupport;if(!t||!Array.isArray(t.keys)||t.keys.some(k=>!TOOLS[k]))throw Error('Choose valid tool roles.');extra[`flags.${ID}.toolSupport`]={keys:[...new Set(t.keys)],allArtisan:t.allArtisan===true,grantProficiency:t.grantProficiency===true,requiresAttunement:t.requiresAttunement===true};}
 await persist(item,next,extra);await reportBreak(item,s,next);return next;
}
async function setProtection(item,s,args,user) {
 if(!PHYSICAL_TYPES.has(item.type))throw Error('Only physical items can be Unbreakable.');
 const before=protectionFor(item),permanent=args.permanent===undefined?before.permanent:args.permanent===true,mode=args.temporaryMode??'keep',now=numeric(game.time?.worldTime);
 let temporary=before.temporary;
 if(mode==='none')temporary=null;
 else if(mode==='manual')temporary={startedAt:now,expiresAt:null,label:String(args.label??'Temporary protection')};
 else if(mode!=='keep'){
  const unit={seconds:1,rounds:6,minutes:60,hours:3600}[mode],duration=numeric(args.duration);
  if(!unit||duration<=0)throw Error('Choose a positive protection duration.');
  const expiresAt=now+duration*unit;if(!Number.isFinite(expiresAt))throw Error('Choose a finite protection duration.');
  temporary={startedAt:now,expiresAt,label:String(args.label??'Temporary protection')};
 }
 const update={[`flags.${ID}.protection`]:{permanent,temporary}};
 const properties=item._source?.system?.properties??item.system?.properties;
 if(properties!==undefined){const values=[...(properties??[])].filter(p=>p!==UNBREAKABLE_PROPERTY);if(permanent)values.push(UNBREAKABLE_PROPERTY);update['system.properties']=values;}
 if(item.flags?.[ID]?.durability||tracked(item,settings().rules)){
  const next=clone(s);next.enabled=tracked(item,settings().rules);next.revision++;delete next.pending;
  history(next,{kind:'protection',reason:`Unbreakable: permanent ${permanent?'on':'off'}; temporary ${mode}`,by:user.name});update[`flags.${ID}.durability`]=next;
 }
 await item.update(update,{sbsBreakable:true});Hooks.callAll(`${ID}.updated`,item);return protectionFor(item);
}
async function armorHit(actor,args,user,cfg) {
 if(actor.documentName!=='Actor')throw Error('Choose the character wearing the armor.');
 if(!args.eventId)throw Error('Armor hits require a unique event ID.');
 const result=[];
 for(const item of actor.items){
  if(!isBodyArmor(item)||!item.system.equipped||!tracked(item,cfg.rules))continue;
  const s=stateFor(item,cfg.profiles,cfg.durability);if(!(s.config.armorOnHit??cfg.rules.autoArmor)||!usable(s)||s.events.includes(args.eventId))continue;
  const next=applyArmorHit(s,{eventId:args.eventId,damagePerHit:s.config.armorDamagePerHit??cfg.rules.armorDamagePerHit,wearMultiplier:durabilityFactors(item,cfg.profiles,cfg.durability).wearMultiplier,reason:args.reason??'Attack hit the wearer',by:user.name});
  if(next.hp!==s.hp)delete next.pending;await persist(item,next);await reportBreak(item,s,next);result.push({uuid:item.uuid,state:next});
 }
 return result;
}
async function markMaterial(item,args) {
 const key=String(args.key??'').trim();if(!key)throw Error('Choose a material key.');
 await item.update({[`flags.${ID}.material`]:{key,valueGP:Math.max(0,numeric(args.valueGP))},[`flags.${ID}.durability.enabled`]:false},{sbsBreakable:true});return true;
}
async function repairCheck(actor,quote,{configure=true}={}) {
 const info=toolInfo(actor,quote.tool),native=Math.max(numeric(actor.system.tools?.[quote.tool]?.effectValue),numeric(actor.system.tools?.[quote.tool]?.value));
 const roller=info.value>native&&actor.clone?actor.clone({[`system.tools.${quote.tool}.value`]:info.value},{keepId:true}):actor;
 const rolls=await roller.rollToolCheck({tool:quote.tool,target:quote.dc,rolls:[{options:{sbsBreakableRepair:true}}]},{configure},{data:{flavor:`Repair broken equipment — DC ${quote.dc}`,flags:{[ID]:{repairCheck:true}}}});
 const list=Array.isArray(rolls)?rolls:[rolls];if(!list[0])return null;return numeric(list[0].total,-Infinity)>=quote.dc;
}
async function commitRepair(item,next,{plan,costCP=0,payer=item.actor,toolUses=[]}={}) {
 return commitItems(item.actor,new Map([[item.id,next]]),{plan,costCP,payer,toolUses});
}
async function commitItems(actor,states,{plan,costCP=0,payer=actor,toolUses=[]}={}) {
 if(!actor)throw Error('Move this item onto a character before repairing it.');
 const cfg=settings(),groups=new Map([[actor.uuid,{actor,states,before:new Map(),updates:new Map((plan?.updates??[]).map(u=>[u._id,{...u}]))}]]),counts=new Map();
 for(const tool of toolUses)if(tool){const key=`${tool.actor.uuid}:${tool.id}`,old=counts.get(key);counts.set(key,{tool,count:(old?.count??0)+1});}
 for(const {tool,count}of counts.values()){
  if(!tracked(tool,cfg.rules))continue;let group=groups.get(tool.actor.uuid);if(!group){group={actor:tool.actor,states:new Map(),before:new Map(),updates:new Map()};groups.set(tool.actor.uuid,group);}
  const old=group.states.get(tool.id)??stateFor(tool,cfg.profiles,cfg.durability),factor=durabilityFactors(tool,cfg.profiles,cfg.durability);
  group.states.set(tool.id,applyWear(old,count,{kind:'use',eventId:`repair-tools:${foundry.utils.randomID(24)}`,profile:cfg.profiles[old.profile],rules:cfg.rules,wearMultiplier:factor.wearMultiplier,reason:'Tool used for equipment repair'}));
 }
 for(const group of groups.values()){
  for(const [id,next]of group.states){const item=group.actor.items.get(id);group.before.set(id,stateFor(item,cfg.profiles,cfg.durability));const update=group.updates.get(id)??{_id:id};update[`flags.${ID}.durability`]=next;if(!usable(next)&&item.system.equipped)update['system.equipped']=false;group.updates.set(id,update);}
  group.updates=[...group.updates.values()];group.originals=group.updates.map(u=>{const item=group.actor.items.get(u._id),old={_id:u._id};if('system.quantity'in u)old['system.quantity']=numeric(item.system.quantity,1);if(`flags.${ID}.durability`in u)old[`flags.${ID}.durability`]=clone(item.flags?.[ID]?.durability??null);if('system.equipped'in u)old['system.equipped']=item.system.equipped;return old;});
 }
 const oldCurrency=clone(payer.system.currency??{}),currency=costCP?spendCurrency(oldCurrency,costCP):null,attempted=[];let currencyWritten=false;
 try{
  if(currency){await payer.update({'system.currency':currency},{sbsBreakable:true});currencyWritten=true;}
  for(const group of groups.values()){attempted.push(group);await group.actor.updateEmbeddedDocuments('Item',group.updates,{sbsBreakable:true});}
 }catch(error){
  const failures=[];for(const group of attempted.reverse()){try{await group.actor.updateEmbeddedDocuments('Item',group.originals,{sbsBreakable:true});}catch(e){failures.push(e);}}
  if(currencyWritten){try{await payer.update({'system.currency':oldCurrency},{sbsBreakable:true});}catch(e){failures.push(e);}}
  if(failures.length){console.error('SBS repair rollback failed',failures);ui.notifications.error('Repair update failed and could not be fully restored. The GM should check equipment, tools, currency and materials.');}throw error;
 }
 for(const group of groups.values())for(const [id,next]of group.states){const item=group.actor.items.get(id);Hooks.callAll(`${ID}.updated`,item);await reportBreak(item,group.before.get(id),next);}return states;
}
async function repairSelf(item,s,args,user,cfg,repairer=item.actor) {
 requireTracked(item,cfg);if(!item.actor)throw Error('Move this item onto a character first.');
 if(s.destroyed)throw Error('Destroyed items cannot be repaired.');
 const view=quoteView(item,{hp:args.hp,repairer});if(view.reasons.length)throw Error(view.reasons.join(' '));assertPeace(item.actor,repairer);
 const success=view.quote.requiresCheck?await repairCheck(repairer,view.quote):true;if(success===null)return {cancelled:true};
 assertPeace(item.actor,repairer);
 const fresh=stateFor(item,cfg.profiles,cfg.durability);if(fresh.revision!==s.revision||fresh.destroyed)throw Error('The item changed during the repair check. No supplies were spent.');
 const again=quoteView(item,{hp:args.hp,repairer});if(again.reasons.length)throw Error(again.reasons.join(' '));
 let next=success?restore(fresh,again.quote.hp,{reason:`${repairer.name} repairs; ${again.quote.minutes} minutes of downtime`,by:user.name}):history({...fresh,revision:fresh.revision+1},{kind:'failed repair',reason:`Failed DC ${again.quote.dc} repair check`,by:user.name});
 delete next.pending;
 const committed=await commitRepair(item,next,{plan:success||cfg.rules.consumeOnFailure?again.plan:null,toolUses:[again.tool.tool]});
 await repairReport(item,success,again.quote,'Self repair');return {state:committed.get(item.id),success};
}
function availableShop(cfg,id,rarity,user=game.user) {const shop=repairService(cfg,id,user);if(shop&&!shop.rarities.includes(rarity))throw Error('That repairer is unavailable for this rarity.');if(!shop)throw Error('That repairer is unavailable or cannot repair this rarity.');return shop;}
async function requestPaid(item,s,args,user,cfg) {
 requireTracked(item,cfg);if(!item.actor)throw Error('Move this item onto a character first.');assertPeace(item.actor);
 const shop=availableShop(cfg,args.shopId,repairQuote(item,s,cfg).rarity,user),view=quoteView(item,{hp:args.hp,shop,supplyParts:args.supplyParts===true});
 if(args.maxCostCP!==undefined&&view.quote.priceCP>args.maxCostCP)throw Error('The quote increased. Review the new price before requesting the repair.');
 if(moneyCP(item.actor.system.currency)<view.quote.priceCP)throw Error('Not enough currency for the quoted repair.');
 const pending={id:foundry.utils.randomID(20),userId:user.id,shopId:shop.id,hp:view.quote.hp,priceCP:view.quote.priceCP,supplyParts:args.supplyParts===true,createdAt:Date.now()};
 s.pending=pending;if(shop.automatic){await assertPlacedService(shop,user);const result=await completePaid(item,s,{requestId:pending.id},user,cfg);await logServiceOrder(shop,{id:pending.id,customer:item.actor.uuid,item:item.uuid,costCP:result.success?view.quote.priceCP:0,success:result.success});return {...result,automatic:true};}s.revision++;await persist(item,s);
 await ChatMessage.create({content:`<div class="sbs-bi-chat"><b>Paid repair requested: ${esc(item.name)}</b><p>${esc(item.actor.name)} · ${esc(shop.name)} · ${view.quote.hp} HP · ${formatGP(view.quote.priceCP)} · ${view.quote.minutes} minutes</p><p>${view.quote.requiresCheck?`Broken item: repairer must pass DC ${view.quote.dc}.`:'Routine repair: no check.'}</p><p>GM: confirm the repairer and downtime are available before completing.</p><button type="button" data-bi-approve="${esc(item.uuid)}" data-bi-request="${pending.id}">Review and complete repair</button></div>`,whisper:[...new Set([...game.users.filter(u=>u.isGM).map(u=>u.id),user.id])],flags:{[ID]:{repairRequest:{itemUuid:item.uuid,id:pending.id}}}});
 return pending;
}
async function completePaid(item,s,args,user,cfg) {
 requireTracked(item,cfg);assertPeace(item.actor);
 const p=s.pending;if(!p||p.id!==args.requestId)throw Error('This repair request was cancelled, completed, or changed.');
 if(s.destroyed)throw Error('Destroyed items cannot be repaired.');
 const customer=game.users.get(p.userId)??user,shop=availableShop(cfg,p.shopId,repairQuote(item,s,cfg).rarity,customer),view=quoteView(item,{hp:p.hp,shop,supplyParts:p.supplyParts});
 if(view.quote.priceCP!==p.priceCP)throw Error('The repair price or supplied parts changed. Request a fresh quote.');
 if(moneyCP(item.actor.system.currency)<view.quote.priceCP)throw Error('The character no longer has enough currency.');
 if(shop.automatic)await assertPlacedService(shop,customer);
 let success=true;
 if(view.quote.requiresCheck){const roll=await new Roll('1d20 + @bonus',{bonus:numeric(shop.checkBonus)}).evaluate();await roll.toMessage({flavor:`${esc(shop.name)} repairs ${esc(item.name)} — DC ${view.quote.dc}`});success=roll.total>=view.quote.dc;}
 assertPeace(item.actor);if(shop.automatic)await assertPlacedService(shop,customer);
 const fresh=stateFor(item,cfg.profiles,cfg.durability);if(fresh.revision!==s.revision||fresh.destroyed)throw Error('The item changed during the repair check. No payment was taken.');
 const currentShop=availableShop(settings(),p.shopId,repairQuote(item,fresh,settings()).rarity,customer),again=quoteView(item,{hp:p.hp,shop:currentShop,supplyParts:p.supplyParts});if(again.quote.priceCP!==p.priceCP)throw Error('The quote changed during the check. No payment was taken.');
 const next=success?restore(fresh,again.quote.hp,{reason:`${shop.name}; ${formatGP(again.quote.priceCP)}; ${again.quote.minutes} minutes of downtime`,by:user.name}):history({...fresh,revision:fresh.revision+1},{kind:'failed repair',reason:`${shop.name} failed DC ${again.quote.dc}; no charge`,by:user.name});
 delete next.pending;
 await commitRepair(item,next,{plan:success&&p.supplyParts?again.plan:null,costCP:success?again.quote.priceCP:0});await repairReport(item,success,again.quote,shop.name);return {state:next,success};
}
export const formatGP=cp=>`${(cp/100).toLocaleString(undefined,{maximumFractionDigits:2})} gp`;
export function batchRepairView(actor,{ids,mode='self',shopId,supplyParts=false,repairer=actor,user=game.user}={}){
 const cfg=settings(),selected=ids?ids.map(id=>{const item=actor.items.get(id);if(!item)throw Error('A selected item is no longer in this inventory.');return item;}):[...actor.items].filter(i=>tracked(i,cfg.rules)&&stateFor(i,cfg.profiles,cfg.durability).hp<stateFor(i,cfg.profiles,cfg.durability).max);
 if(new Set(selected.map(i=>i.id)).size!==selected.length)throw Error('Select each item only once.');
 const selectedIds=new Set(selected.map(i=>i.id)),available=[...actor.items].filter(i=>!selectedIds.has(i.id)).map(i=>({id:i.id,name:i.name,system:{quantity:numeric(i.system.quantity,1)},flags:i.flags}));
 const rows=[],requirements=new Map();let totalCP=0,minutes=0;
 const shop=mode==='paid'?repairService(cfg,shopId,user):null;
 for(const item of selected){
  const s=stateFor(item,cfg.profiles,cfg.durability),row={item,s,errors:[],plan:{allocations:[],updates:[],missing:[]}};
  try{
   if(!tracked(item,cfg.rules))throw Error('Durability is no longer enabled.');
   let quote=repairQuote(item,s,{...cfg,shop:shop??{multiplier:1}});const ti=toolInfo(repairer,quote.tool);row.tool=ti;
   const plan=inventoryPlan(available,quote.requirements);row.plan=plan;
   for(const allocation of plan.allocations){const entry=available.find(x=>x.id===allocation.id);entry.system.quantity-=allocation.quantity;}
   if(mode==='paid'){
    if(!shop||!shop.rarities.includes(quote.rarity))row.errors.push('No selected repairer is available for this rarity.');
    if(supplyParts){let credit=0;for(const a of plan.allocations)credit+=numeric(actor.items.get(a.id).flags?.[ID]?.material?.valueGP)*a.quantity;quote=repairQuote(item,s,{...cfg,shop:shop??{multiplier:1},supplyCreditGP:credit});}
   }else row.errors.push(...eligibleRepair({s,quote,toolPresent:ti.present,proficient:ti.proficient,arcanaProficient:ti.arcana,missing:[]}));
   row.quote=quote;minutes+=quote.minutes;if(mode==='paid')totalCP+=quote.priceCP;
   for(const req of quote.requirements){const old=requirements.get(req.key);requirements.set(req.key,{...req,quantity:(old?.quantity??0)+req.quantity});}
  }catch(e){row.errors.push(e.message);}
  rows.push(row);
 }
 const allocations=rows.flatMap(r=>r.plan.allocations),plan=planFromAllocations(actor,allocations),errors=rows.flatMap(r=>r.errors.map(e=>`${r.item.name}: ${e}`));
 if(!rows.length)errors.push('Select at least one damaged item.');
 if(inCombat(actor)||mode==='self'&&inCombat(repairer))errors.push('Repairs are unavailable while the owner or repairing character is in combat.');
 if(mode==='self'){const missing=inventoryPlan([...actor.items].filter(i=>!selectedIds.has(i.id)),[...requirements.values()]).missing;for(const r of missing)errors.push(`Missing ${r.missing} × ${r.label} for the whole batch.`);}
 if(mode==='paid'&&moneyCP(actor.system.currency)<totalCP)errors.push('Not enough currency for the whole batch.');
 const snapshot={mode,serviceBonus:mode==='paid'?shop?.checkBonus:null,repairerUuid:mode==='self'?repairer.uuid:null,shopId:mode==='paid'?shop?.id:null,supplyParts:mode==='paid'&&supplyParts,rows:rows.map(r=>({id:r.item.id,revision:r.s.revision,quantity:numeric(r.item.system.quantity,1),hp:r.quote?.hp,priceCP:r.quote?.priceCP,dc:r.quote?.dc,minutes:r.quote?.minutes,requirements:r.quote?.requirements,toolId:mode==='self'?r.tool?.tool?.uuid:null,toolRevision:mode==='self'&&r.tool?.tool?stateFor(r.tool.tool,cfg.profiles,cfg.durability).revision:null,toolProficiency:mode==='self'?r.tool?.value:null,allocations:mode==='self'||supplyParts?r.plan.allocations.map(a=>({id:a.id,quantity:a.quantity})):[]}))};
 return {repairer,rows,requirements:[...requirements.values()],plan,totalCP,minutes,checks:rows.filter(r=>r.quote?.requiresCheck).length,errors,snapshot,mode,shop,supplyParts};
}
function planFromAllocations(actor,allocations){const totals=new Map();for(const a of allocations)totals.set(a.id,(totals.get(a.id)??0)+a.quantity);return {allocations,missing:[],updates:[...totals].map(([id,used])=>({_id:id,'system.quantity':numeric(actor.items.get(id)?.system.quantity,1)-used}))};}
function validateBatch(view,expected){if(view.errors.length)throw Error(view.errors.join(' '));if(expected&&JSON.stringify(expected)!==JSON.stringify(view.snapshot))throw Error('The items, costs, tools, or supplies changed. Review Fix All again.');}
async function repairAll(actor,args,user,cfg,repairer=actor){
 assertPeace(actor,repairer);const view=batchRepairView(actor,{ids:args.ids,mode:'self',repairer});validateBatch(view,args.expected);
 const outcomes=[];for(const row of view.rows){const success=row.quote.requiresCheck?await repairCheck(repairer,row.quote,{configure:false}):true;if(success===null)throw Error('A repair check could not be completed. No supplies were spent.');outcomes.push({row,success});assertPeace(actor,repairer);}
 const fresh=batchRepairView(actor,{ids:args.ids,mode:'self',repairer});validateBatch(fresh,view.snapshot);
 return finishBatch(actor,fresh,outcomes.map(o=>o.success),user,cfg);
}
async function requestPaidAll(actor,args,user,cfg){
 assertPeace(actor);const view=batchRepairView(actor,{ids:args.ids,mode:'paid',shopId:args.shopId,supplyParts:args.supplyParts===true,user});validateBatch(view,args.expected);
 if(view.shop.automatic){const result=await executePaidBatch(actor,view,user,cfg);return {...result,automatic:true};}
 const pending={id:foundry.utils.randomID(24),userId:user.id,ids:args.ids,shopId:view.shop.id,supplyParts:args.supplyParts===true,snapshot:view.snapshot,totalCP:view.totalCP};
 await actor.update({[`flags.${ID}.batchRepair`]:pending},{sbsBreakable:true});
 await ChatMessage.create({content:`<div class="sbs-bi-chat"><b>Fix All requested: ${esc(actor.name)}</b><p>${view.rows.length} items · ${formatGP(view.totalCP)} · ${view.minutes} minutes · ${view.checks} broken-item checks.</p><button type="button" data-bi-approve-batch="${esc(actor.uuid)}" data-bi-request="${pending.id}">Review Fix All repair</button></div>`,whisper:[...new Set([...game.users.filter(u=>u.isGM).map(u=>u.id),user.id])]});return pending;
}
async function approvePaidAll(actor,args,user,cfg){
 assertPeace(actor);const p=actor.flags?.[ID]?.batchRepair;if(!p||p.id!==args.requestId)throw Error('This repair request was cancelled, completed, or changed.');
 const customer=game.users.get(p.userId)??user,view=batchRepairView(actor,{ids:p.ids,mode:'paid',shopId:p.shopId,supplyParts:p.supplyParts,user:customer});validateBatch(view,p.snapshot);
 return executePaidBatch(actor,view,customer,cfg,p.id);
}
async function executePaidBatch(actor,view,user,cfg,orderId=foundry.utils.randomID(24)){
 assertPeace(actor);if(view.shop.automatic)await assertPlacedService(view.shop,user);
 const successes=[];for(const row of view.rows){let success=true;if(row.quote.requiresCheck){const roll=await new Roll('1d20 + @bonus',{bonus:numeric(view.shop.checkBonus)}).evaluate();await roll.toMessage({flavor:`${esc(view.shop.name)} repairs ${esc(row.item.name)} — DC ${row.quote.dc}`});success=roll.total>=row.quote.dc;}successes.push(success);assertPeace(actor);}
 if(view.shop.automatic)await assertPlacedService(view.shop,user);
 const fresh=batchRepairView(actor,{ids:view.rows.map(r=>r.item.id),mode:'paid',shopId:view.shop.id,supplyParts:view.supplyParts,user});validateBatch(fresh,view.snapshot);
 const result=await finishBatch(actor,fresh,successes,user,cfg);if(actor.flags?.[ID]?.batchRepair)await actor.update({[`flags.${ID}.batchRepair`]:null},{sbsBreakable:true});
 if(view.shop.automatic)await logServiceOrder(view.shop,{id:orderId,customer:actor.uuid,items:view.rows.map(r=>r.item.uuid),costCP:result.costCP,repaired:result.repaired,failed:result.failed});return result;
}
async function assertPlacedService(shop,user){
 const current=repairService(settings(),shop.id,user),token=await fromUuid(shop.tokenUuid);if(!current?.automatic||!token?.actor)throw Error('That placed repairer is no longer available on your map.');
 assertPeace(token.actor);if(token.actor.system?.attributes?.hp?.value===0)throw Error('That repairer cannot work at 0 HP.');return token;
}
async function logServiceOrder(shop,entry){
 try{const token=await fromUuid(shop.tokenUuid),orders=token.flags?.[ID]?.repairOrders??[];await token.update({[`flags.${ID}.repairOrders`]:[...orders,{...entry,at:Date.now()}].slice(-50)},{sbsBreakable:true});}catch(error){console.warn('SBS repair completed, but repairer order history could not be saved',error);}
}
async function mendItem(item,s,args,user,cfg,caster){
 const reasons=mendingReasons(item,cfg);if(reasons.length)throw Error(reasons.join(' '));if(args.confirmLimits!==true)throw Error('Confirm this is an eligible physical break or tear.');assertPeace(item.actor,caster);
 const source=await fromUuid(args.sourceUuid),activity=source?.system?.activities?.get?.(args.activityId),message=game.messages?.get?.(args.castId);
 if(!source||source.actor?.uuid!==caster.uuid||!activity||!isMendingSource(source,activity)||message?.flags?.dnd5e?.item?.uuid!==source.uuid||message.flags.dnd5e.activity?.id!==activity.id)throw Error('Complete a native Mending cast before choosing the repair target.');
 const casts=caster.flags?.[ID]?.mendingCasts??[];if(casts.includes(args.castId))throw Error('That Mending cast has already repaired an item.');
 const next=withEvent(restore(s,Math.max(1,Math.floor(numeric(cfg.rules.mendingHP,1))),{reason:'Mending; 1 minute of casting downtime; physical repair only',by:user.name}),`mending:${args.castId}`),old=clone(item.flags?.[ID]?.durability??null);
 try{await caster.update({[`flags.${ID}.mendingCasts`]:[...casts,args.castId].slice(-100)},{sbsBreakable:true});await persist(item,next);}catch(error){try{await item.update({[`flags.${ID}.durability`]:old},{sbsBreakable:true});await caster.update({[`flags.${ID}.mendingCasts`]:casts},{sbsBreakable:true});}catch(rollback){console.error('Mending rollback failed',rollback);}throw error;}
 await repairReport(item,true,{hp:next.hp-s.hp,minutes:1},'Mending (physical repair only)');return next;
}
async function finishBatch(actor,view,successes,user,cfg){
 assertPeace(actor,...(view.mode==='self'?[view.repairer]:[]));const states=new Map(),allocations=[],toolUses=[];let costCP=0;
 for(let i=0;i<view.rows.length;i++){const row=view.rows[i],success=successes[i];let next;
  if(success)next=restore(row.s,row.quote.hp,{reason:`Fix All: ${view.mode==='paid'?view.shop.name:'self repair'}; ${row.quote.minutes} minutes`,by:user.name});
  else next=history({...row.s,revision:row.s.revision+1},{kind:'failed repair',reason:`Fix All: failed DC ${row.quote.dc}`,by:user.name});
  delete next.pending;states.set(row.item.id,next);
  if(view.mode==='self'){toolUses.push(row.tool?.tool);if(success||cfg.rules.consumeOnFailure)allocations.push(...row.plan.allocations);}
  else if(success){costCP+=row.quote.priceCP;if(view.supplyParts)allocations.push(...row.plan.allocations);}
 }
 await commitItems(actor,states,{plan:planFromAllocations(actor,allocations),costCP,toolUses});
 const repaired=successes.filter(Boolean).length,failed=successes.length-repaired;
 await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor}),content:`<div class="sbs-bi-chat"><b>Fix All complete</b><p>${repaired} repaired · ${failed} failed · ${formatGP(costCP)} charged · ${view.minutes} minutes of downtime. Break histories were preserved.</p></div>`});
 return {repaired,failed,costCP,minutes:view.minutes};
}
async function repairReport(item,success,quote,who) {await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor:item.actor}),content:`<div class="sbs-bi-chat"><b>${esc(item.name)} — ${success?'Repair complete':'Repair failed'}</b><p>${esc(who)} · ${success?`${quote.hp} HP restored`:'Item remains broken'} · ${quote.minutes} minutes of downtime.</p><p>Break history is preserved.</p></div>`});}
async function reportBreak(item,before,after) {
 if(before.breaks===after.breaks&&before.destroyed===after.destroyed)return;
 const message=after.destroyed?`${item.name} is DESTROYED and cannot be repaired.`:`${item.name} broke (${after.breaks}/${BREAK_LIMIT}).${after.breaks===2?' Its next break will destroy it permanently.':''}`;
 ui.notifications.warn(message);await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor:item.actor}),content:`<div class="sbs-bi-chat"><b>${esc(message)}</b></div>`});
}
export async function createSupplies() {
 if(!game.user.isGM)throw Error('Only the GM can create supply items.');
 const values={metal:2,leather:1,wood:1,cloth:0.5,mechanical:2,gem:5,glass:1,stone:1,paper:0.5};
 const mats=Object.entries(MATERIALS).map(([key,name])=>({key,name,valueGP:values[key]}));
 const cfg=settings(),prices={common:2,uncommon:10,rare:50,veryRare:250,legendary:1000};
 for(const key of Object.keys(prices))mats.push({key:`reagent:${key}`,name:`${cfg.rarities[key].label} Repair Reagents`,valueGP:prices[key]});
 const existing=new Set([...game.items].map(i=>i.flags?.[ID]?.material?.key));
 const data=mats.filter(m=>!existing.has(m.key)).map(m=>({name:m.name,type:'loot',img:'icons/commodities/metal/ingot-iron.webp',system:{quantity:1,price:{value:m.valueGP,denomination:'gp'},description:{value:'<p>Consumable repair supplies for SaltyBananaSlug’s Breakable Items. Drag onto a character and set its quantity. Tools are required separately.</p>'}},flags:{[ID]:{material:{key:m.key,valueGP:m.valueGP},durability:{enabled:false}}}}));
 if(data.length)await Item.createDocuments(data);return data.length;
}
