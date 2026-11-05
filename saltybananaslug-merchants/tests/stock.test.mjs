import test from 'node:test';
import assert from 'node:assert/strict';
import {MODULE_ID} from '../scripts/constants.js';
import {previewRollTable, stageRollTable} from '../scripts/importers.js';
import {buyFromMerchant, merchantSnapshot, importTableToMerchant} from '../scripts/merchant-service.js';
import {quantityOf} from '../scripts/utils.js';

const getProperty=(obj,path)=>path.split('.').reduce((v,k)=>v?.[k],obj);
const setProperty=(obj,path,value)=>{const keys=path.split('.'),last=keys.pop();let o=obj;for(const k of keys)o=o[k]??={};o[last]=value;};
globalThis.foundry={utils:{getProperty,setProperty,deepClone:structuredClone,mergeObject:(a,b)=>({...a,...b}),randomID:()=> 'transaction'}};
globalThis.CONST={DOCUMENT_OWNERSHIP_LEVELS:{OWNER:3,NONE:0}};
globalThis.Hooks={callAll(){}};
class Collection extends Map {get contents(){return [...this.values()];}}
class Item {
  constructor(q=1,stock={}){this.id='potion';this.documentName='Item';this.name='Potion';this.type='consumable';this.system={quantity:q,price:{value:1,denomination:'gp'}};this._source={system:structuredClone(this.system)};this.flags={[MODULE_ID]:{stock}};}
  getFlag(ns,key){return this.flags[ns]?.[key];}
  async setFlag(ns,key,value){(this.flags[ns]??={})[key]=value;}
  toObject(){return {name:this.name,type:this.type,system:structuredClone(this._source.system),flags:structuredClone(this.flags)};}
  async update(patch){await Promise.resolve();for(const [k,v] of Object.entries(patch)){setProperty(this,k,v);setProperty(this._source,k,v);}return this;}
}
function actor(id){return {id,name:id,system:{currency:{gp:10}},items:new Collection(),flags:{},getFlag(ns,k){return this.flags[ns]?.[k];},async setFlag(ns,k,v){(this.flags[ns]??={})[k]=v;},async update(patch){for(const [k,v] of Object.entries(patch))setProperty(this,k,v);},async createEmbeddedDocuments(type,rows){return rows.map(row=>{const i=new Item(row.system.quantity);i.flags=row.flags;i.id=`owned${this.items.size}`;this.items.set(i.id,i);return i;});}};}
function setup(q=1,stock={}){
  const inv=actor('inventory'),customer=actor('customer'),item=new Item(q,stock);inv.items.set(item.id,item);
  const config={isMerchant:true,inventoryActorId:inv.id,status:'open',pricing:{sellRate:100},favor:{levels:[]},treasury:{addCustomerPayments:false}};
  const token={uuid:'Scene.scene.Token.shop',name:'Shop',getFlag:()=>config};
  globalThis.game={user:{isGM:true,name:'GM'},actors:new Map([[inv.id,inv],[customer.id,customer]]),scenes:new Map(),journal:new Map(),items:new Map(),packs:new Map(),modules:new Map()};
  return {inv,customer,item,token};
}
const purchase=(env,lines=[{itemId:'potion',quantity:1}],tokenDoc=env.token)=>buyFromMerchant({tokenDoc,actor:env.customer,lines});

test('v13 world and compendium UUID results stage and import into merchant stock',async()=>{
  const env=setup(0),source=new Item(20);let rolls=0;
  globalThis.fromUuid=async uuid=>{assert.ok(['Item.world','Compendium.dnd5e.items.Item.potion'].includes(uuid));return source;};
  const table={documentName:'RollTable',name:'Potions',async roll(opts){assert.equal(opts.recursive,true);rolls++;return {results:[{documentUuid:rolls%2?'Item.world':'Compendium.dnd5e.items.Item.potion'}]};}};
  const staged=await stageRollTable(table,{count:2});assert.equal(staged.items.length,2);assert.equal(staged.items[0].system.quantity,1);assert.equal(source.system.quantity,20);
  await importTableToMerchant(env.token,table,{count:2});assert.equal(quantityOf(env.item),2);assert.equal(rolls,4);
});
test('all-results mode retains legacy world and pack results and reports skipped rows',async()=>{
  setup();const source=new Item();game.items.set('world',source);game.packs.set('old.pack',{getDocument:async()=>source});
  const table={documentName:'RollTable',name:'Legacy',results:{contents:[{documentCollection:'Item',documentId:'world'},{documentCollection:'old.pack',documentId:'pack'},{name:'Text'}]}};
  const result=await previewRollTable(table,{mode:'all'});assert.equal(result.items.length,2);assert.equal(result.skipped.length,1);
});
test('broken links and depleted tables fail with useful errors',async()=>{
  setup();globalThis.fromUuid=async()=>null;
  const table={documentName:'RollTable',name:'Empty',roll:async()=>({results:[]})};
  await assert.rejects(previewRollTable(table),/returned no results/);
  table.roll=async()=>({results:[{documentUuid:'Item.missing'}]});await assert.rejects(previewRollTable(table),/No linked Items/);
});
test('zero stored stock blocks purchase before charging, even if prepared quantity is positive',async()=>{
  const env=setup(0);env.item.system.quantity=1;
  assert.equal(merchantSnapshot(env.token,game.user,env.customer).items[0].inStock,false);
  await assert.rejects(purchase(env),/enough stock/);assert.equal(env.customer.system.currency.gp,10);assert.equal(env.customer.items.size,0);
});
test('last item sells once; repeated checkout cannot charge or deliver again',async()=>{
  const env=setup(1);await purchase(env);assert.equal(quantityOf(env.item),0);assert.equal(env.customer.items.size,1);
  const purse=structuredClone(env.customer.system.currency);await assert.rejects(purchase(env),/enough stock/);assert.deepEqual(env.customer.system.currency,purse);assert.equal(quantityOf(env.customer.items.contents[0]),1);
});
test('duplicate purchase lines are combined before stock and purchase-limit checks',async()=>{
  const env=setup(1),lines=[{itemId:'potion',quantity:1},{itemId:'potion',quantity:1}];await assert.rejects(purchase(env,lines),/enough stock/);assert.equal(env.customer.items.size,0);assert.equal(env.customer.system.currency.gp,10);
  env.item=env.inv.items.get('potion');await env.item.update({'system.quantity':5});env.item.flags[MODULE_ID].stock.maxPerCustomer=1;await assert.rejects(purchase(env,lines),/limited/);
});
test('simultaneous checkouts across two tokens sharing stock deliver only the last available item',async()=>{
  const env=setup(1),second={...env.token,uuid:'Scene.other.Token.other'};
  const results=await Promise.allSettled([purchase(env),purchase(env,undefined,second)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(quantityOf(env.item),0);assert.equal(quantityOf(env.customer.items.contents[0]),1);
});
test('explicit infinite stock can sell at zero without decrementing',async()=>{
  const env=setup(0,{infinite:true});await purchase(env);await purchase(env);assert.equal(quantityOf(env.item),0);assert.equal(quantityOf(env.customer.items.contents[0]),2);
});
test('invalid quantities and empty carts never charge or deliver',async()=>{
  const env=setup(5);for(const q of [0,-1,1.5,Infinity,NaN])await assert.rejects(purchase(env,[{itemId:'potion',quantity:q}]),/Invalid/);
  await assert.rejects(purchase(env,[]),/empty/);assert.equal(env.customer.items.size,0);assert.equal(env.customer.system.currency.gp,10);
});

test('fresh storefront data clears sold-out or missing cart entries and caps remaining quantities',async()=>{
  const env=setup();
  foundry.appv1={api:{Application:class {}}};
  const {MerchantSheet}=await import('../scripts/apps/merchant-sheet.js');
  game.actors.filter=()=>[];game.user.isGM=false;
  const sheet=new MerchantSheet(env.token);sheet.selectedActorId=env.customer.id;
  sheet.remoteSnapshot={items:[{id:'potion',quantity:0,inStock:false},{id:'other',quantity:2,maxPerCustomer:1,priceCp:100}]};
  sheet.buyCart.set('potion',1);sheet.buyCart.set('missing',1);sheet.buyCart.set('other',5);
  const data=sheet.getData();assert.deepEqual([...sheet.buyCart],[['other',1]]);assert.equal(data.buyItems[0].cartQty,0);
});


test('GM shopping exposes the real storefront and can buy the final item without a player',async()=>{
  const env=setup(1);env.customer.type='character';game.actors.filter=predicate=>[...game.actors.values()].filter(predicate);
  const {MerchantSheet}=await import('../scripts/apps/merchant-sheet.js');
  const sheet=new MerchantSheet(env.token);sheet.selectedActorId=env.customer.id;sheet.render=()=>{};
  assert.equal(sheet.getData().manageStock,true);sheet.shopAsCharacter=true;
  const data=sheet.getData();assert.equal(data.manageStock,false);assert.equal(data.shopAsCharacter,true);assert.equal(data.buyItems[0].inStock,true);
  globalThis.ui={notifications:{info(){},error(){}}};sheet.buyCart.set('potion',1);await sheet._checkoutBuy();
  assert.equal(quantityOf(env.item),0);assert.equal(env.customer.items.size,1);assert.equal(sheet.getData().buyItems[0].inStock,false);assert.equal(sheet.buyCart.size,0);
});

test('visible table picker imports selected tables, prevents double clicks, and keeps errors open for retry',async()=>{
  setup();const {openStockTableDialog}=await import('../scripts/apps/table-picker.js');
  const notices=[];globalThis.ui={notifications:{info:m=>notices.push(m),error:m=>notices.push(m)}};
  globalThis.Dialog=class{constructor(data){this.data=data;this.closed=false;}render(){return this;}async close(){this.closed=true;}};
  const selected={uuid:'RollTable.potions',documentName:'RollTable',name:'Potions'};game.tables={contents:[selected]};globalThis.fromUuid=async()=>selected;
  let imports=0,finish;const gate=new Promise(resolve=>finish=resolve);
  const dialog=openStockTableDialog({onImport:async(t,opts)=>{imports++;assert.equal(t,selected);assert.equal(opts.count,3);await gate;return {items:[{}],skipped:[]};}});
  assert.match(dialog.data.content,/Roll table to add items/);assert.match(dialog.data.content,/RollTable.potions/);
  const nodes={table:{value:''},uuid:{value:''},mode:{value:'draw'},count:{value:'3'},status:{textContent:''}};
  const root={querySelector:selector=>selector.includes('status')?nodes.status:nodes[selector.match(/name='([^']+)'/)[1]]};
  const callback=dialog.data.buttons.import.callback;
  const oldError=console.error;console.error=()=>{};
  try{callback([root]);await dialog.close();await new Promise(setImmediate);assert.equal(dialog.closed,false);assert.match(nodes.status.textContent,/Choose a RollTable/);
    nodes.table.value=selected.uuid;callback([root]);callback([root]);await dialog.close();await new Promise(setImmediate);assert.equal(imports,1);assert.equal(dialog.closed,false);
    finish();await new Promise(setImmediate);assert.equal(dialog.closed,true);assert.match(notices.at(-1),/Added 1/);
  }finally{console.error=oldError;}
});
