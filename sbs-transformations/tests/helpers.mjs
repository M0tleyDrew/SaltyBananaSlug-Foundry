import fs from 'node:fs';
export const catalog=JSON.parse(fs.readFileSync(new URL('../data/catalog.json',import.meta.url)));
export const table=JSON.parse(fs.readFileSync(new URL('../data/unstable.json',import.meta.url)));
export const get=(o,p)=>p.split('.').reduce((v,k)=>v?.[k],o);
export function put(o,p,v){const keys=p.split('.');let x=o;for(const k of keys.slice(0,-1))x=x[k]??={};const last=keys.at(-1);if(last.startsWith('-='))delete x[last.slice(2)];else x[last]=structuredClone(v);}
export const context={spellSlots:true,cantrip:true};
export function answers(t,r,ids){const out={};const used=new Map();for(const f of t.features)for(const c of f.choices??[])if(c.uniqueGroup){const value=r.answers[f.id]?.[c.key];if(value){const xs=used.get(c.uniqueGroup)??new Set();for(const x of Array.isArray(value)?value:[value])xs.add(x);used.set(c.uniqueGroup,xs);}}
 for(const id of ids){const f=t.features.find(f=>f.id===id);out[id]={};for(const c of f.choices??[]){const prior=used.get(c.uniqueGroup)??new Set();const xs=c.options.map(o=>typeof o==='string'?o:o.id).filter(x=>!c.uniqueGroup||!prior.has(x)).slice(0,c.count??1);out[id][c.key]=(c.count??1)===1?xs[0]:xs;if(c.uniqueGroup){for(const x of xs)prior.add(x);used.set(c.uniqueGroup,prior);}}}return out;}
export function combinations(xs,n){if(n===0)return [[]];return xs.flatMap((x,i)=>combinations(xs.slice(i+1),n-1).map(t=>[x,...t]));}
let sequence=0;export const uuid=()=>String(++sequence).padStart(16,'0');
export class Collection extends Array{get contents(){return this;}get(id){return this.find(x=>x.id===id);}map(...args){return Array.from(this).map(...args);}filter(...args){return Array.from(this).filter(...args);}static get[Symbol.species](){return Array;}}
export class Doc{
 constructor(data={},parent){Object.assign(this,structuredClone(data));this.parent=parent;this.id=data._id??uuid();this.flags??={};this.effects=new Collection(...(data.effects??[]).map(e=>new Doc(e,this)));this.system??={};this.actor=parent?.documentName==='Actor'?parent:null;this.documentName=parent?'Item':'Actor';this.uuid=data.uuid??'Actor.'+this.id;this._source=structuredClone(data);}
 getFlag(id,key){return get(this.flags,id+'.'+key);}async setFlag(id,key,v){put(this.flags,id+'.'+key,v);return this;}async unsetFlag(id,key){const p=(id+'.'+key).split('.');const k=p.pop();delete get(this.flags,p.join('.'))?.[k];return this;}
 async update(data){for(const[k,v]of Object.entries(data)){if(k==='_id')continue;if(k.includes('.'))put(this,k,v);else if(v&&typeof v==='object'&&!Array.isArray(v)){this[k]??={};for(const[x,y]of Object.entries(v))put(this[k],x,y);}else this[k]=structuredClone(v);}return this;}
 async createEmbeddedDocuments(type,rows){const c=type==='Item'?this.items:this.effects;return rows.map(row=>{const d=new Doc(row,this);d.documentName=type;c.push(d);return d;});}
 async deleteEmbeddedDocuments(type,ids){const key=type==='Item'?'items':'effects';this[key]=new Collection(...this[key].filter(x=>!ids.includes(x.id)));}
 toObject(){return{_id:this.id,name:this.name,type:this.type,flags:structuredClone(this.flags),system:structuredClone(this.system),effects:this.effects.map(e=>e.toObject())};}
 testUserPermission(u){return u?.id==='player';}getRollData(){return{};}getActiveTokens(){return[];}async endConcentration(){this.concentrationEnded=true;}async rollSavingThrow(){return[{total:20}];}async applyDamage(hits){this.system.attributes.hp.value=Math.min(this.system.attributes.hp.max,this.system.attributes.hp.value-hits.reduce((n,h)=>n+(h.type==='healing'?-h.value:h.value),0));}
}
export function actor(){const a=new Doc({type:'character',name:'Test Hero',img:'portrait.webp',system:{attributes:{hp:{value:40,max:40,temp:0},prof:3,movement:{walk:30,swim:0},exhaustion:0},details:{level:8,type:{value:'humanoid'}},abilities:Object.fromEntries(['str','dex','con','int','wis','cha'].map((key,i)=>[key,{value:i===1?16:12,mod:i===1?3:1}])),traits:{dr:{value:[]},di:{value:[]},dv:{value:[]}},spells:{spell1:{max:3}}},prototypeToken:{texture:{src:'base.webp'},ring:{subject:{texture:null}},randomImg:true}});a.items=new Collection();a.effects=new Collection();a.items.push(new Doc({name:'Test cantrip',type:'spell',system:{level:0}},a));return a;}
export function globals(){
 globalThis.foundry={utils:{getProperty:get,setProperty:put,randomID:uuid,deepClone:structuredClone,isNumeric:x=>x!==''&&Number.isFinite(Number(x)),flattenObject:(o,p='',out={})=>{for(const[k,v]of Object.entries(o??{})){const key=p?p+'.'+k:k;if(v&&typeof v==='object'&&!Array.isArray(v))globalThis.foundry.utils.flattenObject(v,key,out);else out[key]=v;}return out;}}};
 globalThis.Roll=class{constructor(formula){this.formula=formula;}static safeEval(s){if(!/^[\d\s.+\-*/()%]+$/.test(s))throw Error('Unsafe arithmetic');return Function('return ('+s+')')();}async evaluate(){this.total=1;return this;}async toMessage(){}};
 globalThis.CONST={ACTIVE_EFFECT_MODES:{CUSTOM:0,MULTIPLY:1,ADD:2,DOWNGRADE:3,UPGRADE:4,OVERRIDE:5},DOCUMENT_OWNERSHIP_LEVELS:{OBSERVER:2}};
 const callbacks=new Map(),hooks=new Map();globalThis.Hooks={once:(name,fn)=>callbacks.set(name,fn),on:(name,fn)=>{const list=hooks.get(name)??[];list.push(fn);hooks.set(name,list);}};
 const gm={id:'gm',isGM:true,active:true},player={id:'player',isGM:false,active:true};const users=new Collection(gm,player);users.activeGM=gm;
 const settings=new Map([['multiple',false],['definitions',{}],['dawnHour',6]]);
 globalThis.game={user:gm,users,time:{worldTime:100000},actors:new Collection(),scenes:new Collection(),items:new Collection(),packs:new Collection(),settings:{get:(id,key)=>settings.get(key),set:async(id,key,v)=>settings.set(key,v)},modules:new Map(),system:{id:'dnd5e'},macros:new Collection(),combats:new Collection()};
 globalThis.canvas={tokens:{controlled:[]}};globalThis.ui={notifications:{warn:()=>{},info:()=>{},error:()=>{}}};globalThis.ChatMessage={getSpeaker:()=>({}),create:async data=>data};
 globalThis.fromUuidSync=id=>game.actors.find(a=>a.uuid===id);globalThis.fromUuid=async id=>globalThis.fromUuidSync(id);return{gm,player,settings,callbacks,hooks};
}
