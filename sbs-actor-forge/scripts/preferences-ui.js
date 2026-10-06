import {clone,esc} from './core.js';
import {MODES,CATEGORIES} from './updates.js';
import {readPreferences,savePreset,presetSettings,deletePreference} from './preferences.js';
import {applyOwnershipChoices,normalizeOwnership} from './permissions.js';
import {folderLabel} from './folders.js';

export async function saveRowPreset(plan,scope,{Dialog,env,report}) {
  const name=await Dialog.wait({window:{title:'Actor Forge — Save Preset'},content:`<div class="sbs-forge"><p>Save the folder, update mode, categories, advancement setting, account choices, collections and loaded library choices from <strong>${esc(plan.data.name)}</strong>. Actor content and update targets are excluded.</p><label>Preset name<input name="name" placeholder="My NPC imports" maxlength="100"></label></div>`,buttons:[{action:'save',label:'Save Preset',default:true,callback:(_e,_b,d)=>d.element.querySelector('[name=name]').value}]});
  if(name===undefined || name===null)return;
  await savePreset(env(),name,{mode:plan.mode,categories:plan.categories,advance:plan.advance,folderPath:plan.folderPath || folderLabel(scope.get('Folder',plan.data.folder),scope.list('Folder')),ownership:plan.data.ownership,destination:scope.destination,libraryIds:scope.libraryIds ?? []});
  await report('Preset Saved',`${name.trim()} is available in Import and Presets.`);
}
export async function managePresets({Dialog,env,users,report,destinationControls,readDestination,permissionControls,categoryNames={}}) {
  const store=readPreferences(env(),'presets');
  const choice=await Dialog.wait({window:{title:'Actor Forge — Presets'},position:{width:650},content:`<div class="sbs-forge"><p>Save named import defaults for this world. Choose them in Import; every actor remains reviewable.</p><label>Preset<select name="preset">${store.entries.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('') || '<option value="">No saved presets</option>'}</select></label></div>`,buttons:[{action:'new',label:'New Preset',default:true,callback:()=>({action:'edit'})},{action:'edit',label:'Edit / Rename',callback:(_e,_b,d)=>({action:'edit',id:d.element.querySelector('[name=preset]').value})},{action:'delete',label:'Delete',callback:(_e,_b,d)=>({action:'delete',id:d.element.querySelector('[name=preset]').value})}]});
  if(!choice)return;
  const existing=store.entries.find(p=>p.id===choice.id);
  if(choice.id && !existing)throw Error('Preset missing. Reopen the list.');
  if(choice.action==='delete'){
    if(!existing)return;
    if(await Dialog.confirm({window:{title:'Delete preset?'},content:`<p>Delete ${esc(existing.name)}?</p>`}))await deletePreference(env(),'presets',existing.id,store.revision);
    return;
  }
  const settings=presetSettings(existing?.settings),libraries=readPreferences(env(),'libraries');
  const p={data:{ownership:settings.ownership},ownership:JSON.stringify(settings.ownership)};
  const saved=await Dialog.wait({window:{title:'Actor Forge — Edit Preset'},position:{width:720},content:`<div class="sbs-forge"><div class="scroll"><label>Name<input name="name" value="${esc(existing?.name ?? '')}" maxlength="100"></label>${destinationControls(settings.destination)}<label>Folder path<input name="folderPath" value="${esc(settings.folderPath)}" placeholder="SBS / Actors"></label><label>Update mode<select name="mode">${Object.entries(MODES).map(([k,label])=>`<option value="${k}" ${k===settings.mode?'selected':''}>${esc(label)}</option>`).join('')}</select></label><label><input name="advance" type="checkbox" ${settings.advance?'checked':''}> Apply unconfigured advancements in World imports</label><fieldset><legend>Content to update</legend>${CATEGORIES.map(k=>`<label><input type="checkbox" data-category="${k}" ${settings.categories.includes(k)?'checked':''}> ${esc(categoryNames[k] ?? k)}</label>`).join('')}</fieldset>${permissionControls(p)}<p>Permissions apply to existing actors only when the Permissions category is checked. Compendium visibility uses pack permissions.</p><fieldset><legend>Source libraries to load</legend>${libraries.entries.map(l=>`<label><input type="checkbox" data-library="${esc(l.id)}" ${settings.libraryIds.includes(l.id)?'checked':''}> ${esc(l.name)}</label>`).join('') || '<p>No saved source libraries yet.</p>'}</fieldset></div></div>`,buttons:[{action:'save',label:'Save Preset',default:true,callback:(_e,_b,d)=>({name:d.element.querySelector('[name=name]').value,settings:{mode:d.element.querySelector('[name=mode]').value,categories:[...d.element.querySelectorAll('[data-category]:checked')].map(el=>el.dataset.category),advance:d.element.querySelector('[name=advance]').checked,folderPath:d.element.querySelector('[name=folderPath]').value,destination:readDestination(d.element),libraryIds:[...d.element.querySelectorAll('[data-library]:checked')].map(el=>el.dataset.library),ownership:applyOwnershipChoices(normalizeOwnership(settings.ownership),d.element.querySelector('[name=access-default]').value,[...d.element.querySelectorAll('[data-access-user]')].map(el=>({id:el.dataset.accessUser,level:el.value})))}})}]});
  if(!saved)return;
  await savePreset(env(),saved.name,clone(saved.settings),{id:existing?.id,revision:store.revision});
  await report('Preset Saved',`${saved.name.trim()} is available in Import.`);
}
