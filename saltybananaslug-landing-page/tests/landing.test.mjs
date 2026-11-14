import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults,ID} from '../scripts/model.mjs';

globalThis.Hooks={on(){},once(){}};
globalThis.foundry={applications:{api:{ApplicationV2:class {}}}};
globalThis.CONST={DOCUMENT_OWNERSHIP_LEVELS:{OWNER:3,OBSERVER:2}};
const {LandingDashboard,LandingEditor}=await import('../scripts/main.mjs');

test('restricted and client-missing actors retain names and portraits only',async()=>{
  const actor={id:'a',name:'First',img:'first.webp',testUserPermission(){return false},
    get system(){throw Error('Read restricted actor stats')}};
  globalThis.game={user:{isGM:false},actors:new Map([['a',actor]]),modules:new Map(),
    users:[{character:actor},{_source:{character:'b'}}]};
  const p=defaults();
  p.roster=[{id:'b',name:'Second',img:'second.webp'}];
  p.background='scene-art.webp';
  const dashboard=new LandingDashboard();
  dashboard.config=p;
  for (const automatic of [true,false]){
    p.autoParty=automatic;p.actorIds=['a','b'];
    const html=await dashboard.buildHTML();
    for(const token of ['First','Second','first.webp','second.webp'])assert.ok(html.includes(token));
    assert.doesNotMatch(html,/data-lp-action="document"|HP|sbs-lp-health|scene-art.webp/);
  }
  p.sections.party=false;
  assert.doesNotMatch(await dashboard.buildHTML(),/data-panel="party"/);
});

test('republishing updates native art and scene dimensions together and publishes only roster identity',async()=>{
  const actor={id:'a',name:'First',img:'portrait.webp',system:{secret:'private'}};
  const updates=[];
  const scene={id:'landing',getFlag:()=>true,update:async data=>updates.push(data)};
  const scenes=new Map([['landing',scene]]);
  globalThis.game={user:{isGM:true},actors:new Map([['a',actor]]),users:[{character:actor}],scenes};
  globalThis.ui={notifications:{info(){}}};
  globalThis.Image=class {naturalWidth=800;naturalHeight=1000;async decode(){}};
  const editor=new LandingEditor();
  editor.capture=()=>{};editor.save=async()=>({id:'preset'});editor.render=async()=>{};
  editor.element={querySelector:()=>({value:'landing'})};
  editor.p.background='campaign.webp';
  await editor.action('publish');
  assert.deepEqual(updates[0][`flags.${ID}.landing`].roster,[{id:'a',name:'First',img:'portrait.webp'}]);
  assert.equal(updates[0]['background.src'],'campaign.webp');
  assert.deepEqual([updates[0].width,updates[0].height],[800,1000]);
  editor.p.background='';
  await editor.action('publish');
  assert.deepEqual(Object.keys(updates[1]),[`flags.${ID}.landing`]);
});
