import {COINS, MODULE_ID} from "./constants.js";
import {deepClone, getItemPrice, itemIdentification} from "./utils.js";

export function dropDataFromEvent(event){
  if(!event)return null;
  for(const parser of [globalThis.TextEditor?.getDragEventData,foundry?.applications?.ux?.TextEditor?.getDragEventData]){
    if(typeof parser==="function")try{const p=parser.call(globalThis.TextEditor??foundry?.applications?.ux?.TextEditor,event);if(p&&typeof p==="object"&&Object.keys(p).length)return p;}catch(_){ }
  }
  const dt=event.dataTransfer;if(!dt)return null;
  for(const type of ["application/json","text/plain","text"])try{const raw=dt.getData(type);if(raw){const p=JSON.parse(raw);if(p&&typeof p==="object")return p;}}catch(_){ }
  return null;
}

export function safeDropReference(data){if(!data||typeof data!=="object")return null;const o={};for(const k of ["type","uuid","id","_id","pack","documentName","parentUuid"])if(data[k]!=null)o[k]=data[k];if(data.data?.uuid)o.uuid??=data.data.uuid;if(data.data?._id)o.id??=data.data._id;return o;}

export async function resolveDropDocument(data){
  if(!data)return null;
  try{
    const type=data.type??data.documentName;const cls=type?CONFIG?.[type]?.documentClass:null;
    if(cls?.fromDropData)try{const d=await cls.fromDropData(data);if(d)return d;}catch(_){ }
    if(data.uuid){const d=await fromUuid(data.uuid);if(d)return d;}
    const id=data.id??data._id;
    if(data.pack&&id){const d=await game.packs.get(data.pack)?.getDocument(id);if(d)return d;}
    if(type==="Item"&&id)return game.items.get(id)??null;
    if(type==="JournalEntry"&&id)return game.journal.get(id)??null;
    if(type==="RollTable"&&id)return game.tables.get(id)??null;
    if(type==="JournalEntryPage"&&id&&data.parentUuid){const p=await fromUuid(data.parentUuid);return p?.pages?.get(id)??null;}
  }catch(e){console.warn(`${MODULE_ID} | Could not resolve drop`,data,e);}
  return null;
}

function entryFor(doc){return doc?.documentName==="JournalEntry"?doc:doc?.documentName==="JournalEntryPage"?doc.parent:null;}
function pagesFor(doc){return doc?.documentName==="JournalEntryPage"?[doc]:doc?.documentName==="JournalEntry"?(doc.pages?.contents??[]):[];}
function qtyNear(anchor){const row=anchor.closest?.("tr");if(row){const cells=[...row.querySelectorAll("th,td")],cell=anchor.closest?.("th,td"),start=Math.max(0,cells.indexOf(cell)+1);for(const c of cells.slice(start)){const m=String(c.textContent??"").trim().match(/^(?:qty(?:uantity)?\s*[:=]?\s*)?(?:[x×]\s*)?(\d+)$/i);if(m)return Math.max(1,Number(m[1])||1);}}const txt=anchor.closest?.("li,p,div")?.textContent??"";for(const re of [/(?:qty|quantity)\s*[:=]?\s*(\d+)/i,/(?:×|\bx)\s*(\d+)\b/i,/\b(\d+)\s*(?:×|x)\b/i]){const m=String(txt).match(re);if(m)return Math.max(1,Number(m[1])||1);}return 1;}
function currencyFromRoot(root){const out={cp:0,sp:0,ep:0,gp:0,pp:0};let section=false;for(const el of root.querySelectorAll("h1,h2,h3,h4,h5,h6,li,p,tr")){const tag=el.tagName?.toLowerCase?.()??"",text=String(el.textContent??"").replace(/\s+/g," ").trim();if(!text)continue;if(/^h[1-6]$/.test(tag)){section=/\b(currency|coins?|money|treasury)\b/i.test(text);continue;}if(tag==="p"&&el.closest("li,tr"))continue;const label=/^\s*(?:currency|coins?|money|treasury)\s*[:\-–—]/i.test(text);if(!section&&!label)continue;const matches=[...text.matchAll(/\b([\d,]+)\s*(cp|sp|ep|gp|pp)\b/gi)];if(!matches.length)continue;const stripped=text.replace(/^\s*(?:currency|coins?|money|treasury)\s*[:\-–—]?\s*/i,"").replace(/\b[\d,]+\s*(?:cp|sp|ep|gp|pp)\b/gi,"").replace(/[,&+;:\-–—()]/g," ").replace(/\band\b/gi," ").replace(/\s+/g," ").trim();if(!label&&matches.length<2&&stripped)continue;for(const m of matches)out[m[2].toLowerCase()]+=Number(String(m[1]).replace(/,/g,""))||0;}return out;}

export async function parseJournal(doc,user=game.user){
  const entry=entryFor(doc);if(!entry)throw new Error("Drop a Foundry Journal Entry or Journal Page.");
  if(!user.isGM&&!entry.testUserPermission(user,CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER))throw new Error("You do not have permission to read that Journal.");
  const refs=new Map(),currency={cp:0,sp:0,ep:0,gp:0,pp:0};
  for(const page of pagesFor(doc)){
    if(page.type&&page.type!=="text")continue;const html=String(page.text?.content??"");if(!html)continue;const root=new DOMParser().parseFromString(html,"text/html").body;
    for(const a of root.querySelectorAll('a[data-uuid],a[data-type="Item"][data-id]')){let uuid=String(a.dataset?.uuid??"").trim();if(!uuid&&a.dataset?.type==="Item"&&a.dataset?.id)uuid=`Item.${a.dataset.id}`;if(uuid)refs.set(uuid,(refs.get(uuid)??0)+qtyNear(a));}
    for(const m of html.matchAll(/@UUID\[([^\]]+)\](?:\{[^}]*\})?/g)){const uuid=String(m[1]??"").trim();if(uuid&&!refs.has(uuid))refs.set(uuid,1);}
    const pc=currencyFromRoot(root);for(const c of COINS)currency[c]+=Number(pc[c]??0);
  }
  const items=[],skipped=[];
  for(const [uuid,quantity] of refs){try{const item=await fromUuid(uuid);if(!item||item.documentName!=="Item"){skipped.push({uuid,reason:"Item link could not be resolved"});continue;}items.push({item,quantity:Math.max(1,Number(quantity)||1),uuid});}catch(_){skipped.push({uuid,reason:"Item link could not be resolved"});}}
  return{sourceName:entry.name,pageName:doc.documentName==="JournalEntryPage"?doc.name:null,items,currency,skipped};
}

function stagedItem(item,quantity=1,source="drag"){
  const d=deepClone(item.toObject());delete d._id;foundry.utils.setProperty(d,"system.quantity",Math.max(1,Number(quantity)||1));
  const zero=getItemPrice(item)===0;d.flags??={};d.flags[MODULE_ID]??={};d.flags[MODULE_ID].stock={infinite:false,visible:!zero,allowZero:false,customSellCp:null,customBuyCp:null,ignoreFavor:false,favorRequired:"",maxPerCustomer:0,resell:true,source};
  return d;
}
export function stageItem(item,quantity=1,source="drag"){return stagedItem(item,quantity,source);}
export async function stageJournal(doc,user=game.user){const p=await parseJournal(doc,user);return{...p,items:p.items.map(x=>stagedItem(x.item,x.quantity,`Journal: ${p.sourceName}`))};}

async function resultDocument(result){
  if(typeof result?.getDocument==="function")try{const d=await result.getDocument();if(d)return d;}catch(_){ }
  const id=result?.documentId??result?.documentID??result?.document?.id;
  const col=result?.documentCollection??result?.documentCollectionName??result?.collection;
  if(result?.document?.documentName)return result.document;
  if(!id)return null;
  if(col==="Item")return game.items.get(id)??null;
  if(col){const pack=game.packs.get(col);if(pack)return pack.getDocument(id);}
  return null;
}

export async function previewRollTable(table,{mode="draw",count=1}={}){
  if(table?.documentName!=="RollTable")throw new Error("Drop a Foundry RollTable.");
  const results=[];
  if(mode==="all")results.push(...(table.results?.contents??[]));
  else{for(let i=0;i<Math.max(1,Math.min(100,Number(count)||1));i++){const rolled=await table.roll({recursive:true});results.push(...(rolled?.results??[]));}}
  const items=[],skipped=[];
  for(const r of results){const doc=await resultDocument(r);if(doc?.documentName==="Item")items.push(doc);else skipped.push({text:r?.text??r?.name??"Table result",reason:"Result is not a linked Item"});}
  return{tableName:table.name,items,skipped};
}
export async function stageRollTable(table,opts={}){const p=await previewRollTable(table,opts);return{...p,items:p.items.map(i=>stagedItem(i,1,`RollTable: ${table.name}`))};}

export function stagedItemView(data,idx){const ident=itemIdentification(data);const stock=data.flags?.[MODULE_ID]?.stock??{};const qty=foundry.utils.getProperty(data,"system.quantity")??1;return{idx,name:data.name,img:data.img,type:data.type,quantity:stock.infinite?"X":qty,infinite:Boolean(stock.infinite),visible:stock.visible!==false,allowZero:Boolean(stock.allowZero),zero:getItemPrice(data)===0,identifiable:ident.supported,identified:ident.identified};}
