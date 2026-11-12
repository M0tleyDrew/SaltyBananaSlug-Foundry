import {ID,BREAK_LIMIT,PHYSICAL_TYPES,TOOLS,MATERIALS,DEFAULT_PROFILES,DEFAULT_RARITIES,clone,numeric,tracked,stateFor,durabilityFactors,rarityKey,condition,damagePercent,usable,repairQuote,moneyCP,protectionFor,isBodyArmor} from './core.mjs';
import {settings} from './settings.mjs';
import {toolSupport,paidServices,createRepairer} from './repairers.mjs';
import {request,quoteView,batchRepairView,inCombat,canManage,canMendTarget,primaryGM,esc,formatGP,createSupplies} from './service.mjs';
import {mendingSources,mendingReasons} from './mending.mjs';
import {damageDicePenaltyActive,weaponDamageSummary} from './damage-dice.mjs';

const openWindows=new Set();
export async function run(fn) {try{return await fn();}catch(error){console.error('SBS Breakable Items',error);ui.notifications.error(error.message);}}
const options=(values,current)=>Object.entries(values).map(([v,l])=>`<option value="${esc(v)}" ${v===current?'selected':''}>${esc(l?.label??l)}</option>`).join('');
const input=(name,value,type='number',attrs='')=>`<input type="${type}" name="${name}" value="${esc(value)}" ${attrs}>`;
const check=(name,value,label)=>`<label class="bi-check"><input type="checkbox" name="${name}" ${value?'checked':''} ${name==='rule.blockBroken'?'disabled':''}>${esc(label)}</label>`;
export function bar(s){return `<div class="bi-health ${s.destroyed?'is-destroyed':s.hp===0?'is-broken':s.unbreakable?'is-unbreakable':s.hp/s.max<=0.25?'is-low':''}"><div class="bi-health-fill" style="width:${Math.round(s.hp/s.max*100)}%"></div><span>${s.hp} / ${s.max} HP · ${damagePercent(s)}% damaged${s.unbreakable?' · Unbreakable':''}</span></div>`;}
export function badgeText(s) {return `${s.hp}/${s.max} HP · ${damagePercent(s)}% damaged · ${s.breaks}/${BREAK_LIMIT} breaks${s.unbreakable?' · Unbreakable':''}${s.destroyed?' · DESTROYED':s.hp===0?' · BROKEN':s.breaks===2?' · Next break destroys':''}`;}
export function protectionLabel(item){
 const p=protectionFor(item);if(p.permanent)return 'Unbreakable — permanent property';
 if(p.temporaryActive){if(p.remainingSeconds===null)return 'Unbreakable — temporary, until the GM removes it';const n=p.remainingSeconds;return `Unbreakable — temporary (${n<60?`${Math.ceil(n)} seconds`:`${Math.ceil(n/60)} minutes`} remaining)`;}
 return p.active?'Unbreakable — active property or enchantment':'Not Unbreakable';
}
export function defaultActor(){
 const selected=globalThis.canvas?.tokens?.controlled?.[0]?.actor;if(selected&&canManage(game.user,selected))return selected;
 const assigned=game.user.character;return assigned&&canManage(game.user,assigned)?assigned:null;
}
export class BaseWindow extends foundry.applications.api.ApplicationV2 {
 static DEFAULT_OPTIONS={classes:['sbs-breakable'],position:{width:960,height:680},window:{resizable:true}};
 async _renderHTML(context){const div=document.createElement('div');div.className='bi-shell';div.innerHTML=context.html;return div;}
 _replaceHTML(result,content){
  const sameItem=this._lastRenderedItem===this.selected,detail=content.querySelector('.bi-detail')?.scrollTop??0,list=content.querySelector('.bi-item-list')?.scrollTop??0;
  content.replaceChildren(result);if(sameItem){const pane=content.querySelector('.bi-detail');if(pane)pane.scrollTop=detail;}
  const inventory=content.querySelector('.bi-item-list');if(inventory)inventory.scrollTop=list;this._lastRenderedItem=this.selected;
 }
 get durabilityClosing(){return this._biClosing===true;}
 async render(options,...args){if(this.durabilityClosing)return this;return super.render(options,...args);}
 async close(options){this._biClosing=true;openWindows.delete(this);this.events?.abort();return super.close(options);}
 async _onClose(options){openWindows.delete(this);this.events?.abort();return super._onClose(options);}
 bind(){openWindows.add(this);this.events?.abort();this.events=new AbortController();return this.events.signal;}
}
export class EquipmentTracker extends BaseWindow {
 static DEFAULT_OPTIONS={id:'sbs-equipment-tracker',window:{title:"SaltyBananaSlug's Breakable Items — Equipment Tracker"}};
 constructor(options={}){super(options);this.actorUuid=options.actorUuid??defaultActor()?.uuid;this.selected=options.itemId??null;this.query='';this.filter='all';}
 async _prepareContext(){
  const actor=this.actorUuid?await fromUuid(this.actorUuid):null;this.actor=actor&&canManage(game.user,actor)?actor:null;
  const cfg=settings(),items=[...(this.actor?.items??[])].filter(i=>PHYSICAL_TYPES.has(i.type)&&!i.flags?.[ID]?.material).sort((a,b)=>a.name.localeCompare(b.name));
  if(!items.some(i=>i.id===this.selected))this.selected=items[0]?.id;
  const selected=items.find(i=>i.id===this.selected),isGM=game.user.isGM;
  const rows=items.map(i=>{const enabled=tracked(i,cfg.rules),s=stateFor(i,cfg.profiles,cfg.durability),warn=s.breaks===2&&!s.destroyed;
   return `<button type="button" class="bi-item ${this.selected===i.id?'is-selected':''}" data-bi-select="${i.id}" data-search="${esc(i.name.toLowerCase())}" data-protected="${s.unbreakable}" data-condition="${enabled?s.destroyed?'destroyed':s.hp===0?'broken':s.hp<s.max?'damaged':'intact':'untracked'}"><img src="${esc(i.img)}" alt=""><span><strong>${esc(i.name)}</strong>${s.unbreakable?'<small class="bi-protected">Unbreakable</small>':''}${enabled?`<small>${esc(condition(s))} · ${s.hp}/${s.max} HP · ${damagePercent(s)}% damaged</small><small class="${warn?'bi-danger':''}">${s.breaks}/3 breaks${warn?' — next break destroys':''}</small>`:`<small>Not tracked${numeric(i.system?.quantity,1)!==1?' · split stack to track':''}</small>`}</span></button>`;}).join('');
  return {html:`<header class="bi-top"><div><div class="bi-eyebrow">SBS / EQUIPMENT TRACKER</div><h2>Keep your gear in one piece.</h2></div><div class="bi-top-actions"><button type="button" data-bi-refresh title="Refresh"><i class="fas fa-arrows-rotate"></i> Refresh</button>${isGM?'<button type="button" data-bi-add-repairer>Add / place repairer</button><button type="button" data-bi-setup><i class="fas fa-sliders"></i> Setup</button>':''}</div></header>
  <div class="bi-character"><label>Viewing equipment<input type="text" name="actorName" data-bi-current-actor data-actor-uuid="${esc(this.actor?.uuid??'')}" value="${esc(this.actor?.name??'Select a token or assign your player character')}" readonly></label><button type="button" data-bi-token>Use selected token</button><button type="button" data-bi-fix-all ${!this.actor||inCombat(this.actor)?'disabled':''}>Fix All — review costs</button><button type="button" data-bi-help>Help</button><div class="bi-wallet">${this.actor?formatGP(moneyCP(this.actor.system.currency)):''}</div></div>
  ${this.actor?.flags?.[ID]?.batchRepair?`<div class="bi-notice"><strong>Fix All awaiting GM approval</strong><p>${formatGP(this.actor.flags[ID].batchRepair.totalCP)}</p>${isGM?'<button type="button" data-bi-approve-all>Review Fix All</button>':''}<button type="button" data-bi-cancel-all>Cancel request</button></div>`:''}
  ${!primaryGM()?'<div class="bi-notice bi-danger">A GM must be connected to update equipment or perform repairs.</div>':''}
  ${this.actor&&inCombat(this.actor)?'<div class="bi-notice bi-danger"><i class="fas fa-swords"></i> In combat — repairs are locked. Equipment can still be inspected.</div>':''}
  <div class="bi-body"><aside class="bi-inventory"><div class="bi-list-controls"><input type="search" name="search" placeholder="Find equipment…" value="${esc(this.query)}"><select name="filter">${options({all:'All equipment',damaged:'Damaged',broken:'Broken',destroyed:'Destroyed',unbreakable:'Unbreakable',untracked:'Not tracked'},this.filter)}</select></div><div class="bi-item-list">${rows||'<p class="bi-empty">Choose a token or open Equipment durability from a creature’s sheet.</p>'}<p class="bi-empty" data-bi-no-results hidden>No matching equipment.</p></div>${this.actor?'<p class="bi-muted">Equipment is tracked automatically on all creatures. Individual opt-outs are preserved.</p>':''}${isGM&&this.actor?'<button type="button" data-bi-recalculate-all>Recalculate HP for this creature</button>':''}</aside>
  <main class="bi-detail">${selected?this.detail(selected,cfg):'<div class="bi-empty">Select an item to view durability and repairs.</div>'}</main></div>
  <footer class="bi-footer">0 HP = broken. Third break = destroyed. Repairs preserve break history. Tools are retained; repair parts are consumed.</footer>`};
 }
 detail(item,cfg){
  const s=stateFor(item,cfg.profiles,cfg.durability),enabled=tracked(item,cfg.rules),isGM=game.user.isGM,profile={...(cfg.profiles[s.profile]??DEFAULT_PROFILES.gear),...s.config},factors=durabilityFactors(item,cfg.profiles,cfg.durability);
  let repair='';
  if(enabled&&!s.destroyed&&s.hp<s.max){
   try{const view=quoteView(item);repair=`<section class="bi-card"><h3>Repair this item</h3>${cfg.rules.mendingEnabled?'<button type="button" data-bi-mending>Cast Mending</button>':''}<p>${s.hp===0?`Broken: DC ${view.quote.dc} ${esc(TOOLS[view.quote.tool]??view.quote.tool)} check required. A successful repair restores full HP.`:'Routine repairs need the correct proficiencies, tools, and parts. No check.'}</p>
    <div class="bi-requirements">${this.requirement(view.tool.present,TOOLS[view.quote.tool]??view.quote.tool??'No tool required')}${view.quote.requireProficiency?this.requirement(view.tool.proficient,'Tool proficiency'):''}${view.quote.arcana?this.requirement(view.tool.arcana,'Arcana proficiency'):''}${view.quote.requirements.map(r=>{const missing=view.plan.missing.find(m=>m.key===r.key)?.missing??0;return this.requirement(missing===0,`${r.quantity-missing}/${r.quantity} ${r.label}`);}).join('')}</div>
    <div class="bi-action-grid"><button type="button" data-bi-repair ${inCombat(item.actor)?'disabled':''} title="${esc(view.reasons.join(' '))}"><i class="fas fa-hammer"></i> Repair / choose helper</button><button type="button" data-bi-paid ${inCombat(item.actor)?'disabled':''}><i class="fas fa-coins"></i> Paid repair quote</button></div>
    ${view.reasons.length?`<p class="bi-muted">${esc(view.reasons.join(' '))} ${view.plan.missing.length&&s.hp>0?'You can preview a smaller repair with fewer parts.':''}</p>`:''}<p class="bi-muted">Full repair: ${view.quote.minutes} minutes of downtime. Choose a partial repair in the next window.</p></section>`;}catch(error){repair=`<div class="bi-notice">${esc(error.message)}</div>`;}
  }else if(s.destroyed&&enabled)repair='<div class="bi-notice bi-danger">Destroyed permanently. No repair action can restore this item.</div>';
  const historyHTML=s.history.slice(-15).reverse().map(h=>`<li><strong>${esc(h.kind)}</strong>${h.amount!==undefined?` · ${h.amount} HP`:''}<small>${esc(h.reason??'')}${h.by?` · ${esc(h.by)}`:''} · ${new Date(h.at).toLocaleString()}</small></li>`).join('');
  return `<div class="bi-item-heading"><img src="${esc(item.img)}" alt=""><div><div class="bi-eyebrow">${esc(cfg.profiles[s.profile]?.label??s.profile)}</div><h2>${esc(item.name)}</h2><button type="button" class="bi-link" data-bi-sheet>Open item sheet</button></div></div>
   ${s.unbreakable?`<div class="bi-notice bi-protected"><strong>${esc(protectionLabel(item))}</strong><p>New wear, item damage, and destruction are prevented. Existing HP and break history are preserved.</p></div>`:''}
   ${damageDicePenaltyActive(item,s,cfg.rules)?`<div class="bi-notice"><strong>Weapon damage reduced — 50% damaged or worse</strong><p>${esc(weaponDamageSummary(item,s,cfg.rules))}. Each base damage die steps down once. Flat bonuses and separate additional damage stay unchanged.</p><p>Repair above half HP to restore normal damage dice.</p></div>`:''}
   <p class="bi-muted">${esc(cfg.rarities[factors.rarity]?.label??factors.rarity)} · ${esc(factors.material)} · ${esc(factors.quality)} · wear ×${Number(factors.wearMultiplier.toFixed(3))}. Calculated maximum: ${factors.max} HP; saved maximum: ${s.max} HP.</p>
   ${numeric(item.system.quantity,1)>1?'<div class="bi-notice">This stack shares one durability record. Split items to keep separate health; repairs account for every item in the stack.</div>':''}
   ${enabled&&usable(s)?'<section class="bi-card"><h3>Item use</h3><p class="bi-muted">Record narrative uses that Foundry has not already counted. Viewing a sheet does not wear an item.</p><div class="bi-action-grid"><button type="button" data-bi-use>Record Use</button><button type="button" data-bi-use-details>Multiple / strenuous uses</button></div></section>':''}
   ${enabled?`${bar(s)}<div class="bi-stats"><span><strong>${esc(condition(s))}</strong><small>Condition</small></span><span><strong>${s.breaks} / 3</strong><small>Lifetime breaks</small></span><span><strong>${isBodyArmor(item)?s.hitsTaken:s.uses}</strong><small>${isBodyArmor(item)?'Armor events':'Recorded uses'}</small></span></div>${s.breaks===2&&!s.destroyed?'<div class="bi-notice bi-danger"><strong>Next break destroys this item permanently.</strong></div>':''}<p class="bi-muted">${isBodyArmor(item)&&(s.config.armorOnHit??cfg.rules.autoArmor)?`Armor wear: ${Number(((s.config.armorDamagePerHit??cfg.rules.armorDamagePerHit)*factors.wearMultiplier).toFixed(3))} HP per ${cfg.rules.armorTrigger==='attack'?'targeted attack hit':'damage event'} while equipped · ${s.armorProgress.toFixed(2)}/1 HP progress. ${item.system.equipped?'':'Not equipped — incoming wear is inactive.'}`:profile.mode==='damage'?`Weapon wear: ${s.wear}/${profile.damagePerWear} damage toward the next 1 HP of wear. Critical hits cause no wear.`:profile.mode==='use'?`Use wear: ${s.useProgress}/${profile.usesPerWear} uses toward the next 1 HP of wear.`:'Manual wear: the GM applies damage when appropriate.'}</p>`:'<div class="bi-notice">Durability is not enabled for this item. The GM can configure it below.</div>'}
   ${s.pending?`<div class="bi-notice"><strong>Paid repair awaiting GM approval</strong><p>${formatGP(s.pending.priceCP)} · ${s.pending.hp} HP</p><div class="bi-action-grid">${isGM?'<button type="button" data-bi-approve-current>Review and complete</button>':''}<button type="button" data-bi-cancel-paid>Cancel request</button></div></div>`:''}
   ${repair}
   ${isGM?`<section class="bi-card"><h3>GM controls</h3><div class="bi-action-grid"><button type="button" data-bi-configure>Configure item</button><button type="button" data-bi-tool-roles>Tool roles / All-Purpose Tool</button><button type="button" data-bi-recalculate>Recalculate HP</button><button type="button" data-bi-protection>Unbreakable protection</button><button type="button" data-bi-damage ${!enabled||s.unbreakable?'disabled':''}>Apply item damage</button><button type="button" data-bi-destroy ${!enabled||s.destroyed||s.unbreakable?'disabled':''}>Mark destroyed</button>${isBodyArmor(item)?'<button type="button" data-bi-armor-hit>Record a confirmed armor hit</button>':''}</div></section>`:''}
   ${historyHTML?`<details class="bi-history"><summary>Recent item history</summary><ol>${historyHTML}</ol></details>`:''}`;
 }
 requirement(ok,label){return `<span class="bi-requirement ${ok?'is-met':'is-missing'}"><i class="fas ${ok?'fa-check':'fa-xmark'}"></i> ${esc(label)}</span>`;}
 _onRender(context,options){
  super._onRender(context,options);const signal=this.bind(),root=this.element;
  root.addEventListener('click',event=>{const b=event.target.closest('button');if(!b||b.disabled||!b.closest('.bi-shell')||!Object.keys(b.dataset).some(k=>k.startsWith('bi')))return;void run(async()=>{
   if(b.dataset.biSelect){this.selected=b.dataset.biSelect;return this.render({force:true});}
   const item=this.actor?.items.get(this.selected);
   if(b.hasAttribute('data-bi-refresh'))return this.render({force:true});
   if(b.hasAttribute('data-bi-setup'))return new BreakableSetup().render({force:true});
   if(b.hasAttribute('data-bi-add-repairer'))return createRepairerDialog();
   if(b.hasAttribute('data-bi-help'))return game.modules.get(ID).api.help();
   if(b.hasAttribute('data-bi-fix-all'))return fixAllDialog(this.actor);
   if(b.hasAttribute('data-bi-approve-all'))return approveBatchDialog(this.actor);
   if(b.hasAttribute('data-bi-cancel-all'))return request('cancelPaidAll',this.actor.uuid);
   if(b.hasAttribute('data-bi-recalculate-all')){if(await confirm('Recalculate maximum HP?','Adopt the current type, rarity, material and quality HP formula for this character. Damage percentage and break history are preserved.'))await request('recalculate',this.actor.uuid);return this.render({force:true});}
   if(b.hasAttribute('data-bi-token')){const actor=globalThis.canvas?.tokens?.controlled?.[0]?.actor;if(!actor||!canManage(game.user,actor))throw Error('Select a token whose equipment you can manage.');this.actorUuid=actor.uuid;return this.render({force:true});}
   if(b.hasAttribute('data-bi-bulk')){if(await confirm('Enable gear tracking?','Enable durability for physical items on this character. Existing configured items and repair supplies are preserved. Stacks share a condition record.'))await request('bulkTrack',this.actor.uuid);return this.render({force:true});}
   if(!item)return;
   if(b.hasAttribute('data-bi-sheet'))return item.sheet.render(true);
   if(b.hasAttribute('data-bi-configure'))return configureItemDialog(item);
   if(b.hasAttribute('data-bi-tool-roles'))return toolRolesDialog(item);
   if(b.hasAttribute('data-bi-mending'))return castMendingDialog(item);
   if(b.hasAttribute('data-bi-recalculate')){if(await confirm('Recalculate maximum HP?','Adopt the type, rarity, material and quality HP formula. Damage percentage and break history are preserved.'))await request('recalculate',item.uuid);return this.render({force:true});}
   if(b.hasAttribute('data-bi-protection'))return protectionDialog(item);
   if(b.hasAttribute('data-bi-armor-hit'))await request('armorHit',this.actor.uuid,{eventId:foundry.utils.randomID(24),reason:'GM recorded a confirmed hit'});
   if(b.hasAttribute('data-bi-damage'))return damageDialog(item);
   if(b.hasAttribute('data-bi-destroy')){if(await confirm('Destroy item?',`${esc(item.name)} will be permanently unrepairable. Its inventory entry and history remain.`))await request('destroy',item.uuid,{reason:'GM marked item destroyed'});}
   if(b.hasAttribute('data-bi-use'))await request('wear',item.uuid,{kind:'use',amount:1,eventId:foundry.utils.randomID(24)});
   if(b.hasAttribute('data-bi-use-details'))return recordUseDialog(item);
   if(b.hasAttribute('data-bi-repair'))return repairDialog(item);
   if(b.hasAttribute('data-bi-paid'))return paidDialog(item);
   if(b.hasAttribute('data-bi-cancel-paid'))await request('cancelPaid',item.uuid);
   if(b.hasAttribute('data-bi-approve-current'))return approvePaid(item);
   return this.render({force:true});
  });},{signal});
  root.addEventListener('change',event=>{if(event.target.name==='filter'){this.filter=event.target.value;this.filterRows();}},{signal});
  root.addEventListener('input',event=>{if(event.target.name==='search'){this.query=event.target.value;this.filterRows();}},{signal});this.filterRows();
 }
 filterRows(){let count=0;for(const row of this.element.querySelectorAll('[data-bi-select]')){const state=row.dataset.condition,visible=row.dataset.search.includes(this.query.toLowerCase())&&(this.filter==='all'||state===this.filter||this.filter==='unbreakable'&&row.dataset.protected==='true');row.hidden=!visible;if(visible)count++;}const empty=this.element.querySelector('[data-bi-no-results]');if(empty)empty.hidden=count>0;}
}
export async function confirm(title,content){return foundry.applications.api.DialogV2.confirm({window:{title},content:`<div class="sbs-breakable bi-dialog"><p>${content}</p></div>`,rejectClose:false,modal:true});}
export async function toolRolesDialog(item){
 if(!game.user.isGM)throw Error('Only the GM can change tool roles.');const support=toolSupport(item);
 const value=await formDialog(`Tool roles: ${item.name}`,`<p>Any physical item can supply these tool roles without changing its item type. Proficiency is separate from owning the tool.</p>${check('allArtisan',support.allArtisan,'All artisan’s tools (All-Purpose Tool)')}${check('grantProficiency',support.grantProficiency,'Grants proficiency in its tool roles')}${check('requiresAttunement',support.requiresAttunement,'Additional tool roles require attunement')}<h3>Specific tool roles</h3><div class="bi-form-grid">${Object.entries(TOOLS).map(([key,label])=>check(`role.${key}`,support.keys.includes(key),label)).join('')}</div>`,root=>({keys:Object.keys(TOOLS).filter(k=>root.querySelector(`[name="role.${k}"]`).checked),allArtisan:root.querySelector('[name=allArtisan]').checked,grantProficiency:root.querySelector('[name=grantProficiency]').checked,requiresAttunement:root.querySelector('[name=requiresAttunement]').checked}),'Save tool roles');
 if(value)return request('toolRoles',item.uuid,{toolSupport:value});
}
export async function castMendingDialog(item){
 const cfg=settings(),errors=mendingReasons(item,cfg);if(errors.length)throw Error(errors.join(' '));
 const sources=repairerChoices(item.actor).flatMap(a=>mendingSources(a));if(!sources.length)throw Error('No usable native Mending activity was found. Add Mending to the caster’s sheet first.');
 const choice=await formDialog(`Cast Mending: ${item.name}`,`<p>Complete the native cast, then choose the item in the Mending target prompt. Default: ${cfg.rules.mendingHP} item HP per one-minute cast. Break history stays; destroyed items cannot be repaired.</p><label>Cast with<select name="mendingSource">${sources.map((s,i)=>`<option value="${i}">${esc(s.actor.name)} — ${esc(s.item.name)} / ${esc(s.activity.name??'Mending')}</option>`).join('')}</select></label>`,root=>Number(root.querySelector('[name=mendingSource]').value),'Cast Mending');
 if(choice===null||choice===undefined)return;const source=sources[choice];if(inCombat(source.actor)||inCombat(item.actor))throw Error('Mending repairs require out-of-combat casting time.');return source.activity.use({sbsMendingTarget:item.uuid});
}
export async function mendingTargetPrompt(activity,usage,results){
 const caster=activity.actor??activity.item?.actor,cfg=settings();
 if(!caster||!cfg.rules.mendingEnabled)return;
 const preferred=usage?.sbsMendingTarget?await fromUuid(usage.sbsMendingTarget):null;
 const board=globalThis.canvas;
 const visible=t=>t?.visible!==false&&(!t?.document?.hidden||game.user.isGM);
 const allowed=a=>a&&canMendTarget(game.user,a);
 const tokens=()=>Array.from(board?.tokens?.placeables??[]).filter(visible);
 const tokenKey=t=>t.document?.uuid??t.actor?.uuid;
 const choices=new Map();
 for(const a of [caster,...game.actors])if(allowed(a))choices.set(a.uuid,a.name);
 for(const t of tokens())if(allowed(t.actor))choices.set(tokenKey(t),t.document?.name??t.actor.name);
 const initialToken=[...(game.user.targets??[]),...(board?.tokens?.controlled??[])].find(t=>visible(t)&&allowed(t.actor));
 const preferredToken=preferred&&tokens().find(t=>t.actor?.uuid===preferred.actor?.uuid);
 let key=(preferredToken&&tokenKey(preferredToken))??preferred?.actor?.uuid??(initialToken&&tokenKey(initialToken))??caster.uuid;
 if(preferred?.actor&&allowed(preferred.actor)&&!choices.has(key))choices.set(key,preferred.actor.name);
 const actorNow=()=>tokens().find(t=>tokenKey(t)===key)?.actor??(key.startsWith('Actor.')?game.actors.get(key.slice(6)):null)??(preferred?.actor?.uuid===key?preferred.actor:null)??(caster.uuid===key?caster:null);
 const content=`<button type="button" data-bi-pick-token>Choose token on map</button><p data-bi-target></p>
 <details><summary>Choose from a list</summary><select name="mendingActor">${[...choices].map(([id,name])=>`<option value="${esc(id)}" ${id===key?'selected':''}>${esc(name)}</option>`).join('')}</select></details>
 <label>Item<select name="mendingItem"></select></label><div class="bi-notice" data-bi-mending-drop>Drop an inventory item here</div>
 ${check('mendingLimits',false,'This is a physical break/tear within Mending’s size limit, with the pieces available and one minute of casting time')}<div data-bi-mending-status></div>`;
 let cleanup=()=>{};
 let value;
 try{
  value=await formDialog('Mending — choose an item',content,root=>{
   const actor=actorNow(),item=actor?.items.get(root.querySelector('[name=mendingItem]').value);
   if(!allowed(actor)||!item)throw Error('Choose an available inventory item.');
   const reasons=mendingReasons(item,cfg);if(reasons.length)throw Error(reasons.join(' '));
   return {item,confirmLimits:root.querySelector('[name=mendingLimits]').checked};
  },'Apply Mending',(_event,dialog)=>{
   cleanup();
   const root=dialog.element,actors=root.querySelector('[name=mendingActor]'),items=root.querySelector('[name=mendingItem]'),limits=root.querySelector('[name=mendingLimits]');
   const validate=()=>{
    const actor=actorNow(),item=allowed(actor)&&actor.items.get(items.value);
    const errors=item?mendingReasons(item,cfg):['Choose a token with equipment you can view.'];
    if(inCombat(caster)||inCombat(actor))errors.push('Mending repairs are unavailable during combat.');
    root.querySelector('[data-bi-mending-status]').textContent=errors.join(' ');
    root.querySelector('[data-action=save]').disabled=errors.length>0||!limits.checked;
   };
   const draw=(itemId=items.value)=>{
    const actor=actorNow(),inventory=allowed(actor)?[...actor.items].filter(i=>tracked(i,cfg.rules)):[];
    root.querySelector('[data-bi-target]').textContent='Inventory: '+(choices.get(key)??'Choose a token');
    inventory.sort((a,b)=>Number(!!mendingReasons(a,cfg).length)-Number(!!mendingReasons(b,cfg).length));
    items.innerHTML=inventory.map(i=>{
     const state=stateFor(i,cfg.profiles,cfg.durability);
     return `<option value="${esc(i.id)}" ${i.id===itemId?'selected':''}>${esc(i.name)} — ${state.hp}/${state.max} HP</option>`;
    }).join('');
    validate();
   };
   const select=(id,name,itemId)=>{
    if(!choices.has(id)){choices.set(id,name);const option=document.createElement('option');option.value=id;option.textContent=name;actors.append(option);}
    key=id;actors.value=id;limits.checked=false;draw(itemId??'');
   };
   actors.addEventListener('change',()=>select(actors.value,choices.get(actors.value)));
   items.addEventListener('change',validate);limits.addEventListener('change',validate);
   let picking;
   const stop=()=>{picking?.abort();picking=null;root.style.visibility='';};
   root.querySelector('[data-bi-pick-token]').addEventListener('click',()=>{
    const view=board?.app?.view??document.querySelector('#board');
    if(!view){ui.notifications.warn('Open a scene to choose a token on the map.');return;}
    stop();picking=new AbortController();const opts={capture:true,signal:picking.signal};
    root.style.visibility='hidden';ui.notifications.info('Click a visible token. Press Escape to return.');
    document.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();stop();}},opts);
    view.addEventListener('pointerdown',e=>{
     if(e.button!==0)return;
     e.preventDefault();e.stopImmediatePropagation();
     const p=board.canvasCoordinatesFromClient({x:e.clientX,y:e.clientY});
     const token=tokens().reverse().find(t=>t.bounds?.contains(p.x,p.y));
     if(!token||!allowed(token.actor)){ui.notifications.warn('Choose a visible token whose inventory you can view.');return;}
     stop();select(tokenKey(token),token.document?.name??token.actor.name);
    },opts);
   });
   const drop=root.querySelector('[data-bi-mending-drop]');
   drop.addEventListener('dragover',e=>e.preventDefault());
   drop.addEventListener('drop',e=>{e.preventDefault();void run(async()=>{
    const item=await fromUuid(JSON.parse(e.dataTransfer.getData('text/plain')).uuid);
    if(!allowed(item?.actor))throw Error('Drop an item from an inventory you can view.');
    const token=tokens().find(t=>t.actor.uuid===item.actor.uuid);
    select(token?tokenKey(token):item.actor.uuid,item.actor.name,item.id);
   });});
   const hooks=['updateItem','createItem','deleteItem','updateToken','deleteToken','updateActor','canvasReady'];
   const refresh=()=>draw();for(const hook of hooks)Hooks.on(hook,refresh);
   cleanup=()=>{stop();for(const hook of hooks)Hooks.off(hook,refresh);};
   draw(preferred?.id??'');
  },{modal:false});
 }finally{cleanup();}
 if(value)return request('mend',value.item.uuid,{casterUuid:caster.uuid,sourceUuid:activity.item.uuid,activityId:activity.id,castId:results.message?.id,confirmLimits:value.confirmLimits});
}
async function formDialog(title,content,callback,label='Continue',render,options={}){return foundry.applications.api.DialogV2.wait({...options,window:{title},position:{width:600},content:`<div class="sbs-breakable bi-dialog">${content}</div>`,rejectClose:false,render,buttons:[{action:'save',label,default:true,callback:(_event,_button,dialog)=>callback(dialog.element)},{action:'cancel',label:'Cancel',callback:()=>null}]});}
export async function protectionDialog(item){
 if(!game.user.isGM)throw Error('The GM controls Unbreakable protection.');
 const p=protectionFor(item),result=await formDialog(`Unbreakable: ${item.name}`,`<p>${esc(protectionLabel(item))}</p><p>Prevents new weapon wear, armor wear, direct item damage, and destruction. It does not repair damage, restore broken/destroyed items, or erase breaks.</p>${check('permanent',p.permanent,'Permanent Unbreakable property')}<label>Temporary protection<select name="temporaryMode">${options({keep:'Keep current temporary protection',none:'Remove temporary protection',minutes:'For a number of minutes',hours:'For a number of hours',rounds:'For a number of rounds (6 seconds each)',manual:'Until the GM removes it'},'keep')}</select></label><label>Duration${input('duration',1,'number','min="0.01" step="0.01"')}</label><label>Source / reason${input('label',p.temporary?.label??'Temporary protection','text')}</label><p>Timed protection follows the Foundry world clock and expires automatically. Permanent protection also appears among native item properties, alongside properties such as Finesse and Light.</p>`,root=>({permanent:root.querySelector('[name=permanent]').checked,temporaryMode:root.querySelector('[name=temporaryMode]').value,duration:numeric(root.querySelector('[name=duration]').value),label:root.querySelector('[name=label]').value}),'Save protection');
 if(result)return request('protection',item.uuid,result);
}
export async function damageDialog(item){
 const result=await formDialog(`Damage: ${item.name}`,`<p>Apply direct durability damage. A separate break is counted only when HP falls from above 0 to 0.</p><label>Damage amount or dice formula${input('amount',1,'text')}</label><label>Reason${input('reason','Misuse / impact','text')}</label>`,root=>({formula:root.querySelector('[name=amount]').value,reason:root.querySelector('[name=reason]').value}),'Apply damage');
 if(!result)return;
 const roll=await new Roll(result.formula).evaluate();if(!Number.isFinite(roll.total)||roll.total<0)throw Error('Enter positive item damage.');
 await request('damage',item.uuid,{amount:Math.floor(roll.total),reason:result.reason});
}
export async function configureItemDialog(item){
 if(!game.user.isGM)throw Error('Only the GM can configure item durability.');
 const cfg=settings(),s=stateFor(item,cfg.profiles,cfg.durability),c={...(cfg.profiles[s.profile]??DEFAULT_PROFILES.gear),...s.config};
 const content=`<p>Break history survives repairs. Lowering HP to 0 counts a new break; only edit the break count when correcting history.</p><div class="bi-form-grid">
 ${check('enabled',tracked(item,cfg.rules),'Enable durability tracking')}<label>Profile<select name="profile">${options(cfg.profiles,s.profile)}</select></label>
 <label>Maximum HP${input('max',s.max,'number','min="1" step="1"')}</label><label>Current HP${input('hp',s.hp,'number','min="0" step="1"')}</label>
 <label>Lifetime breaks (GM correction)${input('breaks',s.breaks,'number','min="0" max="3" step="1"')}</label><label>Rarity override<select name="rarity"><option value="">Use item rarity</option>${options(cfg.rarities,s.rarity)}</select></label>
 <label>Wear rule<select name="mode">${options({damage:'1 HP per damage threshold',use:'1 HP per use threshold',manual:'GM applies damage'},c.mode)}</select></label><label>Damage per 1 HP wear${input('damagePerWear',c.damagePerWear,'number','min="1"')}</label><label>Uses per 1 HP wear${input('usesPerWear',c.usesPerWear,'number','min="1"')}</label>
 <label>Required tool<select name="tool">${options(TOOLS,c.tool)}</select></label><label>Repair parts<select name="material">${options(MATERIALS,c.material)}</select></label><label>Parts per restored HP${input('partsPerHP',c.partsPerHP,'number','min="0" step="0.01"')}</label>
 <label>Minimum full-repair price (gp)${input('fullRepairGP',c.fullRepairGP??0,'number','min="0" step="0.01"')}</label><label>Broken repair DC override${input('dc',s.config.dc??'','number','min="1" placeholder="Use rarity default"')}</label>
 <label>Durability material<select name="durabilityMaterial"><option value="">Use profile / item properties</option>${options(Object.fromEntries(Object.keys(cfg.durability.materials).map(k=>[k,k])),s.config.durabilityMaterial??'')}</select></label><label>Quality<select name="quality">${options(Object.fromEntries(Object.keys(cfg.durability.qualities).map(k=>[k,k])),s.config.quality??'standard')}</select></label><label>Extra wear multiplier${input('wearMultiplier',s.config.wearMultiplier??1,'number','min="0.001" step="0.05"')}</label>
 ${check('requireProficiency',c.requireProficiency??cfg.rules.requireProficiency,'Require tool proficiency')}${check('arcana',c.arcana??cfg.rarities[rarityKey(item,s.rarity)].arcana,'Require Arcana proficiency')}${check('allowArtifact',c.allowArtifact,'Allow custom artifact repairs')}${check('mendingAllowed',s.config.mendingAllowed!==false,'Allow eligible physical damage to be repaired with Mending')}
 ${s.destroyed?check('clearDestroyed',false,'GM correction: clear destroyed state (also reduce breaks below 3)'):''}</div>
 ${isBodyArmor(item)?`<div class="bi-form-grid"><label>Armor hit wear<select name="armorOnHit">${options({'':'Use campaign setting',on:'Enabled',off:'Disabled'},s.config.armorOnHit===undefined?'':s.config.armorOnHit?'on':'off')}</select></label><label>Armor base HP lost per event${input('armorDamagePerHit',s.config.armorDamagePerHit??'','number','min="0.001" step="any" placeholder="Use campaign default"')}</label></div>`:''}
 <details><summary>This item also works as tools</summary><p>Choose tool roles supplied by this physical item. Skill proficiency is separate unless explicitly granted. All artisan’s tools does not include kits, thieves’ tools or navigator’s tools.</p>${check('toolAllArtisan',toolSupport(item).allArtisan,'Works as all artisan’s tools')}${check('toolGrantsProficiency',toolSupport(item).grantProficiency,'Grants proficiency while used as one of these tools')}${check('toolRequiresAttunement',toolSupport(item).requiresAttunement,'Tool roles require attunement')}<div class="bi-form-grid">${Object.entries(TOOLS).map(([key,label])=>check(`toolRole.${key}`,toolSupport(item).keys.includes(key),label)).join('')}</div></details>
 <label>Additional parts (JSON array; material key or exact item name)<textarea name="extraParts" rows="3">${esc(JSON.stringify(c.extraParts??[],null,2))}</textarea></label>
 <details><summary>Mark this item as repair supplies instead</summary><p>Use a key such as metal, leather, reagent:rare, or a custom key. This disables durability tracking for the supply stack.</p><label>Material key${input('materialKey',item.flags?.[ID]?.material?.key??'','text')}</label><label>Credit per unit supplied (gp)${input('valueGP',item.flags?.[ID]?.material?.valueGP??0,'number','min="0" step="0.01"')}</label></details>`;
 const result=await formDialog(`Configure: ${item.name}`,content,root=>{
  const get=n=>root.querySelector(`[name="${n}"]`),v=n=>get(n)?.value,on=n=>!!get(n)?.checked;
  const extraParts=JSON.parse(v('extraParts')||'[]');if(!Array.isArray(extraParts))throw Error('Additional parts must be a JSON array.');
  const conf={...s.config,mode:v('mode'),damagePerWear:numeric(v('damagePerWear'),20),usesPerWear:numeric(v('usesPerWear'),10),tool:v('tool'),material:v('material'),partsPerHP:numeric(v('partsPerHP'),0.2),fullRepairGP:numeric(v('fullRepairGP')),requireProficiency:on('requireProficiency'),arcana:on('arcana'),allowArtifact:on('allowArtifact'),extraParts,mendingAllowed:on('mendingAllowed'),quality:v('quality'),wearMultiplier:Math.max(0.001,numeric(v('wearMultiplier'),1))};
  if(v('durabilityMaterial'))conf.durabilityMaterial=v('durabilityMaterial');else delete conf.durabilityMaterial;
  if(v('dc'))conf.dc=numeric(v('dc'));
  if(v('armorOnHit'))conf.armorOnHit=v('armorOnHit')==='on';else delete conf.armorOnHit;
  if(v('armorDamagePerHit')){const rate=numeric(v('armorDamagePerHit'));if(rate<=0)throw Error('Armor wear must be positive. Disable armor-hit wear to turn it off.');conf.armorDamagePerHit=rate;}else delete conf.armorDamagePerHit;
  return {enabled:on('enabled'),profile:v('profile'),max:numeric(v('max')),hp:numeric(v('hp')),breaks:numeric(v('breaks')),rarity:v('rarity'),clearDestroyed:on('clearDestroyed'),config:conf,toolSupport:{keys:Object.keys(TOOLS).filter(k=>on(`toolRole.${k}`)),allArtisan:on('toolAllArtisan'),grantProficiency:on('toolGrantsProficiency'),requiresAttunement:on('toolRequiresAttunement')},materialKey:v('materialKey'),valueGP:numeric(v('valueGP'))};
 },'Save item',(_e,dialog)=>{
  const root=dialog.element;root.querySelector('[name=profile]')?.addEventListener('change',e=>{
   const p=cfg.profiles[e.target.value];for(const k of ['mode','damagePerWear','usesPerWear','tool','material','partsPerHP'])root.querySelector(`[name=${k}]`).value=p[k];
   const material=root.querySelector('[name=durabilityMaterial]').value,config={quality:root.querySelector('[name=quality]').value,...(material?{durabilityMaterial:material}:{})};
   const preview={name:item.name,type:item.type,system:item.system,flags:{[ID]:{durability:{profile:e.target.value,rarity:root.querySelector('[name=rarity]').value,config}}}},max=durabilityFactors(preview,cfg.profiles,cfg.durability).max;
   root.querySelector('[name=max]').value=max;root.querySelector('[name=hp]').value=s.hp===0?0:Math.max(1,Math.round(s.hp/s.max*max));
  });
 });
 if(!result)return;
 if(result.materialKey)return request('markMaterial',item.uuid,{key:result.materialKey,valueGP:result.valueGP});
 return request('configure',item.uuid,{...result,expectedRevision:s.revision});
}
function repairerChoices(owner){
 const actors=new Map([[owner.uuid,owner]]);for(const actor of [...game.actors,...(globalThis.canvas?.tokens?.controlled??[]).map(t=>t.actor)])if(actor&&canManage(game.user,actor))actors.set(actor.uuid,actor);
 return [...actors.values()].sort((a,b)=>a.uuid===owner.uuid?-1:b.uuid===owner.uuid?1:a.name.localeCompare(b.name));
}
function helperOptions(actors,owner){return actors.map(a=>`<option value="${esc(a.uuid)}">${esc(a.name)}${a.uuid===owner.uuid?' (item owner)':''}</option>`).join('');}
export async function repairDialog(item){
 const cfg=settings(),s=stateFor(item,cfg.profiles,cfg.durability),max=s.max-s.hp,helpers=repairerChoices(item.actor);
 const result=await formDialog(`Repair: ${item.name}`,`<label>Character doing the work<select name="repairer">${helperOptions(helpers,item.actor)}</select></label><p>Uses that character’s tools and proficiencies. Parts come from the item owner. You must own the helper, or have the GM run the repair.</p><label>HP to restore${input('hp',max,'number',`min="1" max="${max}" ${s.hp===0?'readonly':''}`)}</label><div data-bi-preview></div>`,root=>({hp:numeric(root.querySelector('[name=hp]').value),repairerUuid:root.querySelector('[name=repairer]').value,expectedRevision:s.revision}),'Perform repair',(_e,d)=>{
  const root=d.element,draw=()=>{try{const repairer=helpers.find(a=>a.uuid===root.querySelector('[name=repairer]').value),view=quoteView(item,{hp:numeric(root.querySelector('[name=hp]').value),repairer});root.querySelector('[data-bi-preview]').innerHTML=`<p>Tool: ${esc(view.tool.tool?.name??'Missing required tool')} · ${view.tool.proficient?'proficient':'not proficient'}.</p><p>${view.quote.requirements.map(r=>`${r.quantity} × ${esc(r.label)}`).join('<br>')}</p><p>${view.quote.minutes} minutes of downtime.${view.quote.requiresCheck?` DC ${view.quote.dc} repair check.`:' No check.'}</p>${cfg.rules.consumeOnFailure&&view.quote.requiresCheck?'<p>A failed attempt consumes these parts and time; the item remains broken.</p>':''}${view.reasons.length?`<p class="bi-danger">${esc(view.reasons.join(' '))}</p>`:''}<p>Confirm this downtime is available. The module records the time; it does not advance the world clock.</p>`;const submit=root.querySelector('[data-action=save]');if(submit)submit.disabled=view.reasons.length>0;}catch(e){root.querySelector('[data-bi-preview]').textContent=e.message;}};root.querySelector('[name=hp]').addEventListener('input',draw);root.querySelector('[name=repairer]').addEventListener('change',draw);draw();
 });
 if(result)await request('repair',item.uuid,result);
}
export async function createRepairerDialog(){
 if(!game.user.isGM)throw Error('Only the GM can create a repairer.');
 const result=await formDialog('Add / place a master repairer',`<p>Creates a reusable NPC and paid service covering all tool types and ordinary/magical repair recipes. Destroyed items remain unrepairable; artifacts still require an approved custom recipe.</p><label>Name${input('name','Traveling Master Artisan','text')}</label><label>Price multiplier${input('multiplier',1,'number','min="0" step="0.1"')}</label><label>Broken-repair check bonus${input('checkBonus',10,'number')}</label>${check('placeToken',!!globalThis.canvas?.scene,'Place an independent repairer token near the center of the viewed map')}<p>You can also leave the NPC in the Actors directory. Placed repairers accept payment directly. Unplaced services still need GM approval.</p>`,root=>({name:root.querySelector('[name=name]').value,multiplier:numeric(root.querySelector('[name=multiplier]').value),checkBonus:numeric(root.querySelector('[name=checkBonus]').value),placeToken:root.querySelector('[name=placeToken]').checked}),'Create repairer');
 if(!result)return;const made=await createRepairer(result);ui.notifications.info(`${made.actor.name} is available for repair requests.${made.placed?' Token placed on the scene.':''}`);if(made.placementError)ui.notifications.warn(`Repairer created; token placement failed: ${made.placementError}. Drag the NPC from Actors to place it.`);return made;
}
export async function paidDialog(item){
 const cfg=settings(),s=stateFor(item,cfg.profiles,cfg.durability),base=repairQuote(item,s,cfg),shops=paidServices(cfg).filter(x=>x.rarities.includes(base.rarity));
 
 const result=await formDialog(`Paid repair: ${item.name}`,`<p>Placed repairers on your map accept payment directly. No repairer setup is required for the fallback: choose Find a repairer to send the GM a priced request.</p><label>Paid service<select name="shop">${shops.map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')}</select></label><label>HP to restore${input('hp',s.max-s.hp,'number',`min="1" max="${s.max-s.hp}" ${s.hp===0?'readonly':''}`)}</label>${check('supplyParts',false,'Supply available repair parts for a discount')}<div data-bi-preview></div>`,root=>{const shop=shops.find(x=>x.id===root.querySelector('[name=shop]').value),hp=numeric(root.querySelector('[name=hp]').value),supplyParts=root.querySelector('[name=supplyParts]').checked,view=quoteView(item,{hp,shop,supplyParts});return {shopId:shop.id,hp,supplyParts,maxCostCP:view.quote.priceCP,expectedRevision:s.revision};},'Request GM approval',(_e,d)=>{
  const root=d.element,draw=()=>{try{const shop=shops.find(x=>x.id===root.querySelector('[name=shop]').value),view=quoteView(item,{hp:numeric(root.querySelector('[name=hp]').value),shop,supplyParts:root.querySelector('[name=supplyParts]').checked});const payButton=root.querySelector('[data-action=save]');if(payButton)payButton.textContent=shop.automatic?'Pay and repair':'Request GM approval';root.querySelector('[data-bi-preview]').innerHTML=`<div class="bi-price">${formatGP(view.quote.priceCP)}</div><p>${view.quote.hp} HP restored · ${view.quote.minutes} minutes of downtime.</p><p>${view.quote.requiresCheck?`The repairer makes a DC ${view.quote.dc} check with +${numeric(shop.checkBonus)}. Failed paid repairs are not charged.`:'Routine repair — no check.'}</p><p>${view.quote.creditGP?`Parts discount: ${view.quote.creditGP.toFixed(2)} gp. Parts supplied: ${view.plan.allocations.map(a=>`${a.quantity} × ${esc(a.name)}`).join(', ')}.`:'The repairer provides tools and parts.'}</p><p>${shop.automatic?'This placed repairer completes successful paid repairs directly; no GM approval click is needed.':'The GM must approve the repairer and downtime before payment.'} Payment spends the smallest coins first and only makes change when needed.</p>`;}catch(e){root.querySelector('[data-bi-preview]').textContent=e.message;}};root.querySelectorAll('input,select').forEach(e=>e.addEventListener('input',draw));draw();
 });
 if(result)await request('requestPaid',item.uuid,result);
}
export async function approvePaid(item,requestId){
 const p=stateFor(item,settings().profiles,settings().durability).pending;if(!p||requestId&&p.id!==requestId)throw Error('This request has already changed or completed.');
 if(await confirm('Complete paid repair?',`Confirm the repairer and downtime are available for <strong>${esc(item.name)}</strong>. Charge ${formatGP(p.priceCP)} on success and restore ${p.hp} HP. Broken items require the repairer’s check.`))return request('approvePaid',item.uuid,{requestId:p.id});
}
export async function recordUseDialog(item){
 const cfg=settings(),result=await formDialog(`Record use: ${item.name}`,`<label>Number of uses${input('uses',1,'number','min="1" step="1"')}</label><label>Use intensity<select name="intensity">${options(Object.fromEntries(Object.entries(cfg.durability.useWeights).map(([k,v])=>[k,`${k} (×${v})`])),'normal')}</select></label><label>Reason${input('reason','Narrative item use','text')}</label>`,root=>({amount:Math.max(1,Math.floor(numeric(root.querySelector('[name=uses]').value,1))),intensity:root.querySelector('[name=intensity]').value,reason:root.querySelector('[name=reason]').value}),'Record use');
 if(result)return request('wear',item.uuid,{...result,kind:'use',eventId:foundry.utils.randomID(24)});
}
export async function fixAllDialog(actor){
 const cfg=settings(),helpers=repairerChoices(actor),candidates=batchRepairView(actor).rows;if(!candidates.length){ui.notifications.info('All tracked items are at full HP.');return;}
 let selected=new Set(candidates.filter(r=>!r.errors.length).map(r=>r.item.id)),latest;
 const result=await formDialog(`Fix All — ${actor.name}`,`<div class="bi-form-grid"><label>Repair method<select name="batchMode"><option value="self">Self repair — tools and supplies</option><option value="paid">Paid repair service</option></select></label><label data-bi-batch-helper>Character doing the work<select name="batchRepairer">${helperOptions(helpers,actor)}</select></label><label data-bi-batch-service>Paid service<select name="batchShop">${paidServices(cfg).map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}</select></label></div>${check('batchSupply',false,'Supply available parts for a paid-service discount')}<div data-bi-batch-rows></div><div data-bi-batch-summary></div><p>No paid repairer configured? Find a repairer sends the GM a priced request without setup. Each selected item is restored fully on success. Broken items make separate checks. Time represents available downtime; the world clock is not advanced automatically.</p>`,()=>{if(!latest||latest.errors.length)throw Error(latest?.errors.join(' ')??'Review the repair quote first.');return {ids:[...selected],mode:latest.mode,shopId:latest.shop?.id,repairerUuid:latest.mode==='self'?latest.repairer.uuid:undefined,supplyParts:latest.supplyParts,expected:latest.snapshot};},'Complete / request Fix All',(_event,dialog)=>{
  const root=dialog.element;
  const draw=()=>{
   try{
    const mode=root.querySelector('[name=batchMode]').value,shopId=root.querySelector('[name=batchShop]').value,supplyParts=root.querySelector('[name=batchSupply]').checked,repairer=helpers.find(a=>a.uuid===root.querySelector('[name=batchRepairer]').value);
    root.querySelector('[data-bi-batch-helper]').hidden=mode==='paid';root.querySelector('[data-bi-batch-service]').hidden=mode==='self';
    latest=batchRepairView(actor,{ids:[...selected],mode,shopId,supplyParts,repairer});
    root.querySelector('[data-bi-batch-rows]').innerHTML=`<div class="bi-table-scroll"><table><thead><tr><th>Repair</th><th>Item</th><th>HP</th><th>${mode==='paid'?'Price':'Required supplies'}</th><th>Check / requirements</th></tr></thead><tbody>${candidates.map(candidate=>{
     const row=latest.rows.find(r=>r.item.id===candidate.item.id)??batchRepairView(actor,{ids:[candidate.item.id],mode,shopId,supplyParts,repairer}).rows[0],q=row.quote,disabled=row.errors.length>0&&!selected.has(row.item.id);
     return `<tr><td><input type="checkbox" data-bi-batch-item="${row.item.id}" ${selected.has(row.item.id)?'checked':''} ${disabled?'disabled':''}></td><td>${esc(row.item.name)}${row.s.destroyed?' — destroyed':''}</td><td>${q?.hp??'—'}</td><td>${q?mode==='paid'?formatGP(q.priceCP):q.requirements.map(r=>`${r.quantity} × ${esc(r.label)}`).join('<br>'):'—'}</td><td>${row.errors.length?esc(row.errors.join(' ')):q?.requiresCheck?`DC ${q.dc} ${esc(TOOLS[q.tool]??q.tool)}`:'No check'}</td></tr>`;
    }).join('')}</tbody></table></div>`;
    root.querySelector('[data-bi-batch-summary]').innerHTML=`<div class="bi-notice"><strong>${latest.rows.length} selected · ${latest.checks} broken-item checks · ${latest.minutes} minutes</strong><p>${mode==='paid'?`Maximum service charge: ${formatGP(latest.totalCP)}. ${latest.shop?.automatic?'Placed repairer: no approval needed.':'GM approval required.'} Failed professional repairs are not charged. Smallest coins are used first.`:'No coin charge. Parts come from the item owner; the chosen character supplies skills and tools. Tools are retained and record use.'}</p><p>${mode==='self'?latest.requirements.map(r=>`${r.quantity} × ${esc(r.label)}`).join('<br>'):supplyParts?latest.plan.allocations.map(a=>`${a.quantity} × ${esc(a.name)}`).join('<br>'):'The repairer provides tools and materials.'}</p>${latest.errors.length?`<p class="bi-danger">${esc(latest.errors.join(' '))}</p>`:''}</div>`;
    const button=root.querySelector('[data-action=save]');if(button){button.disabled=latest.errors.length>0;button.textContent=mode==='self'?'Complete Fix All':latest.shop?.automatic?'Pay and repair all':'Request GM approval';}
   }catch(e){latest=null;root.querySelector('[data-bi-batch-summary]').textContent=e.message;}
  };
  root.addEventListener('change',event=>{if(event.target.dataset.biBatchItem){const id=event.target.dataset.biBatchItem;if(event.target.checked)selected.add(id);else selected.delete(id);}else if(['batchMode','batchShop','batchRepairer'].includes(event.target.name)){const mode=root.querySelector('[name=batchMode]').value,shopId=root.querySelector('[name=batchShop]').value,repairer=helpers.find(a=>a.uuid===root.querySelector('[name=batchRepairer]').value);selected=new Set(candidates.filter(c=>!batchRepairView(actor,{ids:[c.item.id],mode,shopId,repairer}).rows[0].errors.length).map(c=>c.item.id));}draw();});draw();
 });
 if(!result)return;const {mode,...args}=result;return request(mode==='paid'?'requestPaidAll':'repairAll',actor.uuid,args);
}
export async function approveBatchDialog(actor,requestId){
 const p=actor.flags?.[ID]?.batchRepair;if(!p||requestId&&p.id!==requestId)throw Error('This Fix All request has changed or completed.');
 const view=batchRepairView(actor,{ids:p.ids,mode:'paid',shopId:p.shopId,supplyParts:p.supplyParts});
 if(view.errors.length)throw Error(view.errors.join(' '));
 if(await confirm('Approve Fix All?',`${view.rows.map(r=>`${esc(r.item.name)}: ${formatGP(r.quote.priceCP)}`).join('<br>')}<br><strong>Total maximum: ${formatGP(view.totalCP)}</strong><br>${view.minutes} minutes; ${view.checks} broken-item checks. Confirm the repairer and downtime are available. Only successful repairs are charged.`))return request('approvePaidAll',actor.uuid,{requestId:p.id});
}

export class BreakableSetup extends BaseWindow {
 static DEFAULT_OPTIONS={id:'sbs-breakable-setup',window:{title:"SaltyBananaSlug's Breakable Items — Setup"},position:{width:1000,height:720}};
 async _prepareContext(){
  if(!game.user.isGM)throw Error('Only the GM can change these settings.');const cfg=settings();
  const rules=[['autoWeapons','Track weapons automatically'],['autoArmor','Track body armor and apply incoming wear'],['autoItems','Track all other physical items, including gear, tools and consumables'],['mendingEnabled','Allow Mending to repair item HP'],['mendingBroken','Mending can physically repair broken items (never destroyed items)'],['damageDicePenalty','Reduce weapon damage dice at 50% damage or worse'],['ignoreCriticals','Critical hits cause no weapon wear'],['showBadges','Show durability on character sheets'],['blockBroken','Broken/destroyed equipment cannot be used or equipped (always enforced)'],['fumblePrompt','Offer GM item damage after a natural 1'],['consumeOnFailure','Failed broken-item DIY repairs consume supplies'],['requireProficiency','Require tool proficiency for repairs']];
  return {html:`<header class="bi-top"><div><div class="bi-eyebrow">SBS / WORLD SETUP</div><h2>Durability & repair rules</h2></div><button type="button" data-bi-save>Save settings</button></header><div class="bi-setup-scroll"><section class="bi-card"><h3>Campaign rules</h3><div class="bi-form-grid">${rules.map(([k,l])=>check(`rule.${k}`,cfg.rules[k],l)).join('')}<label>HP restored per Mending cast${input('rule.mendingHP',cfg.rules.mendingHP,'number','min="1" step="1"')}</label><label>Armor wear trigger<select name="rule.armorTrigger">${options({damage:'Damage received (HP or temporary HP)',attack:'Targeted attack hits'},cfg.rules.armorTrigger)}</select></label><label>Armor base HP lost per event${input('rule.armorDamagePerHit',cfg.rules.armorDamagePerHit,'number','min="0.001" step="any"')}</label><label>Broken-item service surcharge (fraction)${input('rule.brokenSurcharge',cfg.rules.brokenSurcharge,'number','min="0" step="0.05"')}</label></div><p>Existing items with no durability record begin at full HP and zero breaks. Three breaks destroy an item. Repairs are blocked during combat and only broken items require checks. Equipped body armor wears once per damage update by default, including manual HP damage and temporary HP. Targeted-attack mode instead wears armor on confirmed native hits. These modes do not run together. Durability factors and fractional progress apply; shields use ordinary item-use wear.</p></section>
  <section class="bi-card"><h3>Item profiles</h3><p>Profile changes affect default rules. Saved item overrides take priority; existing items keep their saved HP.</p><div class="bi-table-scroll"><table><thead><tr><th>Profile</th><th>HP</th><th>Wear</th><th>Damage/HP</th><th>Uses/HP</th><th>Tool</th><th>Parts</th><th>Parts/HP</th></tr></thead><tbody>${Object.entries(cfg.profiles).map(([k,p])=>`<tr><td>${esc(p.label)}</td><td>${input(`profile.${k}.max`,p.max,'number','min="1"')}</td><td><select name="profile.${k}.mode">${options({damage:'Damage',use:'Uses',manual:'Manual'},p.mode)}</select></td><td>${input(`profile.${k}.damagePerWear`,p.damagePerWear,'number','min="1"')}</td><td>${input(`profile.${k}.usesPerWear`,p.usesPerWear,'number','min="1"')}</td><td><select name="profile.${k}.tool">${options(TOOLS,p.tool)}</select></td><td><select name="profile.${k}.material">${options(MATERIALS,p.material)}</select></td><td>${input(`profile.${k}.partsPerHP`,p.partsPerHP,'number','min="0" step="0.05"')}</td></tr>`).join('')}</tbody></table></div></section>
  <section class="bi-card"><h3>Durability influences</h3><p>Calculated HP = profile HP × rarity × material × quality. Wear contribution uses the corresponding wear multipliers. A smaller wear multiplier makes an item wear more slowly. Existing saved maximum HP changes only when you edit it or use Recalculate HP; damage percentage and breaks are preserved by recalculation.</p>${['rarities','materials','qualities'].map(group=>`<h3>${esc(group)}</h3><div class="bi-table-scroll"><table><thead><tr><th>Factor</th><th>HP multiplier</th><th>Wear multiplier</th></tr></thead><tbody>${Object.entries(cfg.durability[group]).map(([key,f])=>`<tr><td>${esc(group==='rarities'?cfg.rarities[key]?.label??key:key)}</td><td>${input(`factor.${group}.${key}.hp`,f.hp,'number','min="0.001" step="0.05"')}</td><td>${input(`factor.${group}.${key}.wear`,f.wear,'number','min="0.001" step="0.05"')}</td></tr>`).join('')}</tbody></table></div>`).join('')}<h3>Use intensity</h3><div class="bi-form-grid">${Object.entries(cfg.durability.useWeights).map(([key,value])=>`<label>${esc(key)} use weight${input(`weight.${key}`,value,'number','min="0.001" step="0.25"')}</label>`).join('')}</div></section>
  <section class="bi-card"><h3>Rarity & service prices</h3><p>Full repair price is the higher of the rarity base, item value × value fraction, or the item’s custom minimum. Partial repairs charge only for the fraction restored.</p><div class="bi-table-scroll"><table><thead><tr><th>Rarity</th><th>Base gp</th><th>Value fraction</th><th>Broken DC</th><th>Full minutes</th><th>Reagents/full</th><th>Arcana</th></tr></thead><tbody>${Object.entries(cfg.rarities).map(([k,r])=>`<tr><td>${esc(r.label)}</td>${['baseGP','valueRate','dc','minutes','reagents'].map(f=>`<td>${input(`rarity.${k}.${f}`,r[f],'number',`min="0" step="${f==='valueRate'?'0.05':'1'}"`)}</td>`).join('')}<td><input type="checkbox" name="rarity.${k}.arcana" ${r.arcana?'checked':''}></td></tr>`).join('')}</tbody></table></div><p>Prices, DCs, repair times, and supply recipes are adjustable house rules. Artifacts require an item-specific override.</p></section>
  <section class="bi-card"><h3>Welcome & update popups</h3>${check('releasePopups',game.settings.get(ID,'releasePopups')!==false,'Show role-specific welcome and update notes once per user and version')}<p>Uncheck to disable automatic popups for everyone in this world. The tracker’s Help button remains available.</p></section>
  <section class="bi-card"><h3>Available repair services</h3><p>Saved services are optional: Find a repairer is always available as a priced GM-approval request. Add / place repairer in the tracker creates a ready-made NPC/service. Placed instances accept payment directly; unplaced services request approval of access and downtime. JSON supports multiple repairers; use rarity keys mundane, common, uncommon, rare, veryRare, legendary, artifact.</p><textarea name="shops" rows="8">${esc(JSON.stringify(cfg.shops,null,2))}</textarea></section>
  <section class="bi-card"><h3>Repair supplies & launcher</h3><p>Create reusable world Item templates for metal, wood, leather, cloth, mechanisms, and rarity-specific magical reagents. Drag supplies onto a character and set quantities. Tools remain separate normal D&D items.</p><div class="bi-action-grid"><button type="button" data-bi-supplies>Create repair supply items</button><button type="button" data-bi-macro>Create Equipment Tracker macro</button></div></section></div><footer class="bi-footer">Saved item flags preserve durability, wear progress, and break history during normal item transfers.</footer>`};
 }
 _onRender(context,options){super._onRender(context,options);const signal=this.bind();this.element.addEventListener('click',event=>{const b=event.target.closest('button');if(!b)return;void run(async()=>{
  if(b.hasAttribute('data-bi-supplies')){const count=await createSupplies();ui.notifications.info(`${count} repair supply templates created in Items.`);}
  if(b.hasAttribute('data-bi-macro')){await game.modules.get(ID).api.createMacro();ui.notifications.info('SBS — Equipment Tracker is available in Macros.');}
  if(b.hasAttribute('data-bi-save')){
   const cfg=settings(),root=this.element,get=n=>root.querySelector(`[name="${n}"]`);
   for(const key of Object.keys(cfg.rules))cfg.rules[key]=typeof cfg.rules[key]==='boolean'?get(`rule.${key}`).checked:typeof cfg.rules[key]==='string'?get(`rule.${key}`).value:numeric(get(`rule.${key}`).value);
   if(!['damage','attack'].includes(cfg.rules.armorTrigger))throw Error('Choose a valid armor wear trigger.');
   if(cfg.rules.mendingHP<1||!Number.isInteger(cfg.rules.mendingHP))throw Error('Mending must restore at least 1 whole item HP.');
   if(cfg.rules.armorDamagePerHit<=0)throw Error('Armor wear must be positive. Disable automatic body-armor tracking to turn it off.');
   for(const [key,p]of Object.entries(cfg.profiles))for(const f of ['max','mode','damagePerWear','usesPerWear','tool','material','partsPerHP'])p[f]=['mode','tool','material'].includes(f)?get(`profile.${key}.${f}`).value:numeric(get(`profile.${key}.${f}`).value);
   for(const [key,r]of Object.entries(cfg.rarities)){for(const f of ['baseGP','valueRate','dc','minutes','reagents'])r[f]=numeric(get(`rarity.${key}.${f}`).value);r.arcana=get(`rarity.${key}.arcana`).checked;}
   const shops=JSON.parse(get('shops').value);if(!Array.isArray(shops)||shops.some(s=>!s.id||!s.name||!Array.isArray(s.rarities)||s.rarities.some(r=>!cfg.rarities[r])||numeric(s.multiplier,-1)<0||!Number.isFinite(Number(s.checkBonus))))throw Error('Each repairer needs id, name, enabled, valid rarities, nonnegative multiplier, and numeric checkBonus.');
   if(new Set(shops.map(s=>s.id)).size!==shops.length)throw Error('Repairer IDs must be unique.');
   for(const p of Object.values(cfg.profiles))if(p.max<1||p.damagePerWear<1||p.usesPerWear<1||p.partsPerHP<0)throw Error('HP and wear thresholds must be positive; parts cannot be negative.');
   for(const r of Object.values(cfg.rarities))if(r.baseGP<0||r.valueRate<0||r.dc<1||r.minutes<1||r.reagents<0)throw Error('Repair values must be nonnegative, with DC and time at least 1.');
   for(const group of ['rarities','materials','qualities'])for(const [key,factor]of Object.entries(cfg.durability[group]))for(const field of ['hp','wear']){const value=numeric(get(`factor.${group}.${key}.${field}`).value);if(value<=0)throw Error('HP and wear multipliers must be positive.');factor[field]=value;}
   for(const key of Object.keys(cfg.durability.useWeights)){const value=numeric(get(`weight.${key}`).value);if(value<=0)throw Error('Use weights must be positive.');cfg.durability.useWeights[key]=value;}
   for(const [key,value]of Object.entries({...cfg,shops}))await game.settings.set(ID,key,value);
   await game.settings.set(ID,'releasePopups',get('releasePopups').checked);
   ui.notifications.info('Breakable Items settings saved.');return this.render({force:true});
  }
 });},{signal});}
}
let refreshTimer;
export function refreshWindows(){
 clearTimeout(refreshTimer);
 refreshTimer=setTimeout(()=>{for(const win of openWindows)if(win instanceof EquipmentTracker&&win.rendered&&!win.durabilityClosing)void win.render({force:false});},40);
}
