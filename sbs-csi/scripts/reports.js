import {esc} from './core.js';
export function report(title,lines,{label='Import report',filename='SBS_CSI_Import_Report.txt'}={}){
  return foundry.applications.api.DialogV2.wait({window:{title},position:{width:820},content:`<div class="sbs-csi"><label>${esc(label)}<textarea data-report-text readonly rows="12" spellcheck="false">${esc(lines)}</textarea></label><div class="csi-inline"><button type="button" data-copy-report>Copy report</button><button type="button" data-save-report>Download report</button></div><p data-copy-status></p></div>`,render:(_event,dialog)=>{
    const root=dialog.element,field=root.querySelector('[data-report-text]');
    root.querySelector('[data-copy-report]').addEventListener('click',async()=>{let copied=false;try{await navigator.clipboard.writeText(field.value);copied=true;}catch{field.focus();field.select();try{copied=document.execCommand('copy');}catch{}}
      root.querySelector('[data-copy-status]').textContent=copied?'Report copied.':'Text selected. Press Ctrl+C (Command+C on Mac) to copy.';
    });
    root.querySelector('[data-save-report]').addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([field.value],{type:'text/plain;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);});
  },buttons:[{action:'close',label:'Close',default:true}]});
}
