import { ID, VERSION, SOURCE, OPTIONS, FLAWS, ANIMALS, blank, normalize, stage, has, isHybrid, affinity, pending, choose, grant, bloodied, crossedBloodied, nextDawn, damageFactor, choiceName } from './rules.mjs';

const ICON=`modules/${ID}/assets/moon.svg`;
const oldKey='sbsLycanthropy';
const clone=x=>foundry.utils.deepClone(x);
const hp=a=>a?.system?.attributes?.hp;
const supported=a=>['character','npc'].includes(a?.type)&&hp(a)&&a.system?.abilities?.str;
const data=a=>normalize(a?.getFlag(ID,'data'));
const raw=a=>a?.getFlag(ID,'data');
const owned=(a,u=game.user)=>u?.isGM||a?.testUserPermission(u,'OWNER');
const primary=()=>game.user.id===game.users.activeGM?.id;
const role=d=>d?.getFlag(ID,'role');
const now=()=>game.time.worldTime;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const roots=()=>game.actors.contents.filter(a=>supported(a)&&raw(a)&&!a.getFlag(ID,'root'));
const tokensOf=a=>{
 if(a.isToken)return [a.token?.document??a.token].filter(Boolean);
 const placed=game.scenes.contents.flatMap(s=>s.tokens.contents.filter(t=>(t.actorLink||t.isLinked)&&t.actorId===a.id));
 const active=typeof a.getActiveTokens==='function'?a.getActiveTokens(true,true).map(t=>t.document??t):[];
 return [...new Map([...placed,...active].filter(t=>t?.uuid).map(t=>[t.uuid,t])).values()];
};
const allActors=()=>[...new Map([...game.actors.contents,...game.scenes.contents.flatMap(s=>s.tokens.contents.filter(t=>!t.actorLink).map(t=>t.actor).filter(Boolean))].filter(supported).map(a=>[a.uuid,a])).values()];
const rootOf=a=>a?.getFlag(ID,'root')?fromUuidSync(a.getFlag(ID,'root'))??a:a;
const liveOf=a=>{const d=data(a);return d.state.animalUuid?fromUuidSync(d.state.animalUuid)??a:a;};
const queues=new Map(),requests=new Map(),choiceDialogs=new Set(),panelDialogs=new Map(),hpCache=new Map();
let managerDialog;
const notifyError=e=>{console.error('SBS Lycanthropy',e);ui.notifications.error(e.message??String(e));};
const queue=(a,fn)=>{const key=rootOf(a).uuid;const p=(queues.get(key)??Promise.resolve()).catch(()=>{}).then(fn);queues.set(key,p);p.finally(()=>{if(queues.get(key)===p)queues.delete(key);}).catch(()=>{});return p;};
const write=(a,d)=>a.setFlag(ID,'data',d);
const chat=(a,text)=>ChatMessage.create({speaker:ChatMessage.getSpeaker({actor:a}),content:`<div class="sbs-lycan-chat"><h3>🐺 Lycanthropy</h3>${text}</div>`});
const tagged=(r,extra={})=>({[ID]:{role:r,...extra}});
const eligibleUser=a=>{
 const users=game.users.contents.filter(u=>u.active&&!u.isGM&&owned(a,u));
 return users.find(u=>u.character?.id===a.id)??users.sort((a,b)=>a.id.localeCompare(b.id))[0];
};
function modal(title,content,buttons,render) {
 return new Dialog({title,content:`<div class="sbs-lycan">${content}</div>`,buttons,render}, {classes:['sbs-lycan-window'],width:600,height:'auto',resizable:true}).render(true);
}
const field=(name,label,value='',type='text')=>`<label>${label}<input type="${type}" name="${name}" value="${esc(value)}"></label>`;
const check=(name,label,value=false)=>`<label><input type="checkbox" name="${name}" ${value?'checked':''}> ${label}</label>`;
const brand=()=>`<div class="brand"><img src="${ICON}"><div><small>SALTYBANANASLUG</small><h2>Lycanthropy</h2></div></div>`;
function imageField(form,d) {
 const value=d.config.images[form]?.token??'';
 return `<div class="card"><b>${form==='hybrid'?'Hybrid':'Animal'} token image</b><div class="image-row"><input name="${form}Token" value="${esc(value)}" placeholder="Choose an image or leave blank"><button type="button" data-browse="${form}Token"><i class="fas fa-folder-open"></i> Browse</button></div><small>Temporary token image only. Your character portrait stays unchanged.</small></div>`;
}
function browseBind(html) {
 html.find('[data-browse]').on('click',event=>{
  const name=event.currentTarget.dataset.browse;
  const input=html.find(`[name="${name}"]`);
  const Picker=foundry.applications?.apps?.FilePicker?.implementation??globalThis.FilePicker;
  new Picker({type:'image',current:input.val(),callback:path=>input.val(path)}).browse();
 });
}
function imageInputs(html,d,forms=['hybrid','kindred']) {
 const images=clone(d.config.images);
 for(const form of forms){const input=html.find(`[name="${form}Token"]`);if(input.length)images[form]={token:String(input.val()??'').trim()};}
 return images;
}
function request(action,a,args={}) {
 const root=rootOf(a);
 if(!owned(root))return Promise.reject(Error('You do not own this actor.'));
 if(!game.users.activeGM)return Promise.reject(Error('A GM must be online to apply transformation changes.'));
 if(primary())return queue(root,()=>execute(action,root,args,game.user));
 const id=foundry.utils.randomID();
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{requests.delete(id);reject(Error('The request has not completed. Check the actor before retrying; it may still be waiting on the GM.'));},60000);
  requests.set(id,{resolve,reject,timer});
  game.socket.emit(`module.${ID}`,{kind:'request',id,action,actor:root.uuid,args,user:game.user.id});
 });
}
async function socketMessage(m) {
 if(m?.kind==='response'&&m.user===game.user.id){const req=requests.get(m.id);if(req){clearTimeout(req.timer);requests.delete(m.id);m.error?req.reject(Error(m.error)):req.resolve(m.result);}return;}
 if(m?.kind!=='request'||!primary())return;
 let result,error;
 try {
  const a=await fromUuid(m.actor),u=game.users.get(m.user);
  if(!u?.active||!supported(a)||!owned(a,u))throw Error('Actor ownership is required.');
  result=await queue(a,()=>execute(m.action,a,m.args??{},u));
 }catch(e){error=e.message;}
 game.socket.emit(`module.${ID}`,{kind:'response',id:m.id,user:m.user,result,error});
}
function utility(name,action,description,activation='special') {
 return {name,type:'feat',img:ICON,flags:tagged('control',{action}),system:{description:{value:description},activities:{sbsLycanControl1:{type:'utility',name,activation:{type:activation,value:1}}}}};
}
function featureDescription(d) {
 let text=`<p>Stage ${stage(d)} · ${esc(d.state.form)}${d.state.feral?' · Feral':''}. Use this feature to transform, revert, choose pending boons, or change token images.</p>`;
 for(let s=1;s<=stage(d);s++)text+=`<p><b>${esc(choiceName(d,s))}</b>: ${esc(OPTIONS[s].find(o=>o.id===d.config.choices[s]).summary)}<br><b>${esc(FLAWS[s].name)}</b>: ${esc(FLAWS[s].summary)}</p>`;
 return text+`<p>Hybrid natural attacks replace weapon attacks, not Unarmed Strikes. Spending actions, feral movement/targets, passive class restrictions, and sensing require adjudication. Also counts as a Monstrosity; original type is retained. <a href="${SOURCE}" target="_blank">Rules reference</a>.</p>`;
}
async function syncController(a,d) {
 const description=featureDescription(d);const existing=a.items.find(i=>role(i)==='controller');
 const row=utility('Lycanthropy — Transform / Revert','panel',description);
 row.flags[ID].role='controller';
 if(existing)await existing.update({'system.description.value':description});
 else await a.createEmbeddedDocuments('Item',[row]);
}
const change=(key,mode,value)=>({key,mode,value:String(value),priority:80});
function effectRows(a,d,{animal=false}={}) {
 const M=CONST.ACTIVE_EFFECT_MODES;const permanent=[],form=[];
 if(has(d,'vigor')&&!animal){
  const level=Number(a.system.details?.level)||Object.values(a.classes??{}).reduce((n,c)=>n+Number(c.system.levels??0),0);
  if(a.type==='character'&&a._source?.system?.attributes?.hp?.max==null)permanent.push(change('system.attributes.hp.bonuses.overall',M.ADD,level));
  else permanent.push(change('system.attributes.hp.max',M.ADD,level));
 }
 if(isHybrid(d)&&!animal){
  const type=d.config.choices[1];
  if(type==='wolf'){form.push(change('system.abilities.str.value',M.UPGRADE,18));form.push(change('system.attributes.movement.walk',M.ADD,10));}
  if(type==='bear'){form.push(change('system.abilities.str.value',M.UPGRADE,20));form.push(change('system.attributes.movement.climb',M.UPGRADE,Number(a.system.attributes.movement.walk)||0));}
  if(type==='rat'){form.push(change('system.abilities.dex.value',M.UPGRADE,18));form.push(change('system.skills.ste.value',M.UPGRADE,2));}
  if(has(d,'savagery')){form.push(change('system.traits.ci.value',M.ADD,'charmed'));form.push(change('system.traits.ci.value',M.ADD,'frightened'));}
 }
 const rows=[{name:'Lycanthropy',img:ICON,flags:tagged('curse'),description:featureDescription(d),changes:permanent}];
 if(isHybrid(d)&&!animal)rows.push({name:`Lycanthropy — Hybrid ${d.config.choices[1]}${d.state.feral?' (Feral)':''}`,img:ICON,flags:tagged('form'),description:featureDescription(d),changes:form});
 return rows;
}
async function syncEffects(a,d,opts) {
 const rows=effectRows(a,d,opts),roles=new Set(rows.map(r=>r.flags[ID].role));
 for(const row of rows){const old=a.effects.find(e=>role(e)===row.flags[ID].role);if(old)await old.update(row);else await a.createEmbeddedDocuments('ActiveEffect',[row]);}
 const stale=a.effects.filter(e=>['curse','form'].includes(role(e))&&!roles.has(role(e))).map(e=>e.id);
 if(stale.length)await a.deleteEmbeddedDocuments('ActiveEffect',stale);
}
async function syncAttacks(a,d) {
 const ids=a.items.filter(i=>['attack','formAction'].includes(role(i))).map(i=>i.id);if(ids.length)await a.deleteEmbeddedDocuments('Item',ids);
 if(!isHybrid(d))return;
 const type=d.config.choices[1],ability=a.system.abilities.dex.mod>a.system.abilities.str.mod?'dex':'str';
 const rows=(type==='bear'?['Claw']:['Claw','Bite']).map(name=>{
  const activity={type:'attack',name,activation:{type:'action',value:1},attack:{ability,type:{value:'melee',classification:'weapon'}},damage:{includeBase:true,parts:has(d,'savagery')?[{number:1,denomination:8,bonus:'',types:['slashing']}]:[]},range:{value:5,units:'ft'},target:{affects:{type:'creature',count:'1'}}};
  const activities={sbsLycanAttack01:activity};
  if(type!=='bear'){activities.sbsLycanBonus001=clone(activity);activities.sbsLycanBonus001.activation.type='bonus';activities.sbsLycanBonus001.name='Bonus attack after Attack action';}
  return {name:`Lycanthropy — ${name}`,type:'weapon',img:ICON,flags:tagged('attack'),system:{description:{value:'<p>Proficient natural weapon attack. Use Strength or Dexterity. Not an Unarmed Strike. Bonus attacks require the Attack action first. Select exactly one target for conditional damage automation.</p>'},type:{value:'natural',baseItem:''},equipped:true,proficient:1,damage:{base:{number:1,denomination:type==='rat'?6:8,bonus:'',types:['slashing']}},activities}};
 });
 if(type==='wolf')rows.push(utility('Lycanthropy — Dash','dash','<p>Dash as a Bonus Action. Track movement normally.</p>','bonus'));
 if(type==='rat')for(const name of ['Hide','Disengage'])rows.push(utility(`Lycanthropy — ${name}`,name.toLowerCase(),`<p>${name} as a Bonus Action.</p>`,'bonus'));
 if(type==='bear')rows.push(utility('Lycanthropy — Bear Grapple','grapple','<p>Bonus Action after a Claw hit; target at most one size larger. Escape DC = 8 + STR modifier + proficiency.</p>','bonus'));
 if(has(d,'focus'))rows.push(utility('Lycanthropy — Hunter’s Focus','focus','<p>Bonus Action; mark one creature within 60 feet for 1 hour.</p>','bonus'));
 for(const row of rows)if(row.flags[ID].role==='control')row.flags[ID].role='formAction';
 await a.createEmbeddedDocuments('Item',rows);
}
async function sync(a,d,{attacks=false,animal=false}={}) {
 await syncEffects(a,d,{animal});await syncController(a,d);
 if(attacks&&!animal)await syncAttacks(a,d);
}
const ringSubject=t=>{
 const subject=t?._source?.ring?.subject;
 return subject&&Object.hasOwn(subject,'texture')?subject.texture:t?.ring?.subject?.texture??null;
};
function imagePatch(t,src) {
 const patch={'texture.src':src};
 // A distinct dynamic-ring subject can otherwise keep rendering the old art.
 if(t?.ring)patch['ring.subject.texture']=src;
 return patch;
}
async function rememberImages(a,d) {
 const previous=d.state.images;
 d.state.images??={prototype:a.prototypeToken?.texture?.src??null,tokens:[]};
 const images=d.state.images;
 if(!Object.hasOwn(images,'prototypeRingSubject'))images.prototypeRingSubject=ringSubject(a.prototypeToken);
 if(!Object.hasOwn(images,'prototypeRandomImg'))images.prototypeRandomImg=a.prototypeToken?.randomImg??false;
 for(const t of tokensOf(a)){
  const original=images.tokens.find(i=>i.uuid===t.uuid);
  if(original){if(!Object.hasOwn(original,'ringSubject'))original.ringSubject=ringSubject(t);}
  else images.tokens.push({uuid:t.uuid,src:previous?images.prototype??t.texture.src:t.texture.src,ringSubject:ringSubject(t)});
 }
}
async function setImages(a,d,form) {
 const src=d.config.images[form]?.token;if(!src){ui.notifications.info(`No ${form} token image is configured. Choose Token images in the Lycanthropy feature to set one.`);return;}
 if(!a.isToken){const patch=imagePatch(a.prototypeToken,src);await a.update(Object.fromEntries(Object.entries(patch).map(([k,v])=>['prototypeToken.'+k,v]).concat([['prototypeToken.randomImg',false]])),{sbsLycan:true});}
 for(const t of tokensOf(a))await t.update(imagePatch(t,src),{sbsLycan:true});
}
async function restoreImages(a,d) {
 const images=d.state.images;if(!images)return;
 if(images.prototype&&!a.isToken){const patch={'prototypeToken.texture.src':images.prototype};if(Object.hasOwn(images,'prototypeRingSubject')&&a.prototypeToken?.ring)patch['prototypeToken.ring.subject.texture']=images.prototypeRingSubject;if(Object.hasOwn(images,'prototypeRandomImg'))patch['prototypeToken.randomImg']=images.prototypeRandomImg;await a.update(patch,{sbsLycan:true});}
 for(const item of images.tokens??[]){const t=await fromUuid(item.uuid);if(t){const patch={'texture.src':item.src};if(Object.hasOwn(item,'ringSubject')&&t.ring)patch['ring.subject.texture']=item.ringSubject;await t.update(patch,{sbsLycan:true});}}
}
async function findAnimal(a,d) {
 if(d.config.animalUuid){const source=await fromUuid(d.config.animalUuid);if(source?.documentName==='Actor')return source;throw Error('The configured animal actor cannot be found.');}
 const name=ANIMALS[d.config.choices[1]];
 const world=game.actors.find(x=>x.type==='npc'&&x.name.toLowerCase()===name.toLowerCase());if(world)return world;
 const packs=game.packs.contents.filter(p=>p.documentName==='Actor').sort((a,b)=>Number(/24/.test(b.collection))-Number(/24/.test(a.collection)));
 for(const p of packs){try{const index=await p.getIndex();const row=index.find(x=>x.name.toLowerCase()===name.toLowerCase());if(row)return await p.getDocument(row._id);}catch(e){console.debug(ID,'Animal pack unavailable',p.collection);}}
 throw Error(`Import a ${name} NPC actor or set its UUID in the GM manager. No animal stats were changed.`);
}
async function revert(a,{force=false,reason='Reverted using a Magic action.'}={}) {
 let d=data(a);
 if(!force&&d.state.lockDawn>now())throw Error('Reversion is locked until next dawn by Ultimate Predator.');
 if(!force&&d.state.feral)throw Error('Feral form cannot end voluntarily.');
 if(d.state.form==='kindred'){
  const beast=liveOf(a);if(beast===a&&!a.isPolymorphed)throw Error('The animal actor is missing. Use GM repair to restore the original.');
  const restored=await beast.revertOriginalForm({renderSheet:true});
  if(a.isToken){a=restored?.actor??a.token?.actor??a;await a.unsetFlag(ID,'root');}
 }
 await restoreImages(a,d);
 d.state={...d.state,form:'normal',feral:false,expires:0,animalUuid:null,images:null};
 await write(a,d);await sync(a,d,{attacks:true});
 await chat(a,`<p>${esc(reason)} The underlying curse remains.</p>`);return a;
}
async function transform(a,form,{force=false}={}) {
 let d=data(a);
 if(!stage(d))throw Error('Finish the pending Stage 1 choice first.');
 if(force&&d.state.feral)return;
 if(form==='kindred'&&!has(d,'kindred'))throw Error('Kindred Form is not selected.');
 if(!force&&d.state.lockDawn>now())throw Error('Your current form is locked until dawn.');
 if(!force&&d.state.feral)throw Error('You cannot change form voluntarily while feral.');
 if(d.state.form===form&&!force){if(form==='hybrid'){await rememberImages(a,d);await write(a,d);await setImages(a,d,form);}return;}
 if(d.state.form==='kindred'){a=await revert(a,{force:true,reason:'Changing form.'});d=data(a);}
 let animal;if(form==='kindred')animal=await findAnimal(a,d);
 await rememberImages(a,d);
 if(!(has(d,'affinity')&&form==='hybrid'&&!force))await a.endConcentration();
 d.state.form=form;d.state.feral=force;d.state.expires=now()+3600*(force?1:stage(d));
 await write(a,d);
 if(form==='hybrid'){
  await sync(a,d,{attacks:true});await setImages(a,d,'hybrid');
  if(has(d,'savagery'))for(const e of a.effects.filter(e=>e.statuses?.has('charmed')||e.statuses?.has('frightened')))await e.delete();
 }else{
  await sync(a,d,{attacks:true});
  const {default:TransformationSetting}=await import('/systems/dnd5e/module/data/settings/transformation-setting.mjs');
  const preset=clone(CONFIG.DND5E.transformation.presets.polymorph.settings);
  const settings=new TransformationSetting({...preset,preset:'polymorph',transformTokens:true,keep:new Set([...preset.keep,'languages'])});
  const before=new Set(game.actors.map(x=>x.id));
  await a.transformInto(animal,settings,{renderSheet:true});
  const beast=a.isToken?a.token.actor:game.actors.find(x=>!before.has(x.id)&&x.getFlag(ID,'root')===a.uuid);
  if(!beast)throw Error('Animal transformation did not produce an actor. Use GM repair if necessary.');
  d.state.animalUuid=beast.uuid;await write(a,d);
  await beast.setFlag(ID,'root',a.uuid);await write(beast,d);await sync(beast,d,{animal:true});
 }
 await chat(a,`<p>${force?'Forced feral hybrid':'Entered '+esc(form)+' form'}. ${form==='kindred'?'Equipment falls off; animal statistics and temporary HP use the system’s 2024 Polymorph preset.':'Use the new natural attacks and form actions on your sheet.'}</p>`);
}
async function rollSave(a,dc,label) {
 const active=liveOf(a);await chat(active,`<p>${esc(label)} — DC ${dc} Wisdom save.</p>`);
 const result=await active.rollSavingThrow({ability:'wis',target:dc});const roll=Array.isArray(result)?result[0]:result;
 return Number.isFinite(roll?.total)?roll.total>=dc:null;
}
async function hunt(a) {
 let d=data(a);if(!stage(d)||d.state.huntUsed)return;
 const passed=d.state.fullMoon?false:await rollSave(a,10,'Lust for the Hunt');
 if(passed===null){await chat(a,'<p>Save canceled. Resolve Hunt from your Lycanthropy feature.</p>');return;}
 d=data(a);d.state.huntUsed=true;await write(a,d);
 if(!passed)await transform(a,'hybrid',{force:true});else await chat(a,'<p>Lust for the Hunt resisted until the next rest trigger.</p>');
}
async function recovery(a) {
 const d=data(a),h=hp(liveOf(a));if(!d.state.feral)throw Error('You are not feral.');
 if(!h||h.value<h.max)throw Error('Recovery requires full HP at the start of your turn.');
 if(await rollSave(a,10,'Full-HP feral recovery')===true){
  if(data(a).state.lockDawn>now())await chat(a,'<p>Recovery succeeded, but Ultimate Predator still prevents normal form until dawn.</p>');
  else await revert(a,{force:true,reason:'Full-HP recovery succeeded.'});
 }
}
async function tick(a) {
 let d=data(a);if(d.state.lockDawn&&d.state.lockDawn<=now()){d.state.lockDawn=0;await write(a,d);}
 if(d.state.prey&&(d.state.prey.expires<=now()||!fromUuidSync(d.state.prey.uuid)||Number(hp(fromUuidSync(d.state.prey.uuid))?.value)<=0)){d.state.prey=null;await write(a,d);}
 if(d.state.form!=='normal'&&d.state.expires&&d.state.expires<=now()&&!d.state.lockDawn)await revert(a,{force:true,reason:'Transformation duration elapsed.'});
}
function distance(a,b) {
 if(!a||!b||a.parent?.id!==b.parent?.id)return Infinity;
 const grid=a.parent.grid;const center=t=>({x:t.x+t.width*grid.size/2,y:t.y+t.height*grid.size/2});const p=center(a),q=center(b);
 if(canvas.scene?.id===a.parent.id&&canvas.grid?.measurePath){try{return canvas.grid.measurePath([p,q]).distance;}catch(e){}}
 return Math.hypot(p.x-q.x,p.y-q.y)/grid.size*grid.distance;
}
function closestToken(a,b) {
 let best=Infinity;for(const ta of tokensOf(a))for(const tb of tokensOf(b))best=Math.min(best,distance(ta,tb));return best;
}
async function execute(action,a,args,user) {
 const gmOnly=new Set(['grant','remove','force','repair','senses','dawn','source']);
 if(gmOnly.has(action)&&!user.isGM)throw Error('Only a GM can do that.');
 let d=data(a);
 switch(action){
  case 'grant':{
   const n=Number(args.stage);if(d.state.form!=='normal')throw Error('Return to normal form before changing the granted stage.');
   d=grant(d,n);
   // Migrate only documents explicitly owned by the previous macro.
   const es=a.effects.filter(e=>e.getFlag('world',oldKey)).map(e=>e.id),is=a.items.filter(i=>i.getFlag('world',oldKey)).map(i=>i.id);
   if(es.length)await a.deleteEmbeddedDocuments('ActiveEffect',es);if(is.length)await a.deleteEmbeddedDocuments('Item',is);
   if(!n)return removeCurse(a);
   await write(a,d);await sync(a,d);await chat(a,`<p>Transformation Stage ${n} granted. ${eligibleUser(a)?'The player will be prompted to choose pending boons and acknowledge the mandatory flaws.':'Choices are pending. They will appear when an owner logs in; the GM can also open the choice prompt.'}</p>`);return;
  }
  case 'choose':{
   if(d.state.form!=='normal')throw Error('Finish choices in normal form.');
   d=choose(d,Number(args.stage),String(args.boon));
   if(args.images)d.config.images=cleanImages(args.images,d);
   await write(a,d);await sync(a,d);
   await chat(a,`<p>Stage ${args.stage}: ${esc(choiceName(d,args.stage))} selected. Mandatory flaw: ${esc(FLAWS[args.stage].name)}.</p>`);return;
  }
  case 'images':{
   if(d.state.form==='hybrid')await rememberImages(a,d);
   d.config.images=cleanImages(args.images,d);await write(a,d);
   if(d.state.form==='hybrid'){await restoreImages(a,d);await setImages(a,d,'hybrid');}
   if(d.state.form==='kindred'){
    const beast=liveOf(a),src=d.config.images.kindred.token||(await findAnimal(a,d)).prototypeToken.texture.src;
    if(src)await setImages(beast,{config:{images:{kindred:{token:src}}}},'kindred');
   }
   return;
  }
  case 'hybrid':return transform(a,'hybrid');
  case 'kindred':return transform(a,'kindred');
  case 'normal':return revert(a);
  case 'hunt':if(!bloodied(hp(liveOf(a))))throw Error('The actor is not Bloodied.');return hunt(a);
  case 'recovery':return recovery(a);
  case 'removeSpell':if(d.state.lockDawn>now())throw Error('Ultimate Predator locks normal form until dawn. A GM can override with Repair.');return revert(a,{force:true,reason:'Remove Curse ended the current form, but did not cure Lycanthropy.'});
  case 'rest':d.state.huntUsed=false;if(args.long)d.state.predatorImmune=false;await write(a,d);return;
  case 'moon':d.state.fullMoon=!!args.value;await write(a,d);return;
  case 'senses':d.state.senses={bloodied:!!args.bloodied,unconscious:!!args.unconscious};await write(a,d);return;
  case 'force':d.state.huntUsed=true;await write(a,d);return transform(a,'hybrid',{force:true});
  case 'kill':if(isHybrid(d)&&stage(d)>=4){d.state.lockDawn=nextDawn(now(),game.settings.get(ID,'dawnHour'));await write(a,d);await chat(a,'<p>Ultimate Predator: normal form is locked until the next dawn. Use the GM Dawn control for custom calendars.</p>');}return;
  case 'dawn':d.state.lockDawn=0;await write(a,d);return tick(a);
  case 'repair':{
   if(d.state.form==='kindred'&&liveOf(a)===a&&!a.isPolymorphed){await restoreImages(a,d);d.state.form='normal';d.state.feral=false;d.state.animalUuid=null;d.state.images=null;d.state.expires=0;d.state.lockDawn=0;await write(a,d);return sync(a,d,{attacks:true});}
   d.state.lockDawn=0;await write(a,d);return revert(a,{force:true,reason:'GM repair / override.'});
  }
  case 'remove':return removeCurse(a);
  case 'source':if(d.state.form!=='normal')throw Error('Set the animal source while in normal form.');d.config.animalUuid=String(args.uuid??'').trim();await write(a,d);return;
  case 'focus':{
   if(!isHybrid(d)||!has(d,'focus'))throw Error('Hunter’s Focus requires hybrid form and its boon.');
   const target=await fromUuid(args.uuid);if(!supported(target))throw Error('Choose one creature as prey.');
   if(closestToken(a,target)>60)throw Error('Prey must be within 60 feet on the same scene.');
   d.state.prey={uuid:target.uuid,expires:now()+3600};await write(a,d);await chat(a,`<p>Hunter’s Focus marks ${esc(target.name)} for 1 hour. Spend your Bonus Action.</p>`);return;
  }
  case 'track':{
   if(!isHybrid(d)||!has(d,'focus')||!d.state.prey||d.state.prey.expires<=now())throw Error('Mark prey first.');
   const skill=['prc','sur'].includes(args.skill)?args.skill:'prc';await liveOf(a).rollSkill({skill,advantage:true});return;
  }
  case 'grapple':{
   if(!isHybrid(d)||d.config.choices[1]!=='bear')throw Error('Requires hybrid bear form.');
   const target=await fromUuid(args.uuid);if(!supported(target))throw Error('Target the creature hit by your Claw.');
   if(closestToken(a,target)>5)throw Error('Target must be within reach.');
   const sizes=['tiny','sm','med','lg','huge','grg'];if(sizes.indexOf(target.system.traits.size)>sizes.indexOf(a.system.traits.size)+1)throw Error('Target is too large.');
   await target.toggleStatusEffect('grappled',{active:true});
   await chat(a,`<p>Bear grapple applied to ${esc(target.name)} after a Claw hit. Spend your Bonus Action. Escape DC ${8+a.system.abilities.str.mod+a.system.attributes.prof}. Track the grapple’s ending and forced movement normally.</p>`);return;
  }
  default:throw Error('Unknown Lycanthropy action.');
 }
}
function cleanImages(images,d) {
 const result=clone(d.config.images);
 for(const form of ['hybrid','kindred']){const src=String(images?.[form]?.token??result[form]?.token??'').trim();if(src.length>4096||/^(javascript|data):/i.test(src))throw Error('Use a Foundry image path or an HTTPS image URL.');result[form]={token:src};}
 return result;
}
async function removeCurse(a) {
 let d=data(a);if(d.state.form!=='normal'){d.state.lockDawn=0;await write(a,d);a=await revert(a,{force:true,reason:'GM exceptional cure / removal.'});}
 const es=a.effects.filter(e=>role(e)).map(e=>e.id),is=a.items.filter(i=>role(i)).map(i=>i.id);
 if(es.length)await a.deleteEmbeddedDocuments('ActiveEffect',es);if(is.length)await a.deleteEmbeddedDocuments('Item',is);
 await a.unsetFlag(ID,'data');await a.unsetFlag(ID,'root');
}
function choicePrompt(a,{gm=false}={}) {
 a=rootOf(a);const d=data(a),s=pending(d);if(!s||choiceDialogs.has(a.uuid))return;
 if(!gm&&eligibleUser(a)?.id!==game.user.id)return;
 choiceDialogs.add(a.uuid);
 const body=brand()+`<p><span class="badge">Stage ${s}</span> ${esc(a.name)}</p><h3>Choose your boon</h3>`+
 OPTIONS[s].map((o,i)=>`<label class="card choice"><input type="radio" name="boon" value="${o.id}" ${i===0?'checked':''}><span><b>${esc(o.name)}</b><small>${esc(o.summary)}</small></span></label>`).join('')+
 `<h3>Your mandatory flaw</h3><div class="card warning"><b>${esc(FLAWS[s].name)}</b><p>${esc(FLAWS[s].summary)}</p></div>`+
 (s===1?imageField('hybrid',d):'')+(s===2?`<div data-kindred-image hidden>${imageField('kindred',d)}</div>`:'')+
 `<small>You can leave images blank and choose them later. Only the token image changes, and only while the matching form is active.</small>`;
 let busy=false;
 const dialog=modal(`Lycanthropy — Stage ${s}`,body,{
  accept:{label:'Accept boon & flaw',callback:async html=>{
   if(busy)return;busy=true;
   try{await request('choose',a,{stage:s,boon:html.find('[name=boon]:checked').val(),images:imageInputs(html,d)});}
   catch(e){notifyError(e);}finally{choiceDialogs.delete(a.uuid);setTimeout(()=>choicePrompt(a,{gm}),300);}
  }},later:{label:'Choose later',callback:()=>choiceDialogs.delete(a.uuid)}
 },html=>{browseBind(html);html.find('[name=boon]').on('change',()=>html.find('[data-kindred-image]').prop('hidden',html.find('[name=boon]:checked').val()!=='kindred'));});
 // Closing the window must not discard a pending choice.
 const original=dialog.close.bind(dialog);dialog.close=async(...args)=>{choiceDialogs.delete(a.uuid);return original(...args);};
}
function imagesDialog(a) {
 a=rootOf(a);const d=data(a);modal('Transformation token images',brand()+imageField('hybrid',d)+(has(d,'kindred')?imageField('kindred',d):'')+'<p>Original token images are saved on transformation and restored on reversion. Character portraits never change.</p>',{
  save:{label:'Save images',callback:html=>request('images',a,{images:imageInputs(html,d)}).catch(notifyError)},cancel:{label:'Cancel'}
 },browseBind);
}
function targetActor() {return game.user.targets.size===1?[...game.user.targets][0].actor:null;}
function panel(a) {
 a=rootOf(a);if(!owned(a))return ui.notifications.warn('You do not own this actor.');
 const previous=panelDialogs.get(a.uuid);if(previous?.rendered)previous.close();
 const d=data(a),s=stage(d),p=pending(d);
 let body=brand()+`<p><b>${esc(a.name)}</b> · Stage ${s}/${d.config.granted} · <span class="badge">${esc(d.state.form)}${d.state.feral?' / Feral':''}</span></p>`;
 body+=`<small>Hybrid token image: ${d.config.images.hybrid.token?esc(d.config.images.hybrid.token):'Not set'}${has(d,'kindred')?'<br>Animal token image: '+(d.config.images.kindred.token?esc(d.config.images.kindred.token):'Not set'):''}</small>`;
 if(p)body+=`<div class="card warning">Stage ${p} is waiting for your boon choice and flaw acknowledgment.<button data-action="choose">Choose Stage ${p}</button></div>`;
 body+=`<div class="actions"><button data-action="hybrid">Hybrid form</button>${has(d,'kindred')?'<button data-action="kindred">Animal form</button>':''}<button data-action="normal">Revert</button><button data-action="images">Token images</button></div>`;
 for(let n=1;n<=s;n++)body+=`<div class="card"><b>Stage ${n}: ${esc(choiceName(d,n))}</b><small>${esc(OPTIONS[n].find(o=>o.id===d.config.choices[n]).summary)}</small><p><b>${esc(FLAWS[n].name)}</b><small>${esc(FLAWS[n].summary)}</small></p></div>`;
 body+=`<h3>Curse controls</h3>${check('moon','In full-moon light',d.state.fullMoon)}<div class="actions"><button data-action="moon">Save moon setting</button><button data-action="hunt">Resolve Hunt</button><button data-action="recovery">Full-HP recovery</button><button data-action="removeSpell">Remove Curse cast</button><button data-action="kill">Record a kill</button></div>`;
 if(has(d,'focus'))body+=`<h3>Hunter’s Focus</h3><small>Target exactly one creature before marking. Track checks apply only when finding that prey.</small><div class="actions"><button data-action="focus">Mark targeted prey</button><button data-action="track" data-skill="prc">Find prey: Perception</button><button data-action="track" data-skill="sur">Find prey: Survival</button></div>`;
 if(d.config.choices[1]==='bear')body+='<div class="actions"><button data-action="grapple">Grapple targeted creature after Claw hit</button></div>';
 body+='<small>Spend actions normally. Feral movement and passive class restrictions require adjudication. Timers use world time.</small>';
 const dialog=modal('Lycanthropy',body,{close:{label:'Close'}},html=>{
  html.find('[data-action]').on('click',async event=>{
   const button=event.currentTarget,action=button.dataset.action;button.disabled=true;
   try{
    if(action==='choose')return choicePrompt(a,{gm:game.user.isGM});if(action==='images')return imagesDialog(a);
    const args={};if(action==='moon')args.value=html.find('[name=moon]')[0].checked;
    if(['focus','grapple'].includes(action)){const t=targetActor();if(!t)throw Error('Target exactly one creature first.');args.uuid=t.uuid;}
    if(action==='track')args.skill=button.dataset.skill;
    if(action==='removeSpell'&&!await Dialog.confirm({title:'Remove Curse was cast?',content:'<p>This ends a form; it does not cure Stage 1 Lycanthropy or spend a spell slot. Has the spell actually been cast?</p>'}))return;
    await request(action,a,args);if(action!=='track')panel(a);
   }catch(e){notifyError(e);}finally{button.disabled=false;}
  });
 });panelDialogs.set(a.uuid,dialog);
}
function manager(a) {
 if(!game.user.isGM)return panel(a??game.user.character??canvas.tokens.controlled[0]?.actor);
 a=rootOf(a??canvas.tokens.controlled[0]?.actor??roots()[0]??game.actors.find(supported));
 if(!a)return ui.notifications.warn('Create a character or NPC actor first.');
 if(managerDialog?.rendered)managerDialog.close();
 const d=data(a);
 let body=brand()+`<label>Actor<select name="actor">${allActors().filter(x=>!x.getFlag(ID,'root')).map(x=>`<option value="${x.uuid}" ${x.uuid===a.uuid?'selected':''}>${esc(x.name)}${x.isToken?' (token)':''}</option>`).join('')}</select></label>`;
 body+=`<label>Granted stage<select name="stage">${[0,1,2,3,4].map(n=>`<option value="${n}" ${n===d.config.granted?'selected':''}>${n===0?'No transformation':'Stage '+n}</option>`).join('')}</select></label><p>Grant the stage here. The owning player chooses each pending boon and acknowledges its required flaw. Images are requested only when the corresponding form becomes available.</p><div class="actions"><button data-do="grant">Grant selected stage</button><button data-do="choose">Open pending choice</button><button data-do="panel">Player controls</button></div>`;
 body+=`<h3>DM adjudication</h3>${check('bloodied','Can sense a Bloodied creature',d.state.senses.bloodied)}${check('unconscious','Can sense an Unconscious creature',d.state.senses.unconscious)}<div class="actions"><button data-do="senses">Save sensed creatures</button><button data-do="force">Force feral</button><button data-do="dawn">Dawn reached</button><button data-do="repair">Restore normal form / repair</button></div>`;
 body+=field('source','Animal actor UUID (optional override)',d.config.animalUuid)+'<small>Otherwise finds the matching Wolf, Black Bear, or Giant Rat in your world or Actor compendiums. Prefer a 2024 stat block.</small><div class="actions"><button data-do="source">Save animal source</button><button data-do="remove">Remove entire curse</button></div>';
 body+='<small>Do not keep running the old macro. Its documents are replaced when you grant a stage. Remove Curse ends a form; removing the whole curse here is an exceptional cure or undo.</small>';
 managerDialog=modal('SBS Lycanthropy — GM',body,{close:{label:'Close'}},html=>{
  html.find('[name=actor]').on('change',async()=>{const target=await fromUuid(html.find('[name=actor]').val());manager(target);});
  html.find('[data-do]').on('click',async event=>{
   const action=event.currentTarget.dataset.do;
   try{
    if(action==='panel')return panel(a);if(action==='choose')return choicePrompt(a,{gm:true});
    const args={stage:Number(html.find('[name=stage]').val()),uuid:html.find('[name=source]').val(),bloodied:html.find('[name=bloodied]')[0].checked,unconscious:html.find('[name=unconscious]')[0].checked};
    if(action==='remove'&&!await Dialog.confirm({title:'Remove Lycanthropy?',content:'<p>Remove the entire transformation and its generated documents? This is not the Remove Curse spell.</p>'}))return;
    await request(action,a,args);ui.notifications.info('Lycanthropy updated.');
   }catch(e){notifyError(e);}
  });
 });
}
function modifier(config,kind) {
 for(const roll of config.rolls??[]){roll.options??={};roll.options[kind]=true;}
 config[kind]=true;
}
function auraAdvantage(a) {
 if(!supported(a))return false;
 for(const source of allActors()){
  const root=rootOf(source),d=data(root);if(source.uuid===a.uuid||!affinity(d))continue;
  for(const t of tokensOf(source))for(const other of tokensOf(a)){
   if(t.uuid!==other.uuid&&t.disposition!==0&&t.disposition===other.disposition&&distance(t,other)<=20)return true;
  }
 }
 return false;
}
function abilityRoll(config,isSave=false) {
 const a=config.subject;if(!supported(a))return;const d=data(rootOf(a)),s=stage(d);const ability=config.ability;
 if(s>=3&&ability==='int')modifier(config,'disadvantage');
 if(isSave&&s>=4&&ability==='wis'&&d.state.senses.bloodied)modifier(config,'disadvantage');
 if(ability==='wis'&&auraAdvantage(a))modifier(config,'advantage');
}
function attackRoll(config) {
 const activity=config.subject,a=activity?.actor;if(!supported(a))return;
 const d=data(rootOf(a));if(!isHybrid(d)||d.config.choices[1]!=='rat'||role(activity.item)!=='attack')return;
 const target=targetActor();if(!target)return;
 // Relationships other than hostile dispositions require manual advantage.
 for(const victim of tokensOf(target))for(const sceneToken of victim.parent.tokens.contents){
  if(sceneToken.actor?.uuid===target.uuid||sceneToken.disposition===0||victim.disposition===0||sceneToken.disposition===victim.disposition)continue;
  if(distance(victim,sceneToken)<=5){modifier(config,'advantage');return;}
 }
}
function conditionalDamage(config) {
 const activity=config.subject,a=activity?.actor;if(!supported(a))return;
 const d=data(rootOf(a));if(!isHybrid(d))return;
 const target=targetActor();const needs=has(d,'focus')||has(d,'instincts');
 if(!target){if(needs&&game.user.targets.size>1)ui.notifications.warn('Lycanthropy conditional damage: select exactly one target and roll separately.');return;}
 const melee=activity.attack?.type?.value==='melee';
 for(const roll of config.rolls??[]){
  roll.parts??=[];
  if(melee&&has(d,'focus')&&d.state.prey?.uuid===target.uuid&&d.state.prey.expires>now()&&Number(hp(target)?.value)>0){
   // Add to the base damage roll, preserving its selected damage type.
   if(roll===config.rolls[0])roll.parts.push('1d6');
  }
 }
 if(role(activity.item)==='attack'&&has(d,'instincts')&&bloodied(hp(target))){
  const first=config.rolls?.[0];if(first)config.rolls.push({parts:['1d8'],data:first.data??{},options:{...first.options,type:'slashing'}});
 }
}
function physicalDamage(a,damages,options) {
 if(!supported(a)||options.ignore===true)return;
 const d=data(rootOf(a));if(!stage(d))return;
 for(const hit of damages){
  if(Number(hit.value)<=0)continue;
  const props=new Set(hit.properties??[]);
  // Physical tags identify attack damage; mgc/sil are native weapon properties.
  const weapon=props.has('sil')||props.has('mwak')||props.has('rwak')||props.has('mgc');
  const desired=damageFactor(d,{type:hit.type,properties:props,weapon});
  hit.active??={};let factor=1;
  const ignores=cat=>options.ignore?.[cat]===true||options.ignore?.[cat]?.has?.(hit.type);
  if(desired.vulnerable){
   if(hit.active.resistance){factor*=2;hit.active.resistance=false;}
   if(!hit.active.vulnerability&&!ignores('vulnerability')){factor*=2;hit.active.vulnerability=true;}
  }else if(desired.resist&&!hit.active.resistance&&!hit.active.immunity&&!ignores('resistance')){factor/=2;hit.active.resistance=true;}
  hit.value*=factor;hit.active.multiplier=(hit.active.multiplier??1)*factor;
 }
 const total=damages.reduce((n,h)=>n+(h.type==='temphp'?0:Number(h.value)||0),0);
 damages.amount=total>0?Math.floor(total):Math.ceil(total);
}
async function startTurn(a) {
 a=rootOf(a);await tick(a);let d=data(a);if(!stage(d))return;
 if(stage(d)>=4){
  const answer=await new Promise(resolve=>{
   const dialog=modal('Ultimate Predator — sensed creatures',`<p>${esc(a.name)}: adjudicate sight, hearing, and smell at this turn start.</p>${check('bloodied','Can sense a Bloodied creature',d.state.senses.bloodied)}${check('unconscious','Can sense an Unconscious creature',d.state.senses.unconscious)}`,{
    go:{label:'Resolve turn',callback:html=>resolve({bloodied:html.find('[name=bloodied]')[0].checked,unconscious:html.find('[name=unconscious]')[0].checked})},cancel:{label:'Keep current settings',callback:()=>resolve(null)}
   });const old=dialog.close.bind(dialog);dialog.close=async(...args)=>{resolve(null);return old(...args);};
  });
  if(answer){d.state.senses=answer;await write(a,d);}
  if(d.state.senses.unconscious&&!d.state.predatorImmune){
   const passed=await rollSave(a,15,'Ultimate Predator');
   if(passed===true){d=data(a);d.state.predatorImmune=true;await write(a,d);}
   if(passed===false)await transform(a,'hybrid',{force:true});
   if(passed===null)await chat(a,'<p>Ultimate Predator save remains unresolved; the GM can force feral after a failed manual save.</p>');
  }
 }
 d=data(a);
 if(isHybrid(d)&&has(d,'vigor')){const live=liveOf(a);if((Number(hp(live)?.temp)||0)<5)await live.update({'system.attributes.hp.temp':5},{sbsLycan:true});}
 if(d.state.feral){
  await chat(a,'<p><b>Feral turn:</b> pursue the closest sensed creature, prioritizing Bloodied creatures. Dash if needed. Use Claw for the compulsory Attack action. If a damaged creature survives, direct further attacks that turn at it. No equipment or class features.</p>');
  const h=hp(liveOf(a));if(h&&h.value>=h.max)await recovery(a);
 }
}
function guardActivity(activity) {
 const item=activity?.item,a=activity?.actor;if(!supported(a))return;
 const root=rootOf(a),d=data(root),r=role(item),action=item.getFlag(ID,'action');
 if(r==='controller'){
  panel(root);return false;
 }
 if(r==='formAction'&&['focus','grapple'].includes(action)){
  const t=targetActor();if(!t){ui.notifications.warn('Target exactly one creature first.');return false;}
  request(action,root,{uuid:t.uuid}).catch(notifyError);return false;
 }
 if(d.state.form==='normal')return;
 if(item.type==='spell'&&!affinity(d)){ui.notifications.warn('This form cannot cast spells.');return false;}
 if(d.state.feral&&!['attack','formAction','controller'].includes(r)){ui.notifications.warn('Feral: equipment and class features cannot be used.');return false;}
}
function header(app,html) {
 const a=app.actor??app.document??app.object;if(!supported(a)||!owned(a))return;
 if(!game.user.isGM&&!raw(rootOf(a)))return;
 const el=html instanceof HTMLElement?html:html?.[0]??app.element;
 const shell=el?.closest?.('.window-app,.application')??el;
 const bar=shell?.querySelector?.('.window-header');if(!bar||bar.querySelector('[data-sbs-lycan-header]'))return;
 const button=document.createElement('button');button.type='button';button.dataset.sbsLycanHeader='';button.className='header-control';button.title='SBS Lycanthropy';button.innerHTML='<i class="fas fa-moon"></i>';button.addEventListener('click',()=>game.user.isGM?manager(rootOf(a)):panel(rootOf(a)));bar.append(button);
}
async function ready() {
 game.socket.on(`module.${ID}`,m=>socketMessage(m).catch(notifyError));
 game.modules.get(ID).api={openManager:manager,open:panel,choose:a=>choicePrompt(a,{gm:game.user.isGM}),images:imagesDialog,request,
  creatureTypes:a=>[a.system.details?.type?.value??a.system.details?.race,...(stage(data(rootOf(a)))?['monstrosity']:[])].filter(Boolean),version:VERSION};
 if(primary()){
  let macro=game.macros.find(m=>m.getFlag(ID,'launcher'));
  if(!macro)macro=await Macro.create({name:'SBS — Lycanthropy',type:'script',img:ICON,command:`game.modules.get('${ID}').api.openManager();`,flags:{[ID]:{launcher:true}},ownership:{default:CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER}});
  for(const a of allActors())if(raw(a)&&!a.getFlag(ID,'root'))await queue(a,async()=>{await sync(a,data(a));await tick(a);const d=data(a);if(isHybrid(d)){await rememberImages(a,d);await write(a,d);await setImages(a,d,'hybrid');}}).catch(notifyError);
 }
 for(const a of allActors()){
  const h=hp(a);hpCache.set(a.uuid,{value:h.value,max:h.max,temp:h.temp});
  if(raw(a)&&!a.getFlag(ID,'root'))choicePrompt(a);
 }
}
Hooks.once('init',()=>{
 // Retire the old session macro's hooks if it ran before the module loaded.
 for(const [event,id] of globalThis.SBS_LYCANTHROPY?.hooks??[])Hooks.off(event,id);
 globalThis.SBS_LYCANTHROPY=undefined;
 game.settings.register(ID,'dawnHour',{name:'Dawn hour (world time)',hint:'Used for Ultimate Predator. The GM Dawn control supports custom calendars.',scope:'world',config:true,type:Number,range:{min:0,max:23,step:1},default:6});
 class ManagerMenu extends FormApplication {render(){manager();return this;}}
 game.settings.registerMenu(ID,'manager',{name:'Lycanthropy manager',label:'Manage Lycanthropy',hint:'Grant stages, let players choose boons, and manage forms.',icon:'fas fa-moon',type:ManagerMenu,restricted:true});
});
Hooks.once('ready',()=>ready().catch(notifyError));
Hooks.on('dnd5e.preUseActivity',guardActivity);
Hooks.on('dnd5e.preBeginConcentrating',a=>{const d=data(rootOf(a));if(d.state.form!=='normal'&&!affinity(d)){ui.notifications.warn('This form cannot concentrate.');return false;}});
Hooks.on('preCreateActiveEffect',(effect,source)=>{
 const a=effect.parent;if(!supported(a))return;const d=data(rootOf(a));
 if(isHybrid(d)&&has(d,'savagery')&&(source.statuses??[]).some(s=>['charmed','frightened'].includes(s))){ui.notifications.warn('Shapeshifter’s Savagery grants immunity to this condition.');return false;}
});
Hooks.on('dnd5e.preRollAbilityCheck',c=>abilityRoll(c));
Hooks.on('dnd5e.preRollSavingThrow',c=>abilityRoll(c,true));
Hooks.on('dnd5e.preRollSkill',c=>{const a=c.subject;if(!supported(a))return;const ability=c.ability??a.system.skills?.[c.skill]?.ability;if(ability==='int'&&stage(data(rootOf(a)))>=3)modifier(c,'disadvantage');if(ability==='wis'&&auraAdvantage(a))modifier(c,'advantage');});
Hooks.on('dnd5e.preRollToolCheck',c=>{const a=c.subject;if(supported(a)&&(c.ability??a.system.tools?.[c.tool]?.ability)==='int'&&stage(data(rootOf(a)))>=3)modifier(c,'disadvantage');});
Hooks.on('dnd5e.preRollAttack',attackRoll);
Hooks.on('dnd5e.preRollDamage',conditionalDamage);
Hooks.on('dnd5e.calculateDamage',physicalDamage);
Hooks.on('dnd5e.transformActorV2',(host,source,target)=>{
 const d=data(host);if(d.state.form!=='kindred'||!stage(d))return;
 target.img=host.img; // Never replace the character's sheet portrait.
 target.flags[ID]??={};target.flags[ID].root=host.uuid;target.flags[ID].data=d;
 if(d.config.images.kindred.token){Object.assign(target.prototypeToken.texture,{src:d.config.images.kindred.token});if(target.prototypeToken.ring?.subject)target.prototypeToken.ring.subject.texture=d.config.images.kindred.token;target.prototypeToken.randomImg=false;}
 target.effects=target.effects.filter(e=>!e.flags?.[ID]);
 target.items=target.items.filter(i=>!i.flags?.[ID]);
});
Hooks.on('updateActor',(a,changes,options)=>{
 if(!supported(a))return;const h=hp(a),old=hpCache.get(a.uuid);hpCache.set(a.uuid,{value:h.value,max:h.max,temp:h.temp});
 const root=rootOf(a);if(!raw(root))return;
 if(eligibleUser(root)?.id===game.user.id&&pending(data(root)))setTimeout(()=>choicePrompt(root),0);
 if(!primary()||options?.sbsLycan)return;
 const d=data(root);
 const hpChanged=Object.keys(changes).some(k=>k.startsWith('system.attributes.hp'))||foundry.utils.hasProperty(changes,'system.attributes.hp');
 if(hpChanged&&old){
  if(d.state.form==='kindred'&&Number(old.temp)>0&&Number(h.temp)<=0){queue(root,()=>revert(root,{force:true,reason:'Animal-form temporary HP exhausted.'})).catch(notifyError);return;}
  if(stage(d)&&crossedBloodied(old,h)&&!d.state.huntUsed)queue(root,()=>hunt(root)).catch(notifyError);
 }
});
Hooks.on('updateItem',(item,changes)=>{
 const a=item.actor;if(!primary()||!supported(a)||!raw(rootOf(a))||item.type!=='class')return;
 queue(rootOf(a),()=>sync(rootOf(a),data(rootOf(a)))).catch(notifyError);
});
Hooks.on('dnd5e.restCompleted',(a,result,config)=>{
 if(!primary()||!supported(a)||!raw(rootOf(a)))return;
 queue(rootOf(a),async()=>{const root=rootOf(a),d=data(root);d.state.huntUsed=false;if(result?.longRest||result?.type==='long'||config?.type==='long'||config?.longRest)d.state.predatorImmune=false;await write(root,d);}).catch(notifyError);
});
Hooks.on('updateCombat',(combat,changes)=>{
 if(!primary()||!('turn'in changes||'round'in changes))return;const a=combat.combatant?.actor;
 if(supported(a)&&raw(rootOf(a)))queue(rootOf(a),()=>startTurn(a)).catch(notifyError);
});
Hooks.on('updateWorldTime',()=>{if(primary())for(const a of allActors())if(raw(a)&&!a.getFlag(ID,'root'))queue(a,()=>tick(a)).catch(notifyError);});
Hooks.on('createToken',token=>{
 if(!primary()||!supported(token.actor)||!token.actorLink)return;
 const a=token.actor,d=data(a);if(!isHybrid(d))return;
 queue(a,async()=>{const fresh=data(a);fresh.state.images??={prototype:a.prototypeToken.texture.src,tokens:[]};if(!fresh.state.images.tokens.some(i=>i.uuid===token.uuid))fresh.state.images.tokens.push({uuid:token.uuid,src:fresh.state.images.prototype??token.texture.src,ringSubject:fresh.state.images.prototypeRingSubject??null});await write(a,fresh);await setImages(a,fresh,'hybrid');}).catch(notifyError);
});
Hooks.on('renderActorSheet',header);
Hooks.on('renderActorSheetV2',header);
Hooks.on('renderApplicationV2',(app,html)=>{if(app.document?.documentName==='Actor')header(app,html);});

// Pure helpers and bounded adapters exposed for the packaged regression suite.
export const testing={effectRows,physicalDamage,abilityRoll,conditionalDamage,guardActivity,header,choicePrompt,imagesDialog,normalize,stage,has,rememberImages,setImages,restoreImages,execute,transform,revert,sync,manager,panel};
