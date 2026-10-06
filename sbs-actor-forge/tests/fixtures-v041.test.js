import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseRows,workbookRows,exportRows} from '../scripts/core.js';
import {preparePlans,importPlans,undoImport} from '../scripts/engine.js';
import {parseSourceBundle,catalogRows} from '../scripts/sources.js';
import {world} from './mock-world.js';
const context={};vm.createContext(context);vm.runInContext(fs.readFileSync(new URL('../vendor/xlsx.full.min.js',import.meta.url),'utf8'),context);const X=context.XLSX;
const rows=name=>workbookRows(X,X.read(fs.readFileSync(new URL('../workbooks/SaltyBananaSlug_Actor_Forge_'+name+'_v0.4.1.xlsx',import.meta.url)),{type:'buffer'}));
const artFile=path=>new URL('../'+path.replace(/^modules\/sbs-actor-forge\//,''),import.meta.url);
const hasArt=path=>{assert.match(path,/^modules\/sbs-actor-forge\/assets\/art\/[a-z-]+\.webp$/);const bytes=fs.readFileSync(artFile(path));assert.ok(bytes.length>32,path);assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WEBP');};
const legalItemIds=item=>{for(const [key,a]of Object.entries(item.system?.activities ?? {})){assert.match(key,/^[A-Za-z0-9]{16}$/);assert.equal(a._id,key);}for(const a of item.system?.advancement ?? [])assert.match(a._id,/^[A-Za-z0-9]{16}$/);};

test('v0.4.1 workbooks contain legal native IDs and every image resolves to a bundled asset',()=>{
 for(const label of ['Main_Test','Update_Test','Source_Test','Blank']){
  const raw=rows(label);assert.equal(raw.Meta[0]['Module Version'],'0.4.1');
  for(const row of raw.Actors){hasArt(row['Image Path']);const data=JSON.parse(row['Raw JSON']);assert.equal(data.img,row['Image Path']);assert.equal(data.prototypeToken.texture.src,data.img);}
  for(const row of [...raw.Items,...raw.Catalog]){if(row['Image Path'])hasArt(row['Image Path']);if(!row['Raw JSON'])continue;const data=JSON.parse(row['Raw JSON']);hasArt(data.img);legalItemIds(data);assert.ok(!row['Raw JSON'].includes('sbsSourceAct00001'));}
  assert.equal(raw.Artwork.length,label==='Blank'?0:24);for(const row of raw.Artwork)hasArt(row['Image Path']);
 }
 const main=rows('Main_Test'),source=rows('Source_Test');assert.equal(main['Test Plan'].length,24);assert.equal(new Set([...main.Actors,...source.Actors].map(a=>a['Image Path'])).size,4);assert.equal(main.Catalog.length,20);assert.equal(new Set(main.Catalog.map(r=>JSON.parse(r['Raw JSON']).img)).size,20);
});
test('v0.4.1 actual Main imports through strict document validation with distinct art and exact Undo',async()=>{
 const env=world(),plans=parseRows(rows('Main_Test'));await preparePlans(plans,env);assert.ok(plans.every(p=>p.errors.length===0),JSON.stringify(plans.map(p=>p.errors)));const result=await importPlans(plans,env);assert.equal(result.imported.size,3);
 for(const actor of result.imported.values()){hasArt(actor.toObject().img);for(const item of actor.items){hasArt(item.toObject().img);legalItemIds(item.toObject());}assert.ok(actor.system.details.race && actor.system.details.background);}
 for(const source of env.list('Item')){hasArt(source.toObject().img);legalItemIds(source.toObject());}
 const pip=result.imported.get('TEST041-COURIER'),wand=pip.items.find(i=>i.name==='Dispatch Wand');const cast=Object.values(wand.system.activities)[0];assert.equal(env.get('Item',cast.spell.uuid.split('.')[1]).toObject().img,'modules/sbs-actor-forge/assets/art/dispatch-burst.webp');
 await undoImport(env);for(const kind of ['Actor','Item','Folder'])assert.equal(env.list(kind).length,0);
});
test('v0.4.1 source JSON resolves all named rows and gives generated origin features their own images',async()=>{
 const bundle=JSON.parse(fs.readFileSync(new URL('../workbooks/SaltyBananaSlug_Actor_Forge_5etools_Test_v0.4.1.json',import.meta.url))),{records}=parseSourceBundle(bundle);assert.equal(records.length,20);assert.equal(new Set(records.map(r=>r.data.img)).size,20);for(const r of records){hasArt(r.data.img);legalItemIds(r.data);}
 for(const name of ['Safe Routing','Signal Slug — Bright Trail','Depot Surveyor — Feature: Route Ledger'])assert.ok(records.some(r=>r.name===name && r.data.img.endsWith('.webp')));
 const env=world(),plans=parseRows(rows('Source_Test'));for(const p of plans)p.catalog=catalogRows(records);await preparePlans(plans,env,records);assert.ok(plans.every(p=>p.errors.length===0),JSON.stringify(plans.map(p=>p.errors)));const result=await importPlans(plans,env);assert.equal(result.imported.size,1);const actor=result.imported.get('TEST041-SOURCE');assert.equal(actor.items.size,11);assert.equal(actor.toObject().img,'modules/sbs-actor-forge/assets/art/source-pip.webp');for(const item of actor.items)hasArt(item.toObject().img);
});
test('v0.4.1 export preserves actor, token and all embedded item image paths',async()=>{
 const env=world(),plans=parseRows(rows('Main_Test'));await preparePlans(plans,env);const result=await importPlans(plans,env),actors=[...result.imported.values()],exported=exportRows(actors,{folders:env.list('Folder')}),roundtrip=parseRows(exported);assert.equal(roundtrip.length,3);for(let i=0;i<actors.length;i++){const before=actors[i].toObject(),after=roundtrip[i].data;assert.equal(after.img,before.img);assert.equal(after.prototypeToken.texture.src,before.prototypeToken.texture.src);assert.deepEqual(after.items.map(x=>x.img),before.items.map(x=>x.img));}
});
test('an item Image Path cell overrides the image supplied in native JSON',async()=>{
 const env=world(),plans=parseRows({Meta:[{'Schema Version':2}],Actors:[{'Actor Key':'ART-OVERRIDE',Name:'Art override',Type:'character'}],Items:[{'Actor Key':'ART-OVERRIDE',Name:'Courier Spark',Type:'spell','Image Path':'modules/sbs-actor-forge/assets/art/courier-spark.webp','Raw JSON':JSON.stringify({name:'Courier Spark',type:'spell',img:'icons/svg/book.svg'})}]});await preparePlans(plans,env);assert.deepEqual(plans[0].errors,[]);assert.equal(plans[0].data.items[0].img,'modules/sbs-actor-forge/assets/art/courier-spark.webp');
});
