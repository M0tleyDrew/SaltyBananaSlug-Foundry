import {MODULE_ID} from "./constants.js";
import {currencyOf, escapeHtml, formatCopper, getMerchantData, itemIdentification, journalSceneFolder, quantityOf, uniqueJournalName} from "./utils.js";
import {effectiveRates, stockSettings} from "./pricing.js";

export function journalOwnership(_cfg={}){return{default:CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE};}

function stockRows(actor){
  const items=actor?.items?.contents??[];if(!items.length)return '<tr><td colspan="8"><em>No stock.</em></td></tr>';
  return items.map(i=>{const s=stockSettings(i);const ident=itemIdentification(i);const qty=s.infinite?"∞":quantityOf(i);const p=i.system?.price??{};return `<tr><td><img src="${escapeHtml(i.img??'icons/svg/item-bag.svg')}" width="28" height="28"></td><td>${escapeHtml(i.name)}</td><td>${escapeHtml(i.type)}</td><td>${qty}</td><td>${escapeHtml(String(p.value??0))} ${escapeHtml(String(p.denomination??'gp'))}</td><td>${ident.supported?(ident.identified?'Identified':'Unidentified'):'N/A'}</td><td>${s.visible?'Yes':'No'}</td><td>${s.allowZero?'Yes':'No'}</td></tr>`;}).join("");
}
function currencyLine(actor){const c=currencyOf(actor);return Object.entries(c).filter(([,v])=>v).map(([k,v])=>`${v} ${k}`).join(", ")||"None";}
function relationRows(data){
  const rels=data?.favor?.relations??{};const rows=[];
  for(const [actorId,r] of Object.entries(rels)){const a=game.actors.get(actorId);if(!a)continue;const rates=effectiveRates(data,a);rows.push(`<tr><td>${escapeHtml(a.name)}</td><td>${escapeHtml(rates.favorName)}</td><td>${rates.sellRate}%</td><td>${rates.buyRate}%</td></tr>`);}
  return rows.join("")||'<tr><td colspan="4"><em>No character-specific relationships configured.</em></td></tr>';
}
function ledgerHtml(actor){const priv=actor?.getFlag?.(MODULE_ID,"private")??{};const entries=(priv.ledger??[]).slice(-500).reverse();return entries.length?`<ol>${entries.map(e=>`<li><strong>${escapeHtml(e.when)}</strong> — ${escapeHtml(e.text)}</li>`).join("")}</ol>`:'<p><em>No merchant changes recorded yet.</em></p>';}

export async function createMerchantJournal(tokenDoc,inventory,data){
  const sceneName=tokenDoc.parent?.name??"Unknown Scene";const folder=await journalSceneFolder(sceneName);const name=uniqueJournalName(`${tokenDoc.name} — ${sceneName}`);
  const journal=await JournalEntry.create({name,folder:folder.id,ownership:journalOwnership(data.journal),flags:{[MODULE_ID]:{merchantId:data.merchantId,sceneId:tokenDoc.parent?.id,tokenId:tokenDoc.id,inventoryActorId:inventory.id}},pages:[
    {name:"Storefront",type:"text",text:{format:1,content:""}},
    {name:"Inventory & Treasury",type:"text",text:{format:1,content:""}},
    {name:"Customer Relations",type:"text",text:{format:1,content:""}},
    {name:"Transaction Ledger",type:"text",text:{format:1,content:""}},
    {name:"GM Notes",type:"text",text:{format:1,content:""}}
  ]});
  await syncMerchantJournal(tokenDoc,journal);return journal;
}

export async function syncMerchantJournal(tokenDoc,journal=null){
  const data=getMerchantData(tokenDoc);if(!data?.inventoryActorId)return;const inv=game.actors.get(data.inventoryActorId);if(!inv)return;
  journal??=game.journal.get(data.journalId);if(!journal)return;
  const scene=tokenDoc.parent?.name??"Unknown Scene";const treasury=currencyLine(inv);const max=data.treasury?.unlimited?"Unlimited":formatCopper(data.treasury?.maxFundsCp??0);
  const pages=Object.fromEntries((journal.pages?.contents??[]).map(p=>[p.name,p]));
  const storefront=`<section class="sbs-merchant-journal"><h1>${escapeHtml(tokenDoc.name)}</h1><p><strong>Scene:</strong> ${escapeHtml(scene)}<br><strong>Shop:</strong> ${escapeHtml(data.customShopType||data.shopTypeLabel||data.shopType||'Merchant')}<br><strong>Status:</strong> ${escapeHtml(data.status||'open')}</p>${data.description?`<blockquote>${escapeHtml(data.description)}</blockquote>`:""}<p><small>Managed by SaltyBananaSlug's Merchants.</small></p></section>`;
  const inventory=`<section class="sbs-merchant-journal"><h1>Inventory & Treasury</h1><p><strong>Default customer purchase rate:</strong> ${Number(data.pricing?.sellRate??100)}%<br><strong>Default merchant buyback rate:</strong> ${Number(data.pricing?.buyRate??60)}%<br><strong>Current treasury:</strong> ${escapeHtml(treasury)}<br><strong>Maximum buying funds:</strong> ${escapeHtml(max)}</p><table><thead><tr><th></th><th>Item</th><th>Type</th><th>Stock</th><th>Base Value</th><th>Identification</th><th>Visible</th><th>Zero-value enabled</th></tr></thead><tbody>${stockRows(inv)}</tbody></table></section>`;
  const relations=`<section class="sbs-merchant-journal"><h1>Customer Relations</h1><table><thead><tr><th>Character</th><th>Favor</th><th>Player Pays</th><th>Merchant Pays</th></tr></thead><tbody>${relationRows(data)}</tbody></table></section>`;
  const ledger=`<section class="sbs-merchant-journal"><h1>Transaction Ledger</h1>${ledgerHtml(inv)}</section>`;
  const gmNotes=`<section class="sbs-merchant-journal"><h1>GM Notes</h1>${data.gmNotes?`<p>${escapeHtml(data.gmNotes).replace(/\n/g,'<br>')}</p>`:'<p><em>No GM notes.</em></p>'}</section>`;
  const updates=[];for(const [name,content] of [["Storefront",storefront],["Inventory & Treasury",inventory],["Customer Relations",relations],["Transaction Ledger",ledger],["GM Notes",gmNotes]])if(pages[name])updates.push({_id:pages[name].id,"text.content":content});
  if(updates.length)await journal.updateEmbeddedDocuments("JournalEntryPage",updates);
}

export async function renameMerchantJournal(tokenDoc){const data=getMerchantData(tokenDoc),j=game.journal.get(data?.journalId);if(!j)return;const desired=uniqueJournalName(`${tokenDoc.name} — ${tokenDoc.parent?.name??'Unknown Scene'}`,j.id);if(j.name!==desired)await j.update({name:desired});}
export async function syncMerchantJournalOwnership(tokenDoc){const data=getMerchantData(tokenDoc),j=game.journal.get(data?.journalId);if(j)await j.update({ownership:journalOwnership(data.journal)});}
