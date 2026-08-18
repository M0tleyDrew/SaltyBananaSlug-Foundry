import {MODULE_ID} from "./constants.js";
import {currencyOf, escapeHtml, journalSceneFolder, quantityOf, uniqueJournalName} from "./utils.js";
import {lockSummary} from "./lock.js";

export function journalOwnership(cfg={}) {
  const ownership = {default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE};
  if (cfg.visibility === "all") {
    for (const u of game.users) if (!u.isGM) ownership[u.id] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
  } else if (cfg.visibility === "selected") {
    for (const id of cfg.selectedUserIds ?? []) {
      const user = game.users.get(id);
      if (user && !user.isGM) ownership[id] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
    }
  }
  return ownership;
}

function moneyLine(actor) {
  const c = currencyOf(actor);
  const parts = Object.entries(c).filter(([,v]) => v).map(([k,v]) => `${v} ${k}`);
  return parts.length ? parts.join(", ") : "None";
}

function itemRows(actor, maskUnidentified=false) {
  const items = actor?.items?.contents ?? [];
  if (!items.length) return `<tr><td colspan="3"><em>Empty</em></td></tr>`;
  return items.map(i => {
    const identified = foundry.utils.getProperty(i, "system.identified");
    const hide = maskUnidentified && identified === false;
    const name = hide ? (String(foundry.utils.getProperty(i, "system.unidentified.name") ?? "").trim() || "Unidentified Item") : i.name;
    const img = hide ? (String(foundry.utils.getProperty(i, "system.unidentified.img") ?? "").trim() || "icons/svg/mystery-man.svg") : (i.img ?? "icons/svg/item-bag.svg");
    return `<tr><td><img src="${escapeHtml(img)}" width="28" height="28"></td><td>${escapeHtml(name)}</td><td>${quantityOf(i)}</td></tr>`;
  }).join("");
}

export function journalContent(tokenDoc, actor, data) {
  const sceneName = tokenDoc.parent?.name ?? data.sceneName ?? "Unknown Scene";
  const state = data.state ?? "closed";
  const typeName = data.customType || data.typeLabel || data.type || "Container";
  const privateData = actor?.getFlag?.(MODULE_ID, "private") ?? {};
  const playerVisible = data.journal?.visibility === "all" || data.journal?.visibility === "selected";
  const original = privateData.originalContents ?? [];
  // A shared Journal cannot render different HTML for GM vs player viewers.
  // Keep GM-only audit details out of shared journals so unidentified names and
  // transaction history cannot reveal secrets. The GM still sees everything in
  // the live SBS container window.
  const originalHtml = !playerVisible && original.length ? `<details><summary>Original Contents</summary><ul>${original.map(x => `<li>${escapeHtml(x.name)} × ${x.quantity}</li>`).join("")}</ul></details>` : "";
  const history = (privateData.history ?? []).slice(-100).reverse();
  const historyHtml = !playerVisible && data.journal?.transactionLog ? `<details><summary>Recent History</summary>${history.length ? `<ul>${history.map(h => `<li><strong>${escapeHtml(h.when)}</strong> — ${escapeHtml(h.text)}</li>`).join("")}</ul>` : `<p><em>No transactions yet.</em></p>`}</details>` : "";

  return `
  <section class="sbs-container-journal">
    <h1>${escapeHtml(tokenDoc.name)}</h1>
    <p><strong>Scene:</strong> ${escapeHtml(sceneName)}<br>
    <strong>Type:</strong> ${escapeHtml(typeName)}<br>
    <strong>State:</strong> ${escapeHtml(state[0]?.toUpperCase() + state.slice(1))}<br>
    <strong>Lock:</strong> ${escapeHtml(lockSummary(tokenDoc))}</p>
    ${data.description ? `<blockquote>${escapeHtml(data.description)}</blockquote>` : ""}
    <h2>Current Contents</h2>
    <table><thead><tr><th></th><th>Item</th><th>Qty</th></tr></thead><tbody>${itemRows(actor, playerVisible)}</tbody></table>
    <p><strong>Currency:</strong> ${escapeHtml(moneyLine(actor))}</p>
    ${originalHtml}
    ${historyHtml}
    <hr><p><small>Managed by SaltyBananaSlug's Containers. This journal is a companion record; inventory is stored independently on the container's inventory Actor.</small></p>
  </section>`;
}

export async function createJournal(tokenDoc, actor, data) {
  const sceneName = tokenDoc.parent?.name ?? "Unknown Scene";
  const base = `${tokenDoc.name} — ${sceneName}`;
  const name = uniqueJournalName(base);
  const folder = await journalSceneFolder(sceneName);
  return JournalEntry.create({
    name,
    folder: folder.id,
    ownership: journalOwnership(data.journal),
    flags: {[MODULE_ID]: {containerId: data.containerId, sceneId: tokenDoc.parent?.id, tokenId: tokenDoc.id, inventoryActorId: actor.id}},
    pages: [{
      name: "Container Record",
      type: "text",
      text: {format: 1, content: journalContent(tokenDoc, actor, data)}
    }]
  });
}

export async function syncJournal(tokenDoc) {
  const data = tokenDoc?.getFlag?.(MODULE_ID, "container");
  if (!data?.journalId || !data?.inventoryActorId) return;
  const journal = game.journal.get(data.journalId);
  const actor = game.actors.get(data.inventoryActorId);
  if (!journal || !actor) return;
  const page = journal.pages?.contents?.[0];
  if (page) await page.update({"text.content": journalContent(tokenDoc, actor, data)});
}

export async function syncJournalOwnership(tokenDoc) {
  const data = tokenDoc?.getFlag?.(MODULE_ID, "container");
  const journal = game.journal.get(data?.journalId);
  if (!journal) return;
  await journal.update({ownership: journalOwnership(data.journal)});
}

export async function renameJournalForContainer(tokenDoc) {
  const data = tokenDoc.getFlag(MODULE_ID, "container");
  const journal = game.journal.get(data?.journalId);
  if (!journal) return;
  const sceneName = tokenDoc.parent?.name ?? "Unknown Scene";
  const desired = `${tokenDoc.name} — ${sceneName}`;
  if (journal.name === desired) return;
  const otherNames = new Set(game.journal.filter(j => j.id !== journal.id).map(j => j.name));
  let finalName = desired;
  let n = 2;
  while (otherNames.has(finalName)) finalName = `${desired} ${n++}`;
  await journal.update({name: finalName});
}
