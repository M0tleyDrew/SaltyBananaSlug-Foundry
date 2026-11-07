import {HEADERS} from './core.js';
const NS='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const descendants=(node,name)=>Array.from(node?.querySelectorAll('*') ?? []).filter(n=>(n.localName || n.nodeName).split(':').at(-1)===name);
const relId=(n,key='id')=>n?.getAttributeNS(NS,key) || n?.getAttribute('r:'+key);
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

// Update only the Scenes XML. SheetJS's writer does not preserve workbook drawings.
export async function calibratedWorkbook(book,rows){
 if(!book.csiSource)throw Error('Original worksheet bytes are unavailable. Reload the worksheet before downloading calibrations.');
 const parse=path=>{const value=book.files?.[path]?.content;if(!value)throw Error('Missing workbook component: '+path);const doc=new DOMParser().parseFromString(typeof value==='string'?value:new TextDecoder().decode(value),'application/xml');if(descendants(doc,'parsererror').length)throw Error('Invalid worksheet XML: '+path);return doc;};
 const workbook=parse('xl/workbook.xml'),relationships=parse('xl/_rels/workbook.xml.rels');
 const sheet=descendants(workbook,'sheet').find(s=>s.getAttribute('name')==='Scenes');
 const rel=descendants(relationships,'Relationship').find(r=>r.getAttribute('Id')===relId(sheet)&&r.getAttribute('TargetMode')!=='External');
 if(!rel)throw Error('Scenes worksheet relationship is missing.');
 const path=resolve('xl/workbook.xml',rel.getAttribute('Target')),doc=parse(path),ns=doc.documentElement.namespaceURI;
 const old=descendants(doc,'sheetData')[0],styles=new Map(descendants(old,'c').map(c=>[c.getAttribute('r'),c.getAttribute('s')]));
 const data=doc.createElementNS(ns,'sheetData'),matrix=[HEADERS.Scenes,...rows.map(r=>HEADERS.Scenes.map(h=>r[h]??''))];
 matrix.forEach((values,i)=>{const row=doc.createElementNS(ns,'row');row.setAttribute('r',String(i+1));values.forEach((value,j)=>{
   const ref=String.fromCharCode(65+j)+(i+1),cell=doc.createElementNS(ns,'c');cell.setAttribute('r',ref);if(styles.get(ref))cell.setAttribute('s',styles.get(ref));
   if(typeof value==='number'||typeof value==='boolean'){if(typeof value==='boolean')cell.setAttribute('t','b');const v=doc.createElementNS(ns,'v');v.textContent=typeof value==='boolean'?(value?'1':'0'):String(value);cell.append(v);}
   else{cell.setAttribute('t','inlineStr');const inline=doc.createElementNS(ns,'is'),text=doc.createElementNS(ns,'t');text.textContent=String(value);inline.append(text);cell.append(inline);}row.append(cell);
 });data.append(row);});
 old.replaceWith(data);const dimension=descendants(doc,'dimension')[0];dimension?.setAttribute('ref',`A1:P${matrix.length}`);
 const zip=await JSZip.loadAsync(book.csiSource);zip.file(path,new XMLSerializer().serializeToString(doc));return zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}});
}
