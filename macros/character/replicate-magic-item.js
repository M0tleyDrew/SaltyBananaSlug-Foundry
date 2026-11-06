// SBS Replicate Magic Item v1.1 — Foundry v13 / dnd5e 5.2.x
// Published Eberron: Forge of the Artificer (2025), not legacy infusions or UA.
// Run once per session for recorded-death expiration; normal Long Rest counters persist.
await (async () => {
  const NS = 'world', KEY = 'sbsReplicate', FU = foundry.utils;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm = s => String(s ?? '').toLowerCase().replace(/[’']/g,'').replace(/[^a-z0-9+]/g,'');
  const clone = x => FU.deepClone(x), uid = () => FU.randomID();
  const fail = message => { throw Error(message); };
  const a = canvas.tokens.controlled[0]?.actor ?? game.user.character;
  if (!a?.isOwner || a.type !== 'character') return ui.notifications.warn('Select your Artificer token first.');
  const cls = a.items.find(i => i.type === 'class' && (i.system.identifier === 'artificer' || norm(i.name) === 'artificer'));
  const level = Number(cls?.system.levels ?? 0);
  if (cls?.system.source?.rules === '2014') return ui.notifications.warn('This macro requires the updated Eberron: Forge of the Artificer class, not legacy Infuse Item.');
  if (level < 2) return ui.notifications.warn('Replicate Magic Item requires Artificer level 2.');
  const bonus = level >= 9 && a.items.some(i => i.type === 'subclass' && norm(i.name).includes('armorer')) ? 1 : 0;
  const base = 2 + [6,10,14,18].filter(n => level >= n).length, limit = base + bonus;
  const planLimit = base + 2;
  const lockKey = `SBS-RMI:${a.uuid}`;
  if (globalThis[lockKey]) return ui.notifications.warn('This Artificer’s replication window is already open.');
  globalThis[lockKey] = true;
  let s = clone(a.getFlag(NS,KEY) ?? {version:1,level,plans:[],ledger:[],made:[],approved:[]});
  async function syncSheet() {
    const description=`<h2>Known Replication Plans</h2><p>${s.plans.length} plan(s) recorded for Artificer level ${level}. Normal allowance: ${planLimit}${bonus?' plus one Armor-category plan':''}. Active item limit: ${limit}.</p>
      <ul>${s.plans.map(p=>`<li><strong>${esc(p.name)}</strong>${p.slot==='armor'?' — Armor-only bonus plan':''}<br>Template: @UUID[${esc(p.uuid)}]</li>`).join('')||'<li>No plans chosen yet.</li>'}</ul>
      <p>Run <strong>Replicate Magic Item</strong> to review or manage these choices. Players replace one plan when gaining an Artificer level. The GM can correct setup mistakes without resetting resources.</p>
      <p>This entry mirrors the macro’s saved plans. Editing this description does not change the actual choices.</p>`;
    const item=a.items.find(i=>i.getFlag(NS,KEY)?.summary===true);
    const data={name:'Replication — Known Plans', 'system.description.value':description};
    if(item){if(item.system.description?.value!==description)await item.update(data);}
    else await a.createEmbeddedDocuments('Item',[{name:data.name,type:'feat',img:'icons/sundries/books/book-embossed-blue.webp',system:{description:{value:description},source:{rules:'2024'}},flags:{[NS]:{[KEY]:{summary:true}}}}]);
  }
  const save = async () => {
    await a.setFlag(NS,KEY,s);
    try{await syncSheet();}catch(e){console.error('SBS plan sheet summary:',e);ui.notifications.warn('Plans were saved, but their sheet summary could not be updated. Rerun the macro to retry.');}
  };
  // Replace native selects with full-size searchable radio lists, independent of theme select-height rules.
  function enhancePickers(_event,dialog) {
    const root=dialog.element;
    for(const select of root.querySelectorAll('select')) {
      if(select.dataset.sbsEnhanced)continue;select.dataset.sbsEnhanced='true';
      const box=document.createElement('div'),search=document.createElement('input'),list=document.createElement('div'),empty=document.createElement('p');
      box.className='sbs-replication-picker';
      Object.assign(box.style,{display:'flex',flexDirection:'column',gap:'8px',width:'100%',minWidth:'0',flex:'0 0 auto'});
      search.type='search';search.placeholder='Search these choices…';search.setAttribute('aria-label','Search choices');
      Object.assign(search.style,{width:'100%',height:'42px',minHeight:'42px',fontSize:'16px',padding:'8px',flex:'0 0 auto'});
      Object.assign(list.style,{display:'flex',flexDirection:'column',gap:'6px',overflowY:'auto',border:'1px solid var(--color-border-light-2, #888)',borderRadius:'6px',padding:'6px',height:`${Math.min(340,select.options.length*58+12)}px`,minHeight:'100px',flex:'0 0 auto'});
      empty.textContent='No matching choices.';empty.hidden=true;
      const rows=[...select.options].map(option=>{
        const row=document.createElement('label'),radio=document.createElement('input'),text=document.createElement('span');
        Object.assign(row.style,{display:'flex',alignItems:'center',gap:'12px',padding:'10px',minHeight:'48px',flex:'0 0 auto',cursor:'pointer',border:'1px solid var(--color-border-light-2, #888)',borderRadius:'5px',fontSize:'16px',lineHeight:'1.4',textAlign:'left'});
        radio.type='radio';radio.name=select.name;radio.value=option.value;radio.checked=option.selected;radio.disabled=option.disabled;
        Object.assign(radio.style,{flex:'0 0 20px',width:'20px',height:'20px',margin:'0'});
        text.textContent=option.textContent;Object.assign(text.style,{whiteSpace:'normal',overflowWrap:'anywhere',flex:'1',minWidth:'0'});
        row.append(radio,text);list.append(row);return {row,radio,text:option.textContent.toLowerCase()};
      });
      select.disabled=true;select.hidden=true;select.style.display='none';
      search.addEventListener('input',()=>{
        const query=search.value.trim().toLowerCase();
        for(const row of rows){row.row.hidden=!row.text.includes(query);row.row.style.display=row.row.hidden?'none':'flex';if(row.row.hidden)row.radio.checked=false;}
        const visible=rows.filter(r=>!r.row.hidden&&!r.radio.disabled);
        if(!visible.some(r=>r.radio.checked)&&visible[0])visible[0].radio.checked=true;
        empty.hidden=visible.length>0;
      });
      box.append(search,list,empty);select.after(box);
    }
    for(const input of root.querySelectorAll('input:not([type=radio]):not([type=checkbox])'))Object.assign(input.style,{minHeight:'40px',fontSize:'16px'});
  }
  const pick = async (title, content, buttons = [['ok','Continue'],['cancel','Cancel']]) => {
    const result = await foundry.applications.api.DialogV2.wait({window:{title,resizable:true},position:{width:Math.min(820,(globalThis.innerWidth||1100)-48)},render:enhancePickers,
      content:`<div style="max-height:70vh;overflow:auto;min-width:0;font-size:16px;line-height:1.5">${content}</div>`,rejectClose:false,
      buttons:buttons.map(([action,label]) => ({action,label,callback:(_e,b,d) => ({action,form:new FormData(b.form)})}))});
    return result && result.action !== 'cancel' ? result : null;
  };
  const yes = async (title,text) => !!await pick(title,`<p>${text}</p>`,[['ok','Confirm'],['cancel','Cancel']]);
  const options = (xs, value, label) => xs.map(x => `<option value="${esc(value(x))}">${esc(label(x))}</option>`).join('');
  const counters = {};
  async function counter(key,name,max) {
    let i = a.items.find(i => i.getFlag(NS,KEY)?.counter === key);
    if (!i) [i] = await a.createEmbeddedDocuments('Item',[{name,type:'feat',img:'icons/tools/smithing/anvil.webp',
      system:{description:{value:'Resource managed by the SBS Replicate Magic Item macro. Recovers on a normal Foundry Long Rest. Do not reset manually.'},
        uses:{max:String(max),spent:0,recovery:[{period:'lr',type:'recoverAll'}]}},flags:{[NS]:{[KEY]:{counter:key}}}}]);
    if (String(i._source.system.uses.max) !== String(max)) await i.update({'system.uses.max':String(max)});
    return counters[key] = i;
  }
  const spent = i => Number(i._source.system.uses.spent) || 0;
  // Atomic best effort: restore only documents touched by this operation on failure.
  async function transaction(fn) {
    const undo = [], old = clone(s);
    const tx = {
      update:async (d,data) => {const snap=d.toObject(),before={};for(const key of Object.keys(data))before[key]=clone(FU.getProperty(snap,key));undo.push(()=>d.update(before));await d.update(data);},
      create:async data => {const docs=await a.createEmbeddedDocuments('Item',[data]);undo.push(()=>a.deleteEmbeddedDocuments('Item',docs.map(d=>d.id)));return docs[0];},
      remove:async d => {const snap=d.toObject(),parent=d.parent;await parent.deleteEmbeddedDocuments('Item',[d.id]);undo.push(()=>parent.createEmbeddedDocuments('Item',[snap],{keepId:true}));}
    };
    try {await fn(tx);await save();}
    catch(e) {s=old;const errors=[];for(const f of undo.reverse())try{await f();}catch(err){errors.push(err.message);}
      try{await save();}catch(err){errors.push(err.message);}if(errors.length)console.error('SBS replication rollback needs GM review',errors);throw e;}
  }
  // Name families share a single plan, e.g. all plain +1 weapon variants.
  const tables = [
    [2,'Alchemy Jug|Bag of Holding|Cap of Water Breathing|Goggles of Night|Manifold Tool|Repeating Shot|Returning Weapon|Rope of Climbing|Sending Stones|Wand of Magic Detection|Wand of Secrets'],
    [6,'Boots of Elvenkind|Boots of the Winding Path|Cloak of Elvenkind|Cloak of the Manta Ray|Dazzling Weapon|Eyes of Charming|Eyes of Minute Seeing|Gloves of Thievery|Helm of Awareness|Lantern of Revealing|Mind Sharpener|Necklace of Adaptation|Pipes of Haunting|Repulsion Shield|Ring of Swimming|Ring of Water Walking|Sentinel Shield|Spell-Refueling Ring|Wand of Magic Missiles|Wand of Web|Weapon of Warning'],
    [10,'Armor of Resistance|Dagger of Venom|Elven Chain|Ring of Feather Falling|Ring of Jumping|Ring of Mind Shielding'],
    [14,'Arrow-Catching Shield|Flame Tongue|Ring of Free Action|Ring of Protection|Ring of the Ram']
  ];
  const named = new Map(tables.flatMap(([tier,names]) => names.split('|').map(n => [norm(n),{key:norm(n),tier,label:n}])));
  const armorType = d => d.type === 'equipment' && ['light','medium','heavy','shield'].includes(d.system?.type?.value);
  function family(d) {
    const n = norm(d.name), exact = named.get(n); if(exact)return exact;
    for (const [pattern,key,tier,label] of [
      [/^(?:\+1shield|shield\+1)$/,'shield1',2,'Shield +1'],[/^(?:\+2shield|shield\+2)$/,'shield2',10,'Shield +2'],
      [/^(?:\+1weapon|weapon\+1)$/,'weapon1',2,'Weapon +1'],[/^(?:\+2weapon|weapon\+2)$/,'weapon2',10,'Weapon +2'],
      [/^(?:\+1armor|armor\+1)$/,'armor1',6,'Armor +1'],[/^(?:\+2armor|armor\+2)$/,'armor2',14,'Armor +2'],
      [/^(?:\+1wandofthewarmage|wandofthewarmage\+1)$/,'wand1',2,'Wand of the War Mage +1'],
      [/^(?:\+2wandofthewarmage|wandofthewarmage\+2)$/,'wand2',10,'Wand of the War Mage +2'],
      [/^(?:\+1wrapsofunarmedpower|wrapsofunarmedpower\+1)$/,'wraps1',2,'Wraps of Unarmed Power +1'],
      [/^(?:\+2wrapsofunarmedpower|wrapsofunarmedpower\+2)$/,'wraps2',10,'Wraps of Unarmed Power +2']
    ]) if(pattern.test(n))return {key,tier,label};
    return null;
  }
  function wildcard(d) {
    const rarity=d.system?.rarity, type=d.system?.type?.value;
    if(rarity==='common' && !['potion','scroll'].includes(type) && !/^(potion|scroll)\b/i.test(d.name))
      return {key:`item:${norm(d.name)}`,tier:2,label:d.name};
    if(['uncommon','rare'].includes(rarity) && d.type==='equipment' && ['clothing','trinket','wondrous'].includes(type))
      return {key:`item:${norm(d.name)}`,tier:rarity==='uncommon'?10:14,label:d.name};
    return null;
  }
  let catalog;
  async function loadCatalog() {
    if(catalog)return catalog;
    ui.notifications.info('Reading accessible item compendium indexes…');
    const rows = [...game.items].map(d=>({name:d.name,uuid:d.uuid,source:'World Items',type:d.type,system:d.system}));
    const errors=[];
    for(const pack of game.packs) {
      if(pack.documentName !== 'Item' || !pack.visible)continue;
      try {const index=await pack.getIndex({fields:['system.rarity','system.type','system.source.rules']});
        for(const d of index)rows.push({...d,uuid:`Compendium.${pack.collection}.${d._id}`,source:pack.title});}
      catch(e){errors.push(pack.title);}
    }
    if(errors.length)ui.notifications.warn(`Could not read: ${errors.join(', ')}. Other packs remain available.`);
    catalog = rows.filter(d=>!['feat','spell','class','subclass','background','race','facility'].includes(d.type)
      && d.system?.source?.rules !== '2014').sort((x,y)=>x.name.localeCompare(y.name));
    return catalog;
  }
  // Generic names may exist as unconfigured templates. GM-approved concrete variants cover those cases.
  async function choosePlan(armorOnly=false, tierLimit=level, keyOnly=null) {
    const rows=await loadCatalog(), seen=new Set();
    const candidates=rows.map(d=>({d,f:family(d) ?? s.approved.find(p=>p.uuid===d.uuid) ?? wildcard(d)}))
      .filter(({d,f})=>f && f.tier<=tierLimit && (!keyOnly || f.key===keyOnly)
        && (keyOnly || !s.plans.some(p=>p.key===f.key)) && (!armorOnly || armorType(d) || f.armor))
      .filter(({d})=>!seen.has(d.uuid) && seen.add(d.uuid));
    if(!candidates.length){ui.notifications.warn('No eligible item templates found. Import 2024 items into an accessible Item compendium, or ask the GM to approve a concrete variant / wildcard plan using this macro.');return null;}
    const p=await pick('Choose a magic-item plan',`<p>${armorOnly?'Armor-only bonus plan. ':''}Choose one template. Its source must contain the complete 2024 item mechanics.</p>
      <select name="uuid" size="12" style="width:100%">${options(candidates,x=>x.d.uuid,x=>`${x.d.name} — ${x.d.source} (level ${x.f.tier}+)`)}</select>
      <p>Type a name while the list is focused to jump to it. Missing item? Import its real item document first; this macro does not invent placeholder mechanics. Wildcard choices use item-category metadata; the GM must review unusual or misclassified imports.</p>`);
    if(!p)return null;
    const c=candidates.find(x=>x.d.uuid===p.form.get('uuid')); if(!c)return null;
    const doc=await fromUuid(c.d.uuid);if(!doc)fail('The item template is unavailable.');
    if(/\bcurse(?:d)?\b/i.test(doc.system.description?.value ?? ''))fail('This template mentions a curse. GM review is required; use a verified noncursed source.');
    if(doc.system.source?.rules==='2014')fail('Use the updated 2024-rules item document.');
    return {key:c.f.key,name:c.f.label ?? doc.name,uuid:doc.uuid,tier:c.f.tier,armor:armorType(doc),rarity:doc.system.rarity,slot:armorOnly?'armor':'normal'};
  }
  async function approve() {
    if(!game.user.isGM)fail('The GM must run this macro on the Artificer to approve additional item templates.');
    const p=await pick('GM: approve a plan template',`<p>Paste an Item UUID from World Items or a compendium. Use this for concrete weapon/armor variants and wildcard plans.</p>
      <input name="uuid" placeholder="Compendium.… or Item.…">
      <select name="kind">${options(['common','uncommon','rare','family'],x=>x,x=>({common:'Common item (level 2+)',uncommon:'Uncommon Wondrous Item (level 10+)',rare:'Rare Wondrous Item (level 14+)',family:'Variant of a named plan'}[x]))}</select>
      <input name="family" placeholder="Named plan for variants, e.g. Weapon +1, Armor +1, Flame Tongue">
      <label><input type="checkbox" name="verified"> I verified category, rarity, no curse, source rules, and the complete item mechanics.</label>`);
    if(!p)return;if(!p.form.has('verified'))fail('Verify the template before approving it.');
    const d=await fromUuid(String(p.form.get('uuid')).trim());
    if(d?.documentName!=='Item' || d.parent || !d.testUserPermission(game.user,'OBSERVER'))fail('Choose a readable, unowned World Item or compendium Item.');
    if(d.system.source?.rules==='2014')fail('Approve an updated 2024-rules template.');
    const k=p.form.get('kind');let f;
    if(k==='family') {
      f=family({name:p.form.get('family')});if(!f)fail('Use an exact named plan from the published table.');
    } else {
      const required=k==='common'?'common':k;
      if(d.system.rarity!==required)fail(`The item must have ${required} rarity.`);
      const type=d.system.type?.value;
      if(k==='common' && (['potion','scroll'].includes(type)||/^(potion|scroll)\b/i.test(d.name)))fail('Common potions and scrolls are excluded.');
      f={key:`item:${norm(d.name)}`,label:d.name,tier:k==='common'?2:k==='uncommon'?10:14};
    }
    s.approved=s.approved.filter(x=>x.uuid!==d.uuid);
    s.approved.push({...f,uuid:d.uuid,armor:armorType(d)});catalog=null;await save();
  }
  async function locate(entry) {
    const actors = [...game.actors,...(canvas.scene?.tokens ?? []).filter(t=>!t.actorLink).map(t=>t.actor).filter(Boolean)];
    const matches=new Map();
    for(const actor of actors)for(const i of actor.items ?? []) {
      const tag=i.getFlag(NS,KEY);if(tag?.serial===entry.serial && tag?.creator===a.uuid)matches.set(i.uuid,i);
    }
    const original=await fromUuid(entry.uuid).catch(()=>null);
    if(original?.getFlag(NS,KEY)?.serial===entry.serial)matches.set(original.uuid,original);
    if(matches.size!==1)fail(`${entry.name}: cannot locate exactly one item. It may have been transferred, destroyed, or duplicated. Ask the GM to reconcile the ledger.`);
    const item=[...matches.values()][0];
    if(!item.isOwner)fail(`${entry.name} is held by another character. The GM must perform this change.`);
    return item;
  }
  async function vanish(tx,entry) {
    const item=await locate(entry);
    const contents=item.parent.items.filter(i=>i.system.container===item.id);
    for(const child of contents)await tx.update(child,{'system.container':null});
    await tx.remove(item);s.ledger=s.ledger.filter(e=>e.serial!==entry.serial);
  }
  async function template(plan,transmuting=false) {
    const variants=(await loadCatalog()).filter(d=>(family(d) ?? s.approved.find(p=>p.uuid===d.uuid) ?? wildcard(d))?.key===plan.key);
    if(variants.length>1){const chosen=await choosePlan(false,level,plan.key);if(!chosen)return null;plan={...chosen,slot:plan.slot};}
    const d=await fromUuid(plan.uuid);if(!d)fail(`Import or restore the template for ${plan.name}.`);
    if(d.system.source?.rules==='2014')fail('Restore a 2024-rules item template.');
    if(/\bcurse(?:d)?\b/i.test(d.system.description?.value??''))fail('This item mentions a curse; use a verified noncursed template.');
    plan={...plan,armor:armorType(d),rarity:d.system.rarity};
    const data=d.toObject();delete data._id;delete data.ownership;
    data.system.container=null;data.system.equipped=false;data.system.attuned=false;
    // Preserve a template's valid item quantity, including paired items.
    data.system.quantity=Math.max(1,Number(data.system.quantity)||1);
    if(data.system.uses)data.system.uses.spent=0;
    const attune=d.system.attunement==='required' || d.system.attunement==='optional';
    const p=await pick('Create item',`<p>${esc(d.name)}. Read the item entry for prerequisites. Creation requires Tinker’s Tools in hand after a Long Rest; transmutation instead requires touching the old item within 5 feet.</p>
      <label><input name="legal" type="checkbox"> I meet the requirements for this operation.</label>
      ${attune&&!transmuting?'<label><input name="attune" type="checkbox"> Attune immediately (creation after a Long Rest only; prerequisites still apply).</label>':''}`);
    if(!p)return null;if(!p.form.has('legal'))fail('Confirm the required timing, tools, or touch first.');
    return {data,plan,wantAttune:p.form.has('attune')};
  }
  function capacity(entries) {
    if(entries.length>limit || entries.filter(e=>!e.armor).length>base)fail('The extra Armorer allowance can only hold an Armor item.');
  }
  async function put(tx,plan,prepared,attune=false) {
    plan=prepared.plan??plan;
    if(attune) {
      const count=a.items.filter(i=>i.system.attuned).length, max=level>=18?6:level>=14?5:level>=10?4:3;
      if(count>=max)fail(`All ${max} attunement slots are occupied.`);
      prepared.data.system.attuned=true;
    }
    const entry={serial:uid(),key:plan.key,name:prepared.data.name,armor:plan.armor,rarity:plan.rarity,created:Date.now(),uuid:null};
    prepared.data.flags ??= {};prepared.data.flags[NS] ??= {};
    prepared.data.flags[NS][KEY]={creator:a.uuid,serial:entry.serial,key:entry.key};
    const item=await tx.create(prepared.data);entry.uuid=item.uuid;s.ledger.push(entry);
  }
  async function selectEntry(title,filter=()=>true) {
    const entries=s.ledger.filter(filter);if(!entries.length){ui.notifications.warn('No eligible replicated items.');return null;}
    const p=await pick(title,`<select name="serial">${options(entries,e=>e.serial,e=>e.name)}</select>`);
    return p?s.ledger.find(e=>e.serial===p.form.get('serial')):null;
  }
  async function setup() {
    const normal=s.plans.filter(p=>p.slot!=='armor').length;
    for(let n=normal;n<planLimit;n++){const p=await choosePlan();if(!p)return false;s.plans.push(p);await save();}
    if(bonus && !s.plans.some(p=>p.slot==='armor')){const p=await choosePlan(true);if(!p)return false;s.plans.push(p);await save();}
    return true;
  }
  async function editPlans() {
    const buttons=[...(level>s.level?[['level','Use level-up replacement']]:[]),
      ...(game.user.isGM?[['correct','Correct selected plan (GM)'],['remove','Remove incorrect plan (GM)']]:[]),['cancel','Close']];
    const r=await pick('Review / Edit Known Plans',`<p>These choices are also recorded under <strong>Replication — Known Plans</strong> on the Features tab.</p>
      <select name="old">${options(s.plans,p=>p.key,p=>`${p.name}${p.slot==='armor'?' — Armor-only bonus':''}`)}</select>
      <p>${level>s.level?'A level-up replacement is available.':'No level-up replacement is currently available.'} Setup mistakes can be corrected by the GM. Corrections do not refund uses or refill items.</p>`,buttons);
    if(!r)return;
    if(r.action==='level'){await replacements();return;}
    if(!game.user.isGM)fail('The GM must make setup corrections.');
    const old=s.plans.find(p=>p.key===r.form.get('old'));if(!old)fail('Select a known plan first.');
    const replacement=r.action==='correct'?await choosePlan(old.slot==='armor'):null;
    if(r.action==='correct'&&!replacement)return;
    const entries=s.ledger.filter(e=>e.key===old.key);
    if(!await yes('Confirm GM correction',`${esc(old.name)} ${replacement?'will be replaced with '+esc(replacement.name):'will be removed'}. ${entries.length} tracked item(s) made with that plan will vanish. Resource uses stay spent.`))return;
    for(const e of entries)await locate(e);
    await transaction(async tx=>{
      for(const e of entries)await vanish(tx,e);
      s.plans=s.plans.filter(p=>p.key!==old.key);
      if(replacement)s.plans.push({...replacement,slot:old.slot});
    });
  }
  async function restartSetup() {
    if(!game.user.isGM)fail('The GM must restart replication setup.');
    const r=await pick('Restart Replication Setup',`<p>This removes <strong>${s.plans.length} known plan(s)</strong> and makes <strong>${s.ledger.length} tracked replicated item(s)</strong> vanish. Contents of disappearing containers are released first.</p>
      <p>Other equipment, class features, and approved item templates stay in place. Creation, Drain, and Transmute uses remain spent. This does not grant additional level-up replacements.</p>
      <label>Type RESTART to confirm <input name="confirm" autocomplete="off"></label>`,[['restart','Remove plans and created items'],['cancel','Cancel']]);
    if(!r)return;if(r.form.get('confirm')!=='RESTART')fail('Type RESTART exactly to confirm.');
    for(const e of s.ledger)await locate(e);
    await transaction(async tx=>{for(const e of [...s.ledger])await vanish(tx,e);s.plans=[];});
    await setup();
  }
  async function replacements() {
    while(s.level<level) {
      const next=s.level+1;
      const r=await pick(`Artificer level ${next}: optional plan replacement`,
        `<p>You may replace one known plan for this Artificer level. This opportunity does not refresh on a rest. Items made with a replaced plan vanish.</p>
         <select name="old">${options(s.plans,p=>p.key,p=>p.name+(p.slot==='armor'?' (armor-only)':''))}</select>`,[['replace','Replace one'],['skip','Keep plans'],['cancel','Later']]);
      if(!r)return false;
      if(r.action==='replace') {
        const old=s.plans.find(p=>p.key===r.form.get('old')), p=await choosePlan(old.slot==='armor',next);
        if(!p)return false;
        if(!await yes('Replace plan?',`${esc(old.name)} → ${esc(p.name)}. All tracked items made with the old plan will vanish.`))return false;
        const entries=s.ledger.filter(e=>e.key===old.key);for(const e of entries)await locate(e);
        await transaction(async tx=>{for(const e of entries)await vanish(tx,e);s.plans=s.plans.filter(x=>x.key!==old.key);s.plans.push(p);s.level=next;});
      } else {s.level=next;await save();}
    }
    return true;
  }
  async function create() {
    if(spent(counters.create)>=limit)fail('No creation allowance remains. Finish a normal Foundry Long Rest.');
    if(!spent(counters.create))s.made=[];
    const plans=s.plans.filter(p=>!s.made.includes(p.key));
    const p=await pick('Replicate after a Long Rest',`<p>Choose a known plan. Each plan can create one item per Long Rest. This is not a free mid-day refill.</p><select name="key">${options(plans,x=>x.key,x=>x.name)}</select>`);
    if(!p)return;const plan=plans.find(x=>x.key===p.form.get('key'));if(!plan)fail('No unused known plan is available.');
    const prepared=await template(plan);if(!prepared)return;
    const oldest=s.ledger.length>=limit?[...s.ledger].sort((x,y)=>x.created-y.created)[0]:null;
    capacity([...s.ledger.filter(e=>e!==oldest),{armor:prepared.plan.armor}]);
    if(oldest && !await yes('Oldest item will vanish',`${esc(oldest.name)} vanishes to make room. Container contents will be released.`))return;
    if(oldest)await locate(oldest);
    await transaction(async tx=>{if(oldest)await vanish(tx,oldest);await put(tx,plan,prepared,prepared.wantAttune);
      await tx.update(counters.create,{'system.uses.spent':spent(counters.create)+1});s.made.push(plan.key);});
  }
  async function tinker(mode) {
    if(level<6)fail('Magic Item Tinker requires Artificer level 6.');
    if(mode!=='charge' && spent(counters[mode]))fail('That option has already been used since your last Long Rest.');
    const entry=await selectEntry('Choose your replicated item');if(!entry)return;
    const item=await locate(entry);
    if(!await yes('Touch requirement','Confirm that you can touch this item within 5 feet. Charge and Drain use a Bonus Action; Transmute uses a Magic action.'))return;
    if(mode==='charge') {
      const max=Number(item.system.uses?.max), used=Number(item._source.system.uses?.spent);
      if(!Number.isFinite(max)||max<1||!Number.isFinite(used)||used<1)fail('No spent item-level charges found. Activity-specific charge pools require manual handling.');
      const levels=[1,2,3,4,5,6,7,8,9].filter(n=>Number(a.system.spells[`spell${n}`]?.value)>0);
      const p=await pick('Spend a spell slot',`<select name="slot">${options(levels,n=>n,n=>`Level ${n}: restore up to ${n} charge(s)`)}</select>`);
      if(!p)return;const n=Number(p.form.get('slot'));if(!levels.includes(n))fail('No available slot selected.');
      await transaction(async tx=>{await tx.update(a,{[`system.spells.spell${n}.value`]:a.system.spells[`spell${n}`].value-1});await tx.update(item,{'system.uses.spent':Math.max(0,used-n)});});
    } else if(mode==='drain') {
      const n=entry.rarity==='common'?1:['uncommon','rare'].includes(entry.rarity)?2:0;if(!n)fail('Drain supports Common, Uncommon, or Rare items.');
      // Multilevel spell slots in dnd5e 5.2.x allow value > max; a Long Rest restores normal max.
      if(!a.system.spells[`spell${n}`])fail('Native spell-slot pool is unavailable.');
      await transaction(async tx=>{await vanish(tx,entry);await tx.update(a,{[`system.spells.spell${n}.value`]:Number(a.system.spells[`spell${n}`].value||0)+1});await tx.update(counters.drain,{'system.uses.spent':1});});
    } else {
      const plans=s.plans.filter(p=>p.key!==entry.key);
      const p=await pick('Transmute into another known plan',`<select name="key">${options(plans,p=>p.key,p=>p.name)}</select><p>Immediate attunement is not granted by Transmute. Attune normally afterward if needed.</p>`);
      if(!p)return;const plan=plans.find(x=>x.key===p.form.get('key'));if(!plan)fail('Select a different known plan.');
      const prepared=await template(plan,true);if(!prepared)return;capacity([...s.ledger.filter(e=>e!==entry),{armor:prepared.plan.armor}]);
      await transaction(async tx=>{await vanish(tx,entry);await put(tx,plan,prepared,false);await tx.update(counters.transmute,{'system.uses.spent':1});});
    }
  }
  async function reconcile() {
    if(!game.user.isGM)fail('Ask the GM to reconcile missing or transferred items.');
    const e=await selectEntry('GM: reconcile ledger');if(!e)return;
    const p=await pick('GM: locate or retire item',`<p>${esc(e.name)}. Paste its current owned Item UUID after a transfer, or retire its ledger entry only after verifying every copy was actually destroyed.</p><input name="uuid" placeholder="Actor.…Item.…"><label><input name="destroyed" type="checkbox"> I verified the item no longer exists.</label>`);
    if(!p)return;
    if(p.form.has('destroyed'))s.ledger=s.ledger.filter(x=>x!==e);
    else {const d=await fromUuid(String(p.form.get('uuid')).trim());if(d?.documentName!=='Item'||!d.parent)fail('Use an owned Item UUID.');
      await d.setFlag(NS,KEY,{creator:a.uuid,serial:e.serial,key:e.key});e.uuid=d.uuid;}
    await save();
  }
  async function cheatDeath() {
    if(level<20 || Number(a.system.attributes.hp.value)!==0)fail('Cheat Death requires level 20 and being reduced to 0 HP without being killed outright.');
    const entries=s.ledger.filter(e=>['uncommon','rare'].includes(e.rarity));
    const p=await pick('Cheat Death',`<p>Confirm you were not killed outright. Select items to disintegrate.</p><label><input type="checkbox" name="legal"> I was not killed outright.</label>${entries.map(e=>`<label style="display:block"><input type="checkbox" name="item" value="${e.serial}">${esc(e.name)}</label>`).join('')}`);
    if(!p)return;if(!p.form.has('legal'))fail('Cheat Death cannot prevent outright death.');const chosen=entries.filter(e=>p.form.getAll('item').includes(e.serial));if(!chosen.length)return;
    for(const e of chosen)await locate(e);
    await transaction(async tx=>{for(const e of chosen)await vanish(tx,e);await tx.update(a,{'system.attributes.hp.value':Math.min(a.system.attributes.hp.max,20*chosen.length)});});
  }
  async function expire() {
    if(s.expires!=null && game.time.worldTime>=s.expires) {
      for(const e of s.ledger)await locate(e);
      await transaction(async tx=>{for(const e of [...s.ledger])await vanish(tx,e);s.expires=null;});
      ui.notifications.info('Replicated items expired after the Artificer’s death.');
    }
  }
  try {
    if(s.version!==1)fail('Unsupported saved replication data version. Ask the GM before editing it.');
    if(level<s.level)fail('Artificer level decreased. Ask the GM to review plans and active item limits.');
    await counter('create','Replication — Long Rest creation allowance',limit);
    if(level>=6){await counter('drain','Replication — Drain Magic Item',1);await counter('transmute','Replication — Transmute Magic Item',1);}
    await expire();
    // One monitor per actor per client. It runs only while this Foundry session remains open.
    globalThis.SBSReplicationMonitors ??= new Map();
    const previousMonitor=globalThis.SBSReplicationMonitors.get(a.uuid);
    if(previousMonitor!=null)Hooks.off('updateWorldTime',previousMonitor);
    {
      const id=Hooks.on('updateWorldTime',async()=>{if(globalThis[lockKey])return;globalThis[lockKey]=true;
        try{s=clone(a.getFlag(NS,KEY)??s);await expire();}catch(e){console.warn('SBS replication expiration:',e.message);}finally{globalThis[lockKey]=false;}});
      globalThis.SBSReplicationMonitors.set(a.uuid,id);
    }
    await save();
    if(!s.plans.length)await setup();
    let running=true;
    while(running) {
      const normal=s.plans.filter(p=>p.slot!=='armor').length;
      const menu=[['edit','Review / Edit Known Plans'],['plans','Choose missing plans'],...(level>s.level?[['level','Resolve level-up replacement(s)']]:[]),['create','Create item'],
        ...(level>=6?[['charge','Charge'],['drain','Drain'],['transmute','Transmute']]:[]),...(level>=20?[['deathsave','Cheat Death']]:[]),['list','Plan list'],
        ...(game.user.isGM?[['approve','Approve template'],['reconcile','Reconcile ledger'],['reset','Restart Setup (GM)'],['death','Record death']]:[])];
      const action=await pick(`${a.name}: Replicate Magic Item`,
        `<p><b>Artificer ${level}</b> · Plans ${normal}/${planLimit}${bonus?' + 1 armor-only':''} · Active items ${s.ledger.length}/${limit}</p>
         <p>Creation uses remaining: ${Math.max(0,limit-spent(counters.create))}. ${bonus?'At most '+base+' non-Armor items.':''}</p>
         <p><b>Known:</b> ${s.plans.map(p=>esc(p.name)+(p.slot==='armor'?' [armor]':'')).join(', ')||'Choose plans below.'}</p>
         <p><b>Created:</b> ${s.ledger.map(e=>esc(e.name)).join(', ')||'None'}</p>
         <p>Use Foundry’s normal Long Rest to recover counters. New items require completion of that rest with Tinker’s Tools in hand; the macro cannot verify real-world timing.</p>
         <select name="menu" size="8" style="width:100%">${options(menu,x=>x[0],x=>x[1])}</select>`,[['open','Open'],['cancel','Close']]);
      if(!action)break;
      action.action=action.form.get('menu');
      try {
        if(action.action==='list')await pick('Published plan options',tables.map(([n,names])=>`<p><b>Level ${n}+</b>: ${esc(names.replaceAll('|',', '))}</p>`).join('')+
          '<p><b>Also level 2+:</b> Shield +1, Weapon +1, Wand of the War Mage +1, Wraps of Unarmed Power +1; any noncursed Common item except Potions and Scrolls.</p><p><b>Also level 6+:</b> Armor +1.</p><p><b>Also level 10+:</b> Shield +2, Weapon +2, Wand of the War Mage +2, Wraps of Unarmed Power +2; noncursed Uncommon Wondrous Items.</p><p><b>Also level 14+:</b> Armor +2; noncursed Rare Wondrous Items.</p><p>Each wildcard item is a separate plan. Concrete variants of a named plan share that named plan. Choose a template for the variant you intend to create; GM approval can bind additional variants. Only accessible, imported 2024 item documents can be created.</p>',[['ok','Close']]);
        else if(action.action==='edit')await editPlans();
        else if(action.action==='plans')await setup();
        else if(action.action==='level')await replacements();
        else if(action.action==='approve')await approve();
        else if(action.action==='reconcile')await reconcile();
        else if(action.action==='reset')await restartSetup();
        else if(action.action==='death') {
          if(s.expires!=null)fail('A death-expiration timer is already recorded.');
          if(await yes('Record actual death','This is for death, not unconsciousness. Start the 1d4-day item-expiration timer?')) {
            const roll=await new Roll('1d4').evaluate();s.expires=game.time.worldTime+Number(roll.total)*86400;await save();await roll.toMessage({speaker:ChatMessage.getSpeaker({actor:a}),flavor:'Replicated items vanish this many days after death.'});
          }
        } else if(action.action==='deathsave')await cheatDeath();
        else {if(level>s.level)fail('Resolve the level-up replacement opportunities first.');
          if(action.action==='create')await create();else await tinker(action.action);}
      } catch(e){console.error('SBS Replicate Magic Item',e);ui.notifications.error(e.message);}
    }
  } catch(e) {console.error('SBS Replicate Magic Item',e);ui.notifications.error(e.message);}
  finally {globalThis[lockKey]=false;}
})();
