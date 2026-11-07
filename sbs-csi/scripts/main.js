import {ID,VERSION,esc,number,clone} from './core.js';
import {loadPackage,refresh} from './files.js';
import {categories,findScene,preflight,importScene} from './engine.js';
import {dependencies,environment} from './foundry.js';
import {report} from './reports.js';
import {runBatch} from './batch.js';
import {calibratedWorkbook} from './embedded-artwork.js';
const D=()=>foundry.applications.api.DialogV2;
let busy=false;
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
export async function blankWorksheet(){const r=await fetch(`modules/${ID}/workbooks/SBS_CSI_Blank.xlsx`);if(!r.ok)throw Error('Blank worksheet is missing. Reinstall the full module.');download(await r.blob(),'SBS_CSI_Blank.xlsx');}
function summary(p){if(p.error)return p.error;const c=p.compiled;return `${c.type} · ${c.scene.width} × ${c.scene.height} px · ${c.walls.length} walls/openings · ${c.lights.length} lights · ${c.keys.length} keys`;}
function draw(canvas,p,points=[]){
  const ctx=canvas.getContext('2d'),c=p.compiled,s=Math.min(1,1400/p.dimensions.width,1000/p.dimensions.height);
  canvas.width=Math.round(p.dimensions.width*s);canvas.height=Math.round(p.dimensions.height*s);ctx.drawImage(p.imageElement,0,0,canvas.width,canvas.height);
  const sx=canvas.width/c.scene.width,sy=canvas.height/c.scene.height;
  if(c.scene.grid.alpha){ctx.strokeStyle='rgba(255,255,255,.25)';ctx.lineWidth=1;ctx.beginPath();for(let x=0;x<=c.scene.width;x+=c.scene.grid.size){ctx.moveTo(x*sx,0);ctx.lineTo(x*sx,canvas.height);}for(let y=0;y<=c.scene.height;y+=c.scene.grid.size){ctx.moveTo(0,y*sy);ctx.lineTo(canvas.width,y*sy);}ctx.stroke();}
  for(const l of c.lights){ctx.beginPath();ctx.strokeStyle=l.data.config.color;ctx.fillStyle=l.data.config.color+'22';ctx.arc(l.data.x*sx,l.data.y*sy,l.data.config.dim/c.scene.grid.distance*c.scene.grid.size*sx,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#fff';ctx.fillRect(l.data.x*sx-3,l.data.y*sy-3,6,6);}
  for(const w of c.walls){const [a,b,x,y]=w.data.c;ctx.lineWidth=w.data.door?5:2;const row=p.walls.find(r=>r.wall_id===w.key);ctx.strokeStyle=w.data.door?(w.data.ds===2?'#ff5577':w.data.door===2?'#ce7fff':'#ffe24a'):row?.kind==='window'?'#48dcff':'#7bfa91';ctx.beginPath();ctx.moveTo(a*sx,b*sy);ctx.lineTo(x*sx,y*sy);ctx.stroke();}
  ctx.strokeStyle='#fff';ctx.fillStyle='#ffe24a';ctx.lineWidth=2;for(const [x,y]of points){ctx.beginPath();ctx.arc(x*s,y*s,5,0,Math.PI*2);ctx.fill();ctx.stroke();}if(points.length===2){ctx.beginPath();ctx.moveTo(points[0][0]*s,points[0][1]*s);ctx.lineTo(points[1][0]*s,points[1][1]*s);ctx.stroke();}
}
async function review(plans){
  let current=plans.findIndex(p=>!p.error),points=[];const env=environment();
  const content=`<div class="sbs-csi"><h2>Inspect your scenes</h2><p>${plans.filter(p=>!p.error).length} ready; ${plans.filter(p=>p.error).length} need attention. Scenes with errors are excluded; valid scenes can still be imported.</p><div class="csi-review"><div class="csi-list">${plans.map((p,i)=>`<div class="csi-card"><label><input type="checkbox" data-scene="${i}" ${p.error?'disabled':'checked'}><strong>${esc(p.row.name||p.key)}</strong></label><button type="button" data-preview="${i}" ${p.error?'disabled':''}>Preview ${findScene(env,p.key)?'update':'new scene'}</button><small data-summary="${i}">${esc(summary(p))}</small></div>`).join('')}</div><div class="csi-map"><h3 data-title></h3><canvas aria-label="Map preview with walls, lights and calibration points"></canvas><p class="csi-legend">Green: wall · Yellow: door · Red: locked · Purple: secret · Cyan: window</p><p data-details></p><div data-calibration><p>Optional scale calibration: click two points spanning a known distance.</p><div class="csi-inline"><label>Measured distance<input name="measure" type="number" min="0.01" step="any" value="5"></label><button type="button" data-calibrate>Apply measurement</button><button type="button" data-reset>Clear points</button></div><small>Use the scene's units (normally feet). Calibration changes this import; save the worksheet to reuse it.</small></div><p class="csi-warning" data-warnings></p></div></div><fieldset><legend>Update these categories on existing scenes</legend><div class="csi-inline">${categories.map(cat=>`<label><input type="checkbox" data-category="${cat}" checked>${{scene:'Image & scene settings',walls:'Walls, doors & windows',lights:'Lights',keys:'Keys'}[cat]}</label>`).join('')}</div><p>New scenes always receive their complete setup. Updates preserve placed tokens. Uniform scale corrections reposition token centers on the same image locations; manual walls, tiles, drawings and other placed content still block geometry changes. Removed CSI walls/lights are removed when their category is selected; old key Items are retained.</p><label class="csi-warning"><input name="force" type="checkbox">Overwrite CSI content edited since the last import (selected categories only).</label></fieldset><button type="button" data-save>Download worksheet with these calibrations</button></div>`;
  return D().wait({window:{title:'SBS CSI — Validate & Preview'},position:{width:1150},content,render:(_event,dialog)=>{
    const root=dialog.element,canvas=root.querySelector('canvas');
    const show=i=>{current=i;points=[];const p=plans[i];root.querySelector('[data-title]').textContent=p.compiled.scene.name;root.querySelector('[data-details]').textContent=summary(p);root.querySelector('[data-warnings]').textContent=p.compiled.warnings.join('\n');root.querySelector('[data-calibration]').hidden=p.compiled.type==='scenic';draw(canvas,p,points);};
    for(const button of root.querySelectorAll('[data-preview]'))button.addEventListener('click',()=>show(Number(button.dataset.preview)));
    canvas.addEventListener('click',e=>{const p=plans[current];if(!p||p.error||p.compiled.type==='scenic')return;const rect=canvas.getBoundingClientRect();if(points.length===2)points=[];points.push([(e.clientX-rect.left)/rect.width*p.dimensions.width,(e.clientY-rect.top)/rect.height*p.dimensions.height]);draw(canvas,p,points);});
    root.querySelector('[data-reset]').addEventListener('click',()=>{points=[];if(current>=0)draw(canvas,plans[current],points);});
    root.querySelector('[data-calibrate]').addEventListener('click',()=>{try{if(points.length!==2)throw Error('Click two points on the preview first.');const distance=number(root.querySelector('[name=measure]').value,null,'Measured distance',0.01,100000);const p=plans[current],px=Math.hypot(points[1][0]-points[0][0],points[1][1]-points[0][1]);if(px<1)throw Error('Choose points farther apart.');const old=clone(p.row);p.row.grid_columns='';p.row.grid_size=px*p.compiled.scene.grid.distance/distance;try{refresh(p);}catch(e){p.row=old;refresh(p);throw e;}root.querySelector(`[data-summary="${current}"]`).textContent=summary(p);show(current);}catch(e){ui.notifications.error(e.message);}});
    root.querySelector('[data-save]').addEventListener('click',async()=>{try{download(await calibratedWorkbook(plans[0].workbook,plans.map(p=>p.row)),'SBS_CSI_Calibrated.xlsx');}catch(e){ui.notifications.error(e.message);}});if(current>=0)show(current);else{canvas.hidden=true;root.querySelector('[data-calibration]').hidden=true;root.querySelector('[data-title]').textContent='No scenes are ready';root.querySelector('[data-details]').textContent='Close this preview and add the missing artwork, then try again.';}
  },buttons:[{action:'import',label:'Import Selected Scenes',default:true,callback:(_event,_button,dialog)=>{const root=dialog.element;return {plans:[...root.querySelectorAll('[data-scene]:checked:not(:disabled)')].map(el=>plans[Number(el.dataset.scene)]),categories:[...root.querySelectorAll('[data-category]:checked')].map(el=>el.dataset.category),force:root.querySelector('[name=force]').checked};}},{action:'cancel',label:'Cancel'}]});
}
export async function open(){
  if(busy)return ui.notifications.warn('SBS CSI already has an import open.');
  let plans=[];busy=true;
  try{
    dependencies();
    const files=await D().wait({window:{title:`SaltyBananaSlug's Complete Scene Importer — ${VERSION}`},position:{width:780},content:`<div class="sbs-csi"><header><img src="modules/${ID}/assets/slug-surveyor.png" alt="SBS CSI slug surveyor"><div><h2>Complete Scene Importer</h2><p>Prepared maps and scenic images. One worksheet. One import.</p></div></header><label>CSI worksheet (.xlsx) with embedded artwork<input name="files" type="file" accept=".xlsx"></label><p><strong>One completed worksheet supplies the full-resolution artwork and scene setup.</strong> CSI extracts images from the Artwork tab and applies the walls, lights, doors, windows, locks and keys.</p><details><summary>Legacy ZIPs or external-image worksheets (optional)</summary><label>Legacy ZIP or additional images<input name="artwork" type="file" multiple accept=".zip,.png,.jpg,.jpeg,.webp,.avif"></label><label>Or select the artwork folder<input name="artfolder" type="file" webkitdirectory multiple></label></details><p data-file-summary></p><p>A worksheet may mix battle maps and scenic images. Download the blank template for its Artwork tab and setup instructions. Prepared geometry comes from the worksheet.</p><div class="csi-inline"><button type="button" data-blank>Download Blank Worksheet</button><button type="button" data-example>Download Example Worksheet</button></div><p>Lock & Key is active. Keys will be created under Items → Map Name → Keys.</p></div>`,render:(_event,dialog)=>{
      dialog.element.addEventListener('change',()=>{const all=[...dialog.element.querySelectorAll('input[type=file]')].flatMap(input=>[...input.files]);dialog.element.querySelector('[data-file-summary]').textContent=all.length?`${all.length} file(s) selected: ${all.slice(0,4).map(f=>f.name).join(', ')}${all.length>4?'…':''}`:'';});
      dialog.element.querySelector('[data-blank]').addEventListener('click',()=>blankWorksheet().catch(e=>ui.notifications.error(e.message)));
      dialog.element.querySelector('[data-example]').addEventListener('click',async()=>{try{const r=await fetch(`modules/${ID}/workbooks/SBS_CSI_Example.xlsx`);if(!r.ok)throw Error('Example package is missing.');download(await r.blob(),'SBS_CSI_Example.xlsx');}catch(e){ui.notifications.error(e.message);}});
    },buttons:[{action:'load',label:'Validate & Preview',default:true,callback:(_event,_button,dialog)=>[...dialog.element.querySelectorAll('input[type=file]')].flatMap(input=>[...input.files])},{action:'cancel',label:'Close'}]});
    if(!Array.isArray(files)||!files.length)return;
    ui.notifications.info('CSI is reading the worksheet and images…');plans=await loadPackage(files);
    const selected=await review(plans);
    if(!selected?.plans?.length){if(selected?.plans&&plans.some(p=>p.error))await report('SBS CSI — No scenes imported',plans.filter(p=>p.error).map(p=>p.error).join('\n\n'));return;}
    const result=await runBatch(selected.plans,environment(),selected,{onProgress:(i,total,p)=>ui.notifications.info(`CSI: importing ${i}/${total} — ${p.row.name||p.key}`)});
    const excluded=plans.filter(p=>p.error);if(excluded.length){result.failed=true;result.lines.push(`\n${excluded.length} scene(s) excluded because their artwork or setup needs attention:`,...excluded.map(p=>p.error));}
    await report(result.failed?'SBS CSI — Import finished with issues':'SBS CSI — Import complete',result.lines.join('\n'));
  }catch(e){console.error('SBS CSI',e);await report('SBS CSI — Cannot import',e.message);}finally{for(const p of plans)if(p.url)URL.revokeObjectURL(p.url);busy=false;}
}
Hooks.once('init',()=>{
  game.modules.get(ID).api={open,blankWorksheet};
  class CSIMenu extends foundry.applications.api.ApplicationV2{render(){void open();return this;}}
  game.settings.registerMenu(ID,'open',{name:'Complete Scene Importer',label:'Open SBS CSI',hint:'Import scenes or download the blank worksheet.',icon:'fas fa-map',type:CSIMenu,restricted:true});
});
function registerHub(api){api?.register({id:'sbs-csi:import',moduleId:ID,label:'Import scenes',gmOnly:true,open});api?.register({id:'sbs-csi:blank',moduleId:ID,label:'Download blank worksheet',gmOnly:true,open:blankWorksheet});}
Hooks.on('sbsHubReady',registerHub);
Hooks.once('ready',async()=>{
  registerHub(game.sbsHub);
  if(!game.user.isGM||game.users.activeGM?.id!==game.user.id)return;
  try{if(!game.macros.some(m=>m.flags?.[ID]?.launcher))await Macro.create({name:'SBS CSI — Complete Scene Importer',type:'script',img:`modules/${ID}/assets/slug-surveyor.png`,command:"game.modules.get('sbs-csi').api.open();",flags:{[ID]:{launcher:true}},ownership:{default:0}});}catch(e){console.warn('SBS CSI: create the launcher manually using CSI_Launcher.js',e);}
});
