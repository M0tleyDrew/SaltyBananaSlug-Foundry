import {assetPath,imagePath,rowsFromWorkbook,groupRows,compile,blank} from './core.js';
import {resolveImage} from './image-resolver.js';
import {extractArtwork} from './embedded-artwork.js';
const MAX=512*1024*1024, FILE_MAX=80*1024*1024;
export async function loadPackage(files){
  const all=new Map();let total=0;
  function add(path,file){path=assetPath(path);const limit=/\.xlsx$/i.test(path)?MAX:FILE_MAX;if(file.size>limit)throw Error(`${path}: exceeds ${limit/1024/1024} MB per file.`);total+=file.size;if(total>MAX)throw Error('Workbook and extracted artwork exceed 512 MB. Split the scenes into smaller worksheets.');if(all.has(path))throw Error(`Duplicate file: ${path}`);all.set(path,file);}
  for(const f of files){if(/\.zip$/i.test(f.name)){
    if(f.size>MAX)throw Error('ZIP exceeds 512 MB.');
    const zip=await JSZip.loadAsync(f);const entries=Object.values(zip.files).filter(e=>!e.dir&&!e.name.startsWith('__MACOSX/'));
    if(entries.length>1000)throw Error('ZIP exceeds 1,000 files.');
    for(const e of entries){if(e.unsafeOriginalName&&e.unsafeOriginalName!==e.name)throw Error('ZIP contains unsafe paths.');const path=assetPath(e.name);if(!/\.(xlsx|webp|png|jpe?g|avif)$/i.test(path))continue;if(e._data?.uncompressedSize>(/\.xlsx$/i.test(path)?MAX:FILE_MAX)||total+(e._data?.uncompressedSize??0)>MAX)throw Error('ZIP decompressed size exceeds limits.');const blob=await e.async('blob');add(path,new File([blob],path.split('/').pop(),{type:mime(path)}));}
  }else add(f.webkitRelativePath||f.name,f);}
  const books=[...all].filter(([path])=>/\.xlsx$/i.test(path));if(books.length!==1)throw Error('Choose exactly one XLSX worksheet, with its images, or a ZIP containing them.');
  const [bookPath,bookFile]=books[0],prefix=bookPath.includes('/')?bookPath.slice(0,bookPath.lastIndexOf('/')+1):'';
  const bytes=await bookFile.arrayBuffer();
  const book=XLSX.read(bytes,{type:'array',cellFormula:false,cellHTML:false,bookFiles:true});
  book.csiSource=bytes;
  const embedded=extractArtwork(XLSX,book);
  for(const asset of embedded.values()){
    const path=assetPath(prefix+imagePath(asset.imagePath));
    if(!all.has(path)){const name=asset.imagePath.split('/').pop().replace(/\.[^.]+$/,'.'+asset.extension);add(path,new File([asset.blob],name,{type:asset.blob.type}));}
  }
  const images=[...all.keys()].filter(p=>/\.(png|jpe?g|webp|avif)$/i.test(p));
  if(!images.length)throw Error(`This worksheet has no embedded scene artwork on its Artwork tab: ${bookPath}.\n\nUse the completed self-contained CSI worksheet. Each Artwork row needs an Image Path matching Scenes.image and its original image inserted on that row. Scale Guide thumbnails are for review and are not used as map artwork. No scenes were imported.`);
  const plans=groupRows(rowsFromWorkbook(book,XLSX));if(plans.length>100)throw Error('Maximum 100 scenes per import.');
  for(const p of plans){p.workbook=book;p.packageWarnings=[];p.keyImages=new Map();try{
    function resolve(value){const result=resolveImage(all,value,prefix);if(result.renamed)p.packageWarnings.push(`Artwork matched to supplied file: ${result.path}`);return result.file;}
    p.image=resolve(p.row.image);p.url=URL.createObjectURL(p.image);
    const image=new Image();image.src=p.url;await image.decode();p.dimensions={width:image.naturalWidth,height:image.naturalHeight};p.imageElement=image;
    for(const r of p.keys)if(!blank(r.image)){const f=resolve(r.image);const u=URL.createObjectURL(f);try{const i=new Image();i.src=u;await i.decode();}finally{URL.revokeObjectURL(u);}p.keyImages.set(r.key_id,f);}
    refresh(p);
  }catch(e){if(p.url){URL.revokeObjectURL(p.url);delete p.url;}p.error=`${p.key}: ${e.message}`;}}
  return plans;
}
export function refresh(p){p.compiled=compile(p,p.dimensions);p.compiled.warnings.push(...(p.packageWarnings??[]));p.compiled.image=p.image;for(const k of p.compiled.keys)k.imageFile=p.keyImages.get(k.key);return p.compiled;}
export function mime(path){return ({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',avif:'image/avif',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})[path.split('.').pop().toLowerCase()]||'application/octet-stream';}
