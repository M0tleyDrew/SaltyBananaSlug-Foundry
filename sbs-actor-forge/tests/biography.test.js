import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {ID} from '../scripts/core.js';
import {biographyHTML,mountBiography,openBiography} from '../scripts/biography.js';
import {saveDetails,readPrivateDetails} from '../scripts/privacy.js';
import {world} from './mock-world.js';
import {registerSheetAdapter,biographyHost} from '../scripts/sheet-adapters.js';

const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
test('V2 tabpanels mount below native biography fields without requiring the tab class',async()=>{
 const s=await setup();s.app.element.innerHTML='<nav><a data-tab="biography">Biography</a></nav><div role="tabpanel" data-tab="biography" data-group="actor"><prose-mirror name="system.details.biography.value"></prose-mirror></div>';
 const panel=s.mount();assert.ok(panel);assert.equal(panel.parentElement.getAttribute('role'),'tabpanel');assert.equal(s.app.element.querySelector('nav [data-sbs-biography]'),null);
});
test('semantic native biography editors locate alternative Notes panels and activate their group',async()=>{
 const s=await setup(),calls=[];s.app.element.innerHTML='<nav><a data-tab="notes">Notes</a></nav><section class="tab" data-tab="notes" data-group="actor"><div class="editor" data-edit="system.details.biography.value"></div></section>';
 s.actor.sheet={...s.app,tabGroups:{actor:'inventory'},render:async()=>{},changeTab:(...args)=>calls.push(args)};
 await openBiography(s.actor,{user:s.env.user,mount:(app,html)=>mountBiography(app,html,s.env)});assert.deepEqual(calls,[['notes','actor']]);assert.ok(s.app.element.querySelector('[data-sbs-biography]'));
});
test('explicit adapters support custom hosts and can be removed without inventing a tab',async()=>{
 const s=await setup();s.app.element.innerHTML='<section data-custom-bio><p>Native lore</p></section>';s.app.custom=true;
 const unregister=registerSheetAdapter({id:'test-custom',match:app=>app.custom,findHost:(_app,root)=>({host:root.querySelector('[data-custom-bio]'),tab:'lore',group:'custom'})});
 try{assert.ok(s.mount());assert.equal(biographyHost(s.app,s.app.element,s.actor).tab,'lore');}finally{unregister();}
 assert.equal(biographyHost(s.app,s.app.element,s.actor),null);
});
test('unsupported sheets report the native sheet fallback without a separate notes window',async()=>{
 const s=await setup(),warnings=[];s.app.element.innerHTML='<section data-tab="inventory">Inventory only</section>';s.actor.sheet={...s.app,render:async()=>{}};
 await openBiography(s.actor,{user:s.env.user,mount:(app,html)=>mountBiography(app,html,s.env),onWarning:text=>warnings.push(text)});assert.equal(warnings.length,1);assert.match(warnings[0],/native D&D5e/);assert.equal(s.app.element.querySelector('[data-sbs-biography]'),null);
});
test('locked compendium sheets show all SBS fields read-only, including GM notes',async()=>{
 const s=await setup();s.actor.pack='world.templates';s.actor.compendium={locked:true};Object.defineProperty(s.actor,'uuid',{get:()=>`Compendium.world.templates.Actor.${s.actor.id}`});
 const panel=s.mount();assert.ok(panel);assert.equal(panel.querySelector('[data-sbs-save],[data-sbs-add],[data-sbs-advance]'),null);assert.ok([...panel.querySelectorAll('input,textarea')].every(el=>el.hasAttribute('readonly')));
});
async function setup({gm=true,level=3,type='character',tab='biography'}={}) {
  const env=world();env.user={id:gm?'gm1':'player',isGM:gm};
  const actor=await env.create('Actor',{name:'Biography test',type,ownership:{player:level},flags:{[ID]:{details:[]}}});
  await saveDetails(env,actor,[{section:'Lore',label:'Public',value:'Original public note'}],[{section:'Secrets',label:'GM',value:'SECRET_ONLY_FOR_GM'}]);
  env.isGM=gm;
  const {document,window}=parseHTML(`<html><body><form><nav><a data-tab="${tab}">Biography</a></nav><section class="tab active" data-tab="${tab}" data-group="primary"><textarea name="system.details.biography.value">Native biography stays here</textarea></section></form></body></html>`);
  const app={actor,element:document.querySelector('form')},errors=[];
  const options={onError:err=>errors.push(err.message)};
  const mount=()=>mountBiography(app,app.element,env,options);
  return {env,actor,document,window,app,errors,options,mount,panel:mount()};
}
test('inline fields mount once in Biography, preserve native content and introduce no tab or native form fields',async()=>{
  const s=await setup();assert.equal(s.app.element.querySelectorAll('[data-sbs-biography]').length,1);s.mount();s.mount();
  assert.equal(s.app.element.querySelectorAll('[data-sbs-biography]').length,1);
  assert.equal(s.app.element.querySelectorAll('nav [data-tab]').length,1);
  assert.equal(s.app.element.querySelector('[name="system.details.biography.value"]').value,'Native biography stays here');
  assert.equal(s.panel.querySelectorAll('[name],[data-action]').length,0);
  assert.ok(s.panel.querySelector('.sbs-biography-scroll'));assert.ok(s.panel.querySelector('.sbs-biography-actions [data-sbs-save]'));
});
test('Owner notes save without GM fields, native change submission or private data exposure',async()=>{
  const s=await setup({gm:false});let submits=0;s.app.element.addEventListener('change',()=>submits++);
  assert.ok(!s.panel.innerHTML.includes('SECRET_ONLY_FOR_GM'));assert.equal(s.panel.querySelector('[data-sbs-gm]'),null);
  const input=s.panel.querySelector('[data-sbs-field="value"]');input.value='Owner edited this';input.dispatchEvent(new s.window.Event('change',{bubbles:true}));
  assert.equal(submits,0);s.panel.querySelector('[data-sbs-save]').click();await tick();
  assert.equal(s.actor.flags[ID].details[0].value,'Owner edited this');s.env.isGM=true;
  assert.equal(readPrivateDetails(s.env,s.actor.id)[0].value,'SECRET_ONLY_FOR_GM');assert.deepEqual(s.errors,[]);
});
test('Observers get read-only notes and no edit actions; Limited actors receive no panel',async()=>{
  const s=await setup({gm:false,level:2});assert.equal(s.panel.querySelectorAll('[data-sbs-save],[data-sbs-add],[data-sbs-remove]').length,0);
  assert.ok([...s.panel.querySelectorAll('input,textarea')].every(el=>el.hasAttribute('readonly')));
  const limited=await setup({gm:false,level:1});assert.equal(limited.panel,null);
});
test('GM notes save to the protected journal and remain outside actor data',async()=>{
  const s=await setup();const input=s.panel.querySelector('[data-sbs-gm] [data-sbs-field="value"]');
  input.value='Changed secret';input.dispatchEvent(new s.window.Event('input',{bubbles:true}));s.panel.querySelector('[data-sbs-save]').click();await tick();
  assert.equal(readPrivateDetails(s.env,s.actor.id)[0].value,'Changed secret');assert.ok(!JSON.stringify(s.actor.toObject()).includes('Changed secret'));
  assert.equal(s.panel.querySelector('[data-sbs-status]').textContent,'Saved');assert.deepEqual(s.errors,[]);
});
test('unsaved drafts survive native sheet part replacement and can be reloaded or saved',async()=>{
  const s=await setup();const input=s.panel.querySelector('[data-sbs-public] [data-sbs-field="value"]');
  input.value='Draft survives';input.dispatchEvent(new s.window.Event('input',{bubbles:true}));
  s.app.element.querySelector('.tab').innerHTML='<p>Native rerender</p>';let panel=s.mount();
  assert.equal(panel.querySelector('[data-sbs-field="value"]').value,'Draft survives');assert.equal(panel.querySelector('[data-sbs-status]').textContent,'Unsaved changes');
  panel.querySelector('[data-sbs-reload]').click();await tick();panel=s.app.element.querySelector('[data-sbs-biography]');
  assert.equal(panel.querySelector('[data-sbs-field="value"]').value,'Original public note');
  panel.querySelector('[data-sbs-add="Public"]').click();assert.equal(panel.querySelectorAll('[data-sbs-public] [data-sbs-visibility]').length,2);
  panel.querySelector('[data-sbs-public] [data-sbs-remove]').click();assert.equal(panel.querySelectorAll('[data-sbs-public] [data-sbs-visibility]').length,1);
});
test('concurrent note changes are caught before a draft can overwrite them',async()=>{
  const s=await setup();const input=s.panel.querySelector('[data-sbs-field="value"]');input.value='My draft';input.dispatchEvent(new s.window.Event('input',{bubbles:true}));
  await saveDetails(s.env,s.actor,[{section:'Lore',label:'Public',value:'Other client saved'}],undefined);
  s.panel.querySelector('[data-sbs-save]').click();await tick();
  assert.equal(s.actor.flags[ID].details[0].value,'Other client saved');assert.match(s.errors[0],/changed since/);
});
test('vehicle notes use Description and the launcher activates native tabs without opening a dialog',async()=>{
  const s=await setup({type:'vehicle',tab:'description'}),calls=[];s.actor.sheet={...s.app,tabGroups:{primary:'inventory'},render:async o=>calls.push(o),changeTab:(...args)=>calls.push(args)};
  await openBiography(s.actor,{user:s.env.user,mount:(app,html)=>mountBiography(app,html,s.env)});
  assert.deepEqual(calls,[{force:true,tab:'description'},['description','primary']]);assert.ok(s.panel);
});
test('rendering long escaped notes retains the content without interpreting HTML',async()=>{
  const s=await setup();const text='<img src=x onerror=alert(1)> '+('Long lore line.\n'.repeat(300));
  const html=biographyHTML(s.actor,s.env,{public:[{section:'Lore',label:'Long',value:text}],private:[]});
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  await saveDetails(s.env,s.actor,[{section:'Lore',label:'Long',value:text}],[]);
  const panel=s.mount();assert.equal(panel.querySelector('textarea').value,text);assert.equal(panel.querySelectorAll('img').length,1);
});
test('permission changes remove private markup and downgrade fields on an existing DOM',async()=>{
  const s=await setup();s.env.isGM=false;s.env.user={id:'player',isGM:false};let panel=s.mount();
  assert.ok(!panel.innerHTML.includes('SECRET_ONLY_FOR_GM'));await s.actor.update({'ownership.player':2});panel=s.mount();
  assert.equal(panel.querySelector('[data-sbs-save]'),null);assert.ok(panel.querySelector('textarea').hasAttribute('readonly'));
  await s.actor.update({'ownership.player':1});assert.equal(s.mount(),null);assert.equal(s.app.element.querySelector('[data-sbs-biography]'),null);
});
