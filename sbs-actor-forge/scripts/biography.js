import {ID,clone,esc,equal} from './core.js';
import {readPrivateDetails,saveDetails,actorRecordKey} from './privacy.js';
import {biographyHost,biographyTab} from './sheet-adapters.js';

const drafts=new WeakMap();
const editable=(actor,env)=>!actor.compendium?.locked && (env.isGM || actor.testUserPermission(env.user,'OWNER'));
const rootOf=(app,html)=>app.element?.querySelector ? app.element : html?.querySelector ? html : html?.[0];
const saved=(actor,env)=>({public:clone(actor.getFlag(ID,'details') ?? []),...(env.isGM ? {private:readPrivateDetails(env,actorRecordKey(actor))} : {})});

function rowHTML(row,visibility,canEdit) {
  const readonly=canEdit ? '' : 'readonly';
  return `<fieldset class="sbs-detail-entry" data-sbs-visibility="${visibility}">
    <label>Section<input data-sbs-field="section" value="${esc(row.section || 'Notes')}" ${readonly}></label>
    <label>Label<input data-sbs-field="label" value="${esc(row.label || '')}" ${readonly}></label>
    <label class="sbs-detail-value">Details<textarea data-sbs-field="value" rows="4" ${readonly}>${esc(row.value ?? '')}</textarea></label>
    ${canEdit ? '<button type="button" class="sbs-detail-remove" data-sbs-remove>Remove entry</button>' : ''}
  </fieldset>`;
}

// These fields deliberately have no name/data-action attributes: the native actor
// form must never submit private notes or treat the note buttons as sheet actions.
export function biographyHTML(actor,env,values=saved(actor,env)) {
  const canEdit=editable(actor,env);
  return `<section class="sbs-biography" data-sbs-biography aria-label="SBS Details">
    <header class="sbs-biography-heading"><img src="modules/${ID}/assets/forge.svg" alt=""><h3>SBS Details</h3></header>
    <div class="sbs-biography-scroll" tabindex="0" aria-label="Scrollable SBS details">
      <h4>Public details</h4><p class="sbs-detail-hint">Visible to everyone who can view this actor’s sheet.</p>
      <div data-sbs-public>${values.public.map(r=>rowHTML(r,'Public',canEdit)).join('')}</div>
      ${canEdit ? '<button type="button" data-sbs-add="Public">Add public entry</button>' : ''}
      ${env.isGM ? `<h4>GM notes</h4><p class="sbs-detail-hint">Private notes for GMs, saved separately from the actor.</p>
      <div data-sbs-gm>${(values.private ?? []).map(r=>rowHTML(r,'GM',canEdit)).join('')}</div>${canEdit?'<button type="button" data-sbs-add="GM">Add GM entry</button>':''}` : ''}
    </div>
    <footer class="sbs-biography-actions">
      ${canEdit ? '<button type="button" data-sbs-save>Save details</button><button type="button" data-sbs-reload>Reload saved</button>' : ''}
      ${canEdit && !actor.pack && !actor.inCompendium && actor.type==='character' ? '<button type="button" data-sbs-advance>Advancements</button>' : ''}
      <span data-sbs-status role="status" aria-live="polite">${canEdit ? 'Saved' : 'Read only'}</span>
    </footer>
  </section>`;
}

function collect(panel,isGM) {
  const rows=[...panel.querySelectorAll('[data-sbs-visibility]')].map(el=>({visibility:el.dataset.sbsVisibility,
    section:el.querySelector('[data-sbs-field="section"]').value,
    label:el.querySelector('[data-sbs-field="label"]').value,
    value:el.querySelector('[data-sbs-field="value"]').value}));
  return {public:rows.filter(r=>r.visibility==='Public').map(({visibility,...r})=>r),
    ...(isGM ? {private:rows.filter(r=>r.visibility==='GM').map(({visibility,...r})=>r)} : {})};
}

export function mountBiography(app,html,env,{onError=console.error,onAdvancements=async()=>{},force=false}={}) {
  const actor=app.actor ?? app.document;
  const root=rootOf(app,html);
  if(!root || actor?.documentName!=='Actor')return null;
  if(!actor.testUserPermission(env.user,'OBSERVER')){root.querySelector('[data-sbs-biography]')?.remove();drafts.delete(app);return null;}
  // Also clean up the old v0.2 header launcher if a sheet survived a module reload.
  root.querySelector('[data-sbs-details-button]')?.remove();
  const tab=biographyHost(app,root,actor)?.host;
  if(!tab)return null;
  let state=drafts.get(app);
  if(!state || state.actorId!==actorRecordKey(actor) || state.userId!==env.user.id || state.isGM!==env.isGM || state.canEdit!==editable(actor,env)) {
    state={actorId:actorRecordKey(actor),userId:env.user.id,isGM:env.isGM,canEdit:editable(actor,env),values:saved(actor,env),base:saved(actor,env),dirty:false,revision:0};
    force=true;
    drafts.set(app,state);
  }
  const existing=tab.querySelector('[data-sbs-biography]');
  if(existing && !state.dirty && !equal(saved(actor,env),state.base))force=true;
  if(existing && !force)return existing;
  existing?.remove();
  if(!state.dirty){state.values=saved(actor,env);state.base=clone(state.values);}
  tab.classList.add('sbs-biography-host');
  tab.insertAdjacentHTML('beforeend',biographyHTML(actor,env,state.values));
  const panel=tab.querySelector('[data-sbs-biography]');
  if(state.saving && panel.querySelector('[data-sbs-save]'))panel.querySelector('[data-sbs-save]').disabled=true;
  // Assign values as properties as well, preserving leading newlines exactly.
  for(const visibility of ['Public','GM']){
    const values=visibility==='Public' ? state.values.public : state.values.private ?? [];
    [...panel.querySelectorAll(`[data-sbs-visibility="${visibility}"]`)].forEach((row,i)=>{
      for(const field of ['section','label','value'])row.querySelector(`[data-sbs-field="${field}"]`).value=String(values[i]?.[field] ?? (field==='section' ? 'Notes' : ''));
    });
  }
  const status=text=>{const el=rootOf(app,html)?.querySelector('[data-sbs-status]');if(el)el.textContent=text;};
  if(state.dirty)status('Unsaved changes');
  const changed=()=>{if(!editable(actor,env))return;state.values=collect(panel,env.isGM);state.dirty=true;state.revision++;status('Unsaved changes');};
  // Isolate the native submit-on-change handler and preserve drafts across native rerenders.
  for(const event of ['input','change'])panel.addEventListener(event,e=>{e.stopPropagation();if(e.target.matches('[data-sbs-field]'))changed();});
  panel.addEventListener('keydown',e=>{if(!e.target.matches('[data-sbs-field]'))return;e.stopPropagation();if(e.key==='Enter' && e.target.tagName==='INPUT')e.preventDefault();});
  panel.addEventListener('click',async e=>{
    const button=e.target.closest('button');if(!button || !panel.contains(button))return;
    e.preventDefault();e.stopPropagation();
    try {
      if(button.hasAttribute('data-sbs-advance'))return await onAdvancements(actor);
      if(!editable(actor,env))throw Error('Only an actor owner can edit SBS Details');
      if(button.hasAttribute('data-sbs-remove')){button.closest('[data-sbs-visibility]').remove();changed();}
      else if(button.dataset.sbsAdd){
        if(button.dataset.sbsAdd==='GM' && !env.isGM)return;
        panel.querySelector(button.dataset.sbsAdd==='GM' ? '[data-sbs-gm]' : '[data-sbs-public]').insertAdjacentHTML('beforeend',rowHTML({},button.dataset.sbsAdd,true));changed();
      } else if(button.hasAttribute('data-sbs-reload')) {
        state.dirty=false;state.revision++;mountBiography(app,html,env,{onError,onAdvancements,force:true});
      } else if(button.hasAttribute('data-sbs-save') && !state.saving) {
        state.values=collect(panel,env.isGM);
        const current=saved(actor,env);
        if(!equal(current,state.base) && !equal(current,state.values))throw Error('These notes changed since you opened them. Use Reload saved to load the latest notes before saving.');
        const revision=state.revision,values=clone(state.values);state.saving=true;button.disabled=true;status('Saving…');
        try {
          await saveDetails(env,actor,values.public,values.private);state.base=clone(values);
          if(state.revision===revision)state.dirty=false;
          status(state.dirty ? 'Unsaved changes' : 'Saved');
        } finally {state.saving=false;const b=rootOf(app,html)?.querySelector('[data-sbs-save]');if(b)b.disabled=false;}
      }
    } catch(err){status('Could not save');onError(err);}
  });
  return panel;
}

export async function openBiography(actor,{user,mount,onWarning=()=>{}}) {
  if(!actor?.testUserPermission(user,'OBSERVER'))return;
  const sheet=actor.sheet,tab=biographyTab(actor);
  if(!sheet)throw Error('This actor has no sheet to open');
  if(sheet.tabGroups)await sheet.render({force:true,tab});
  else await sheet.render(true);
  const location=biographyHost(sheet,rootOf(sheet,sheet.element),actor);
  if(typeof sheet.changeTab==='function')sheet.changeTab(location?.tab ?? tab,location?.group ?? 'primary');
  else if(typeof sheet.activateTab==='function')sheet.activateTab(location?.tab ?? tab,{group:location?.group ?? 'primary'});
  const panel=mount(sheet,sheet.element);
  if(!panel){onWarning('This sheet does not expose a supported Biography or Description field. Select the native D&D5e sheet in the actor’s sheet settings.');return;}
  // Scroll the native tab to the inline section; the rest of Biography stays scrollable.
  panel.scrollIntoView?.({block:'start',behavior:'smooth'});
}
