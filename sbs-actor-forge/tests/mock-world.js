import {ID,clone,setPath,itemKey,markItems} from '../scripts/core.js';
class Collection extends Map { [Symbol.iterator](){return this.values();} find(fn){return [...this].find(fn);} filter(fn){return [...this].filter(fn);} }
// An independent schema oracle: do not reuse the production repair/validator.
function nativeItemIds(item){for(const [key,a]of Object.entries(item.system?.activities ?? {})){if(!/^[A-Za-z0-9]{16}$/.test(key) || a._id!==undefined && (a._id!==key || !/^[A-Za-z0-9]{16}$/.test(a._id)))throw Error('Native activity ID requires 16 alphanumeric characters');}for(const a of item.system?.advancement ?? [])if(a._id!==undefined && !/^[A-Za-z0-9]{16}$/.test(a._id))throw Error('Native advancement ID requires 16 alphanumeric characters');}
export function world({gm=true}={}){
 let n=0;const db={Actor:new Collection(),Item:new Collection(),JournalEntry:new Collection(),Folder:new Collection()},settings={undo:{entries:[]}};
 const randomID=()=>('TEST'+String(++n).padStart(12,'0'));
 function doc(kind,raw){
  const d={id:raw._id || randomID(),documentName:kind,raw:clone(raw),get name(){return this.raw.name;},get type(){return this.raw.type;},get flags(){return this.raw.flags;},get uuid(){return kind+'.'+this.id;},get folder(){return this.raw.folder;},get system(){return this.raw.system;},get text(){return this.raw.text;},toObject(){return clone(this.raw);},getFlag(mod,key){return this.flags?.[mod]?.[key];},testUserPermission(user,level){return user.isGM || (this.raw.ownership?.[user.id] ?? this.raw.ownership?.default ?? 0)>=(level==='OWNER'?3:2);},
   async update(p){for(const [k,v]of Object.entries(p))setPath(this.raw,k,v);this.refresh();return this;},
   async importFromJSON(s){this.raw=JSON.parse(s);this.refresh();return this;},async delete(){db[kind].delete(this.id);},
   async createEmbeddedDocuments(k,rows){const key=k==='Item'?'items':'pages';this.raw[key] ??=[];for(const r of rows)this.raw[key].push({...clone(r),_id:r._id || randomID()});this.refresh();return rows.map((_r,i)=>[...this[key]].at(-rows.length+i));},
   async updateEmbeddedDocuments(k,rows){const key=k==='Item'?'items':'pages';for(const r of rows){const old=this.raw[key].find(x=>x._id===r._id);for(const [p,v]of Object.entries(r))setPath(old,p,v);}this.refresh();return this[key];},
   refresh(){this.raw._id=this.id;if(kind==='Actor'){this.raw.system ??={};this.raw.items ??=[];for(const i of this.raw.items)i._id ??=randomID();this.items=new Collection(this.raw.items.map(i=>{const x=embedded('Item',i,this);return [x.id,x];}));}if(kind==='JournalEntry'){for(const p of this.raw.pages ?? [])p._id ??=randomID();this.pages=new Collection((this.raw.pages ?? []).map(p=>{const x=embedded('JournalEntryPage',p,this);return [x.id,x];}));}}
  };d.refresh();return d;
 }
 function embedded(kind,r,parent){return {id:r._id,_id:r._id,name:r.name,type:r.type,system:r.system,flags:r.flags,text:r.text,toObject:()=>clone(r),async update(p){for(const [k,v]of Object.entries(p))setPath(r,k,v);parent.refresh();return this;}};}
 const env={isGM:gm,user:{id:'gm1',isGM:gm},db,settings,randomID,list:k=>[...db[k]],get:(k,id)=>db[k].get(id),
  create:async(k,r)=>{const d=doc(k,r);db[k].set(d.id,d);return d;},restore:async(_k,d,r)=>d.importFromJSON(JSON.stringify(r)),
  getSetting:k=>settings[k],setSetting:async(k,v)=>{settings[k]=clone(v);},fromUuid:async u=>{const [kind,id]=u.split('.');return db[kind]?.get(id);},findItems:async(name,type)=>[...db.Item].filter(d=>d.name===name && (!type || d.type===type)),
  validateActor:d=>{if(!d.name || !['character','npc','vehicle','group'].includes(d.type))throw Error('Actor schema');for(const item of d.items ?? [])nativeItemIds(item);},validateItem:d=>{if(!d.name || !d.type)throw Error('Item schema');nativeItemIds(d);},runAdvancements:async()=>[]};
 return env;
}
