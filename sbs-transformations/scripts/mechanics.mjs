import {ID,selected,completed,ownsFeature,copy} from './engine.mjs';
export const HP=a=>a?.system?.attributes?.hp;
export const supported=a=>['character','npc'].includes(a?.type)&&!!HP(a)&&!!a?.system?.abilities;
export function actorContext(a){return{spellSlots:Object.values(a.system.spells??{}).some(s=>(Number(s.max)||Number(s.override)||0)>0),cantrip:a.items.some(i=>i.type==='spell'&&Number(i.system.level)===0)};}
export function variables(a,t,r){return{stage:completed(t,r),prof:Number(a.system.attributes.prof)||2,level:Number(a.system.details?.level)||Object.values(a.classes??{}).reduce((n,c)=>n+Number(c.system.levels||0),0),walk:Number(a.system.attributes.movement?.walk)||0,...Object.fromEntries(Object.entries(a.system.abilities).map(([id,v])=>[id,Number(v.mod)||0]))};}
export function expression(value,vars){
 let s=String(value).replace(/@([a-z]+)/g,(_,key)=>{if(!(key in vars))throw Error('Unknown formula variable: '+key);return String(vars[key]);});
 if(!/^[\d\s.+\-*/()%]+$/.test(s))throw Error('Only numeric arithmetic is allowed in effects.');
 // Foundry's sandboxed arithmetic evaluator; Node regression tests supply the same restricted arithmetic contract.
 const n=foundry.utils?.isNumeric?.(s)?Number(s):Roll.safeEval(s);if(!Number.isFinite(n))throw Error('Effect formula is not finite.');return n;
}
export function diceFormula(value,vars){
 let s=String(value).replace(/@([a-z]+)/g,(_,key)=>String(vars[key]??0));
 s=s.replace(/\(([-+*/\d\s.]+)\)d(\d+)/g,(_,n,die)=>Math.max(0,Math.floor(expression(n,vars)))+'d'+die).replace(/(\d+)\s+d/g,'$1d');
 if(!/^[\d\sd.+\-*/()%]+$/i.test(s))throw Error('Invalid dice formula.');return s;
}
export function rollFormula(value,vars){
 diceFormula(value,vars); // Validate the authored formula before preserving native roll-data references.
 let text=String(value).replace(/@([a-z]+)\s*d(\d+)/g,(_,key,die)=>String(vars[key]??0)+'d'+die);
 text=text.replace(/@(stage|level)/g,(_,key)=>String(vars[key])).replace(/\(([-+*/\d\s.]+)\)d(\d+)/g,(_,n,die)=>Math.max(0,Math.floor(expression(n,vars)))+'d'+die);
 return text.replace(/@([a-z]+)/g,(_,key)=>['str','dex','con','int','wis','cha'].includes(key)?'@abilities.'+key+'.mod':key==='prof'?'@attributes.prof':key==='walk'?'@attributes.movement.walk':String(vars[key]??0));
}
export const active=(r,key,time=game.time.worldTime)=>!!r.state.active?.[key]&&(!r.state.active[key].until||r.state.active[key].until>time);
export function when(r,s){return!s||s==='always'||r.state.mode===s||active(r,s);}
function answerValue(f,r,key){if(/^skills[01]$/.test(key))return r.answers[f.id]?.skills?.[Number(key.at(-1))];return r.answers[f.id]?.[key];}
export function passiveChanges(a,t,r){
 const M=CONST.ACTIVE_EFFECT_MODES,v=variables(a,t,r),out=[],capped=new Map();
 for(const f of selected(t,r))for(const effect of f.effects??[]){
  if(!when(r,effect.when))continue;
  let key=effect.key.replace(/\$([A-Za-z0-9]+)/g,(_,k)=>answerValue(f,r,k)??'');let value=effect.value;
  if(key.includes('..'))continue;
  if(String(value).startsWith('$'))value=answerValue(f,r,String(value).slice(1));if(value==null)continue;
  let mode=effect.mode;
  if(value==='expertise'){const raw=foundry.utils.getProperty(a._source,key)??0;value=Number(raw)>=1?2:1;mode=M.UPGRADE;}
  else if(value==='swim-plus'){const raw=Number(a._source?.system?.attributes?.movement?.swim)||0;value=raw?raw+10:v.walk;mode=M.UPGRADE;}
  else if(!key.startsWith('system.traits.')||key.includes('size')){
   value=expression(value,v);
   if(effect.cap){const raw=capped.get(key)??(Number(foundry.utils.getProperty(a._source,key))||0);value=Math.max(0,Math.min(value,Number(effect.cap)-raw));capped.set(key,raw+value);}
  }
  out.push({key,mode,value:String(value),priority:80});
 }
 const names=new Set(selected(t,r).map(f=>f.name)),add=(key,value,mode=M.ADD)=>out.push({key:'system.'+key,value:String(value),mode,priority:85});
 const has=n=>names.has(n);
 const externalResistance=type=>new Set(a._source?.system?.traits?.dr?.value??[]).has(type)||a.effects.some(e=>!e.disabled&&!e.isSuppressed&&e.getFlag(ID,'record')!==r.id&&(e.changes??[]).some(c=>c.key==='system.traits.dr.value'&&String(c.value).split(/[;,]/).includes(type)));
 if(r.state.unstable?.id==='half-hp')add('attributes.hp.max',Math.max(1,Math.floor(r.state.unstable.baseHP/2)),M.OVERRIDE);
 if(r.state.unstable?.id==='slow')for(const mode of ['walk','fly','swim','climb','burrow'])add('attributes.movement.'+mode,Math.max(0,(Number(a._source?.system?.attributes?.movement?.[mode])||0)-15),M.OVERRIDE);
 if(r.state.unstable?.id==='speed')add('attributes.movement.walk',5);
 if(has('Bestial Vigor'))add(a.type==='character'&&a._source?.system?.attributes?.hp?.max==null?'attributes.hp.bonuses.overall':'attributes.hp.max',v.level);
 for(const name of ['Spectral Form','Grave-Touched Soul'])if(has(name))add(externalResistance('necrotic')?'traits.di.value':'traits.dr.value','necrotic');
 if(has('Abyssal Resistance')){const chosen=r.answers[t.id+':fiendish-soul']?.resistance;for(const type of ['acid','cold','fire'])add(type===chosen?'traits.di.value':'traits.dr.value',type);}
 if(has('Primeval Body')){const type=r.answers[t.id+':primeval-body']?.resistance;if(type)add(externalResistance(type)?'traits.di.value':'traits.dr.value',type);}
 if(has('Hag Form')&&!wearingArmor(a)){add('attributes.ac.calc','custom',M.OVERRIDE);add('attributes.ac.formula','13 + @abilities.dex.mod',M.OVERRIDE);}
 if(has('Shadowsteel Absorption')&&!wearingArmor(a))add('attributes.ac.bonus',1);
 for(const name of ['Elemental Affinity','Dual Nature','Master of Many'])if(has(name)){const f=t.features.find(f=>f.name===name),e=r.answers[f.id]?.element;const type={air:'lightning',earth:'bludgeoning',fire:'fire',water:'cold'}[e];if(type)add('traits.dr.value',type);}
 if(has('Elemental Mastery'))for(const type of ['lightning','bludgeoning','fire','cold'])add('traits.dr.value',type);
 if(has('Seasonally Affected')){const court=selected(t,r).find(f=>/^Servant of the/.test(f.name))?.name;const type=court?.includes('Spring')?'necrotic':court?.includes('Summer')?'cold':court?.includes('Autumn')?'radiant':'fire';add('traits.dv.value',type);}
 if(active(r,'shell')&&!heavyArmor(a)){add('attributes.ac.bonus',2);add('attributes.movement.walk',-10);}
 if(active(r,'slime'))for(const type of ['acid','cold','fire'])add('traits.dr.value',type);
 if(active(r,'incorporeal'))for(const type of Object.keys(CONFIG.DND5E.damageTypes))if(type!=='force')add('traits.dr.value',type);
 if(active(r,'celestial-bow'))add(has('Bow of Celestial Domination')?'traits.di.value':'traits.dr.value','necrotic');
 return out;
}
export const wearingArmor=a=>a.items.some(i=>i.type==='equipment'&&i.system.equipped&&['light','medium','heavy'].includes(i.system.armor?.type??i.system.type?.value));
export const heavyArmor=a=>a.items.some(i=>i.type==='equipment'&&i.system.equipped&&(i.system.armor?.type??i.system.type?.value)==='heavy');
export function stableID(text){let h=2166136261;for(const c of text){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return('sbs'+(h>>>0).toString(36)).padEnd(16,'0').slice(0,16);}
export const cleanText=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const part=(formula,type)=>({number:0,denomination:0,bonus:'',types:type?[type]:[],custom:{enabled:true,formula}});
function damageType(value,t,r){if(value==='$soulResistance')return r.answers[t.id+':fiendish-soul']?.resistance??'fire';return value;}
export function nativeItem(a,t,r,f){
 const vars=variables(a,t,r),acts={},effects=[],actionMap={},names=new Set(selected(t,r).map(f=>f.name));const has=n=>names.has(n);
 const row={name:t.name+' — '+f.name,type:'feat',img:`modules/${ID}/assets/transforming-slug.png`,flags:{[ID]:{role:'feature',record:r.id,feature:f.id,actionMap}},effects,system:{description:{value:`<p><b>${f.kind==='flaw'?'Flaw':'Boon'} · Stage ${f.stage}</b></p><p>${cleanText(f.summary)}</p><p><b>Coverage: ${cleanText(f.coverage??'manual')}</b>. Native rolls/counters/effects are provided where configured; narrative or secondary effects listed below require confirmation.</p><p>${cleanText(f.manual??'')}</p>${(f.actions??[]).filter(a=>a.notes).map(a=>'<p><b>'+cleanText(a.name)+':</b> '+cleanText(a.notes)+'</p>').join('')}`},activities:acts}};
 if(f.uses)row.system.uses={max:String(Math.max(0,expression(f.uses.max,vars))),spent:0,recovery:[{period:f.uses.recovery,type:'recoverAll'}]};
 for(const rawAction of f.actions??[]){
  const action=copy(rawAction);
  if(f.name==='Fanged Bite'&&action.id==='bite-blood-drain')action.formula=has('Final Soman Bloodline')?'3d8':has('Soman Bloodline')?'1d8':'1d6';
  if(f.name==='Fzeg Bloodline'&&has('Final Fzeg Bloodline')&&action.kind==='attack')action.formula='3d6';
  if(f.name==='Elemental Surge'){const element={'lightning-strike':'air','earth-shard':'earth','flame-wave':'fire','aquatic-rejuvenation':'water'}[action.id];if(element&&!['Elemental Affinity','Dual Nature','Master of Many'].some(n=>{const f=t.features.find(f=>f.name===n);return f&&r.answers[f.id]?.element===element;}))continue;}
  if(action.when&&!when(r,action.when))continue;
  const id=stableID(f.id+':'+action.id);actionMap[id]=action;
  const common={name:action.name,activation:{type:action.activation??'action',value:1},range:{override:true,value:action.range??5,units:'ft'},target:{affects:{type:'creature',count:'1'}}};
  if(f.uses&&!f.actions.some(ac=>ac.kind==='toggle')&&!['form','toggle','reference','spell'].includes(action.kind)&&!(f.name.startsWith('Adept of the ')&&action.kind==='attack'))common.consumption={targets:[{type:'itemUses',target:'',value:'1'}]};
  const formula=action.formula?rollFormula(action.formula,vars):'',dtype=damageType(action.damageType,t,r);
  if(action.kind==='attack'){
   const ability=action.ability??'str',modifier=ability==='best'?'max(@abilities.str.mod, @abilities.dex.mod)':'@abilities.'+ability+'.mod';
   acts[id]={...common,type:'attack',attack:{flat:true,bonus:'@attributes.prof + '+modifier,ability:'none',type:{value:(action.range??5)>5?'ranged':'melee',classification:'weapon'}},damage:{includeBase:false,parts:[part(formula+' + '+modifier,dtype)]}};
  }else if(action.kind==='save'){
   const condition=action.condition==='$courtCondition'?courtCondition(t,r):action.condition;
   let ids=[];if(condition){const eid=stableID(f.id+':'+action.id+':effect');effects.push({_id:eid,name:condition,img:'icons/svg/aura.svg',transfer:false,statuses:[condition],duration:{seconds:action.duration??60},changes:[],flags:{[ID]:{record:r.id,feature:f.id}}});ids=[{_id:eid,onSave:false}];}
   acts[id]={...common,type:'save',save:{ability:[action.save],dc:{calculation:'',formula:rollFormula(action.dc??'8+@prof+@stage',vars)}},damage:{parts:formula?[part(formula,dtype)]:[],onSave:action.onSave??'half'},effects:ids};
  }else if(action.kind==='damage')acts[id]={...common,type:'damage',damage:{parts:[part(formula,dtype)]}};
  else if(action.kind==='heal'||action.kind==='temphp')acts[id]={...common,type:'heal',healing:part(formula,action.kind==='temphp'?'temphp':'healing')};
  else acts[id]={...common,type:'utility'};
 }
 if(!Object.keys(acts).length){const id=stableID(f.id+':reference');acts[id]={type:'utility',name:'View rule / resolve',activation:{type:'special',value:1}};actionMap[id]={kind:'reference',name:'View rule'};}
 return row;
}
export function courtCondition(t,r){const n=selected(t,r).find(f=>/^Servant of the/.test(f.name))?.name??'';return n.includes('Spring')?'stunned':n.includes('Summer')?'charmed':n.includes('Autumn')?'poisoned':'frightened';}
export function naturalAttacks(a,t,r){
 const v=variables(a,t,r),fs=selected(t,r),has=n=>fs.some(f=>f.name===n),rows=[];
 function add(name,formula,type='slashing',bonus=true){rows.push({id:t.id+':natural-'+name.toLowerCase(),type:t.id,name,kind:'boon',stage:completed(t,r),summary:'Manifested natural attack. Use the action economy and restrictions of its parent feature; this is not an Unarmed Strike.',coverage:'assisted',actions:[{id:'attack',name,kind:'attack',ability:'best',formula,damageType:type,activation:'action'},...(bonus?[{id:'bonus',name:name+' (Bonus Action when permitted)',kind:'attack',ability:'best',formula,damageType:type,activation:'bonus'}]:[])]});}
 if((t.baseType??r.type)==='lycanthrope'&&r.state.mode==='hybrid'){const type=fs.find(f=>/^Hybrid (Wolf|Bear|Rat) Form$/.test(f.name))?.name??'';const damage=type.includes('Rat')?'1d6':'1d8';const extra=has("Shapeshifter's Savagery")?' + 1d8':'';add('Claw',damage+extra,'slashing',!type.includes('Bear'));if(!type.includes('Bear'))add('Bite',damage+extra);}
 if(active(r,'fey-claws'))add('Manifested Claw','1d6');
 if(active(r,'limbs'))add('Eldritch Limb',has('Efficient Killer')?'2d8':'1d8');
 return rows.map(f=>nativeItem(a,t,r,f));
}
