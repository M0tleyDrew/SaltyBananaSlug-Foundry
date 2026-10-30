import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {DOMParser} from 'linkedom';
import {extractArtwork,uploadArtwork,attachArtworkPreviews} from '../scripts/artwork.js';
import {parseRows,workbookRows} from '../scripts/core.js';import {preparePlans,importPlans} from '../scripts/engine.js';import {world} from './mock-world.js';
const ctx={};vm.createContext(ctx);vm.runInContext(fs.readFileSync(new URL('../vendor/xlsx.full.min.js',import.meta.url),'utf8'),ctx);const X=ctx.XLSX;
const fixture=()=>X.read(fs.readFileSync(new URL('../workbooks/SaltyBananaSlug_Actor_Forge_Main_Test_v0.4.1.xlsx',import.meta.url)),{type:'array',bookFiles:true});
function picker(failAt=Infinity){const uploads=[],directories=[];return {uploads,directories,async createDirectory(_s,d){directories.push(d);},async browse(){},async upload(_s,d,f){if(uploads.length===failAt)throw Error('Permission denied');uploads.push(f);return {path:d+'/'+f.name};}};}
function sample(){const assets=new Map(['a','b'].map(x=>[x,{name:x,extension:'png',blob:new Blob([x],{type:'image/png'})}]));const plans=[{data:{name:'B',img:'b',items:[{img:'a'}]}},{data:{name:'A',img:'a',prototypeToken:{texture:{src:'a'}},items:[{img:'a'},{img:'icons/svg/sword.svg'}]}}];return {assets,plans};}
test('extracts 24 real embedded pictures from the existing workbook, preserving exact media bytes',async()=>{
 const book=fixture(),assets=extractArtwork(X,book,DOMParser);assert.equal(assets.size,24);
 const archiveBytes=Object.entries(book.files).filter(([p])=>p.startsWith('xl/media/')).map(([,f])=>Buffer.from(f.content));
 for(const [path,a]of assets){assert.match(path,/^modules\/sbs-actor-forge\/assets\/art\//);assert.match(a.blob.type,/^image\//);const bytes=Buffer.from(await a.blob.arrayBuffer());assert.ok(archiveBytes.some(b=>b.equals(bytes)));}
});
test('no Artwork worksheet preserves legacy path-only imports',()=>{assert.equal(extractArtwork(X,{SheetNames:['Actors']},DOMParser).size,0);});
test('missing image relationships and duplicate artwork mappings fail visibly',()=>{
 let book=fixture();const drawing=Object.keys(book.files).find(p=>/^xl\/drawings\/drawing\d+\.xml$/.test(p));delete book.files[drawing];assert.throws(()=>extractArtwork(X,book,DOMParser),/Missing workbook artwork component/);
 book=fixture();const ws=book.Sheets.Artwork,rows=X.utils.sheet_to_json(ws,{header:1});const column=rows[0].indexOf('Image Path');ws[X.utils.encode_cell({r:2,c:column})].v=ws[X.utils.encode_cell({r:1,c:column})].v;assert.throws(()=>extractArtwork(X,book,DOMParser),/duplicate embedded image/);
});
test('uploads each referenced picture once, matches paths across reordered actors and fixes tokens/features',async()=>{
 const {assets,plans}=sample(),Picker=picker();assert.equal(await uploadArtwork(plans,assets,{Picker,randomID:()=> 'batch-id'}),2);assert.equal(Picker.uploads.length,2);
 for(const p of plans){assert.equal(p.data.prototypeToken.texture.src,p.data.img);assert.match(p.data.img,/^sbs-actor-forge\/artwork\/batch-id\//);}
 assert.equal(plans[0].data.items[0].img,plans[1].data.img);assert.equal(plans[1].data.items[1].img,'icons/svg/sword.svg');
});
test('upload failure leaves all input paths untouched and reports no actor import',async()=>{
 const {assets,plans}=sample(),before=JSON.stringify(plans);await assert.rejects(uploadArtwork(plans,assets,{Picker:picker(1),randomID:()=> 'failure'}),/No actors were imported/);assert.equal(JSON.stringify(plans),before);
});
test('missing upload result and unavailable FilePicker stop rather than producing broken images',async()=>{
 const {assets,plans}=sample();await assert.rejects(uploadArtwork(plans,assets,{}),/unavailable/);const Picker=picker();Picker.upload=async()=>({});await assert.rejects(uploadArtwork(plans,assets,{Picker,randomID:()=> 'empty'}),/no uploaded path/);
});
test('only effective selected content is uploaded, so disabled update categories cannot create uploads',async()=>{
 const {assets,plans}=sample(),Picker=picker();assert.equal(await uploadArtwork(plans,assets,{Picker,randomID:()=> 'skip',effectiveData:()=>({img:'existing.png',items:[]})}),0);assert.equal(Picker.directories.length,0);
});
test('temporary preview URLs are revoked without modifying import image paths',()=>{
 const {assets,plans}=sample(),release=attachArtworkPreviews(plans,assets);assert.match(plans[0].artworkPreview.url,/^blob:/);assert.equal(plans[0].data.img,'b');release();
});
test('uploaded portraits and tokens survive native actor creation with matching default tokens',async()=>{
 const book=fixture(),plans=parseRows(workbookRows(X,book)),e=world();await preparePlans(plans,e);const assets=extractArtwork(X,book,DOMParser),Picker=picker();await uploadArtwork(plans,assets,{Picker,randomID:()=> 'integration'});const r=await importPlans(plans,e);assert.ok(!r.lines.some(l=>l.includes('FAILED')));
 for(const a of e.list('Actor')){assert.match(a.toObject().img,/^sbs-actor-forge\/artwork\/integration\//);assert.equal(a.toObject().prototypeToken.texture.src,a.toObject().img);}
 assert.ok(Picker.uploads.length>=14);for(const item of e.list('Item'))if(assets.has(item.toObject().img))assert.fail('Catalog source still refers to embedded-only artwork');
});
