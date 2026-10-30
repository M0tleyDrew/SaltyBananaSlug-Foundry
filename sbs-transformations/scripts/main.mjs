import {ID,VERSION,blank,fresh,copy,definition,feature,completed,selected,ownsFeature,pending,eligible,acceptStage,setStage,resetFrom,validateCatalog,validateAnswers,validateGiftSelection,history,isBloodied,crossedBloodied,dawn} from './engine.mjs';
import {HP,supported,actorContext,variables,expression,diceFormula,active,passiveChanges,nativeItem,naturalAttacks,stableID,cleanText,heavyArmor} from './mechanics.mjs';
import {placedTokens,capture,applyImage,restoreImages,oldBackup,snapshot} from './images.mjs';
export {ID,VERSION};
const LEGACY='sbs-lycanthropy',ICON=`modules/${ID}/assets/transforming-slug.png`;
let stock=[],catalog=[],loading;
const serials=new Map(),waiting=new Map(),processed=new Set(),choiceWindows=new Set(),hpCache=new Map(),choiceDialogs=new Map();
const raw=a=>a?.getFlag(ID,'data');
const root=a=>{const id=a?.getFlag(ID,'root');return id?fromUuidSync(id)??a:a;};
const read=a=>copy(raw(root(a))??blank());
const primary=()=>game.user.id===game.users.activeGM?.id;
const owner=(a,u=game.user)=>!!a&&(u?.isGM||a.testUserPermission(u,'OWNER'));
const live=(a,r)=>r.state.animalUuid?fromUuidSync(r.state.animalUuid)??a:a;
const actorList=()=>[...new Map([...game.actors.contents,...game.scenes.contents.flatMap(s=>s.tokens.contents.filter(t=>!t.actorLink).map(t=>t.actor).filter(Boolean))].filter(supported).map(a=>[a.uuid,a])).values()];
const error=e=>{console.error('SBS Transformations',e);ui.notifications.error(e.message??String(e));};
const serial=(a,fn)=>{const k=root(a).uuid,p=(serials.get(k)??Promise.resolve()).catch(()=>{}).then(fn);serials.set(k,p);p.finally(()=>{if(serials.get(k)===p)serials.delete(k);}).catch(()=>{});return p;};
const write=(a,d)=>a.setFlag(ID,'data',d);
const tagged=(role,rid,extra={})=>({[ID]:{role,record:rid,...extra}});
const tag=d=>d?.flags?.[ID]??d?.getFlag(ID,'')??{};
const chat=(a,text)=>ChatMessage.create({speaker:ChatMessage.getSpeaker({actor:a}),content:`<div class="sbs-t-chat"><h3>Transformations</h3>${text}</div>`});
const worldTypes=()=>{const over=game.settings.get(ID,'definitions')??{};return stock.map(t=>over[t.id]??t).concat(Object.entries(over).filter(([id])=>!stock.some(t=>t.id===id)).map(([,t])=>t));};
function loadCatalog(){catalog=worldTypes();validateCatalog(catalog);}
function recordOf(d,id){const r=d.records.find(r=>r.id===id);if(!r)throw Error('Transformation record not found.');const t=definition(catalog,r.type);if(!t)throw Error('Transformation definition is missing.');return{r,t};}
const roundKey=()=>game.combat?`${game.combat.id}:${game.combat.round}`:`time:${Math.floor(game.time.worldTime/6)}`;
async function request(action,a,args={}){
 a=root(a);if(!supported(a))throw Error('Choose a dnd5e character or NPC with hit points.');if(!owner(a))throw Error('You do not own this actor.');if(!game.users.activeGM)throw Error('A GM must be online to process this change.');
 if(primary())return serial(a,()=>execute(action,a,args,game.user));
 const id=foundry.utils.randomID();return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{waiting.delete(id);reject(Error('Request still pending with the GM. Check the actor before retrying.'));},60000);waiting.set(id,{resolve,reject,timer,actor:a.uuid});
  a.setFlag(ID,`requests.${id}`,{action,args}).catch(e=>{clearTimeout(timer);waiting.delete(id);reject(e);});
 });
}
async function handleRequests(a,changes,userId){
 const reqs=foundry.utils.getProperty(changes,`flags.${ID}.requests`)??Object.fromEntries(Object.entries(changes).filter(([k])=>k.startsWith(`flags.${ID}.requests.`)).map(([k,v])=>[k.split('.').at(-1),v]));
 if(primary()&&reqs){for(const [id,req]of Object.entries(reqs)){
  if(id.startsWith('-=')||!req||processed.has(a.uuid+id))continue;processed.add(a.uuid+id);
  const user=game.users.get(userId);let result,fail;
  try{if(!user?.active||!owner(a,user))throw Error('Actor ownership is required.');result=await serial(a,()=>execute(req.action,a,req.args??{},user));}catch(e){fail=e.message;}
  await a.setFlag(ID,`responses.${id}`,{user:userId,error:fail??null,result:result??null});
 }}
 const responses=a.getFlag(ID,'responses')??{};for(const[id,res]of Object.entries(responses)){
  const p=waiting.get(id);if(!p||p.actor!==a.uuid||res.user!==game.user.id)continue;clearTimeout(p.timer);waiting.delete(id);res.error?p.reject(Error(res.error)):p.resolve(res.result);
  a.unsetFlag(ID,`requests.${id}`).catch(()=>{});a.unsetFlag(ID,`responses.${id}`).catch(()=>{});
 }
}
function typesFor(a){const out=new Set([a.system.details?.type?.value].filter(Boolean));const d=read(a);for(const r of d.records){const t=definition(catalog,r.type);if(t)for(const f of selected(t,r))if(f.creatureType)out.add(f.creatureType);}return [...out];}
function controller(a,r,t){return{name:`${t.name} — Transformation Controls`,type:'feat',img:ICON,flags:tagged('controller',r.id),system:{description:{value:`<p>Stage ${completed(t,r)} / ${r.granted}${r.disabled?' — suspended':''}. Open to manage forms, pending choices, images, uses, and selected features.</p><p>Creature types: ${typesFor(a).map(cleanText).join(', ')||'see source actor'}. Additional types are tracked here because core provides one creature-type field.</p>`},activities:{sbsTransformOpen:{type:'utility',name:'Open transformation',activation:{type:'special',value:1}}}}};}
function statusEffects(r){
 const statuses=[];if(active(r,'invisible'))statuses.push('invisible');
 // Confusion has a behavior table rather than a core condition; its rule card is the prompt.
 return statuses;
}
async function sync(a,{animal=false}={}){
 const d=read(a),expected=new Map(),effects=[];
 for(const r of d.records){const t=definition(catalog,r.type);if(!t)continue;
  expected.set(r.id+':controller',controller(a,r,t));
  const fs=selected(t,r);
  for(const f of fs){const row=nativeItem(a,t,r,f);expected.set(r.id+':'+f.id,row);}
  if(!animal){for(const row of naturalAttacks(a,t,r)){expected.set(r.id+':'+row.flags[ID].feature,row);}
   if(fs.length)effects.push({name:`${t.name} — Stage ${completed(t,r)}`,img:ICON,flags:tagged('mechanics',r.id),changes:passiveChanges(a,t,r),statuses:statusEffects(r)});
  }
 }
 const current=a.items.filter(i=>i.getFlag(ID,'role'));
 for(const[key,row]of expected){const f=row.flags[ID],old=current.find(i=>i.getFlag(ID,'record')===f.record&&(f.role==='controller'?i.getFlag(ID,'role')==='controller':i.getFlag(ID,'feature')===f.feature));
  if(old){if(row.system.uses)row.system.uses.spent=Math.min(Number(row.system.uses.max)||0,Number(old.system.uses?.spent)||0);const oldEffects=old.effects?.contents??[];if(row.effects){const newIDs=new Set(row.effects.map(e=>e._id));const stale=oldEffects.filter(e=>e.getFlag(ID,'record')&&!newIDs.has(e.id)).map(e=>e.id);if(stale.length)await old.deleteEmbeddedDocuments('ActiveEffect',stale);}const childEffects=row.effects;delete row.effects;await old.update(row,{sbsTransformations:true});if(childEffects)for(const effect of childEffects){const currentEffect=old.effects.get(effect._id);if(currentEffect)await currentEffect.update(effect);else await old.createEmbeddedDocuments('ActiveEffect',[effect],{keepId:true});}}
  else await a.createEmbeddedDocuments('Item',[row],{keepId:true,sbsTransformations:true});
 }
 const stale=current.filter(i=>i.getFlag(ID,'role')!=='spell'||!d.records.some(r=>{const t=definition(catalog,r.type);return t&&selected(t,r).some(f=>(i.getFlag(ID,'spellFor')??'').startsWith(f.id+':'));})).filter(i=>!expected.has(i.getFlag(ID,'record')+':'+(i.getFlag(ID,'role')==='controller'?'controller':i.getFlag(ID,'feature')))).map(i=>i.id);if(stale.length)await a.deleteEmbeddedDocuments('Item',stale,{sbsTransformations:true});
 const oldEffects=a.effects.filter(e=>e.getFlag(ID,'role')==='mechanics');
 for(const row of effects){const old=oldEffects.find(e=>e.getFlag(ID,'record')===row.flags[ID].record);if(old)await old.update(row,{sbsTransformations:true});else await a.createEmbeddedDocuments('ActiveEffect',[row],{sbsTransformations:true});}
 const expectedRecords=new Set(effects.map(e=>e.flags[ID].record));const ids=oldEffects.filter(e=>!expectedRecords.has(e.getFlag(ID,'record'))).map(e=>e.id);if(ids.length)await a.deleteEmbeddedDocuments('ActiveEffect',ids);
}
async function visual(a,d,r,key){
 const src=formImage(r,key);if(!src)return;
 if(d.appearance&&d.appearance.record!==r.id)throw Error('Revert the other active appearance before changing this token image.');
 if(!d.appearance)d.appearance={record:r.id,key,backup:capture(a)};else d.appearance.key=key;
 await write(a,d);await applyImage(a,src);
}
async function clearVisual(a,d,r){if(d.appearance?.record===r.id){await restoreImages(a,d.appearance.backup);d.appearance=null;}}
async function changeForm(a,id,mode,{forced=false}={}){
 let d=read(a),{r,t}=recordOf(d,id);if(r.disabled||!completed(t,r))throw Error('Complete the first stage and resume the transformation first.');
 if(!forced&&(r.state.feral||r.state.lockUntil>game.time.worldTime))throw Error('This form cannot end voluntarily yet.');
 const has=n=>selected(t,r).some(f=>f.name===n);
 if(mode==='revealed'&&!imageKeys(t,r).includes('revealed'))throw Error('No revealed appearance is available.');
 if(mode==='hybrid'&&(t.baseType??r.type)!=='lycanthrope')throw Error('Hybrid form belongs to Lycanthrope only.');
 if(mode==='animal'&&!has('Kindred Form'))throw Error('Kindred Form is not selected.');
 if(mode==='ooze'&&!has('Ooze Form'))throw Error('Ooze Form is not selected.');
 if(!['normal','hybrid','animal','ooze','revealed','disguised'].includes(mode))throw Error('Unknown transformation form.');
 if(mode!=='normal'&&d.records.some(x=>x.id!==r.id&&x.state.mode!=='normal'))throw Error('Only one transformation form can replace the body at a time.');
 if(r.state.mode===mode){if(forced&&mode==='hybrid'&&!r.state.feral){r.state.feral=true;r.state.expires=game.time.worldTime+3600;await a.endConcentration();await write(a,d);await sync(a);}if(d.appearance?.record===r.id&&formImage(r,d.appearance.key))await applyImage(live(a,r),formImage(r,d.appearance.key));return;}
 if(r.state.mode==='animal'){
  const beast=live(a,r);if(beast===a&&!a.isPolymorphed)throw Error('The animal actor is missing; use GM repair.');
  const restored=await beast.revertOriginalForm({renderSheet:true});if(a.isToken){a=restored?.actor??a.token?.actor??a;await a.unsetFlag(ID,'root');}
  d=read(a);({r,t}=recordOf(d,id));r.state.animalUuid=null;
 }
 if(mode==='normal'){
  await clearVisual(a,d,r);r.state.mode='normal';r.state.feral=false;r.state.expires=0;await write(a,d);await sync(a);return;
 }
 if(mode==='animal')return animalForm(a,d,r,t);
 if(mode==='ooze'&&r.state.mode!=='ooze')await spend(a,r.id,t.id+':ooze-form');
 const seconds=mode==='hybrid'?(forced?3600:completed(t,r)*3600):mode==='ooze'?(has('Legion of Slime')||has('Mimic Object')?0:has('Corrosive Membrane')||has('Engulf')?600:60):0;
 if(!(mode==='hybrid'&&has('Hybrid Form Affinity')&&!forced)&&['hybrid','ooze'].includes(mode))await a.endConcentration();
 r.state.mode=mode;r.state.feral=forced;r.state.expires=seconds?game.time.worldTime+seconds:0;await write(a,d);await sync(a);await visual(a,d,r,mode);
}
async function animalSource(a,r,t){
 if(r.state.animalSource){const doc=await fromUuid(r.state.animalSource);if(doc?.documentName==='Actor')return doc;throw Error('Configured animal actor not found.');}
 const fs=selected(t,r).map(f=>f.name),name=fs.includes('Hybrid Bear Form')?'Black Bear':fs.includes('Hybrid Rat Form')?'Giant Rat':'Wolf';
 const world=game.actors.find(x=>x.type==='npc'&&x.uuid!==a.uuid&&x.name.toLowerCase()===name.toLowerCase());if(world)return world;
 for(const pack of game.packs.contents.filter(p=>p.documentName==='Actor').sort((a,b)=>Number(/24/.test(b.collection))-Number(/24/.test(a.collection)))){try{const index=await pack.getIndex(),row=index.find(x=>x.name.toLowerCase()===name.toLowerCase());if(row)return await pack.getDocument(row._id);}catch{}}
 throw Error(`Import a ${name} NPC or set its actor UUID in the GM editor; no animal statistics were substituted.`);
}
async function animalForm(a,d,r,t){
 const source=await animalSource(a,r,t);await a.endConcentration();
 if(!d.appearance)d.appearance={record:r.id,key:'animal',backup:capture(a)};
 r.state.mode='animal';r.state.expires=game.time.worldTime+3600;await write(a,d);await sync(a);
 const {default:TransformationSetting}=await import('/systems/dnd5e/module/data/settings/transformation-setting.mjs');
 const preset=foundry.utils.deepClone(CONFIG.DND5E.transformation.presets.polymorph.settings),settings=new TransformationSetting({...preset,keep:new Set([...preset.keep,'languages']),preset:'polymorph',transformTokens:true});
 const before=new Set(game.actors.map(a=>a.id));await a.transformInto(source,settings,{renderSheet:true});
 const beast=a.isToken?a.token.actor:game.actors.find(b=>!before.has(b.id)&&b.getFlag(ID,'root')===a.uuid);
 if(!beast)throw Error('The native animal transformation did not create its actor. Use GM repair.');
 r.state.animalUuid=beast.uuid;await write(a,d);await beast.setFlag(ID,'root',a.uuid);await beast.setFlag(ID,'data',d);await sync(beast,{animal:true});
}
async function spend(a,rid,fid){const item=a.items.find(i=>i.getFlag(ID,'record')===rid&&i.getFlag(ID,'feature')===fid);if(!item?.system.uses?.max)return;
 const max=Number(item.system.uses.max)||0,spent=Number(item.system.uses.spent)||0;if(spent>=max)throw Error('No uses remaining; finish the required rest first.');await item.update({'system.uses.spent':spent+1},{sbsTransformations:true});}
async function findSourceItem(name,type){const own=game.items.find(i=>i.type===type&&i.name.toLowerCase()===name.toLowerCase());if(own)return own;
 for(const p of game.packs.contents.filter(p=>p.documentName==='Item')){try{const idx=await p.getIndex(),row=idx.find(i=>i.type===type&&i.name.toLowerCase()===name.toLowerCase());if(row)return await p.getDocument(row._id);}catch{}}
 throw Error(`Import ${name} into Items or an accessible Item compendium first.`);
}
async function useFeature(a,rid,fid,aid){
 let d=read(a),{r,t}=recordOf(d,rid),f=selected(t,r).find(f=>f.id===fid),action=f?.actions.find(ac=>ac.id===aid);if(!f||!action)throw Error('That feature/action is not active for this transformation.');
 if(r.disabled)throw Error('This transformation is suspended.');
 if(action.when&&!(r.state.mode===action.when||active(r,action.when)))throw Error('This action requires its corresponding form or manifestation.');
 if(action.kind==='reference'){await chat(a,`<p><b>${cleanText(f.name)}</b></p><p>${cleanText(f.summary)}</p><p>${cleanText(f.manual)}</p>`);return;}
 if(action.kind==='form')return changeForm(a,rid,action.mode);
 if(action.kind==='toggle'){
  const existing=active(r,action.state);if(!existing){if(['wings','fiend-wings','shell'].includes(action.state)&&heavyArmor(a))throw Error('This manifestation cannot be used in heavy armor.');await spend(a,rid,fid);}
  if(existing)delete r.state.active[action.state];else{
   if(['shell','limbs','slime'].includes(action.state))for(const key of ['shell','limbs','slime'])delete r.state.active[key];
   r.state.active[action.state]={until:action.duration?game.time.worldTime+action.duration:0,source:fid};
  }
  if(existing&&d.appearance?.record===r.id&&d.appearance.key===action.state)await clearVisual(a,d,r);
  await write(a,d);await sync(a);if(!existing)await visual(a,d,r,action.state);return;
 }
 if(action.kind==='spell'){
  const source=await findSourceItem(action.spell,'spell');await spend(a,rid,fid);
  let spell=a.items.find(i=>i.getFlag(ID,'spellFor')===fid+':'+aid&&i.getFlag(ID,'record')===rid);
  if(!spell){const row=source.toObject();delete row._id;row.flags??={};row.flags[ID]={role:'spell',record:rid,spellFor:fid+':'+aid};row.system.preparation={mode:'innate',prepared:true};row.system.uses={max:'1',spent:0,recovery:[]};spell=(await a.createEmbeddedDocuments('Item',[row]))[0];}
  // Native spell card preserves targeting, saves, and effects. The transformation use, not a class spell slot, funds it.
  await spell.update({'system.uses.spent':0},{sbsTransformations:true});
  const activity=spell.system.activities.contents?.[0]??[...spell.system.activities][0];
  if(activity)await activity.use({spell:{slot:false},consume:{spellSlot:false}},{},{create:true});else await spell.use({consumeSpellSlot:false});
  if(action.state){r.state.active[action.state]={until:game.time.worldTime+(action.duration??60),source:fid};await write(a,d);await sync(a);}
 }
}
let unstableTable=[];
const feats=(t,r)=>new Set(selected(t,r).map(f=>f.name));
const getMod=(a,key)=>Number(a.system.abilities?.[key]?.mod)||0;
async function save(a,ability,dc,label){await chat(a,`<p>${cleanText(label)} — DC ${dc} ${ability.toUpperCase()} save.</p>`);const rs=await a.rollSavingThrow({ability,target:dc});const roll=Array.isArray(rs)?rs[0]:rs;return Number.isFinite(roll?.total)?roll.total>=dc:null;}
async function rollAmount(a,formula,label){const roll=await new Roll(formula,a.getRollData()).evaluate();await roll.toMessage({speaker:ChatMessage.getSpeaker({actor:a}),flavor:label});return roll.total;}
async function selfDamage(a,amount,{rawDamage=false}={}){if(!Number.isFinite(amount)||amount<0)throw Error('Invalid damage.');const h=HP(a),temp=Math.min(Number(h.temp)||0,amount);await a.update({'system.attributes.hp.temp':(Number(h.temp)||0)-temp,'system.attributes.hp.value':Math.max(0,Number(h.value)-(amount-temp))},{sbsTransformations:rawDamage});}
async function tempHP(a,amount){if((Number(HP(a).temp)||0)<amount)await a.update({'system.attributes.hp.temp':amount},{sbsTransformations:true});}
async function heal(a,amount){await a.applyDamage([{type:'healing',value:amount}]);}
async function unstable(a,id,{worsen=false}={}){
 const d=read(a),{r,t}=recordOf(d,id),n=await rollAmount(a,'1d100','Unstable Form');if(worsen&&r.state.unstable&&n>=r.state.unstable.roll)return;
 const s=completed(t,r),entry=unstableTable.find(e=>{const text=e.ranges[s-1];if(!text)return false;const[lo,hi]=text.split('-').map(Number);return n>=lo&&n<=(hi??lo);});
 if(!entry)throw Error('Unstable Form table result missing.');r.state.unstable={roll:n,id:entry.id,summary:entry.summary,baseHP:HP(a).max};await write(a,d);
 if(entry.id==='exhaustion')await a.update({'system.attributes.exhaustion':Number(a.system.attributes.exhaustion||0)+2},{sbsTransformations:true});
 if(entry.id==='temporary-hp')await tempHP(a,4*s);
 await sync(a);await chat(a,`<p><b>Unstable Form ${n}</b>: ${cleanText(entry.summary)}</p>`);
}
async function hunt(a,id){const d=read(a),{r,t}=recordOf(d,id);if(r.state.huntUsed)return;const passed=r.state.fullMoon?false:await save(a,'wis',10,'Lust for the Hunt');if(passed===null)return;r.state.huntUsed=true;await write(a,d);if(!passed)await changeForm(a,id,'hybrid',{forced:true});}
function formImage(r,key){const t=definition(catalog,r.type),stage=t?completed(t,r):0;for(let n=stage;n>=1;n--){const row=r.stageImages?.[n];if(row&&Object.hasOwn(row,key))return row[key];}return r.images[key]??'';}
function imageKeys(t,r){const keys=new Set();for(const f of selected(t,r)){for(const ac of f.actions??[]){if(ac.kind==='form'&&ac.mode!=='normal')keys.add(ac.mode);if(ac.kind==='toggle')keys.add(ac.state);}if(/Appearance|Radiance|Roiling|Sanguine/.test(f.name))keys.add('revealed');}if((t.baseType??t.id)!=='lycanthrope'&&completed(t,r)>0&&![...keys].some(k=>['hybrid','animal','ooze','revealed'].includes(k)))keys.add('revealed');return [...keys];}
function validImages(t,r,images){const keys=new Set(imageKeys(t,r)),out={...r.images};for(const[k,v]of Object.entries(images??{})){if(!keys.has(k))throw Error('Image form does not belong to this transformation.');const src=String(v).trim();if(src.length>4096||/^(javascript|data):/i.test(src))throw Error('Use a Foundry image path or HTTPS URL.');out[k]=src;}return out;}
async function execute(action,a,args,user){
 if(!supported(a))throw Error('Choose a dnd5e character or NPC with hit points.');
 if(!owner(a,user))throw Error('Actor ownership is required.');
 const gmActions=new Set(['add','grant','reset','remove','suspend','resume','migrate','rollback','repair','source','save-definition','reset-definition','override','assign-chooser']);
 if(gmActions.has(action)&&!user.isGM)throw Error('Only the GM can do that.');
 let d=read(a);
 if(action==='add'){
  const t=definition(catalog,args.type);if(!t)throw Error('Unknown transformation.');
  if(d.records.some(r=>r.type===t.id))throw Error('That transformation already exists on this actor.');
  if(d.records.some(r=>!r.disabled)&&!game.settings.get(ID,'multiple'))throw Error('This world allows one active transformation per actor. Suspend/remove the existing one or enable GM-approved combinations.');
  const r=fresh(foundry.utils.randomID(),t.id);r.granted=Number(args.stage??1);if(!Number.isInteger(r.granted)||r.granted<1||r.granted>4)throw Error('Invalid granted stage.');r.chooser=args.chooser==='gm'?'gm':'player';r.state.lastFed=game.time.worldTime;d.records.push(r);history(d,{action:'add',type:t.id,stage:r.granted,user:user.id});await write(a,d);await sync(a);return r.id;
 }
 if(action==='migrate')return migrate(a,user);
 if(action==='rollback')return rollback(a,user);
 if(action==='trigger-damage'){for(const r of d.records)if(!r.disabled)r.state.receivedRadiant=true;await write(a,d);return;}
 const {r,t}=recordOf(d,args.record);const names=feats(t,r),s=completed(t,r);
 switch(action){
  case 'assign-chooser':r.chooser=args.chooser==='gm'?'gm':'player';await write(a,d);return;
  case 'choose':{
   const next=acceptStage(t,r,{stage:Number(args.stage),boons:args.boons,answers:args.answers},actorContext(a));
   next.state.answerRest??={};for(const fid of Object.keys(next.answers)){const f=feature(t,fid);if(f?.choices.some(c=>c.rest)&&next.state.answerRest[fid]==null)next.state.answerRest[fid]=f.choices.some(c=>c.rest==='lr')?next.state.longRestSerial:next.state.restSerial;}
   if(args.images){const validated=validImages(t,next,args.images);next.stageImages??={};next.stageImages[Number(args.stage)]={...next.stageImages[Number(args.stage)],...Object.fromEntries(Object.keys(args.images).map(k=>[k,validated[k]]))};}d.records[d.records.indexOf(r)]=next;history(d,{action:'choose',type:r.type,stage:Number(args.stage),boons:args.boons,user:user.id});await write(a,d);await sync(a);return;
  }
  case 'grant':case 'reset':{
   if(r.state.mode!=='normal'||Object.keys(r.state.active).length)throw Error('Return to normal form and end manifestations before editing stages.');
   const next=action==='grant'?setStage(t,r,Number(args.stage)):resetFrom(t,r,Number(args.stage));if(args.chooser)next.chooser=args.chooser==='gm'?'gm':'player';d.records[d.records.indexOf(r)]=next;history(d,{action,type:r.type,stage:Number(args.stage),user:user.id});await write(a,d);await sync(a);return;
  }
  case 'suspend':case 'resume':{
   if(action==='resume'&&d.records.some(other=>other.id!==r.id&&!other.disabled)&&!game.settings.get(ID,'multiple'))throw Error('Another transformation is active; combinations are disabled.');
   if(action==='suspend'){if(r.state.mode==='animal'){await changeForm(a,r.id,'normal',{forced:true});d=read(a);}const rr=d.records.find(x=>x.id===r.id);await clearVisual(a,d,rr);rr.state.mode='normal';rr.state.active={};rr.disabled=true;}else r.disabled=false;
   history(d,{action,type:r.type,user:user.id});await write(a,d);await sync(a);return;
  }
  case 'remove':{
   if(r.state.mode==='animal'){await changeForm(a,r.id,'normal',{forced:true});d=read(a);}await clearVisual(a,d,r);d.records=d.records.filter(x=>x.id!==r.id);history(d,{action:'remove',type:r.type,user:user.id});await write(a,d);await sync(a);return;
  }
  case 'repair':{
   if(r.state.mode==='animal'&&live(a,r)!==a)return changeForm(a,r.id,'normal',{forced:true});await clearVisual(a,d,r);r.state.mode='normal';r.state.feral=false;r.state.lockUntil=0;r.state.active={};r.state.animalUuid=null;await write(a,d);await sync(a);return;
  }
  case 'images':{
   const stage=Number(args.stage??s);if(!Number.isInteger(stage)||stage<1||stage>s)throw Error('Choose a completed transformation stage.');
   const preview=setStage(t,r,stage),validated=validImages(t,preview,args.images);r.stageImages??={};r.stageImages[stage]={...r.stageImages[stage],...Object.fromEntries(Object.keys(args.images??{}).map(k=>[k,validated[k]]))};
   await write(a,d);if(d.appearance?.record===r.id){const src=formImage(r,d.appearance.key);if(src)await applyImage(live(a,r),src);else await clearVisual(a,d,r);await write(a,d);}else if(r.state.mode!=='normal')await visual(a,d,r,r.state.mode);return;
  }
  case 'form':return changeForm(a,r.id,args.mode);
  case 'use':return useFeature(a,r.id,args.feature,args.action);
  case 'state':{
   const allowed=new Set(['notes','nextSpellSave','concentratingContext','receivedRadiant']);
   if((t.baseType??r.type)==='vampire'){allowed.add('sunlight');allowed.add('uninvited');}
   if((t.baseType??r.type)==='lycanthrope'){allowed.add('fullMoon');allowed.add('senses');}
   if((t.baseType??r.type)==='hag')allowed.add('purity');if((t.baseType??r.type)==='seraph')allowed.add('corrupted');if((t.baseType??r.type)==='fey')allowed.add('tributeUnpaid');
   if(!allowed.has(args.key))throw Error('That tracker does not belong to this transformation.');
   if(args.key==='notes')r.state.notes=String(args.value??'').slice(0,8000);
   else if(args.key==='senses')r.state.senses={bloodied:!!args.value?.bloodied,unconscious:!!args.value?.unconscious};
   else r.state[args.key]=!!args.value;await write(a,d);await sync(a);return;
  }
  case 'recover':{
   if((t.baseType??r.type)!=='lycanthrope'||!r.state.feral)throw Error('This is not a feral lycanthrope.');if(HP(a).value<HP(a).max)throw Error('Recovery requires full HP at turn start.');if(await save(a,'wis',10,'Feral recovery')===true)return changeForm(a,r.id,'normal',{forced:r.state.lockUntil<=game.time.worldTime});return;
  }
  case 'hunt':if((t.baseType??r.type)!=='lycanthrope'||!isBloodied(HP(a)))throw Error('Requires a Bloodied lycanthrope.');return hunt(a,r.id);
  case 'remove-spell':if((t.baseType??r.type)!=='lycanthrope')throw Error('This control is specific to the lycanthrope flaw.');if(r.state.lockUntil>game.time.worldTime)throw Error('Ultimate Predator still locks reversion until dawn.');return changeForm(a,r.id,'normal',{forced:true});
  case 'kill':if((t.baseType??r.type)==='lycanthrope'&&s===4&&r.state.mode==='hybrid'){r.state.lockUntil=dawn(game.time.worldTime,game.settings.get(ID,'dawnHour'));await write(a,d);}return;
  case 'feed':{
   if((t.baseType??r.type)!=='vampire'&&(t.baseType??r.type)!=='hag')throw Error('This feeding tracker belongs to Vampire or Hag.');r.state.lastFed=game.time.worldTime;r.state.feedingOverdue=false;await write(a,d);await chat(a,'<p>Feeding recorded. Resolve target eligibility, blood loss/Exhaustion, or the Hag’s vile nourishment with the GM.</p>');return;
  }
  case 'soul':{
   if((t.baseType??r.type)!=='lich'||!names.has('Soul Vessel'))throw Error('This actor has no soul vessel.');if(args.charged){const cr=Number(args.cr),level=variables(a,t,r).level;if(!Number.isFinite(cr)||cr<level/2)throw Error('The soul CR must be at least half character level.');if((r.state.soulCaptures??0)>=2*s)throw Error('No captures remaining until a long rest.');r.state.soulCaptures=(r.state.soulCaptures??0)+1;r.state.soul={charged:true,cr};}else r.state.soul={charged:false,cr:0};await write(a,d);await sync(a);return;
  }
  case 'source':if((t.baseType??r.type)!=='lycanthrope'||!names.has('Kindred Form'))throw Error('Animal sources belong to Kindred Form.');r.state.animalSource=String(args.uuid??'').trim();await write(a,d);return;
  case 'unstable':if((t.baseType??r.type)!=='aberrant-horror')throw Error('Unstable Form belongs to Aberrant Horror.');return unstable(a,r.id);
  case 'focus':{
   if(!names.has("Hunter's Focus")||r.state.mode!=='hybrid')throw Error('Requires Hunter’s Focus in hybrid form.');const target=await fromUuid(args.target);if(!supported(target)||rangeBetween(a,target)>60)throw Error('Choose a creature within 60 feet.');r.state.prey={uuid:target.uuid,until:game.time.worldTime+3600};await write(a,d);return;
  }
  case 'contract':{
   if((t.baseType??r.type)!=='fiend'||!names.has('Devilish Contractor'))throw Error('Requires Devilish Contractor.');const gift=feature(t,args.gift);if(!gift||gift.kind!=='gift'||gift.stage>s)throw Error('Gift is from the wrong transformation or above your stage.');if((r.state.contracts??[]).includes(gift.id))throw Error('That gift is already associated with a recorded contract.');
   const values=validateAnswers(t,r,[gift.id],{[gift.id]:args.answers??{}});r.answers={...r.answers,...values};
   const activeGifts=r.state.activeGifts??[],max=names.has('Devilish Subcontractor')?2:1;
   if(args.activate!==false){let next=[...activeGifts];if(next.length>=max){if(!next.includes(args.replace))throw Error('Choose which active gift the new contract replaces, or disable immediate activation.');next=next.filter(id=>id!==args.replace);}next.push(gift.id);r.state.activeGifts=next;}
   r.state.contracts=[...new Set([...(r.state.contracts??[]),gift.id])];await write(a,d);await sync(a);if(args.activate!==false&&activeGifts.length&&names.has('Enhanced Contract'))await tempHP(a,5*s);return;
  }
  case 'gifts':{
   validateGiftSelection(t,r,args.gifts,{rest:r.state.lastRest??'none'});if(!r.state.giftSwitchReady)throw Error('Finish the appropriate rest before switching active gifts.');const old=r.state.activeGifts??[],changed=old.filter(x=>!args.gifts.includes(x)).length;if(changed>1)throw Error('Only one active gift can be switched per rest.');r.state.activeGifts=args.gifts;r.state.giftSwitchReady=false;await write(a,d);await sync(a);if(names.has('Enhanced Contract'))await tempHP(a,5*s);return;
  }
  case 'rest-choice':{
   const f=selected(t,r).find(f=>f.id===args.feature);if(!f)throw Error('Feature is not selected.');const cs=f.choices.filter(c=>c.rest);if(!cs.length)throw Error('This feature cannot be reselected after rests.');const serial=cs.some(c=>c.rest==='lr')?r.state.longRestSerial:r.state.restSerial;
   if(r.state.answerRest?.[f.id]===serial)throw Error('That rest choice was already made.');const valid=validateAnswers(t,r,[f.id],{[f.id]:args.answers});r.answers[f.id]=valid[f.id];r.state.answerRest??={};r.state.answerRest[f.id]=serial;await write(a,d);await sync(a);return;
  }
  default:throw Error('Unknown transformation action.');
 }
}
function rangeBetween(a,b){let best=Infinity;for(const ta of placedTokens(a))for(const tb of placedTokens(b)){if(ta.parent?.id!==tb.parent?.id)continue;const grid=ta.parent.grid;const p={x:ta.x+ta.width*grid.size/2,y:ta.y+ta.height*grid.size/2},q={x:tb.x+tb.width*grid.size/2,y:tb.y+tb.height*grid.size/2};let dist=canvas.scene?.id===ta.parent.id&&canvas.grid?.measurePath?canvas.grid.measurePath([p,q]).distance:Math.hypot(p.x-q.x,p.y-q.y)/grid.size*grid.distance;const u=String(grid.units).toLowerCase();if(['m','meter','meters','metre','metres'].includes(u))dist*=3.28084;best=Math.min(best,dist);}return best;}
async function migrate(a,user){
 const old=a.flags?.[LEGACY]?.data;if(!old)throw Error('No legacy Lycanthropy data found on this actor.');
 if(old.state?.form==='kindred')throw Error('Revert the old animal form before migration.');
 const d=read(a);if(d.records.some(r=>r.type==='lycanthrope'))throw Error('A Lycanthrope record already exists.');
 const t=definition(catalog,'lycanthrope'),r=fresh(foundry.utils.randomID(),t.id);r.granted=old.config?.granted??1;
 const mapping={wolf:'hybrid-wolf-form',bear:'hybrid-bear-form',rat:'hybrid-rat-form',focus:'hunter-s-focus',pelt:'iron-pelt',kindred:'kindred-form',vigor:'bestial-vigor',savagery:'shapeshifter-s-savagery',affinity:'hybrid-form-affinity',instincts:'savage-instincts'};
 for(let s=1;s<=r.granted;s++){const name=mapping[old.config?.choices?.[s]];if(!name)break;r.stages[s]={boons:['lycanthrope:'+name]};}
 const saved=old.state??{};r.state={...r.state,mode:saved.form==='hybrid'?'hybrid':'normal',feral:!!saved.feral,expires:saved.expires??0,huntUsed:!!saved.huntUsed,fullMoon:!!saved.fullMoon,senses:saved.senses??r.state.senses,lockUntil:saved.lockDawn??0,prey:saved.prey?{uuid:saved.prey.uuid,until:saved.prey.expires}:null,animalSource:old.config?.animalUuid??''};
 r.images={hybrid:old.config?.images?.hybrid?.token??'',animal:old.config?.images?.kindred?.token??''};
 const items=a.items.filter(i=>i.flags?.[LEGACY]?.role),effects=a.effects.filter(e=>e.flags?.[LEGACY]?.role);
 d.migration={at:Date.now(),record:r.id,oldData:copy(old),items:items.map(i=>i.toObject()),effects:effects.map(e=>e.toObject())};d.records.push(r);
 if(saved.images&&r.state.mode==='hybrid')d.appearance={record:r.id,key:'hybrid',backup:oldBackup(saved.images)};
 history(d,{action:'migrate',type:r.type,user:user.id});await write(a,d);
 if(items.length)await a.deleteEmbeddedDocuments('Item',items.map(i=>i.id));if(effects.length)await a.deleteEmbeddedDocuments('ActiveEffect',effects.map(e=>e.id));
 await a.unsetFlag(LEGACY,'data');await sync(a);if(r.state.mode==='hybrid')await visual(a,d,r,'hybrid');return r.id;
}
async function rollback(a,user){
 const d=read(a),backup=d.migration;if(!backup)throw Error('No migration backup is available.');const r=d.records.find(r=>r.id===backup.record);
 if(r?.state.mode==='animal')throw Error('Return to normal form before rolling back.');
 if(r)await clearVisual(a,d,r);d.records=d.records.filter(r=>r.id!==backup.record);
 await write(a,d);await sync(a);
 await a.setFlag(LEGACY,'data',backup.oldData);
 if(backup.items.length)await a.createEmbeddedDocuments('Item',backup.items,{keepId:true});if(backup.effects.length)await a.createEmbeddedDocuments('ActiveEffect',backup.effects,{keepId:true});
 d.migration=null;history(d,{action:'rollback',user:user.id});await write(a,d);await chat(a,'<p>Legacy Lycanthropy restored from the migration backup. Re-enable that module if it was disabled. Other transformation records remain intact.</p>');
}
const esc=cleanText;
const ruleText=f=>esc(String(f.summary??'').replace(/\b(STR|DEX|CON|INT|WIS|CHA)\b/g,key=>({STR:'Strength',DEX:'Dexterity',CON:'Constitution',INT:'Intelligence',WIS:'Wisdom',CHA:'Charisma'}[key])).replace(/ floor (\d+)/g,' at least $1'));
const brand=()=>`<div class="sbs-t-brand"><img src="${ICON}" alt=""><div><small>SALTYBANANASLUG</small><h2>Transformations</h2></div></div>`;
function modal(title,body,buttons={},bind){return new Dialog({title,content:`<div class="sbs-t">${body}</div>`,buttons:{...buttons,close:{label:'Close'}},render:bind},{classes:['sbs-t-window'],width:680,height:'auto',resizable:true}).render(true);}
const button=(id,label,extra='')=>`<button type="button" data-action="${id}" ${extra}>${label}</button>`;
const input=(name,label,value,type='text')=>`<label>${label}<input name="${name}" type="${type}" value="${esc(value)}"></label>`;
const checkbox=(name,label,value)=>`<label><input name="${name}" type="checkbox" ${value?'checked':''}> ${label}</label>`;
const selectField=(name,label,options,value)=>`<label>${label}<select name="${name}">${options.map(([id,text])=>`<option value="${esc(id)}" ${String(id)===String(value)?'selected':''}>${esc(text)}</option>`).join('')}</select></label>`;
const formLabel=key=>({hybrid:'Hybrid',animal:'Animal',ooze:'Manifested Ooze',revealed:'Revealed appearance',wings:'Angelic wings','fiend-wings':'Fiend wings',shell:'Chitinous shell',limbs:'Eldritch limbs',slime:'Slimy mutation','fey-claws':'Fey natural weapons','celestial-bow':'Celestial bow',incorporeal:'Incorporeal',invisible:'Invisible appearance',disguise:'Illusionary disguise'}[key]??key);
function imageInput(key,value=''){return`<label>${esc(formLabel(key))} token image <span class="sbs-t-image"><input name="image:${key}" value="${esc(value)}" placeholder="Optional image path"><button type="button" data-browse="image:${key}">Browse</button></span></label>`;}
function bindBrowse(html){html.find('[data-browse]').on('click',event=>{const name=event.currentTarget.dataset.browse;const field=html.find(`[name="${name}"]`);try{const Picker=foundry.applications?.apps?.FilePicker?.implementation??globalThis.FilePicker;new Picker({type:'image',current:field.val(),callback:src=>field.val(src)}).browse();}catch(e){error(e);}});}
const imageValues=(html,keys)=>Object.fromEntries(keys.map(key=>[key,String(html.find(`[name="image:${key}"]`).val()??'').trim()]));
function choiceFields(f,r){return(f.choices??[]).map(c=>{const value=r.answers[f.id]?.[c.key],vals=Array.isArray(value)?value:[value];return`<label>${esc(c.label)}${c.count>1?' (choose '+c.count+')':''}<select name="answer:${f.id}:${c.key}" ${c.count>1?'multiple size="5"':''}>${c.options.map(o=>{const id=typeof o==='string'?o:o.id,label=typeof o==='string'?o:o.label??o.id;return`<option value="${esc(id)}" ${vals.includes(id)?'selected':''}>${esc(label)}</option>`;}).join('')}</select></label>`;}).join('');}
function answerValues(html,features){const out={};for(const f of features){out[f.id]={};for(const c of f.choices??[]){const field=html.find(`[name="answer:${f.id}:${c.key}"]`)[0];if(field)out[f.id][c.key]=c.count>1?[...field.selectedOptions].map(o=>o.value):field.value;}}return out;}
function recipient(a){return game.users.contents.filter(u=>u.active&&!u.isGM&&owner(a,u)).sort((u,v)=>Number(v.character?.id===a.id)-Number(u.character?.id===a.id)||u.id.localeCompare(v.id))[0];}
function choiceRecipient(a,r){return r.chooser==='gm'?game.users.activeGM:recipient(a)??game.users.activeGM;}
function pendingChoicePanel(a,t,r){
 const stage=pending(t,r);if(!stage)return '';
 const st=t.stages[stage-1],ctx=actorContext(a),available=st.boons.map(id=>feature(t,id)).filter(f=>eligible(t,r,stage,f.id,ctx));
 return `<div class="sbs-t-card sbs-t-warning"><h3>Stage ${stage}: choices pending</h3><p>Benefits are applied after this stage is confirmed. Choose ${st.choose} boon${st.choose===1?'':'s'}; the listed flaws are required.</p>${st.grants.length?'<p><b>Automatic boons:</b> '+st.grants.map(id=>esc(feature(t,id).name)).join(', ')+'.</p>':''}<p><b>Available boons:</b> ${st.choose===0?'No boon pick is needed; confirm the automatic grants.':available.map(f=>esc(f.name)).join(', ')||'No eligible choices; open the choice window to see unmet prerequisites.'}</p><p><b>Required flaws:</b> ${st.flaws.map(id=>esc(feature(t,id).name)).join(', ')||'None for this stage.'}</p>${button('choose',game.user.isGM?'DM: Set boons & flaws':'Choose boons & confirm flaws',`data-record="${r.id}"`)}</div>`;
}
async function editChoices(a,id){
 if(!game.user.isGM)throw Error('Only the GM can change completed stage choices.');
 const {r,t}=recordOf(read(a),id);
 if(pending(t,r))return promptChoice(a,id,{gm:true});
 return modal('Change '+t.name+' choices',brand()+selectField('editStage','Change choices from stage',Array.from({length:completed(t,r)},(_,i)=>[i+1,'Stage '+(i+1)]),completed(t,r))+'<p>This reopens the selected stage and all later stages. Return to normal form and end manifestations first.</p>',{edit:{label:'Reopen choices for DM',callback:async html=>{try{await request('reset',a,{record:id,stage:Number(html.find('[name=editStage]').val()),chooser:'gm'});promptChoice(a,id,{gm:true});}catch(e){error(e);}}}});
}
function promptChoice(a,id,{gm=false}={}){
 a=root(a);const d=read(a),{r,t}=recordOf(d,id),s=pending(t,r),key=a.uuid+id;if(!s||choiceWindows.has(key)||!owner(a))return;
 if(!gm&&choiceRecipient(a,r)?.id!==game.user.id)return;
 choiceWindows.add(key);const st=t.stages[s-1],ctx=actorContext(a),fixed=st.grants.map(id=>feature(t,id)),flaws=st.flaws.map(id=>feature(t,id));
 const choices=st.boons.map(id=>feature(t,id));
 let body=brand()+`<p><b>${esc(a.name)}</b> · ${esc(t.name)} · Stage ${s}</p><p>${game.user.isGM?'You are setting these choices for the player.':'Choose your boons and confirm the required flaws.'}</p>${fixed.length?'<h3>Automatic boons</h3>':''}`+fixed.map(f=>`<div class="sbs-t-card"><b>${esc(f.name)}</b><p>${ruleText(f)}</p>${choiceFields(f,r)}</div>`).join('');
 body+=st.choose===0?'<h3>Automatic stage — no boon selection required</h3>':`<h3>Choose exactly ${st.choose} boon${st.choose===1?'':'s'}</h3>`+choices.map(f=>{const ok=eligible(t,r,s,f.id,ctx);return`<div class="sbs-t-card ${ok?'':'sbs-t-unavailable'}"><label><input type="checkbox" name="boon" value="${esc(f.id)}" ${ok?'':'disabled'}> <b>${esc(f.name)}</b></label><p>${ruleText(f)}</p>${ok?'':`<small>Unavailable: ${f.requires.length?'requires '+f.requires.map(id=>feature(t,id)?.name??id).join(', '):'requires the listed spellcasting prerequisite'}.</small>`}<div data-feature-options="${esc(f.id)}" hidden>${choiceFields(f,r)}</div></div>`;}).join('');
 body+='<h3>Required flaws</h3><p>These flaws belong to this transformation and are included when you confirm the stage.</p>'+flaws.map(f=>`<div class="sbs-t-card sbs-t-warning"><b>${esc(f.name)}</b><p>${ruleText(f)}</p>${choiceFields(f,r)}</div>`).join('');
 const candidates=[...fixed,...choices,...flaws],imageOwners=new Map();for(const f of candidates){const preview=copy(r);preview.stages[s]={boons:f.kind==='boon'&&!st.grants.includes(f.id)?[f.id]:[]};for(const k of imageKeys(t,preview)){if(!imageOwners.has(k))imageOwners.set(k,new Set());imageOwners.get(k).add(f.id);}}
 body+=`<h3>Stage ${s} temporary token art</h3><p>Optional. Used only in the matching form at this stage. Your portrait and normal token art stay unchanged.</p>`;
 for(const[k,ids]of imageOwners)body+=`<div data-image-owners="${[...ids].map(esc).join(',')}" data-image-key="${esc(k)}">${imageInput(k,formImage(r,k))}</div>`;
 body+='<p class="sbs-t-muted">You can finish later. Confirming adds this stage’s chosen boons and required flaws to the character sheet.</p>';
 let accepting=false;let dialog;try{dialog=modal(`${t.name} — Stage ${s}`,body,{accept:{label:'Apply Stage '+s+' choices',callback:async html=>{
  accepting=true;const boons=html.find('[name=boon]:checked').toArray().map(e=>e.value),fs=[...fixed,...boons.map(id=>feature(t,id)),...flaws];
  const preview=copy(r);preview.stages[s]={boons};const keys=imageKeys(t,preview).filter(k=>imageOwners.has(k));
  try{await request('choose',a,{record:id,stage:s,boons,answers:answerValues(html,fs),images:imageValues(html,keys)});choiceWindows.delete(key);choiceDialogs.delete(key);open(a);setTimeout(()=>pendingPrompts(a),200);}catch(e){error(e);choiceWindows.delete(key);setTimeout(()=>promptChoice(a,id,{gm}),100);}
 }},later:{label:'Choose later'}},html=>{
  bindBrowse(html);const refresh=()=>{const ids=new Set([...st.grants,...st.flaws,...html.find('[name=boon]:checked').toArray().map(e=>e.value)]);html.find('[data-feature-options]').each((i,el)=>el.hidden=!ids.has(el.dataset.featureOptions));html.find('[data-image-owners]').each((i,el)=>el.hidden=!el.dataset.imageOwners.split(',').some(id=>ids.has(id)));};html.find('[name=boon]').on('change',refresh);refresh();
 });}catch(e){choiceWindows.delete(key);throw e;}choiceDialogs.set(key,{dialog,stage:s,actor:a.uuid,manual:gm,chooser:r.chooser});const close=dialog.close.bind(dialog);dialog.close=async(...args)=>{if(!accepting)choiceWindows.delete(key);if(choiceDialogs.get(key)?.dialog===dialog)choiceDialogs.delete(key);return close(...args);};return dialog;
}
function imageDialog(a,id,stage){
 const {r,t}=recordOf(read(a),id),level=Number(stage??completed(t,r));if(!level)return ui.notifications.info('Complete Stage 1 choices before editing its art.');
 const preview=setStage(t,r,level),keys=imageKeys(t,preview);
 const dialog=modal(`${t.name} — Stage ${level} token art`,brand()+selectField('imageStage','Stage',Array.from({length:completed(t,r)},(_,i)=>[i+1,'Stage '+(i+1)]),level)+keys.map(k=>imageInput(k,formImage(preview,k))).join('')+'<p>Optional temporary token images for this stage. They appear only in the matching form. Character portraits and original token art are preserved.</p>',{save:{label:'Save stage art',callback:async html=>{try{await request('images',a,{record:id,stage:level,images:imageValues(html,keys)});open(a);}catch(e){error(e);}}}},html=>{bindBrowse(html);html.find('[name=imageStage]').on('change',()=>{dialog.close();imageDialog(a,id,Number(html.find('[name=imageStage]').val()));});});return dialog;
}
function restChoiceDialog(a,id,fid){const{r,t}=recordOf(read(a),id),f=selected(t,r).find(f=>f.id===fid);if(!f)return;modal('Rest selection — '+f.name,`<p>${ruleText(f)}</p>${choiceFields(f,r)}`,{save:{label:'Use rest selection',callback:html=>request('rest-choice',a,{record:id,feature:fid,answers:answerValues(html,[f])[fid]}).catch(error)}});}
let managerWindow;
function selectedTokenActor(){
 const tokens=canvas?.tokens?.controlled??[];
 if(tokens.length!==1)throw Error('Select exactly one token on the scene first.');
 const a=root(tokens[0].actor);
 if(!supported(a)||!owner(a))throw Error('Select a character or NPC token you own.');
 return a;
}
const transformationDescriptions={
 'aberrant-horror':'Mutate into an aberration with adaptable limbs, protective mutations, and an increasingly unstable body.',
 fey:'Join a seasonal Fey court, gaining enchantments and supernatural gifts alongside binding obligations.',
 fiend:'Gain infernal power through a fiendish soul, contracts, and gifts of damnation.',
 hag:'Become a Fey witch of a sisterhood, developing claws, curses, and unsettling magic.',
 lich:'Become an undead spellcaster sustained by souls and a vessel, with the costs of undeath.',
 lycanthrope:'Take a wolf, bear, or rat hybrid form, gaining natural attacks while struggling with the hunt.',
 ooze:'Manifest an amorphous body with unusual senses, resilience, and a more slippery sense of self.',
 primordial:'Embody elemental forces, choosing affinities and powers as your mortal nature changes.',
 seraph:'Develop celestial powers, wings, and divine gifts while facing corruption and otherworldly demands.',
 'shadowsteel-ghoul':'Draw power from Shadowsteel curses and weapons as the corruption takes its toll.',
 specter:'Become a spectral creature with haunting powers, increasingly detached from living flesh.',
 vampire:'Gain a supernatural bite and bloodline powers, with hunger, sunlight, and other vampiric weaknesses.'
};
function simpleHeader(a){return brand()+`<div class="sbs-t-simple-header"><p>Managing: <b>${esc(a.name)}</b>${a.isToken?' (unlinked token)':''}</p>${button('selected-token','Use selected token')}</div>`;}
function setupPreview(t){return t?`<h3>${esc(t.name)}</h3><p>${esc(transformationDescriptions[t.baseType??t.id]??'A custom transformation. Review its Stage 1 choices next.')}</p><p>Starts at Stage 1. You will choose ${t.stages[0].choose} boon${t.stages[0].choose===1?'':'s'} and confirm the required flaw.</p>`:'<p>Pick a transformation to see what it does.</p>';}
function open(a){
 if(!a){try{a=selectedTokenActor();}catch(e){
  if(managerWindow?.rendered)managerWindow.close();managerWindow=modal('SBS Transformations',brand()+'<p>Select one character or NPC token on the scene.</p>'+button('selected-token','Use selected token'),{},html=>html.find('[data-action]').on('click',()=>{try{open(selectedTokenActor());}catch(e){ui.notifications.warn(e.message);}}));return managerWindow;
 }}
 a=root(a);if(!supported(a)||!owner(a))return ui.notifications.warn('Select a character or NPC token you own.');
 const d=read(a);if(managerWindow?.rendered)managerWindow.close();
 if(!d.records.length)return setupTransformation(a);
 if(d.records.length===1)return stageEditor(a,d.records[0].id);
 let body=simpleHeader(a)+'<h3>Choose a transformation to edit</h3>'+d.records.map(r=>{const t=definition(catalog,r.type);return `<div class="sbs-t-card"><b>${esc(t?.name??r.type)}</b><p>Stage ${t?completed(t,r):0} / ${r.granted}${r.disabled?' — suspended':''}</p>${button('record','Edit',`data-record="${r.id}"`)}</div>`;}).join('');
 managerWindow=modal('SBS Transformations',body,{},html=>html.find('[data-action]').on('click',event=>{try{const el=event.currentTarget;if(el.dataset.action==='selected-token')return open(selectedTokenActor());stageEditor(a,el.dataset.record);}catch(e){error(e);}}));return managerWindow;
}
function setupTransformation(a){
 const online=recipient(a);let body=simpleHeader(a);
 if(!game.user.isGM)body+='<p>Your DM has not applied a transformation to this token yet.</p>';
 else if(a.flags?.[LEGACY]?.data)body+='<h3>Existing Lycanthropy found</h3><p>Import its current stage and choices instead of adding it a second time.</p>'+button('migrate','Import existing Lycanthropy');
 else body+='<h3>Choose a transformation</h3>'+selectField('newType','Transformation',[['','Choose a transformation…'],...catalog.map(t=>[t.id,t.name])],'')+'<div data-setup-preview>'+setupPreview()+'</div><div class="sbs-t-actions">'+button('apply-dm','Apply Stage 1 — I’ll choose')+(online?button('apply-player','Apply Stage 1 — leave choices for '+esc(online.name??'player')):'')+'</div>'+(online?'<p>The player can run the macro to choose their boon and stage art. You can also complete setup for them.</p>':'<p>No player owner is online. You can complete their choices now.</p>');
 if(game.user.isGM)body+='<details><summary>Advanced</summary>'+button('definitions','Edit transformation definitions')+'</details>';
 managerWindow=modal('SBS Transformations — Setup',body,{},html=>{
  const preview=()=>{const t=definition(catalog,html.find('[name=newType]').val());html.find('[data-setup-preview]').html(setupPreview(t));html.find('[data-action^="apply-"]').prop('disabled',!t);};html.find('[name=newType]').on('change',preview);preview();
  html.find('[data-action]').on('click',async event=>{const el=event.currentTarget,action=el.dataset.action;el.disabled=true;try{
   if(action==='selected-token')return open(selectedTokenActor());if(action==='definitions')return definitionsEditor();
   if(action==='migrate'){if(await Dialog.confirm({title:'Import existing Lycanthropy?',content:confirmText('migrate',a,read(a))})){await request('migrate',a);open(a);pendingPrompts(a);}return;}
   if(!['apply-dm','apply-player'].includes(action))return;
   const type=html.find('[name=newType]').val();if(!definition(catalog,type))throw Error('Choose a transformation first.');
   const existing=read(a).records;if(existing.length){open(a);return;}
   const chooser=action==='apply-player'?'player':'gm',id=await request('add',a,{type,stage:1,chooser});open(a);if(chooser==='gm')promptChoice(a,id,{gm:true});else{pendingPrompts(a);ui.notifications.info('Stage 1 applied. The player can run SBS — Transformations to complete their choices, or you can choose for them here.');}
  }catch(e){error(e);}finally{el.disabled=false;}});
 });return managerWindow;
}
function stageEditor(a,id){
 const {r,t}=recordOf(read(a),id),level=completed(t,r),next=pending(t,r),online=recipient(a),fs=selected(t,r,{includeDisabled:true});
 let body=simpleHeader(a)+`<h3>${esc(t.name)} <span class="sbs-t-badge">Stage ${level||1}${next?(level?' · Stage '+next+' pending':' · choices pending'):''}${r.disabled?' · Suspended':''}</span></h3>`;
 if(next){body+=`<div class="sbs-t-card sbs-t-warning"><b>Finish Stage ${next}</b><p>Choose ${t.stages[next-1].choose} boon${t.stages[next-1].choose===1?'':'s'} and confirm its required flaw. Each option includes its effects below.</p><div class="sbs-t-actions">${button('choose',game.user.isGM?'Choose for player':'Choose boon & stage art')}${game.user.isGM&&online?button('send-player','Leave choices for '+esc(online.name??'player')):''}</div></div>`;}
 else if(game.user.isGM&&level<4&&!r.disabled)body+=`<div class="sbs-t-actions">${button('level-dm','Add Stage '+(level+1)+' — I’ll choose')}${online?button('level-player','Add Stage '+(level+1)+' — player chooses'):''}</div>`;
 if(level){const modes=new Set(fs.flatMap(f=>(f.actions??[]).filter(ac=>ac.kind==='form').map(ac=>ac.mode)));if(imageKeys(t,r).includes('revealed')){modes.add('revealed');modes.add('normal');}body+='<div class="sbs-t-actions">'+[...modes].map(mode=>button('form',mode==='normal'?'Revert':formLabel(mode),`data-mode="${mode}"`)).join('')+button('images','Stage token art')+'</div>';
  for(let stage=1;stage<=level;stage++){const st=t.stages[stage-1],ids=[...st.grants,...r.stages[stage].boons,...st.flaws];body+=`<details class="sbs-t-stage"><summary>Stage ${stage} — boons & flaws</summary>`+ids.map(fid=>{const f=feature(t,fid);return `<div class="sbs-t-card ${f.kind==='flaw'?'sbs-t-warning':''}"><b>${esc(f.name)}</b> <small>${esc(f.kind)}</small><p>${ruleText(f)}</p></div>`;}).join('')+(game.user.isGM?button('edit-stage','Change Stage '+stage+' choices',`data-stage="${stage}"`):'')+button('stage-images','Stage '+stage+' token art',`data-stage="${stage}"`)+'</details>';}}
 body+='<details><summary>More controls</summary>'+button('more','Features, uses & trackers');if(game.user.isGM)body+=`<div class="sbs-t-actions">${button(r.disabled?'resume':'suspend',r.disabled?'Resume':'Suspend')}${button('repair','Restore normal form')}${button('remove','Remove transformation')}${button('advanced','Advanced manager')}</div>`;body+='</details>';
 managerWindow=modal(t.name+' — Stage editor',body,{},html=>html.find('[data-action]').on('click',async event=>{const el=event.currentTarget,action=el.dataset.action;el.disabled=true;try{
  if(action==='selected-token')return open(selectedTokenActor());if(action==='choose')return promptChoice(a,id,{gm:game.user.isGM});if(action==='more')return recordPanel(a,id);if(action==='advanced')return openAdvanced(a);if(action==='images'||action==='stage-images')return imageDialog(a,id,el.dataset.stage);
  if(action==='form'){await request('form',a,{record:id,mode:el.dataset.mode});open(a);return;}
  if(action==='send-player'){const key=a.uuid+id;choiceDialogs.get(key)?.dialog.close();choiceDialogs.delete(key);choiceWindows.delete(key);await request('assign-chooser',a,{record:id,chooser:'player'});pendingPrompts(a);ui.notifications.info('Choices saved for the player. They can run SBS — Transformations to finish setup.');return;}
  if(action==='level-dm'||action==='level-player'){const chooser=action==='level-dm'?'gm':'player';await request('grant',a,{record:id,stage:level+1,chooser});open(a);if(chooser==='gm')promptChoice(a,id,{gm:true});else pendingPrompts(a);return;}
  if(action==='edit-stage'){if(!await Dialog.confirm({title:'Change stage choices?',content:'<p>This reopens the chosen stage and all later stages. Return to normal form first.</p>'}))return;await request('reset',a,{record:id,stage:Number(el.dataset.stage),chooser:'gm'});open(a);promptChoice(a,id,{gm:true});return;}
  if(action==='remove'&&!await Dialog.confirm({title:'Remove transformation?',content:confirmText('remove',a,read(a),id)}))return;
  if(['suspend','resume','repair','remove'].includes(action)){await request(action,a,{record:id});open(a);}
 }catch(e){error(e);}finally{el.disabled=false;}}));return managerWindow;
}
function openAdvanced(a){
 if(!a&&canvas?.tokens?.controlled?.length){try{a=selectedTokenActor();}catch(e){return ui.notifications.warn(e.message);}}
 a=root(a??game.user.character);
 const actors=actorList().filter(a=>owner(a)&&!a.getFlag(ID,'root'));
 if(!a||!owner(a))a=actors[0];if(!a)return ui.notifications.warn('Select a character/NPC you own first.');
 if(!actors.some(other=>other.uuid===a.uuid))actors.unshift(a);
 const d=read(a);if(managerWindow?.rendered)managerWindow.close();
 let body=brand()+`<div class="sbs-t-card"><p>Managing: <b>${esc(a.name)}</b>${a.isToken?' (unlinked token)':''}</p><div class="sbs-t-actions">${button('selected-token','Use selected token')}</div><small>Select one token on the scene, then click the button to manage it.</small><details><summary>Browse all characters / NPCs</summary>`+selectField('actor','Character / NPC',actors.map(a=>[a.uuid,a.name+(a.isToken?' (unlinked token)':'')]),a.uuid)+'</details></div>';
 if(game.user.isGM){body+='<div class="sbs-t-card">'+selectField('newType','Add transformation',catalog.map(t=>[t.id,t.name]),catalog[0]?.id)+selectField('newStage','Granted stage',[1,2,3,4].map(s=>[s,'Stage '+s]),1)+selectField('newChooser','Who sets the choices?',[['player','Prompt player (DM if offline)'],['gm','DM chooses for the player']],'player')+`<div class="sbs-t-actions">${button('add','Add transformation')}${button('definitions','Edit transformation definitions')}</div></div>`;}
 if(a.flags?.[LEGACY]?.data&&game.user.isGM)body+=`<div class="sbs-t-card sbs-t-warning"><b>Existing SBS Lycanthropy found</b><p>Preview and migrate its stage, choices, token images, and saved normal appearance. A rollback backup is kept.</p>${button('migrate','Preview Lycanthropy migration')}</div>`;
 if(!d.records.length)body+='<p>No transformations assigned.</p>';
 for(const r of d.records){const t=definition(catalog,r.type);if(!t)continue;body+=`<div class="sbs-t-card"><h3>${esc(t.name)} <span class="sbs-t-badge">${r.disabled?'Suspended':'Stage '+completed(t,r)+' / '+r.granted}</span></h3><p>${esc(r.state.mode)}${r.state.feral?' · Feral':''}</p><div class="sbs-t-actions">${button('record','Open controls',`data-record="${r.id}"`)}${pending(t,r)?button('choose','Choose Stage '+pending(t,r),`data-record="${r.id}"`):''}</div>`;
  if(game.user.isGM)body+=selectField('stage:'+r.id,'Granted stage',[1,2,3,4].map(n=>[n,'Stage '+n]),r.granted)+`<div class="sbs-t-actions">${button('grant','Set granted stage',`data-record="${r.id}"`)}${button('reset','Redo choices from selected stage',`data-record="${r.id}"`)}${button(r.disabled?'resume':'suspend',r.disabled?'Resume':'Suspend',`data-record="${r.id}"`)}${button('remove','Remove / cure',`data-record="${r.id}"`)}${button('repair','Restore normal / repair',`data-record="${r.id}"`)}</div>`;
  body+=pendingChoicePanel(a,t,r);if(game.user.isGM)body+=`<div class="sbs-t-actions">${button('edit-choices','DM: Set / change boons & flaws',`data-record="${r.id}"`)}${pending(t,r)?button('prompt-player','Leave choices for player',`data-record="${r.id}"`):''}</div>`;body+='</div>';
 }
 if(d.history.length)body+=`<details><summary>Change history (${d.history.length})</summary>${d.history.slice(-20).reverse().map(h=>`<p>${new Date(h.at).toLocaleString()} · ${esc(h.action)} · ${esc(h.type??'')}${h.stage?' · Stage '+h.stage:''}</p>`).join('')}</details>`;
 if(d.migration&&game.user.isGM)body+=button('rollback','Roll back Lycanthropy migration');
 managerWindow=modal('SBS Transformations',body,{},html=>{
  html.find('[name=actor]').on('change',async()=>open(await fromUuid(html.find('[name=actor]').val())));
  html.find('[data-action]').on('click',async event=>{const e=event.currentTarget,action=e.dataset.action,rid=e.dataset.record;e.disabled=true;try{
   if(action==='selected-token')return open(selectedTokenActor());
   if(action==='edit-choices')return editChoices(a,rid);if(action==='prompt-player'){await request('assign-chooser',a,{record:rid,chooser:'player'});pendingPrompts(a);return;}
   if(action==='record')return recordPanel(a,rid);if(action==='choose')return promptChoice(a,rid,{gm:game.user.isGM});if(action==='definitions')return definitionsEditor();
   const args={record:rid};if(action==='add'){args.type=html.find('[name=newType]').val();args.stage=Number(html.find('[name=newStage]').val());args.chooser=html.find('[name=newChooser]').val();}
   if(action==='grant'||action==='reset')args.stage=Number(html.find(`[name="stage:${rid}"]`).val());
   if(['remove','rollback','migrate','reset'].includes(action)&&!await Dialog.confirm({title:'Confirm '+action,content:confirmText(action,a,d,rid)}))return;
   await request(action,a,args);open(a);if(['add','grant','reset','resume'].includes(action))pendingPrompts(a);
  }catch(e){error(e);}finally{e.disabled=false;}});
 });
}
function confirmText(action,a,d,id){if(action==='migrate'){const old=a.flags[LEGACY].data;return`<p>Migrate Lycanthropy for ${esc(a.name)}: granted Stage ${old.config?.granted??1}, choices ${esc(JSON.stringify(old.config?.choices??{}))}, current form ${esc(old.state?.form??'normal')}.</p><p>Preserves saved token images and normal-image backups. Replaces only old-module documents; stores rollback data. Do not run both modules on this actor afterward.</p>`;}if(action==='rollback')return'<p>Restore the legacy Lycanthropy backup, replacing its migrated transformation record. Later changes to that record will be lost. Other records and unrelated features remain.</p>';if(action==='reset')return'<p>Clear the selected stage and all later choices so they can be picked again? Generated benefits will be recalculated.</p>';return'<p>Remove this transformation and its generated features/effects? This is an exceptional cure/GM removal, not an ordinary Remove Curse casting.</p>';}
function recordPanel(a,id){
 a=root(a);const{r,t}=recordOf(read(a),id),fs=selected(t,r,{includeDisabled:true}),names=new Set(fs.map(f=>f.name));
 let body=brand()+`<h3>${esc(t.name)} — ${esc(a.name)}</h3><p>Stage ${completed(t,r)} / ${r.granted} · ${esc(r.state.mode)}${r.state.feral?' · Feral':''}${r.disabled?' · Suspended':''}</p>`;
 body+=pendingChoicePanel(a,t,r);if(game.user.isGM)body+=button('edit-choices','DM: Set / change boons & flaws');
 body+='<div class="sbs-t-actions">'+button('images','Token images');
 const modes=new Set(fs.flatMap(f=>(f.actions??[]).filter(ac=>ac.kind==='form').map(ac=>ac.mode)));if(imageKeys(t,r).includes('revealed')){modes.add('revealed');modes.add('normal');}if(modes.size){for(const mode of modes)body+=button('form',mode==='normal'?'Revert':formLabel(mode),`data-mode="${mode}"`);}body+='</div>';
 for(const f of fs){const item=a.items.find(i=>i.getFlag(ID,'record')===r.id&&i.getFlag(ID,'feature')===f.id);body+=`<div class="sbs-t-card ${f.kind==='flaw'?'sbs-t-warning':''}"><b>${esc(f.name)}</b> <span class="sbs-t-badge">${esc(f.kind)}</span><p>${ruleText(f)}</p><small>Coverage: ${esc(f.coverage)}${f.effects.length?' · configured passive effects':''}${f.actions.length?' · sheet activities':''}</small>`;
  if(item?.system.uses?.max)body+=`<p>Uses remaining: ${Math.max(0,Number(item.system.uses.max)-Number(item.system.uses.spent||0))}/${item.system.uses.max}</p>`;
  body+='<div class="sbs-t-actions">';for(const ac of f.actions??[]){if(['form'].includes(ac.kind))continue;body+=button('ability',ac.name,`data-feature="${f.id}" data-ability="${ac.id}"`);}if(f.choices?.some(c=>c.rest))body+=button('rest-choice','Choose after rest',`data-feature="${f.id}"`);body+='</div></div>';
 }
 body+='<h3>Trackers</h3>';
 if((t.baseType??r.type)==='lycanthrope'){body+=checkbox('fullMoon','In full-moon light',r.state.fullMoon)+checkbox('senseBloodied','Can sense a Bloodied creature (GM context)',r.state.senses.bloodied)+checkbox('senseUnconscious','Can sense an Unconscious creature (GM context)',r.state.senses.unconscious)+'<div class="sbs-t-actions">'+button('hunt','Resolve Hunt')+button('recover','Full-HP turn-start recovery')+button('remove-spell','Remove Curse was cast')+button('kill','Record a hybrid kill')+'</div>';if(names.has("Hunter's Focus"))body+=button('focus','Mark targeted creature as prey');}
 if((t.baseType??r.type)==='vampire')body+=checkbox('sunlight','In sunlight',r.state.sunlight)+checkbox('uninvited','Inside a private residence uninvited',r.state.uninvited)+button('feed','Record feeding');
 if((t.baseType??r.type)==='hag')body+=checkbox('purity','Can see a pure source causing Purity’s Pain',r.state.purity)+button('feed','Record vile nourishment');
 if((t.baseType??r.type)==='fey')body+=checkbox('tributeUnpaid','Tribute rejected / atonement outstanding',r.state.tributeUnpaid);
 if((t.baseType??r.type)==='seraph')body+=checkbox('corrupted','Corrupted (GM-determined)',r.state.corrupted);
 if((t.baseType??r.type)==='lich')body+=`<div class="sbs-t-card"><p>Soul vessel: ${r.state.soul.charged?'Charged · CR '+r.state.soul.cr:'Uncharged'}</p>${input('soulCR','Eligible soul CR',r.state.soul.cr,'number')}<div class="sbs-t-actions">${button('charge-soul','Capture eligible soul')}${button('spend-soul','Spend vessel charge')}</div></div>`;
 if((t.baseType??r.type)==='aberrant-horror')body+=button('unstable','Roll Unstable Form');
 if((t.baseType??r.type)==='fiend'&&names.has('Devilish Contractor')){body+='<h3>Contracts & gifts</h3>'+selectField('gift','New signed-contract gift',t.features.filter(f=>f.kind==='gift'&&f.stage<=completed(t,r)).map(f=>[f.id,f.name]),'')+checkbox('activateNewGift','Activate new contract gift immediately',true)+selectField('replaceGift','Replace active gift (if at capacity)',[['','Keep current gifts'],...(r.state.activeGifts??[]).map(id=>[id,feature(t,id)?.name??id])],'')+t.features.filter(f=>f.kind==='gift'&&f.choices?.length).map(f=>`<div data-contract-options="${esc(f.id)}" hidden>${choiceFields(f,r)}</div>`).join('')+button('contract','Record signed contract');for(const fid of r.state.contracts??[]){const f=feature(t,fid);if(f)body+=checkbox('gift:'+fid,f.name,(r.state.activeGifts??[]).includes(fid));}body+=button('gifts','Apply contracted gift selection after rest');}
 if((t.baseType??r.type)==='vampire')body+=checkbox('receivedRadiant','Received Radiant damage since last turn',r.state.receivedRadiant);
 body+=checkbox('nextSpellSave','Next saving throw is against a spell',r.state.nextSpellSave)+input('notes','Character-specific transformation notes',r.state.notes)+button('save-trackers','Save trackers');
 modal(t.name+' controls',body,{},html=>{
  const updateContractOptions=()=>html.find('[data-contract-options]').each((i,el)=>el.hidden=el.dataset.contractOptions!==html.find('[name=gift]').val());html.find('[name=gift]').on('change',updateContractOptions);updateContractOptions();
  html.find('[data-action]').on('click',async event=>{const el=event.currentTarget,ac=el.dataset.action;el.disabled=true;try{
   if(ac==='edit-choices')return editChoices(a,id);
   if(ac==='choose')return promptChoice(a,id,{gm:game.user.isGM});if(ac==='images')return imageDialog(a,id);if(ac==='rest-choice')return restChoiceDialog(a,id,el.dataset.feature);
   if(ac==='ability')return runActivity(a,id,el.dataset.feature,el.dataset.ability);
   if(ac==='save-trackers'){
    const bool=name=>!!html.find(`[name="${name}"]`)[0]?.checked;
    const keys=['fullMoon','sunlight','uninvited','purity','tributeUnpaid','corrupted','nextSpellSave','receivedRadiant'];for(const k of keys)if(html.find(`[name="${k}"]`).length)await request('state',a,{record:id,key:k,value:bool(k)});
    if(html.find('[name=senseBloodied]').length)await request('state',a,{record:id,key:'senses',value:{bloodied:bool('senseBloodied'),unconscious:bool('senseUnconscious')}});
    await request('state',a,{record:id,key:'notes',value:html.find('[name=notes]').val()});ui.notifications.info('Transformation trackers saved.');return;
   }
   const args={record:id};let action=ac;
   if(ac==='form')args.mode=el.dataset.mode;
   if(ac==='focus'){if(game.user.targets.size!==1)throw Error('Target exactly one creature first.');args.target=[...game.user.targets][0].actor.uuid;}
   if(ac==='charge-soul'||ac==='spend-soul'){action='soul';args.charged=ac==='charge-soul';args.cr=Number(html.find('[name=soulCR]').val());}
   if(ac==='contract'){args.gift=html.find('[name=gift]').val();args.activate=!!html.find('[name=activateNewGift]')[0]?.checked;args.replace=html.find('[name=replaceGift]').val();const gift=feature(t,args.gift);args.answers=gift?answerValues(html,[gift])[gift.id]:{};}if(ac==='gifts')args.gifts=html.find('input[name^="gift:"]:checked').toArray().map(el=>el.name.slice(5));
   if(ac==='remove-spell'&&!await Dialog.confirm({title:'Remove Curse cast?',content:'<p>This records an actual casting and ends the current form; it does not cure Stage 1 Lycanthropy or spend a spell slot.</p>'}))return;
   await request(action,a,args);ui.notifications.info('Transformation updated.');
  }catch(e){error(e);}finally{el.disabled=false;}});
 });
}
async function runActivity(a,rid,fid,aid){const{r,t}=recordOf(read(a),rid),f=selected(t,r).find(f=>f.id===fid),action=f?.actions.find(ac=>ac.id===aid);if(!action)throw Error('Ability is not selected.');if(['form','toggle','spell','reference'].includes(action.kind))return request('use',a,{record:rid,feature:fid,action:aid});const actual=live(a,r),item=actual.items.find(i=>i.getFlag(ID,'record')===rid&&i.getFlag(ID,'feature')===fid),activity=item?.system.activities.get(stableID(fid+':'+aid));if(activity)return activity.use();throw Error('Generated activity is missing. Ask the GM to refresh this transformation.');}
function cloneDefinition(t,newId,name){const next=copy(t),prefix=t.id+':';next.baseType=t.baseType??t.id;next.id=newId;next.name=name;const rewrite=id=>id.startsWith(prefix)?newId+':'+id.slice(prefix.length):id;for(const f of next.features){f.id=rewrite(f.id);f.type=newId;f.requires=f.requires.map(rewrite);f.replaces=(f.replaces??[]).map(rewrite);}for(const s of next.stages)for(const key of ['grants','boons','flaws'])s[key]=s[key].map(rewrite);return next;}
async function saveDefinition(next){
 if(!game.user.isGM)throw Error('GM permission required.');const all=catalog.filter(t=>t.id!==next.id).concat([next]);validateCatalog(all);
 for(const a of actorList())for(const r of read(a).records.filter(r=>r.type===next.id)){
  let probe=fresh(r.id,next.id);probe.granted=r.granted;for(const [stageNo,choice]of Object.entries(r.stages).sort((a,b)=>Number(a[0])-Number(b[0]))){try{probe=acceptStage(next,probe,{stage:Number(stageNo),boons:choice.boons,answers:Object.fromEntries([...next.stages[Number(stageNo)-1].grants,...choice.boons,...next.stages[Number(stageNo)-1].flaws].map(id=>[id,r.answers[id]??{}]))},actorContext(a));}catch(e){throw Error(`${a.name}: reset choices from Stage ${stageNo} before this edit (${e.message}).`);}const s=next.stages[Number(stageNo)-1];if(choice.boons.length!==s.choose||choice.boons.some(id=>!s.boons.includes(id)))throw Error(`${a.name} has choices invalidated by this edit. Reset that actor from Stage ${stageNo} first.`);}
 }
 const overrides=copy(game.settings.get(ID,'definitions')??{});overrides[next.id]=next;await game.settings.set(ID,'definitions',overrides);loadCatalog();if(primary())for(const a of actorList())if(read(a).records.some(r=>r.type===next.id))await serial(a,()=>sync(a));
}
function definitionsEditor(){
 if(!game.user.isGM)return;const body=brand()+selectField('type','Transformation',catalog.map(t=>[t.id,t.name]),catalog[0]?.id)+'<p>Edits are stored as world overrides. Built-in reference definitions remain available to reset. Exported files contain the definition, not character records.</p><div class="sbs-t-actions">'+button('edit','Edit features and rules')+button('duplicate','Duplicate as custom transformation')+button('export','Export JSON')+button('import','Import JSON')+button('reset-def','Reset built-in definition')+'</div><input type="file" name="definitionFile" accept=".json" hidden>';
 modal('Transformation definitions',body,{},html=>{
  html.find('[data-action]').on('click',async event=>{const action=event.currentTarget.dataset.action,t=definition(catalog,html.find('[name=type]').val());try{
   if(action==='edit')return definitionEditor(t);
   if(action==='duplicate'){const newId='custom-'+t.id;return definitionEditor(cloneDefinition(t,newId,t.name+' (custom)'));}
   if(action==='export')return foundry.utils.saveDataToFile(JSON.stringify(t,null,2),'application/json',t.id+'.json');
   if(action==='import')return html.find('[name=definitionFile]')[0].click();
   if(action==='reset-def'&&await Dialog.confirm({title:'Reset world definition?',content:'<p>Reset the world override? Existing actor choices must remain valid. Export your customization first if you want to keep it.</p>'})){
    const original=stock.find(x=>x.id===t.id);if(!original)throw Error('This is a custom definition. Remove its actor records before deleting it in the advanced editor.');await saveDefinition(copy(original));
   }
  }catch(e){error(e);}});
  html.find('[name=definitionFile]').on('change',async event=>{try{const text=await event.currentTarget.files[0].text();const obj=JSON.parse(text);validateCatalog([obj]);definitionEditor(obj);}catch(e){error(e);}});
 });
}
function definitionEditor(t){
 const copyDef=copy(t);modal('Edit '+t.name,brand()+input('name','Display name',t.name)+selectField('feature','Feature',t.features.map(f=>[f.id,`Stage ${f.stage} · ${f.kind} · ${f.name}`]),t.features[0]?.id)+'<div class="sbs-t-actions">'+button('feature','Edit selected feature')+button('save-name','Save name')+'</div><details><summary>Advanced: stages, pools, prerequisites, and effect/action definitions</summary><p>Feature IDs must remain in this transformation’s namespace. Invalid references, duplicate pools, and foreign-transformation choices are rejected.</p><textarea name="json" class="sbs-t-json">'+esc(JSON.stringify(t,null,2))+'</textarea>'+button('advanced','Validate & save definition')+'</details>',{},html=>{
  html.find('[data-action]').on('click',async event=>{try{const ac=event.currentTarget.dataset.action;if(ac==='feature')return featureEditor(copyDef,feature(copyDef,html.find('[name=feature]').val()));if(ac==='save-name'){copyDef.name=String(html.find('[name=name]').val()).trim();await saveDefinition(copyDef);}else if(ac==='advanced'){const next=JSON.parse(html.find('[name=json]').val());await saveDefinition(next);}ui.notifications.info('Transformation definition saved.');}catch(e){error(e);}});
 });
}
function featureEditor(t,f){modal('Edit '+f.name,input('name','Feature name',f.name)+'<label>Mechanical summary<textarea name="summary">'+ruleText(f)+'</textarea></label><label>Manual/contextual steps<textarea name="manual">'+esc(f.manual)+'</textarea></label><details><summary>Effects and activities</summary><p>Effects use native system paths and numeric arithmetic. Actions use the supported attack, save, damage, heal, form, toggle, spell, and reference descriptors; arbitrary JavaScript is not supported.</p><label>Effects JSON<textarea name="effects" class="sbs-t-json">'+esc(JSON.stringify(f.effects,null,2))+'</textarea></label><label>Actions JSON<textarea name="actions" class="sbs-t-json">'+esc(JSON.stringify(f.actions,null,2))+'</textarea></label></details>',{save:{label:'Save feature',callback:async html=>{try{const next=copy(t),nf=feature(next,f.id);nf.name=String(html.find('[name=name]').val()).trim();nf.summary=String(html.find('[name=summary]').val());nf.manual=String(html.find('[name=manual]').val());nf.effects=JSON.parse(html.find('[name=effects]').val());nf.actions=JSON.parse(html.find('[name=actions]').val());await saveDefinition(next);ui.notifications.info('Feature saved.');}catch(e){error(e);}}}});}
function beforeD20(config){
 const a=config.subject?.actor??config.subject;if(!supported(a))return;const d=read(root(a)),ability=config.ability??a.system.skills?.[config.skill]?.ability;
 const hookNames=(config.hookNames??[]).map(x=>String(x).toLowerCase()),isSave=hookNames.some(n=>n.includes('savingthrow')),isDeath=hookNames.some(n=>n.includes('deathsave')),isAttack=hookNames.some(n=>n==='attack');
 let advantage=false,disadvantage=false;
 for(const r of d.records){const t=definition(catalog,r.type);if(!t||r.disabled)continue;const names=feats(t,r),has=n=>names.has(n);
  if((r.state.sunlight&&has('Greater Sanguine Curse'))||(r.state.uninvited&&has('The Sanguine Curse'))||r.state.tributeUnpaid||r.state.roilingUntil>game.time.worldTime||r.state.unstable?.id==='all-disadvantage')disadvantage=true;
  if(ability==='int'&&has('Frayed Thoughts'))disadvantage=true;
  if(ability==='dex'&&(has('Physical Deterioration')||r.state.unstable?.id==='dexterity'))disadvantage=true;
  if(ability==='cha'&&has('Friendless'))disadvantage=true;
  if(config.skill==='per'&&has('Hideous Appearance (Hag)'))disadvantage=true;
  if(config.skill==='dec'&&has('Fiendish Soul'))advantage=true;
  if(config.skill==='ste'&&active(r,'slime'))advantage=false;
  if(config.skill==='ste'&&r.state.mode==='ooze'&&r.state.augmentation==='transparent')advantage=true;
  if(config.skill==='prc'&&r.state.unstable?.id==='perception')disadvantage=true;
  if(isSave&&ability==='con'&&(r.state.unstable?.id==='con-save'||has('Necromantic Dystrophia')&&!r.state.soul.charged))disadvantage=true;
  if(isSave&&ability==='dex'&&has('Inhuman Reflexes'))advantage=true;
  if(isSave&&r.state.nextSpellSave){if(has('Magic Resistance'))advantage=true;if(has('Planar Binding (Fey)')&&!r.state.planarSaveUsed)disadvantage=true;}
  if(isSave&&ability==='wis'&&has('Ultimate Predator')&&r.state.senses.bloodied)disadvantage=true;
  if(isDeath&&['Fiend Bound','Planar Binding (Primordial)','Planar Binding (Seraph)','Drawn to Darkness','Seasonally Affected'].some(has))disadvantage=true;
  if(isDeath&&r.state.unstable?.id==='death-advantage')advantage=true;
  const fid=config.subject?.item?.getFlag(ID,'feature');
  if(isAttack&&fid==='vampire:fanged-bite'&&has('Soman Bloodline'))advantage=true;
 }
 if(ability==='wis'&&hasNearbyAffinity(a))advantage=true;
 for(const roll of config.rolls??[]){roll.options??={};if(advantage)roll.options.advantage=true;if(disadvantage)roll.options.disadvantage=true;}
 if(advantage)config.advantage=true;if(disadvantage)config.disadvantage=true;
}
function hasNearbyAffinity(a){for(const source of actorList()){if(source.uuid===a.uuid)continue;for(const r of read(root(source)).records){const t=definition(catalog,r.type);if(!t||r.disabled||r.state.mode!=='hybrid'||r.state.feral||!feats(t,r).has('Hybrid Form Affinity'))continue;for(const t1 of placedTokens(source))for(const t2 of placedTokens(a))if(t1.disposition!==0&&t1.disposition===t2.disposition&&rangeBetween(source,a)<=20)return true;}}return false;}
function beforeActivity(activity){
 const item=activity?.item,a=activity?.actor;if(!supported(a))return;const origin=root(a),d=read(origin),rid=item.getFlag(ID,'record');
 if(item.getFlag(ID,'role')==='controller'){stageEditor(origin,rid);return false;}
 for(const r of d.records){if(r.disabled)continue;const t=definition(catalog,r.type),names=t?feats(t,r):new Set();
  if(activity.activation?.type==='reaction'&&r.state.unstable?.id==='no-reactions'){ui.notifications.warn('Unstable Form prevents reactions.');return false;}
  if(r.state.feral&&!(rid===r.id&&/natural-/.test(item.getFlag(ID,'feature')??''))){ui.notifications.warn('Feral: only the transformation’s natural attacks and allowed form actions can be used.');return false;}
  if(item.type==='spell'&&((r.state.mode==='hybrid'&&!(names.has('Hybrid Form Affinity')&&!r.state.feral))||r.state.mode==='animal'||r.state.lostSelf)){ui.notifications.warn('This form cannot cast spells.');return false;}
  if(r.state.purity&&(t.baseType??r.type)==='hag'&&rid===r.id&&item.getFlag(ID,'feature')){ui.notifications.warn('Purity’s Pain suppresses Hag boons while the source remains visible.');return false;}
 }
 if(rid){const{r,t}=recordOf(d,rid),fid=item.getFlag(ID,'feature'),f=selected(t,r).find(f=>f.id===fid),action=f?.actions.find(ac=>stableID(fid+':'+ac.id)===activity.id);if(f&&!f.actions.length){chat(origin,`<p><b>${cleanText(f.name)}</b></p><p>${cleanText(f.summary)}</p>`).catch(error);return false;}
  if(action&&['form','toggle','spell','reference'].includes(action.kind)){request('use',origin,{record:rid,feature:fid,action:action.id}).catch(error);return false;}
 }
}
function damageAdjustments(a,damages,options){
 if(!supported(a)||options.ignore===true)return;const d=read(root(a));let physicalResist=false,silverVulnerable=false,halfHealing=false,seasonVulnerability;
 for(const r of d.records){const t=definition(catalog,r.type);if(!t||r.disabled)continue;const names=feats(t,r);
  if(names.has('Healing Resistance')||names.has('Untethered from Life'))halfHealing=true;
  if(r.state.mode==='hybrid'&&names.has('Iron Pelt')||names.has('Final Fzeg Bloodline')||names.has('Abyssal Resistance'))physicalResist=true;
  if(names.has('Silver Sensitivity'))silverVulnerable=true;
  if(names.has('Seasonally Affected')){const court=selected(t,r).find(f=>f.name.startsWith('Servant of the'))?.name??'';seasonVulnerability=court.includes('Spring')?'necrotic':court.includes('Summer')?'cold':court.includes('Autumn')?'radiant':'fire';}
 }
 for(const hit of damages){hit.active??={};const properties=new Set(hit.properties??[]);let factor=1;
  if(hit.type==='healing'&&halfHealing)factor/=2;
  if(['bludgeoning','piercing','slashing'].includes(hit.type)){
   if(silverVulnerable&&properties.has('sil')){if(hit.active.resistance){factor*=2;hit.active.resistance=false;}if(!hit.active.vulnerability){factor*=2;hit.active.vulnerability=true;}}
   else if(physicalResist&&!properties.has('sil')&&!properties.has('mgc')&&!hit.active.resistance&&!hit.active.immunity){factor/=2;hit.active.resistance=true;}
  }
  if(hit.type===seasonVulnerability&&!hit.active.vulnerability){factor*=2;hit.active.vulnerability=true;}
  hit.value*=factor;
 }
 const total=damages.reduce((sum,h)=>sum+(h.type==='temphp'?0:Number(h.value)||0),0);damages.amount=total>0?Math.floor(total):Math.ceil(total);
}
function beforeCalculateDamage(a,damages,options){
 if(!supported(a)||options.ignore===true)return;options._sbsRadiant=damages.some(h=>h.type==='radiant'&&h.value>0);const d=read(root(a));const force=new Set();
 for(const r of d.records){const t=definition(catalog,r.type);if(!t||r.disabled)continue;const names=feats(t,r);
  if(names.has('Seasonally Affected')){const court=selected(t,r).find(f=>f.name.startsWith('Servant of the'))?.name??'';force.add(court.includes('Spring')?'necrotic':court.includes('Summer')?'cold':court.includes('Autumn')?'radiant':'fire');}
  if(names.has('Silver Sensitivity'))for(const hit of damages)if(new Set(hit.properties??[]).has('sil')&&['bludgeoning','piercing','slashing'].includes(hit.type))force.add(hit.type);
 }
 if(force.size){options.ignore??={};for(const cat of ['resistance']){if(options.ignore[cat]===true)continue;options.ignore[cat]=new Set([...(options.ignore[cat]??[]),...force]);}}
}
function conditionalDamage(config){
 const activity=config.subject,a=activity?.actor;if(!supported(a)||game.user.targets.size!==1)return;
 const target=[...game.user.targets][0].actor,d=read(root(a)),base=config.rolls?.[0];if(!base)return;
 for(const r of d.records){const t=definition(catalog,r.type);if(!t||r.disabled)continue;const names=feats(t,r),fid=activity.item?.getFlag(ID,'feature');
  if(r.state.mode==='hybrid'&&names.has("Hunter's Focus")&&r.state.prey?.uuid===target.uuid&&r.state.prey.until>game.time.worldTime&&activity.attack?.type.value==='melee')base.parts.push('1d6');
  if(r.state.mode==='hybrid'&&names.has('Savage Instincts')&&fid?.startsWith('lycanthrope:natural-')&&isBloodied(HP(target)))config.rolls.push({parts:['1d8'],data:base.data,options:{...base.options,type:'slashing'}});
 }
}
async function afterRoll(a,event){
 const d=read(a);for(const r of d.records){const t=definition(catalog,r.type);if(!t||r.disabled)continue;const names=feats(t,r);const spell=r.state.nextSpellSave;
  if(event.save&&spell){r.state.nextSpellSave=false;r.state.planarSaveUsed=true;}
  if(event.natural===1){
   if(names.has('Pull of the Netherworld')&&!r.state.netherUsed){r.state.netherUsed=true;const amount=await rollAmount(a,'6d6','Pull of the Netherworld — unavoidable Psychic');await selfDamage(a,amount,{rawDamage:true});}
   if(names.has('Pull of Oblivion'))await selfDamage(a,await rollAmount(a,'4d6','Pull of Oblivion — unavoidable Force'),{rawDamage:true});
   if(event.save&&spell&&names.has('Primordial Chaos'))await selfDamage(a,await rollAmount(a,'8d6','Primordial Chaos — unavoidable Force'),{rawDamage:true});
   if(event.save&&names.has('Seraph Corruption'))r.state.seraphEpisode=game.time.worldTime+60;
   if(event.save&&names.has('Slippery Ego'))r.state.lostSelf=true;
  }
  if(event.save&&names.has('Entropic Abomination')&&event.failed)await unstable(a,r.id,{worsen:true});
  else if(event.save&&spell&&event.natural<=2&&names.has('Unstable Existence'))await unstable(a,r.id,{worsen:true});
 }
 // Preserve changes made by an Unstable Form resolution while committing trigger flags.
 const current=read(a);for(const rec of d.records){const freshRec=current.records.find(r=>r.id===rec.id);if(freshRec){const unstableState=freshRec.state.unstable;freshRec.state={...freshRec.state,...rec.state};if(unstableState)freshRec.state.unstable=unstableState;}}
 await write(a,current);await sync(a);
}
async function bloodiedTriggers(a,old,h){
 let d=read(a);const jobs=[];for(const r of d.records){const t=definition(catalog,r.type);if(!t||r.disabled||!completed(t,r))continue;const names=feats(t,r),v=variables(a,t,r),crossed=crossedBloodied(old,h);
  if(h.value<old.value)r.state.tookDamage=true;
  if(crossed){
   if(names.has('Aberrant Form')&&!r.state.aberrantBloodied){r.state.aberrantBloodied=true;await tempHP(a,v.prof+v.stage);}
   if(names.has('Lust for the Hunt')&&!r.state.huntUsed){jobs.push(()=>hunt(a,r.id));}
   if(names.has('Weakened Constitution')&&game.combat?.started&&r.state.feyCombat!==game.combat.id){r.state.feyCombat=game.combat.id;if(await save(a,'con',20,'Weakened Constitution')===false)await a.update({'system.attributes.exhaustion':Number(a.system.attributes.exhaustion||0)+1},{sbsTransformations:true});}
   if(names.has('Fraying Reality')&&!r.state.frayUsed){r.state.frayUsed=true;if(await save(a,'cha',15,'Fraying Reality')===false)r.state.active.confusion={until:game.time.worldTime+60};}
   if(names.has('Slippery Ego')&&!r.state.egoBloodied){r.state.egoBloodied=true;r.state.lostSelf=true;}
   if(names.has('Entropic Abomination')&&!r.state.entropicBloodied){r.state.entropicBloodied=true;jobs.push(()=>unstable(a,r.id,{worsen:true}));}
  }
  if((crossed||h.value===0&&old.value>0)&&names.has('Shadowsteel Explosion')&&!r.state.explosionUsed){r.state.explosionUsed=true;await chat(a,'<p><b>Shadowsteel Explosion triggered.</b> Use its save activity for living creatures within 60 feet: DC 20 CON, 4d10 Force and Stunned on failure; half damage on success.</p>');}
  if(r.state.mode==='animal'&&Number(old.temp)>0&&Number(h.temp)<=0){jobs.push(()=>changeForm(a,r.id,'normal',{forced:true}));}
 }
 await write(a,d);for(const job of jobs)await job();
}
async function onRest(a,isLong){
 let d=read(a);const jobs=[];for(const r of d.records){r.state.restSerial++;if(isLong)r.state.longRestSerial++;r.state.lastRest=isLong?'long':'short';r.state.giftSwitchReady=true;
  for(const key of ['huntUsed','aberrantBloodied','frayUsed','explosionUsed','planarSaveUsed','netherUsed'])r.state[key]=false;
  r.state.lostSelf=false;if(r.state.mode==='ooze'){await clearVisual(a,d,r);r.state.mode='normal';}
  if(isLong){r.state.unstable=null;r.state.predatorImmune=false;r.state.egoBloodied=false;r.state.entropicBloodied=false;r.state.soulCaptures=0;const t=definition(catalog,r.type);if(t&&feats(t,r).has('Unstable Form')&&r.state.tookDamage){jobs.push(()=>unstable(a,r.id));}r.state.tookDamage=false;}
 }
 await write(a,d);for(const job of jobs)await job();await sync(a);
}
async function turnStart(a){
 let d=read(a);const jobs=[];for(const r of d.records){const t=definition(catalog,r.type);if(!t||r.disabled)continue;const names=feats(t,r);
  if(names.has('Ultimate Predator')&&r.state.senses.unconscious&&!r.state.predatorImmune){const ok=await save(a,'wis',15,'Ultimate Predator');if(ok===true)r.state.predatorImmune=true;if(ok===false){jobs.push(()=>changeForm(a,r.id,'hybrid',{forced:true}));}}
  if(r.state.feral){await chat(a,'<p>Feral: move toward the closest sensed creature, prioritizing Bloodied creatures; Dash if needed and use Claw for the required Attack action. No equipment/class features.</p>');if(HP(a).value>=HP(a).max){if(await save(a,'wis',10,'Full-HP feral recovery')===true&&r.state.lockUntil<=game.time.worldTime){jobs.push(()=>changeForm(a,r.id,'normal',{forced:true}));}}}
  if(names.has('Bestial Vigor')&&r.state.mode==='hybrid')await tempHP(a,5);
  if(active(r,'celestial-bow'))await tempHP(a,names.has('Bow of Celestial Domination')?15:5);
  if(active(r,'blink'))await tempHP(a,variables(a,t,r).prof+completed(t,r));
  if(active(r,'unholy-healing')&&r.state.soul.charged)await heal(a,10);
  if(names.has('Regeneration')&&!r.state.sunlight&&!r.state.receivedRadiant&&HP(a).value>0&&HP(a).value<60)await heal(a,15);
  if(r.state.sunlight&&names.has('Supreme Sanguine Curse'))await selfDamage(a,await rollAmount(a,'1d10','Vampire sunlight — unavoidable Radiant'),{rawDamage:true});
  if(r.state.uninvited&&names.has('The Sanguine Curse'))await selfDamage(a,await rollAmount(a,'1d4','Uninvited residence — unavoidable Psychic'),{rawDamage:true});
  if(r.state.purity&&names.has("Purity's Pain"))await selfDamage(a,await rollAmount(a,'3d6 + '+getMod(a,'cha'),'Purity’s Pain'),{rawDamage:true});
  if(r.state.seraphEpisode>game.time.worldTime){await selfDamage(a,await rollAmount(a,'1d10','Seraph Corruption — unavoidable Psychic'),{rawDamage:true});if(HP(a).temp)await a.update({'system.attributes.hp.temp':0},{sbsTransformations:true});}
  if(r.state.lostSelf){await chat(a,'<p>Slippery Ego: no spells, magic items, or intelligible communication. Follow the compelled movement/attacks; attempt DC 18 WIS at turn end to regain control.</p>');}
 }
 await write(a,d);for(const job of jobs)await job();await sync(a);
}
async function timeTick(a){
 const d=read(a);let changed=false;for(const r of d.records){if(r.disabled)continue;const t=definition(catalog,r.type);if(!t)continue;
  for(const [key,value]of Object.entries(r.state.active))if(value.until&&value.until<=game.time.worldTime){delete r.state.active[key];changed=true;if(d.appearance?.record===r.id&&d.appearance.key===key)await clearVisual(a,d,r);}
  if(r.state.lockUntil&&r.state.lockUntil<=game.time.worldTime){r.state.lockUntil=0;changed=true;}
  if(r.state.expires&&r.state.expires<=game.time.worldTime&&!r.state.lockUntil){await write(a,d);await changeForm(a,r.id,'normal',{forced:true});return;}
  if((t.baseType??r.type)==='vampire'||(t.baseType??r.type)==='hag'&&completed(t,r)===4){const days=(t.baseType??r.type)==='hag'?1:[7,4,2,1][completed(t,r)-1]??7;if(game.time.worldTime-r.state.lastFed>days*86400&&!r.state.feedingOverdue){r.state.feedingOverdue=true;changed=true;await chat(a,`<p>${t.name} nourishment is overdue. Resolve the feeding/Exhaustion consequences with the GM.</p>`);}}
 }
 if(changed){await write(a,d);await sync(a);}
}

function reconcileChoiceWindows(a){
 if(!supported(a)||!owner(a))return;const d=read(a);
 for(const [key,entry]of choiceDialogs){if(entry.actor!==a.uuid)continue;const r=d.records.find(r=>key===a.uuid+r.id),t=r&&definition(catalog,r.type),stage=t?pending(t,r):null;
  if(!r||r.disabled||stage!==entry.stage||entry.chooser!==r.chooser||!entry.manual&&choiceRecipient(a,r)?.id!==game.user.id){entry.dialog.close();choiceDialogs.delete(key);choiceWindows.delete(key);}}
}
// Called only by explicit actions within an already launched workflow.
function pendingPrompts(a){
 if(!supported(a)||!owner(a))return;reconcileChoiceWindows(a);
 for(const r of read(a).records){const t=definition(catalog,r.type);if(t&&!r.disabled&&pending(t,r)){try{promptChoice(a,r.id);}catch(e){error(e);}}}
}
async function turnEnd(a){const d=read(a);for(const r of d.records){r.state.receivedRadiant=false;if(r.state.lostSelf&&await save(a,'wis',18,'Slippery Ego — end of turn')===true)r.state.lostSelf=false;if(r.state.initiativeStun){r.state.initiativeStun=false;const ids=a.effects.filter(e=>e.getFlag(ID,'role')==='initiative-stun'&&e.getFlag(ID,'record')===r.id).map(e=>e.id);if(ids.length)await a.deleteEmbeddedDocuments('ActiveEffect',ids);}}await write(a,d);await sync(a);}
async function ready(){
 await loading;if(game.system.id!=='dnd5e')return;
 const api={open,definitions:()=>copy(catalog),editDefinitions:definitionsEditor,types:typesFor,request:(action,actor,args)=>request(action,actor,args),version:VERSION};
 game.modules.get(ID).api=api;globalThis.SBS_TRANSFORMATIONS=api;
 if(primary()){
  const command=`game.modules.get('${ID}').api.open();`;let macro=game.macros.find(m=>m.getFlag(ID,'launcher'));
  if(!macro)macro=await Macro.create({name:'SBS — Transformations',type:'script',img:ICON,command,flags:{[ID]:{launcher:true}},ownership:{default:CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER}});
  else if(macro.command!==command||macro.img!==ICON)await macro.update({command,img:ICON});
 }
 for(const combat of game.combats??[])combatActors.set(combat.id,combat.combatant?.actor);
 for(const a of actorList()){const h=HP(a);hpCache.set(a.uuid,{value:h.value,max:h.max,temp:h.temp});if(raw(a)&&!a.getFlag(ID,'root')){if(primary())await serial(a,async()=>{await timeTick(a);await sync(a);});}}
 if(game.modules.get(LEGACY)?.active&&primary())ui.notifications.info('SBS Transformations: migrate existing Lycanthropy records before disabling the old module. Use one module per actor.');
}
Hooks.once('init',()=>{
 game.settings.register(ID,'definitions',{scope:'world',config:false,type:Object,default:{},onChange:()=>{if(stock.length)loadCatalog();}});
 game.settings.register(ID,'multiple',{name:'Allow multiple active transformations',hint:'GM exception: combinations are not balanced by the source rules. Forms remain mutually exclusive.',scope:'world',config:true,type:Boolean,default:false});
 game.settings.register(ID,'dawnHour',{name:'Dawn hour (world time)',scope:'world',config:true,type:Number,range:{min:0,max:23,step:1},default:6});
 class ManagerMenu extends FormApplication{render(){open();return this;}}
 game.settings.registerMenu(ID,'manager',{name:'SBS Transformations',label:'Manage transformations',hint:'Grant stages, edit definitions, and manage choices.',icon:'fas fa-dragon',type:ManagerMenu,restricted:true});
 loading=(async()=>{if(game.system.id!=='dnd5e')return;const responses=await Promise.all(['catalog','unstable'].map(name=>fetch(`modules/${ID}/data/${name}.json`)));for(const res of responses)if(!res.ok)throw Error('Unable to load transformation data.');[stock,unstableTable]=await Promise.all(responses.map(res=>res.json()));loadCatalog();})();
});
Hooks.once('ready',()=>ready().catch(error));
Hooks.on('dnd5e.preUseActivity',beforeActivity);
for(const hook of ['AbilityCheck','SavingThrow','Skill','ToolCheck','Attack','DeathSave','Initiative'])Hooks.on('dnd5e.preRoll'+hook,beforeD20);
Hooks.on('dnd5e.preRollDamage',conditionalDamage);
Hooks.on('dnd5e.preCalculateDamage',beforeCalculateDamage);
Hooks.on('dnd5e.calculateDamage',damageAdjustments);
Hooks.on('dnd5e.applyDamage',(a,amount,options)=>{if(amount>0&&options?._sbsRadiant&&supported(a)&&raw(root(a))&&owner(root(a)))request('trigger-damage',root(a)).catch(error);});
Hooks.on('dnd5e.preBeginConcentrating',a=>{if(!supported(a))return;for(const r of read(root(a)).records){const t=definition(catalog,r.type);if(!t||r.disabled)continue;if(r.state.mode==='animal'||r.state.mode==='hybrid'&&!(feats(t,r).has('Hybrid Form Affinity')&&!r.state.feral)){ui.notifications.warn('This form cannot concentrate on spells.');return false;}}});
Hooks.on('dnd5e.transformActorV2',(host,source,target)=>{
 if(!supported(host)||!raw(host))return;const d=read(host),r=d.records.find(r=>r.state.mode==='animal');if(!r)return;
 target.img=host.img;target.flags??={};target.flags[ID]??={};target.flags[ID].root=host.uuid;target.flags[ID].data=d;
 if(formImage(r,'animal')){target.prototypeToken.texture.src=formImage(r,'animal');if(target.prototypeToken.ring?.subject)target.prototypeToken.ring.subject.texture=formImage(r,'animal');target.prototypeToken.randomImg=false;}
 target.items=target.items.filter(i=>!i.flags?.[ID]);target.effects=target.effects.filter(e=>!e.flags?.[ID]);
});
Hooks.on('updateActor',(a,changes,options={},userId)=>{
 if(!supported(a))return;handleRequests(a,changes,userId).catch(error);
 const h=HP(a),old=hpCache.get(a.uuid);hpCache.set(a.uuid,{value:h.value,max:h.max,temp:h.temp});const origin=root(a);if(!raw(origin))return;
 if(Object.keys(changes).some(k=>k.includes(ID)||k.startsWith('ownership'))||changes.flags?.[ID])reconcileChoiceWindows(origin);
 if(!primary()||options.sbsTransformations||options.isRest)return;
 const keys=Object.keys(foundry.utils.flattenObject(changes));
 if(old&&keys.some(k=>k.startsWith('system.attributes.hp.')))serial(origin,()=>bloodiedTriggers(origin,old,{value:h.value,max:h.max,temp:h.temp})).catch(error);
 if(keys.some(k=>/system\.(abilities|details\.level|attributes\.(prof|movement))\./.test(k)))serial(origin,()=>sync(origin)).catch(error);
});
for(const hook of ['createItem','updateItem','deleteItem'])Hooks.on(hook,(item,changes,options={})=>{const a=item.actor;if(!primary()||options.sbsTransformations||item.getFlag(ID,'role')||!supported(a)||!raw(root(a)))return;if(['class','equipment'].includes(item.type))serial(root(a),()=>sync(root(a))).catch(error);});
Hooks.on('dnd5e.restCompleted',(a,result,config)=>{if(primary()&&supported(a)&&raw(root(a)))serial(root(a),()=>onRest(root(a),!!(result?.longRest||result?.type==='long'||config?.type==='long'||config?.longRest))).catch(error);});
const combatActors=new Map();
Hooks.on('updateCombat',(combat,changes)=>{
 if(!primary()||!('turn'in changes||'round'in changes))return;const previous=combatActors.get(combat.id),a=combat.combatant?.actor;combatActors.set(combat.id,a);
 if(supported(previous)&&raw(root(previous)))serial(root(previous),()=>turnEnd(root(previous))).catch(error);
 if(supported(a)&&raw(root(a)))serial(root(a),()=>turnStart(root(a))).catch(error);
});
Hooks.on('deleteCombat',combat=>{combatActors.delete(combat.id);});
Hooks.on('updateWorldTime',()=>{if(primary())for(const a of actorList())if(raw(a)&&!a.getFlag(ID,'root'))serial(a,()=>timeTick(a)).catch(error);});
Hooks.on('createToken',token=>{
 if(!primary()||!token.actorLink||!supported(token.actor))return;const a=root(token.actor);if(!raw(a))return;
 serial(a,async()=>{const d=read(a),appearance=d.appearance;if(!appearance)return;const r=d.records.find(r=>r.id===appearance.record),src=r?formImage(r,appearance.key):null;if(!src)return;
  if(!appearance.backup.tokens.some(t=>t.uuid===token.uuid))appearance.backup.tokens.push({uuid:token.uuid,...appearance.backup.prototype});await write(a,d);await token.update({'texture.src':src,...(token.ring?{'ring.subject.texture':src}:{})},{sbsTransformations:true});
 }).catch(error);
});
// Persisted chat documents are observed on the GM client too; local-only roll hooks are not.
Hooks.on('createChatMessage',(message,options,userId)=>{
 if(!primary()||!message.isRoll||!message.rolls?.length)return;const rollData=message.flags?.dnd5e?.roll;if(!['ability','save','skill','tool','attack','death'].includes(rollData?.type))return;
 const speaker=message.speaker,a=speaker.scene&&speaker.token?game.scenes.get(speaker.scene)?.tokens.get(speaker.token)?.actor:game.actors.get(speaker.actor);if(!supported(a)||!raw(root(a)))return;
 const user=game.users.get(userId);if(!owner(root(a),user))return;
 const roll=message.rolls.find(r=>r.dice?.some(d=>d.faces===20)),die=roll?.dice.find(d=>d.faces===20),natural=die?.results.find(r=>r.active!==false&&!r.discarded)?.result;if(!Number.isFinite(natural))return;
 serial(root(a),()=>afterRoll(root(a),{natural,save:rollData.type==='save',failed:roll.isSuccess===false})).catch(error);
});
Hooks.on('dnd5e.rollInitiative',(a)=>{if(!primary()||!supported(a)||!raw(root(a)))return;serial(root(a),async()=>{const d=read(root(a));for(const r of d.records)if(r.state.unstable?.id==='initiative-stun'&&!r.disabled){r.state.initiativeStun=true;await root(a).createEmbeddedDocuments('ActiveEffect',[{name:'Unstable Form — first-turn Stunned',img:ICON,statuses:['stunned'],flags:tagged('initiative-stun',r.id)}]);}await write(root(a),d);}).catch(error);});
// Internal adapter seam for headless regression checks; normal callers use module.api.
export const testAdapter={reconcileChoiceWindows,formImage,imageDialog,setupTransformation,stageEditor,openAdvanced,promptChoice,pendingPrompts,pendingChoicePanel,choiceRecipient,recordPanel,open,selectedTokenActor,execute,read,sync,migrate,rollback,changeForm,validImages,cloneDefinition,beforeD20,beforeActivity,damageAdjustments,beforeCalculateDamage,afterRoll,bloodiedTriggers,onRest,turnStart,turnEnd,timeTick,load:(types,table=[])=>{stock=copy(types);catalog=copy(types);unstableTable=table;}};
