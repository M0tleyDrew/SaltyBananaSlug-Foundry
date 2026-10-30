import {catalogReferences} from './advancements.js';
// OOXML relationship/anchor extraction and FilePicker uploads, as in SBS Item Uploader.
// SheetJS inflates the archive with bookFiles:true; no second ZIP library needed.
const NS='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const descendants=(node,name)=>Array.from(node?.querySelectorAll('*') ?? []).filter(n=>(n.localName || n.nodeName).split(':').at(-1)===name);
const relId=(n,key='id')=>n?.getAttributeNS(NS,key) || n?.getAttribute('r:'+key);
const slug=s=>String(s).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,90) || 'portrait';
function resolve(base,target){
 if(!target || /^[a-z]+:/i.test(target))throw Error('Invalid embedded artwork relationship');
 const parts=target.startsWith('/')?[]:base.split('/').slice(0,-1);
 for(const p of target.split('/')){if(!p || p==='.')continue;if(p==='..'){if(!parts.length)throw Error('Invalid artwork archive path');parts.pop();}else parts.push(p);}
 return parts.join('/');
}
const relsPath=p=>p.replace(/([^/]+)$/,'_rels/$1.rels');
export function extractArtwork(XLSX,book,Parser=globalThis.DOMParser){
 const sheetName=book.SheetNames.find(n=>n.toLowerCase()==='artwork');
 if(!sheetName)return new Map();
 const files=book.files;
 if(!files)throw Error('Embedded artwork requires reading the workbook with bookFiles enabled');
 function xml(path,optional=false){
  const bytes=files[path]?.content;if(!bytes){if(optional)return null;throw Error('Missing workbook artwork component: '+path);}
  if(!Parser)throw Error('XML parser is unavailable');
  const doc=new Parser().parseFromString(typeof bytes==='string'?bytes:new TextDecoder().decode(bytes),'application/xml');
  if(descendants(doc,'parsererror').length)throw Error('Invalid artwork XML: '+path);return doc;
 }
 function relationships(path){
  const doc=xml(relsPath(path),true);return new Map(doc?descendants(doc,'Relationship').filter(r=>r.getAttribute('TargetMode')!=='External').map(r=>[r.getAttribute('Id'),r.getAttribute('Target')]):[]);
 }
 const workbook=xml('xl/workbook.xml'),workbookRels=relationships('xl/workbook.xml');
 const sheet=descendants(workbook,'sheet').find(s=>s.getAttribute('name')===sheetName);
 const path=resolve('xl/workbook.xml',workbookRels.get(relId(sheet))),doc=xml(path),rels=relationships(path);
 // Actual worksheet row numbers match drawing anchors, never actor row order.
 const matrix=XLSX.utils.sheet_to_json(book.Sheets[sheetName],{header:1,defval:'',range:0});
 const headers=matrix[0] || [],assets=new Map();
 for(const drawing of descendants(doc,'drawing')){
  const drawingPath=resolve(path,rels.get(relId(drawing))),drawingXML=xml(drawingPath),drawingRels=relationships(drawingPath);
  for(const anchor of [...descendants(drawingXML,'oneCellAnchor'),...descendants(drawingXML,'twoCellAnchor')]){
   const from=descendants(anchor,'from')[0],row=Number(descendants(from,'row')[0]?.textContent);
   if(!Number.isInteger(row) || row<1)continue;
   const record=Object.fromEntries(headers.map((h,i)=>[h,String(matrix[row]?.[i] ?? '').trim()]));
   const imagePath=record['Image Path'];
   if(!imagePath)throw Error(`Artwork row ${row+1}: Image Path is required to match its embedded picture`);
   if(assets.has(imagePath))throw Error(`Artwork row ${row+1}: duplicate embedded image for ${imagePath}`);
   const blip=descendants(anchor,'blip')[0],target=drawingRels.get(relId(blip,'embed'));
   if(!target)throw Error(`Artwork row ${row+1}: embedded image relationship is missing`);
   const media=resolve(drawingPath,target),bytes=files[media]?.content,extension=media.split('.').at(-1).toLowerCase();
   const mime={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif'}[extension];
   if(!mime || !bytes?.length)throw Error(`Artwork row ${row+1}: missing or unsupported picture (${media})`);
   assets.set(imagePath,{imagePath,name:record.Name || imagePath,extension,blob:new Blob([bytes],{type:mime})});
  }
 }
 return assets;
}
export function artworkPaths(data){return [data.img,data.prototypeToken?.texture?.src,...(data.items ?? []).map(i=>i.img)].filter(Boolean);}
export function remapArtwork(data,paths){
 if(paths.has(data.img)){
  data.img=paths.get(data.img);data.prototypeToken ??={};data.prototypeToken.texture ??={};data.prototypeToken.texture.src=data.img;
 }else if(paths.has(data.prototypeToken?.texture?.src))data.prototypeToken.texture.src=paths.get(data.prototypeToken.texture.src);
 for(const item of data.items ?? [])if(paths.has(item.img))item.img=paths.get(item.img);
}
export function attachArtworkPreviews(plans,assets){
 const urls=new Map();
 for(const p of plans){const asset=assets.get(p.data.img);if(!asset)continue;
  if(!urls.has(asset))urls.set(asset,URL.createObjectURL(asset.blob));p.artworkPreview={path:p.data.img,url:urls.get(asset)};
 }
 return ()=>{for(const url of urls.values())URL.revokeObjectURL(url);};
}
export async function uploadArtwork(plans,assets,{Picker,randomID,effectiveData=p=>p.data,FileClass=globalThis.File}={}){
 const needed=new Set();
 const catalog=new Map(plans.flatMap(p=>(p.catalog ?? []).map(r=>[r['Source Key'],typeof r['Raw JSON']==='string'?JSON.parse(r['Raw JSON']):r['Raw JSON']])));
 const required=new Set();
 for(const p of plans){const data=effectiveData(p);for(const path of artworkPaths(data))if(assets.has(path))needed.add(path);for(const key of catalogReferences(data))required.add(key);}
 for(const key of required){const data=catalog.get(key);if(!data)continue;for(const path of artworkPaths(data))if(assets.has(path))needed.add(path);for(const ref of catalogReferences(data))required.add(ref);}
 if(!needed.size)return 0;
 if(!Picker?.upload || !Picker?.createDirectory || !Picker?.browse)throw Error('Foundry image upload is unavailable; no actors were imported');
 const directory='sbs-actor-forge/artwork/'+slug(randomID());let current='';
 for(const part of directory.split('/')){
  current=current?current+'/'+part:part;
  try{await Picker.createDirectory('data',current,{notify:false});}
  catch(error){try{await Picker.browse('data',current);}catch{throw Error(`Cannot create artwork folder ${current}: ${error.message}`);}}
 }
 const paths=new Map();
 for(const path of needed){
  const a=assets.get(path),filename=`${paths.size+1}-${slug(a.name)}.${a.extension}`,file=new FileClass([a.blob],filename,{type:a.blob.type});
  let result;try{result=await Picker.upload('data',directory,file,{}, {notify:false});}
  catch(error){throw Error(`Artwork upload failed for ${a.name}: ${error.message}. No actors were imported; uploaded files remain in ${directory}.`);}
  if(!result?.path)throw Error(`Artwork upload failed for ${a.name}: no uploaded path returned. No actors were imported.`);
  paths.set(path,result.path);
 }
 // Patch only after every required upload succeeds.
 for(const p of plans){remapArtwork(p.data,paths);for(const row of p.catalog ?? []){const raw=row['Raw JSON'];if(!raw)continue;const data=typeof raw==='string'?JSON.parse(raw):structuredClone(raw);remapArtwork(data,paths);row['Raw JSON']=JSON.stringify(data);}}
 return paths.size;
}
