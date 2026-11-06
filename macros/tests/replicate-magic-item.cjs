const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const raw=fs.readFileSync(require('path').join(__dirname,'../character/replicate-magic-item.js'),'utf8');
function fixture(level=6,armorer=false){
 const docs=new Map(),queue=[],notes=[];let id=0;
 const cp=o=>o===undefined?undefined:structuredClone(o);
 const get=(o,p)=>p.split('.').reduce((o,k)=>o?.[k],o);
 const set=(o,p,v)=>{let ks=p.split('.'),k=ks.pop();for(let n of ks)o=o[n]??={};o[k]=v;};
 class Doc {
  constructor(data,parent){this._source=cp(data);this.id=data._id??`x${++id}`;this._source._id=this.id;this.parent=parent;this.uuid=parent?`${parent.uuid}.Item.${this.id}`:`Item.${this.id}`;this.isOwner=true;this.documentName='Item';docs.set(this.uuid,this);}
  get name(){return this._source.name}get type(){return this._source.type}get system(){return this._source.system??{}}getFlag(n,k){return get(this._source,`flags.${n}.${k}`)}
  async setFlag(n,k,v){set(this._source,`flags.${n}.${k}`,cp(v));}toObject(){return cp(this._source)}testUserPermission(){return true}
  async update(data){for(let[k,v]of Object.entries(data))set(this._source,k,cp(v));return this;}
 }
 const a=new Doc({name:'Artificer',type:'character',system:{attributes:{hp:{value:0,max:100}},spells:{spell1:{value:4,max:4},spell2:{value:2,max:2}}}});
 a.uuid='Actor.artificer';a.items=[];a.createEmbeddedDocuments=async(_,rows)=>rows.map(r=>{let d=new Doc(r,a);a.items.push(d);return d;});
 a.deleteEmbeddedDocuments=async(_,ids)=>{for(let id of ids){const i=a.items.find(i=>i.id===id);if(i)docs.delete(i.uuid);}a.items=a.items.filter(i=>!ids.includes(i.id));};
 a.items.push(new Doc({name:'Artificer',type:'class',system:{levels:level,identifier:'artificer',source:{rules:'2024'}}},a));
 if(armorer)a.items.push(new Doc({name:'Armorer',type:'subclass',system:{}},a));
 const names=['Alchemy Jug','Bag of Holding','Cap of Water Breathing','Goggles of Night','Wand of Secrets','Boots of Elvenkind','Cloak of Elvenkind','Armor +1'];
 const items=names.map(name=>new Doc({name,type:name==='Bag of Holding'?'container':'equipment',system:{source:{rules:'2024'},rarity:'uncommon',type:{value:name==='Armor +1'?'heavy':'trinket'},description:{value:'Complete imported item.'},uses:{max:7,spent:2},quantity:1,attunement:name==='Cloak of Elvenkind'?'required':''}}));
 const context={console,FormData,Date,Map,Set,Error,Number,String,Math,globalThis:null,
  foundry:{utils:{deepClone:cp,randomID:()=>`r${++id}`,getProperty:get},applications:{api:{DialogV2:{wait:async cfg=>{assert(queue.length,`Unexpected dialog ${cfg.window.title}`);return queue.shift();}}}}},
  canvas:{tokens:{controlled:[{actor:a}]},scene:{tokens:[]}},game:{user:{id:'u',isGM:true,character:a},actors:[a],items,packs:[],time:{worldTime:100}},
  ui:{notifications:{warn:m=>notes.push(m),info:m=>notes.push(m),error:m=>notes.push(m)}},fromUuid:async u=>docs.get(u),Hooks:{on:()=>1},ChatMessage:{getSpeaker:()=>({})}};
 context.globalThis=context;vm.createContext(context);
 const marker='  try {\n    if(s.version!==1)';
 const source=raw.replace(marker,`  globalThis.test={a,get s(){return s},create,tinker,setup,replacements,capacity,family,wildcard,approve,cheatDeath,vanish,locate,counters,counter,save,expire,editPlans,syncSheet,restartSetup};return;\n${marker}`);
 const dialog=(action='ok',fields={})=>{let form=new FormData();for(let[k,v]of Object.entries(fields))for(let x of Array.isArray(v)?v:[v])form.append(k,x);queue.push({action,form});};
 return {a,items,context,docs,queue,dialog,notes,async init(){await vm.runInContext(`(async()=>{${source}})()`,context);const t=context.test;await t.counter('create','create',2+[6,10,14,18].filter(n=>level>=n).length+(armorer&&level>=9?1:0));await t.counter('drain','drain',1);await t.counter('transmute','transmute',1);return t;}};
}
(async()=>{
 let f=fixture(),t=await f.init();
 for(let i=0;i<5;i++)f.dialog('ok',{uuid:f.items[i].uuid});assert(await t.setup());assert.equal(t.s.plans.length,5);
 const bag=t.s.plans.find(p=>p.name==='Bag of Holding');
 f.dialog('ok',{key:bag.key});f.dialog('ok',{legal:'on'});await t.create();
 assert.equal(t.s.ledger.length,1);assert.equal(t.counters.create.system.uses.spent,1);
 assert.equal(t.a.items.find(i=>i.getFlag('world','sbsReplicate')?.serial).system.uses.spent,0);
 f.dialog('ok',{key:bag.key});await assert.rejects(t.create(),/No unused known plan/);assert.equal(t.s.ledger.length,1);
 let e=t.s.ledger[0],item=await t.locate(e);await item.update({'system.uses.spent':4});
 f.dialog('ok',{serial:e.serial});f.dialog();f.dialog('ok',{slot:'2'});await t.tinker('charge');
 assert.equal(t.a.system.spells.spell2.value,1);assert.equal(item.system.uses.spent,2);
 f.dialog('ok',{serial:e.serial});f.dialog();await t.tinker('drain');
 assert.equal(t.s.ledger.length,0);assert.equal(t.a.system.spells.spell2.value,2);assert.equal(t.counters.drain.system.uses.spent,1);
 await assert.rejects(t.tinker('drain'),/already been used/);
 // Simulate native long-rest resource recovery, then replicate the same plan again.
 for(const i of Object.values(t.counters))await i.update({'system.uses.spent':0});
 f.dialog('ok',{key:bag.key});f.dialog('ok',{legal:'on'});await t.create();assert.equal(t.s.ledger.length,1);
 // Transmute preserves allowance, removes old item, does not grant immediate attunement.
 const cloak=f.items.find(i=>i.name==='Cloak of Elvenkind');t.s.plans.push({key:'cloakofelvenkind',name:cloak.name,uuid:cloak.uuid,armor:false,rarity:'uncommon',tier:6,slot:'normal'});
 e=t.s.ledger[0];const oldUuid=e.uuid;
 f.dialog('ok',{serial:e.serial});f.dialog();f.dialog('ok',{key:'cloakofelvenkind'});f.dialog('ok',{legal:'on',attune:'on'});await t.tinker('transmute');
 assert(!f.docs.has(oldUuid));assert.equal(t.s.ledger[0].name,'Cloak of Elvenkind');assert.equal((await t.locate(t.s.ledger[0])).system.attuned,false);assert.equal(t.counters.create.system.uses.spent,1);
 // Permission guard and container contents release.
 const transferred=await t.locate(t.s.ledger[0]);transferred.isOwner=false;await assert.rejects(t.locate(t.s.ledger[0]),/GM must/);transferred.isOwner=true;
 // Charge rollback when the second update fails must restore spell slot.
 let before=t.a.system.spells.spell1.value;const original=transferred.update.bind(transferred);let once=true;transferred.update=async data=>{if(once){once=false;throw Error('write failed')}return original(data)};
 await original({'system.uses.spent':2});f.dialog('ok',{serial:t.s.ledger[0].serial});f.dialog();f.dialog('ok',{slot:'1'});await assert.rejects(t.tinker('charge'),/write failed/);assert.equal(t.a.system.spells.spell1.value,before);
 // Oldest replacement and spilling contents from a disappearing Bag of Holding.
 f=fixture(2);t=await f.init();for(let i=0;i<4;i++)f.dialog('ok',{uuid:f.items[i].uuid});await t.setup();
 const plans=t.s.plans;
 for(let p of [plans[1],plans[0]]){f.dialog('ok',{key:p.key});f.dialog('ok',{legal:'on'});await t.create();}
 const oldest=t.s.ledger[0],bagDoc=await t.locate(oldest);const [child]=await t.a.createEmbeddedDocuments('Item',[{name:'Stored gem',type:'loot',system:{container:bagDoc.id}}]);
 await t.counters.create.update({'system.uses.spent':0});f.dialog('ok',{key:plans[2].key});f.dialog('ok',{legal:'on'});f.dialog();await t.create();assert(!f.docs.has(oldest.uuid));assert.equal(child.system.container,null);assert.equal(t.s.ledger.length,2);
 // Armorer gains an armor-only plan and one armor-only active allowance at 9.
 f=fixture(9,true);await f.items[7].update({name:'Shield +1','system.type.value':'shield'});t=await f.init();for(let i=0;i<5;i++)f.dialog('ok',{uuid:f.items[i].uuid});f.dialog('ok',{uuid:f.items[7].uuid});await t.setup();assert.equal(t.s.plans.length,6);assert(t.s.plans.some(p=>p.slot==='armor'&&p.armor));
 assert.throws(()=>t.capacity([{armor:false},{armor:false},{armor:false},{armor:false}]),/extra Armorer/);
 t.capacity([{armor:false},{armor:false},{armor:false},{armor:true}]);
 // Level-up replacement is processed once and destroys the replaced-plan item.
 f=fixture(7);t=await f.init();for(let i=0;i<5;i++)f.dialog('ok',{uuid:f.items[i].uuid});await t.setup();t.s.level=6;
 const first=t.s.plans[0];f.dialog('ok',{key:first.key});f.dialog('ok',{legal:'on'});await t.create();
 f.dialog('replace',{old:first.key});f.dialog('ok',{uuid:f.items[5].uuid});f.dialog();await t.replacements();assert.equal(t.s.level,7);assert.equal(t.s.ledger.length,0);assert(!t.s.plans.some(p=>p.key===first.key));await t.replacements();assert.equal(f.queue.length,0);
 // Level-20 Cheat Death, and delayed expiration of remaining items.
 f=fixture(20);t=await f.init();for(let i=0;i<8;i++)f.dialog('ok',{uuid:f.items[i].uuid});await t.setup();
 for(let p of t.s.plans.slice(0,3)){f.dialog('ok',{key:p.key});f.dialog('ok',{legal:'on'});await t.create();}
 f.dialog('ok',{legal:'on',item:t.s.ledger.slice(0,2).map(e=>e.serial)});await t.cheatDeath();assert.equal(t.a.system.attributes.hp.value,40);assert.equal(t.s.ledger.length,1);
 t.s.expires=99;await t.expire();assert.equal(t.s.ledger.length,0);assert.equal(t.s.expires,null);
 // Creation refuses attunement beyond the class capacity without consuming resources.
 f=fixture(6);t=await f.init();for(let i=0;i<5;i++)f.dialog('ok',{uuid:f.items[i].uuid});await t.setup();
 const cl=f.items.find(i=>i.name==='Cloak of Elvenkind');t.s.plans.push({key:'cloakofelvenkind',name:cl.name,uuid:cl.uuid,armor:false,rarity:'uncommon',tier:6,slot:'normal'});
 await t.a.createEmbeddedDocuments('Item',Array.from({length:3},(_,i)=>({name:`Attuned ${i}`,type:'equipment',system:{attuned:true}})));
 f.dialog('ok',{key:'cloakofelvenkind'});f.dialog('ok',{legal:'on',attune:'on'});await assert.rejects(t.create(),/attunement slots/);assert.equal(t.s.ledger.length,0);assert.equal(t.counters.create.system.uses.spent,0);
 // The native Features entry mirrors saved choices and stays unique across updates.
 let summaries=t.a.items.filter(i=>i.getFlag('world','sbsReplicate')?.summary);
 assert.equal(summaries.length,1);assert(summaries[0].system.description.value.includes('Alchemy Jug'));
 const priorSpent=t.counters.create.system.uses.spent;
 f.dialog('correct',{old:t.s.plans[0].key});f.dialog('ok',{uuid:f.items[5].uuid});f.dialog();await t.editPlans();
 assert(t.s.plans.some(p=>p.name==='Boots of Elvenkind'));assert.equal(t.counters.create.system.uses.spent,priorSpent);
 summaries=t.a.items.filter(i=>i.getFlag('world','sbsReplicate')?.summary);assert.equal(summaries.length,1);assert(summaries[0].system.description.value.includes('Boots of Elvenkind'));assert(!summaries[0].system.description.value.includes('Alchemy Jug'));
 // GM removal releases a plan slot but does not refund creation resources.
 const remove=t.s.plans[0];f.dialog('remove',{old:remove.key});f.dialog();await t.editPlans();assert(!t.s.plans.some(p=>p.key===remove.key));assert.equal(t.counters.create.system.uses.spent,priorSpent);
 // Players can review but cannot invoke the GM-only correction path.
 f.context.game.user.isGM=false;f.dialog('correct',{old:t.s.plans[0].key});await assert.rejects(t.editPlans(),/GM must/);
 // A confirmed GM restart removes tracked items and plans, never daily-resource use.
 f.context.game.user.isGM=true;const newPlan=t.s.plans[0];f.dialog('ok',{key:newPlan.key});f.dialog('ok',{legal:'on'});await t.create();const resetItemUuid=t.s.ledger[0].uuid;
 const restartSpent=t.counters.create.system.uses.spent;await t.counters.drain.update({'system.uses.spent':1});
 f.dialog('restart',{confirm:'RESTART'});f.queue.push(null);await t.restartSetup();
 assert.equal(t.s.plans.length,0);assert.equal(t.s.ledger.length,0);assert(!f.docs.has(resetItemUuid));assert.equal(t.counters.create.system.uses.spent,restartSpent);assert.equal(t.counters.drain.system.uses.spent,1);
 assert(t.a.items.some(i=>i.type==='class'));assert.equal(t.a.items.filter(i=>i.getFlag('world','sbsReplicate')?.summary).length,1);
 f.context.game.user.isGM=false;await assert.rejects(t.restartSetup(),/GM must/);
 console.log('PASS: setup; plan limits; creation; no duplicate plan per rest; charge and slot spending; drain and once/rest; long-rest recovery; transmute and attunement; permission guard; rollback; oldest item replacement; container release; Armorer bonus; one level-up replacement; Cheat Death; death expiry; attunement cap; sheet summary; GM correction/removal; player edit guard; GM restart; spent-resource preservation.');
})().catch(e=>{console.error(e);process.exitCode=1});
