import {escapeHtml, notifyError} from "../utils.js";

/** Shared by the creator and existing merchants; pasted UUIDs also support compendiums. */
export function openStockTableDialog({table=null,onImport,label="Add Stock"}={}){
  if(!game.user.isGM)return;
  const tables=[...(game.tables?.contents??[])].sort((a,b)=>a.name.localeCompare(b.name));
  const options=tables.map(t=>`<option value="${escapeHtml(t.uuid)}">${escapeHtml(t.name)}</option>`).join("");
  const reference=table?`<p><strong>${escapeHtml(table.name)}</strong></p>`:`<label>World RollTable<select name="table"><option value="">Choose a table…</option>${options}</select></label><label>Or paste a RollTable UUID<input name="uuid" type="text" placeholder="RollTable.… or Compendium.…"><small>Use the UUID option for a table in a compendium.</small></label>`;
  let busy=false;
  // Legacy Dialog closes immediately after callbacks; hold it open during imports.
  const StockDialog=class extends Dialog{async close(options){if(busy)return this;return super.close(options);}};
  const dialog=new StockDialog({title:"Add Stock from Table",content:`<div class="sbsm-dialog">${reference}<label>Mode<select name="mode"><option value="draw">Roll table to add items</option><option value="all">Add every linked Item result</option></select></label><label>Number of rolls<input name="count" type="number" min="1" max="100" value="5"></label><p>Copies linked Items into stock without marking the source table's results as drawn. Plain text results are skipped.</p><p class="sbsm-table-status" role="status"></p></div>`,buttons:{cancel:{label:"Cancel"},import:{label,callback:html=>{
    if(busy)return false;
    const root=html[0]??html,status=root.querySelector(".sbsm-table-status");
    busy=true;if(status)status.textContent="Rolling table and adding stock…";
    Promise.resolve().then(async()=>{try{
      const uuid=table?.uuid||root.querySelector("[name='uuid']")?.value.trim()||root.querySelector("[name='table']")?.value;
      const selected=table||(uuid?await fromUuid(uuid):null);
      if(selected?.documentName!=="RollTable")throw new Error("Choose a RollTable or paste its UUID first.");
      const result=await onImport(selected,{mode:root.querySelector("[name='mode']").value,count:Number(root.querySelector("[name='count']").value)||1});
      ui.notifications.info(`Added ${result.items.length} item result(s) from ${selected.name}${result.skipped.length?`; skipped ${result.skipped.length} non-Item or broken result(s)`:""}.`);
      busy=false;await dialog.close();
    }catch(error){if(status)status.textContent=error.message;notifyError(error,"Could not add table stock");}finally{busy=false;}});
    return false; // Keep the controls and errors visible until the asynchronous import succeeds.
  }}},default:"import"},{classes:["sbs-merchants","sbsm-dialog-app"],width:540,resizable:true});
  dialog.render(true);return dialog;
}
