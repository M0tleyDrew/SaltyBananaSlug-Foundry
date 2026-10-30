export const ID='sbs-transformations';
export const VERSION='0.1.3';
export const SCHEMA=1;
export const copy=x=>structuredClone(x);
export const blank=()=>({schema:SCHEMA,records:[],history:[],migration:null});
export const fresh=(id,type)=>({id,type,granted:1,stages:{},answers:{},state:{mode:'normal',active:{},uses:{},restSerial:0,longRestSerial:0,marks:{},sunlight:false,uninvited:false,fullMoon:false,feral:false,senses:{bloodied:false,unconscious:false},lockUntil:0,lastFed:0,soul:{charged:false,cr:0},notes:''},images:{},disabled:false});
export const definition=(catalog,type)=>catalog.find(t=>t.id===type);
export const feature=(t,id)=>t.features.find(f=>f.id===id);
export function completed(t,r){let stage=0;for(let n=1;n<=r.granted;n++){if(!r.stages[n])break;stage=n;}return stage;}
export function selected(t,r,{includeDisabled=false}={}){
 if(r.disabled&&!includeDisabled)return [];
 const out=[];for(let s=1;s<=completed(t,r);s++){const def=t.stages[s-1];for(const id of [...def.grants,...(r.stages[s]?.boons??[]),...def.flaws]){const f=feature(t,id);if(f)out.push(f);}}
 if((t.baseType??r.type)==='fiend')for(const id of r.state.activeGifts??[]){const f=feature(t,id);if(f&&f.kind==='gift'&&f.stage<=completed(t,r)&&(r.state.contracts??[]).includes(id))out.push(f);}
 const replaced=new Set(out.flatMap(f=>f.replaces??[]));return out.filter(f=>!replaced.has(f.id));
}
export const ownsFeature=(t,r,id)=>selected(t,r).some(f=>f.id===id);
export const pending=(t,r)=>completed(t,r)<r.granted?completed(t,r)+1:null;
export function eligible(t,r,s,id,context={}){
 const stage=t.stages[s-1],f=feature(t,id);
 if(!stage||!f||f.type!==t.id||f.kind!=='boon'||f.stage!==s||!stage.boons.includes(id))return false;
 const owned=new Set([...selected(t,r).map(f=>f.id),...stage.grants]);
 if(!(f.requires??[]).every(id=>owned.has(id)))return false;
 if(f.gate==='slots'&&!context.spellSlots)return false;
 if(f.gate==='cantrip'&&!context.cantrip)return false;
 return true;
}
export function validateAnswers(t,r,ids,answers={}){
 const clean={};
 const selectedIds=new Set([...selected(t,r).map(f=>f.id),...ids]);
 for(const [id,values] of Object.entries(answers))if(!ids.includes(id))throw Error('Selections contain an unrelated feature.');
 for(const id of ids){const f=feature(t,id);if(!f||f.type!==t.id)throw Error('Feature does not belong to this transformation.');
  const values=answers[id]??r.answers[id]??{};clean[id]={};
  for(const key of Object.keys(values))if(!(f.choices??[]).some(c=>c.key===key))throw Error('Unknown feature selection.');
  for(const c of f.choices??[]){
   const raw=values[c.key],list=Array.isArray(raw)?raw:raw==null||raw===''?[]:[raw];
   if(list.length!==(c.count??1)||new Set(list).size!==list.length)throw Error(`${f.name}: choose ${c.count??1} ${c.label}.`);
   const valid=new Set(c.options.map(o=>typeof o==='string'?o:o.id));if(list.some(x=>!valid.has(x)))throw Error(`${f.name}: invalid ${c.label}.`);
   if(c.uniqueGroup){for(const otherId of selectedIds){if(otherId===id)continue;const other=feature(t,otherId);for(const oc of other?.choices??[]){if(oc.uniqueGroup!==c.uniqueGroup)continue;const v=clean[otherId]?.[oc.key]??answers[otherId]?.[oc.key]??r.answers[otherId]?.[oc.key];const previous=Array.isArray(v)?v:v?[v]:[];if(list.some(x=>previous.includes(x)))throw Error('Choose a different element; that affinity is already selected.');}}}
   clean[id][c.key]=(c.count??1)===1?list[0]:list;
  }
 }
 return clean;
}
export function acceptStage(t,r,{stage,boons,answers},context={}){
 if(stage!==pending(t,r))throw Error('That stage is not pending.');
 const def=t.stages[stage-1];if(!Array.isArray(boons)||boons.length!==def.choose||new Set(boons).size!==boons.length)throw Error(`Choose exactly ${def.choose} boon(s) for this stage.`);
 if(boons.some(id=>!eligible(t,r,stage,id,context)))throw Error('A boon is from the wrong transformation/stage or has unmet prerequisites.');
 const ids=[...def.grants,...boons,...def.flaws];const clean=validateAnswers(t,r,ids,answers);
 const next=copy(r);next.stages[stage]={boons:[...boons]};next.answers={...next.answers,...clean};return next;
}
export function setStage(t,r,n){
 if(!Number.isInteger(n)||n<1||n>4)throw Error('Choose a stage from 1 through 4.');
 const next=copy(r);next.granted=n;for(const s of Object.keys(next.stages))if(Number(s)>n)delete next.stages[s];
 const allowed=new Set(selected(t,next,{includeDisabled:true}).map(f=>f.id));for(const id of Object.keys(next.answers))if(!allowed.has(id))delete next.answers[id];return next;
}
export function resetFrom(t,r,n){const next=copy(r);for(const s of Object.keys(next.stages))if(Number(s)>=n)delete next.stages[s];const allowed=new Set(selected(t,next,{includeDisabled:true}).map(f=>f.id));for(const id of Object.keys(next.answers))if(!allowed.has(id))delete next.answers[id];return next;}
export function validateCatalog(catalog){
 if(!Array.isArray(catalog)||!catalog.length||catalog.length>80)throw Error('Invalid transformation catalog.');
 const typeIds=new Set();
 for(const t of catalog){
  if(!/^[a-z0-9-]{1,64}$/.test(t.id)||typeIds.has(t.id))throw Error('Invalid or duplicate transformation ID.');typeIds.add(t.id);
  if(!t.name||!Array.isArray(t.features)||t.features.length>300||!Array.isArray(t.stages)||t.stages.length!==4)throw Error('Each transformation needs a name, features, and four stages.');
  const ids=new Set();for(const f of t.features){if(f.type!==t.id||!f.id.startsWith(t.id+':')||ids.has(f.id))throw Error('Foreign or duplicate feature in transformation.');ids.add(f.id);if(!['boon','flaw','gift'].includes(f.kind)||!Number.isInteger(f.stage)||f.stage<1||f.stage>4)throw Error('Invalid feature stage/kind.');
   for(const e of f.effects??[])if(!/^system\.(abilities|attributes|traits|skills|bonuses|spells|details|tools)\./.test(e.key)||![1,2,3,4,5].includes(e.mode))throw Error('Unsupported effect key/mode.');
   if((f.actions??[]).some(a=>!a.id||!['attack','save','damage','heal','temphp','form','toggle','spell','reference'].includes(a.kind)))throw Error('Unsupported action descriptor.');
   if(new Set((f.actions??[]).map(a=>a.id)).size!==(f.actions??[]).length)throw Error('Duplicate action ID.');
   if((f.effects??[]).some(e=>e.cap!=null&&(!Number.isFinite(e.cap)||e.cap<1)))throw Error('Invalid effect cap.');
   if((f.choices??[]).some(c=>!c.key||!Array.isArray(c.options)||!c.options.length))throw Error('Invalid feature choices.');
  }
  t.stages.forEach((s,i)=>{
   if(s.stage!==i+1||!Number.isInteger(s.choose)||s.choose<0||s.choose>10)throw Error('Invalid stage selection count.');
   for(const [pool,kind]of [[s.grants,'boon'],[s.boons,'boon'],[s.flaws,'flaw']]){
    if(!Array.isArray(pool)||new Set(pool).size!==pool.length)throw Error('Invalid or duplicate stage pool.');
    for(const id of pool){const f=feature(t,id);if(!f||f.stage!==i+1||f.kind!==kind)throw Error('Stage references a foreign, incorrect-stage, or incorrect-kind feature.');}
   }
   if(s.grants.some(id=>s.boons.includes(id)))throw Error('Automatic grants cannot also be chosen.');
   if(s.choose>s.boons.length)throw Error('Not enough choices in this stage.');
  });
  for(const f of t.features){for(const id of [...(f.requires??[]),...(f.replaces??[])])if(!ids.has(id))throw Error('A prerequisite or replacement references another transformation.');}
 }
 return true;
}
export function validateGiftSelection(t,r,ids,{rest='long'}={}){
 if((t.baseType??t.id)!=='fiend'||!ownsFeature(t,r,t.id+':devilish-contractor'))throw Error('Only Fiends with Devilish Contractor can select Gifts.');
 const max=ownsFeature(t,r,t.id+':devilish-subcontractor')?2:1;
 if(!Array.isArray(ids)||ids.length>max||new Set(ids).size!==ids.length)throw Error(`At most ${max} gift(s) may be active.`);
 if(ids.some(id=>{const f=feature(t,id);return !f||f.kind!=='gift'||f.stage>completed(t,r)||!(r.state.contracts??[]).includes(id);}))throw Error('Gift must be contracted, unlocked, and belong to this Fiend.');
 if(rest==='short'&&!ownsFeature(t,r,t.id+':enhanced-contract'))throw Error('A long rest is required to switch gifts.');return true;
}
export const isBloodied=h=>!!h&&Number(h.max)>0&&Number(h.value)<=Number(h.max)/2;
export const crossedBloodied=(old,h)=>!!old&&!isBloodied(old)&&isBloodied(h);
export function history(d,event){d.history.push({...event,at:Date.now()});d.history=d.history.slice(-100);}
export const dawn=(time,hour=6)=>{const n=Math.floor(time/86400)*86400+hour*3600;return n>time?n:n+86400;};
