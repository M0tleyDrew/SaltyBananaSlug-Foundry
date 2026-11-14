import { fitView, zoomView, dragView } from './navigation.mjs';
import { ID, QUESTS, EVIDENCE, SECTIONS, clone, esc, safeURL, defaults, normalize, projectQuests, health, validateLinkRows, mapPlacement, normalizeAppearance, panelStyle } from './model.mjs';

const { ApplicationV2 } = foundry.applications.api;
let dashboard, editor, refreshTimer, hiddenScene;
const settings = key => game.settings.get(ID,key);
const moduleAPI = id => game.modules.get(id)?.active ? game.modules.get(id).api : null;
const viewedScene = () => game.scenes?.viewed;
const permission = (doc,user=game.user) => !!doc && (user.isGM || doc.testUserPermission?.(user,CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER));
const draftJournals = () => game.user.isGM ? game.journal.filter(j=>j.getFlag(ID,'preset')).sort((a,b)=>a.name.localeCompare(b.name)) : [];
const text = value => esc(value).replace(/\n/g,'<br>');
const notice = message => ui.notifications.warn(message);
const handleError = error => { console.error(`${ID} |`,error); ui.notifications.error(error.message || 'Landing page action failed.'); };
const button = (action,label,extra='') => `<button type="button" data-lp-action="${action}" ${extra}>${esc(label)}</button>`;
function checkGM() { if (!game.user.isGM) throw new Error('Only the GM can change the landing page.'); }
function currentConfig() { const raw=viewedScene()?.getFlag(ID,'landing'); return raw ? normalize(raw) : null; }
function queueRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer=setTimeout(()=>{ if (dashboard?.rendered) dashboard.render().catch(handleError); },180);
}
function hideDashboard() { hiddenScene=viewedScene()?.id; dashboard?.close(); }

async function resolveVisible(uuid,user=game.user) {
  if (typeof uuid!=='string') return null;
  try { const doc=await fromUuid(uuid); return permission(doc,user)?doc:null; } catch { return null; }
}
async function openDocument(uuid) {
  const doc=await resolveVisible(uuid);
  if (!doc) return notice('That document is unavailable or you do not have permission to view it.');
  if (doc.documentName==='JournalEntryPage') return doc.parent.sheet.render(true,{pageId:doc.id});
  return doc.sheet?.render(true);
}
function partyFor(p) {
  const ids = p.autoParty
    ? game.users.filter(u => !u.isGM).map(u => u.character?.id ?? u._source?.character).filter(Boolean)
    : p.actorIds;
  const roster = new Map((p.roster ?? []).map(member => [member.id, member]));
  return [...new Set(ids)].map(id => game.actors.get(id) ?? roster.get(id)).filter(Boolean);
}
function characterCard(actor,p,user) {
  if (!actor.testUserPermission || !permission(actor,user)) {
    const image = safeURL(actor.img);
    return `<article class="sbs-lp-character">${image ? `<img src="${esc(image)}" alt="">` : ''}<div class="sbs-lp-character-info"><strong>${esc(actor.name)}</strong></div></article>`;
  }
  const owner=user.isGM || actor.testUserPermission(user,CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER);
  const attrs=actor.system?.attributes ?? {}, info=health(attrs.hp,p.hpMode,owner);
  const playerNames=game.users.filter(u=>!u.isGM && u.character?.id===actor.id).map(u=>u.name).join(', ');
  const classes=Object.values(actor.classes ?? {}).map(c=>`${c.name} ${c.system?.levels??''}`).join(' / ');
  const tags=[];
  if (p.showAC && attrs.ac?.value != null) tags.push(`AC ${attrs.ac.value}`);
  if (p.showPassive && actor.system?.skills?.prc?.passive != null) tags.push(`Passive ${actor.system.skills.prc.passive}`);
  if (p.showInspiration && attrs.inspiration) tags.push('★ Inspiration');
  if (p.showConditions) tags.push(...Array.from(actor.statuses ?? []).map(id=>CONFIG.statusEffects.find(s=>s.id===id)?.name ?? id).map(s=>game.i18n.localize(s)));
  const image=safeURL(actor.img);
  return `<button type="button" class="sbs-lp-character" data-lp-action="document" data-uuid="${esc(actor.uuid)}">
    ${image?`<img src="${esc(image)}" alt="${esc(actor.name)}" loading="lazy">`:''}<div class="sbs-lp-character-info"><strong>${esc(actor.name)}</strong>
    ${p.showPlayer?`<small>${esc(playerNames)}</small>`:''}${p.showLevel?`<small>${esc(classes || `Level ${actor.system?.details?.level ?? '—'}`)}</small>`:''}
    <span>${esc(info.label)}</span>${info.percent!==null?`<span class="sbs-lp-health" aria-hidden="true"><span style="width:${info.percent}%"></span></span>`:''}
    <small>${tags.map(esc).join(' · ')}</small></div></button>`;
}

class HTMLWindow extends ApplicationV2 {
  static DEFAULT_OPTIONS = {tag:'div',classes:['sbs-lp-window'],window:{resizable:true,minimizable:true,icon:'fa-solid fa-house'},position:{width:900,height:700}};
  async _renderHTML() { return this.buildHTML(); }
  _replaceHTML(result,content) {
    const scroll=content.querySelector?.('.sbs-lp-editor')?.scrollTop ?? 0;
    const panels=new Map(Array.from(content.querySelectorAll?.('[data-panel]') ?? []).map(p=>[p.dataset.panel,p.querySelector('.sbs-lp-panel-content')?.scrollTop ?? 0]));
    const expanded=new Map(Array.from(content.querySelectorAll('details'), d=>[d.querySelector('summary')?.textContent,d.open]));
    content.innerHTML=result;
    content.querySelectorAll('details').forEach(d=>{
      const title=d.querySelector('summary')?.textContent;
      if(expanded.has(title))d.open=expanded.get(title);
    });
    const viewport=content.querySelector('.sbs-lp-editor');if(viewport)viewport.scrollTop=scroll;
    content.querySelectorAll('[data-panel]').forEach(p=>{const body=p.querySelector('.sbs-lp-panel-content');if(body)body.scrollTop=panels.get(p.dataset.panel) ?? 0;});
  }
  async _onRender(context,options) {
    await super._onRender(context,options);
    this.element.querySelectorAll('[data-lp-action]').forEach(el=>el.addEventListener('click',event=>{
      event.preventDefault(); Promise.resolve(this.action(el.dataset.lpAction,el,event)).catch(handleError);
    }));
  }
}

export class LandingDashboard {
  generation = 0;
  get rendered() { return !!this.element?.isConnected; }
  close() {
    this.generation++;
    this.endPan();
    this.restoreZoomLimit();
    this.observer?.disconnect();
    this.ticker?.remove(this.trackMap);
    this.controls?.remove();
    this.element?.remove();
    this.element = null;
  }
  async render() {
    const generation = ++this.generation;
    const scene = viewedScene();
    const html = await this.buildHTML();
    const host = document.body;
    if (!host || generation !== this.generation || viewedScene() !== scene) return;
    if (!this.rendered) {
      this.element = document.createElement('div');
      this.element.className = 'sbs-lp-overlay';
      host.append(this.element);
      this.ticker = canvas.app?.ticker;
      this.trackMap = () => this.alignMap();
      this.ticker?.add(this.trackMap);
      this.element.addEventListener('wheel',event=>{
        event.stopPropagation();
        if(event.ctrlKey || event.metaKey) {
          event.preventDefault();
          this.zoomMap(event.deltaY<0?1.1:1/1.1,{x:event.clientX,y:event.clientY});
        }
      },{passive:false});
      this.controls=document.createElement('nav');
      this.controls.className='sbs-lp-view-controls';
      this.controls.setAttribute('aria-label','Landing page view');
      this.controls.innerHTML=button('zoom-out','−','aria-label="Zoom out"')+button('fit','Fit map')+
        button('zoom-in','+','aria-label="Zoom in"')+
        (game.user.isGM?button('configure','Configure'):'')+button('hide','Hide widgets');
      this.controls.title='Zoom the entire map. Scroll inside panels for content. Ctrl + wheel zooms at the cursor. Right-drag or middle-drag anywhere to pan.';
      host.append(this.controls);
      this.controls.addEventListener('click',event=>{
        const control=event.target.closest('[data-lp-action]');
        if(control)this.action(control.dataset.lpAction,control).catch(handleError);
      });
      this.element.addEventListener('pointerdown',event=>this.startPan(event),true);
      this.element.addEventListener('pointermove',event=>this.movePan(event),true);
      for(const type of ['pointerup','pointercancel','lostpointercapture']) {
        this.element.addEventListener(type,event=>{
          if(this.panGesture?.id===event.pointerId)this.endPan();
        },true);
      }
      this.element.addEventListener('contextmenu',event=>{event.preventDefault();event.stopPropagation();});
      this.element.addEventListener('auxclick',event=>{
        if(event.button===1 || event.button===2){event.preventDefault();event.stopPropagation();}
      });
      this.element.addEventListener('dragstart',event=>event.preventDefault());
      this.observer = new ResizeObserver(() => this.arrange());
      this.observer.observe(this.element);
      this.element.addEventListener('click', event => {
        const el = event.target.closest('[data-lp-action]');
        if (el) this.action(el.dataset.lpAction,el).catch(handleError);
      });
    }
    const scroll = new Map(Array.from(this.element.querySelectorAll('[data-panel]'), panel =>
      [panel.dataset.panel, panel.lastElementChild.scrollTop]));
    this.element.innerHTML = html;
    if (this.fittedScene !== this.sceneId) {
      this.fitMap();
      this.fittedScene=this.sceneId;
    }
    this.alignMap();
    this.arrange();
    for (const panel of this.element.querySelectorAll('[data-panel]')) {
      panel.lastElementChild.scrollTop = scroll.get(panel.dataset.panel) ?? 0;
    }
  }
  viewBounds() {
    const sidebar=document.querySelector('#sidebar')?.getBoundingClientRect();
    const left=80, right=Math.max(left+160,Math.min(window.innerWidth-16,sidebar?.left ?? window.innerWidth-16));
    return {left,right,top:85,bottom:Math.max(245,window.innerHeight-110)};
  }
  canvasViewport() {
    return (canvas.app.canvas ?? canvas.app.view).getBoundingClientRect();
  }
  fittedView() {
    return fitView(canvas.dimensions.sceneRect,this.viewBounds(),this.canvasViewport(),canvas.screenDimensions,canvas.stage.position);
  }
  restoreZoomLimit() {
    if(this.zoomLimit && this.zoomLimit.range.min===this.zoomLimit.applied)this.zoomLimit.range.min=this.zoomLimit.original;
    this.zoomLimit=null;
  }
  ensureZoomLimit() {
    const range=canvas.dimensions.scale;
    if(this.zoomLimit?.range!==range) {
      this.restoreZoomLimit();
      this.zoomLimit={range,original:range.min,applied:range.min};
    }
    // Preserve a lower limit installed by another module and only extend zoom-out.
    if(range.min!==this.zoomLimit.applied)this.zoomLimit.original=range.min;
    const minimum=Math.min(this.zoomLimit.original,this.fittedView().scale/4);
    range.min=minimum;
    this.zoomLimit.applied=minimum;
  }
  zoomMap(factor,anchor) {
    if(!canvas.ready)return;
    this.ensureZoomLimit();
    const bounds=this.viewBounds();
    anchor ??= {x:(bounds.left+bounds.right)/2,y:(bounds.top+bounds.bottom)/2};
    const scale=Math.max(canvas.dimensions.scale.min,Math.min(canvas.dimensions.scale.max,canvas.stage.scale.x*factor));
    canvas.pan(zoomView(canvas.stage,this.canvasViewport(),canvas.screenDimensions,anchor,scale));
  }
  fitMap() {
    if(!canvas.ready)return;
    this.ensureZoomLimit();
    canvas.pan(this.fittedView());
  }
  startPan(event) {
    if(!canvas.ready || ![1,2].includes(event.button))return;
    event.preventDefault();
    event.stopPropagation();
    this.panGesture={id:event.pointerId,x:event.clientX,y:event.clientY};
    this.element.setPointerCapture(event.pointerId);
    this.element.classList.add('sbs-lp-panning');
  }
  movePan(event) {
    const gesture=this.panGesture;
    if(!gesture || gesture.id!==event.pointerId)return;
    event.preventDefault();
    event.stopPropagation();
    canvas.pan(dragView(canvas.stage,this.canvasViewport(),canvas.screenDimensions,event.clientX-gesture.x,event.clientY-gesture.y));
    gesture.x=event.clientX;
    gesture.y=event.clientY;
  }
  endPan() {
    const gesture=this.panGesture;
    this.panGesture=null;
    if(gesture && this.element?.hasPointerCapture(gesture.id))this.element.releasePointerCapture(gesture.id);
    this.element?.classList.remove('sbs-lp-panning');
  }
  alignMap() {
    if (!this.element || !canvas.ready || canvas.scene?.id !== this.sceneId) return;
    this.ensureZoomLimit();
    if(this.controls) {
      const {left,right}=this.viewBounds();
      this.controls.style.left=`${left}px`;
      this.controls.style.width=`${right-left}px`;
    }
    const rect=canvas.dimensions.sceneRect;
    const view=canvas.app.canvas ?? canvas.app.view;
    const viewport=view.getBoundingClientRect();
    const placement=mapPlacement(rect,canvas.stage,viewport,canvas.screenDimensions);
    Object.assign(this.element.style,placement);
  }
  arrange() {
    const stage=this.element?.querySelector('.sbs-lp-stage');
    if (!stage) return;
    const party=stage.querySelector(':scope > .sbs-lp-party');
    const lower=stage.querySelector('.sbs-lp-lower');
    stage.style.gridTemplateRows=party && lower ? 'minmax(0, 0.38fr) minmax(0, 0.62fr)' : 'minmax(0,1fr)';
    if (lower) {
      const panels=Array.from(lower.children);
      const columns=Math.max(1,Math.min(3,Math.floor(stage.clientWidth/300)));
      const rows=Math.ceil(panels.length/columns);
      const perRow=Math.ceil(panels.length/rows);
      lower.style.gridTemplateRows=`repeat(${rows},minmax(0,1fr))`;
      panels.forEach((panel,i)=>{
        const count=Math.min(perRow,panels.length-Math.floor(i/perRow)*perRow);
        panel.style.gridColumn=`span ${6/count}`;
      });
    }
  }
  async buildHTML() {
    const p=this.config ?? currentConfig(); if (!p) return '';
    const user=this.preview ?? game.user, isGM=game.user.isGM && !this.preview;
    const panels={};
    panels.header=`<div class="sbs-lp-eyebrow">${esc(p.campaign)}</div><h1>${esc(p.showTitle?p.title:'Session '+p.session)}</h1><p>${[p.arc&&`Arc ${p.arc}`,p.chapter&&`Chapter ${p.chapter}`,p.session&&`Session ${p.session}`].filter(Boolean).map(esc).join(' · ')}</p>`;
    panels.party=`<div class="sbs-lp-party">${partyFor(p).map(a=>characterCard(a,p,user)).join('') || '<p>No visible characters selected.</p>'}</div>`;
    panels.recap=`<p>${text(p.recap || 'Your story continues here.')}</p>`;
    const qa=moduleAPI(QUESTS);
    if (qa?.getState) {
      const quests=projectQuests(qa.getState(),user,p.questIds);
      panels.quests=`${button('quests','Open quest board')}${quests.map(q=>`<article class="sbs-lp-quest"><strong>${esc(q.title)}</strong><ul>${q.objectives.map(o=>`<li class="${o.completed?'completed':''}">${o.completed?'✓':'○'} ${esc(o.title)}</li>`).join('')}</ul></article>`).join('') || '<p>No active quests visible.</p>'}`;
    }
    const journals=await Promise.all(p.journalRefs.map(ref=>resolveVisible(ref,user)));
    panels.journals=journals.filter(Boolean).map(j=>button('document',j.name,`data-uuid="${esc(j.uuid)}"`)).join('') || '<p>No handouts available for this session.</p>';
    const ea=moduleAPI(EVIDENCE);
    if (ea?.listBoards) {
      // The source API filters for the actual signed-in user; filter again for player preview.
      const boards=ea.listBoards().filter(b=>permission(b,user) && (!p.boardIds.length || p.boardIds.includes(b.id)));
      panels.evidence=boards.map(b=>button('evidence',b.name,`data-board="${esc(b.id)}"`)).join('') || '<p>No accessible evidence boards.</p>';
    }
    const links=await Promise.all(p.links.map(async link=>{
      const url=safeURL(link.target,true);
      if (url) return `<a class="sbs-lp-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(link.label)} ↗</a>`;
      const doc=await resolveVisible(link.target,user);
      return doc?button('document',link.label,`data-uuid="${esc(doc.uuid)}"`):'';
    }));
    panels.links=links.join('') || '<p>No links selected.</p>';
    panels.notices=`${p.nextSession?`<strong>Next session: ${esc(p.nextSession)}</strong>`:''}<p>${text(p.notices)}</p>`;
    const keys=Object.keys(SECTIONS).filter(key=>p.sections[key] && panels[key]!==undefined && (key!=='notices' || p.notices || p.nextSession));
    const section=key=>`<section class="sbs-lp-panel sbs-lp-${key}" data-panel="${key}" style="${panelStyle(p,key)}">
      <h2>${esc(SECTIONS[key])}</h2><div class="sbs-lp-panel-content">${panels[key]}</div></section>`;
    const lower=keys.filter(key=>key!=='party');
    return `<div class="sbs-lp-root sbs-lp-layout-${p.layoutMode ?? 'artwork'}" style="--lp-opacity:${p.opacity};--lp-text:${p.textScale}">
      <div class="sbs-lp-stage">${keys.includes('party')?section('party'):''}
        ${lower.length?`<div class="sbs-lp-lower">${lower.map(section).join('')}</div>`:''}
      </div></div>`;
  }
  async action(action,el) {
    if (action==='zoom-in') return this.zoomMap(1.2);
    if (action==='zoom-out') return this.zoomMap(1/1.2);
    if (action==='fit') return this.fitMap();
    if (action==='hide') return this.preview?this.close():hideDashboard();
    if (action==='configure') return openEditor();
    if (this.preview && ['document','quests','evidence'].includes(action)) return notice('Preview shows visibility only. Open links from your normal dashboard.');
    if (action==='document') return openDocument(el.dataset.uuid);
    if (action==='quests') return moduleAPI(QUESTS)?.openBoard();
    if (action==='evidence') return moduleAPI(EVIDENCE)?.openBoard(el.dataset.board);
  }
}

const field=(name,label,value,type='text')=>`<label>${esc(label)}<input type="${type}" name="${name}" value="${esc(value)}"></label>`;
const area=(name,label,value,rows=4)=>`<label>${esc(label)}<textarea name="${name}" rows="${rows}">${esc(value)}</textarea></label>`;
const check=(name,label,checked)=>`<label class="sbs-lp-check"><input type="checkbox" name="${esc(name)}" ${checked?'checked':''}>${esc(label)}</label>`;
const select=(name,label,value,options)=>`<label>${esc(label)}<select name="${name}">${Object.entries(options).map(([id,title])=>`<option value="${esc(id)}" ${id===value?'selected':''}>${esc(title)}</option>`).join('')}</select></label>`;

export class LandingEditor extends HTMLWindow {
  static DEFAULT_OPTIONS = {id:'sbs-landing-editor',window:{title:"SaltyBananaSlug's Landing Page — Session Setup"},position:{width:900,height:760}};
  constructor() {
    super(); const live=currentConfig(); this.presetId=live?.presetId ?? '';
    const saved=game.user.isGM && this.presetId ? game.journal.get(this.presetId)?.getFlag(ID,'preset') : null;
    this.p=normalize(saved ?? live ?? defaults()); if(live)this.p.layout=clone(live.layout);
    this.dirty=false; this.saving=false;
  }
  async buildHTML() {
    if (!game.user.isGM) return '<p>GM access required.</p>';
    const p=this.p;
    const presets=draftJournals();
    const actorChoices=game.actors.filter(a=>a.type==='character' || p.actorIds.includes(a.id)).sort((a,b)=>a.name.localeCompare(b.name));
    const ea=moduleAPI(EVIDENCE), qa=moduleAPI(QUESTS);
    const journalChoices=game.journal.filter(j=>!j.getFlag(ID,'preset')).sort((a,b)=>a.name.localeCompare(b.name));
    return `<div class="sbs-lp-editor"><div class="sbs-lp-editor-top"><p>Prepare a private preset, then publish it to a landing scene. Nothing changes in the scene until you publish.</p>
      <label>Saved presets<select name="presetChoice"><option value="">Choose a preset…</option>${presets.map(j=>`<option value="${j.id}" ${j.id===this.presetId?'selected':''}>${esc(j.getFlag(ID,'preset').name)}</option>`).join('')}</select></label>
      <div class="sbs-lp-buttons">${button('load','Load preset')}${button('new','New preset')}${button('copy','Duplicate draft')}${button('save','Save draft')}${button('macros','Create launcher macros')}</div></div>
      <form autocomplete="off"><details open><summary>Session & background</summary><div class="sbs-lp-fields">
      ${field('name','Preset name (GM only)',p.name)}${field('campaign','Campaign name',p.campaign)}${field('arc','Campaign arc',p.arc)}${field('chapter','Chapter',p.chapter)}${field('session','Session number',p.session)}${field('title','Episode / session title',p.title)}
      ${check('showTitle','Display episode title when published',p.showTitle)}
      <label class="sbs-lp-wide">Background image<div class="sbs-lp-buttons"><input type="text" name="background" value="${esc(p.background)}" placeholder="Foundry image path or https://…">${button('browse','Browse images')}</div></label>
      ${field('opacity','Default panel opacity (0 transparent–1 solid)',p.opacity,'number')}${field('textScale','Text scale (0.8–1.5)',p.textScale,'number')}
      </div></details>
      <details open><summary>Recap & announcements</summary><div class="sbs-lp-fields">${area('recap','Previously…',p.recap,6)}${area('notices','Announcements / reminders',p.notices,6)}${field('nextSession','Next session (include timezone)',p.nextSession)}</div></details>
      <details><summary>Character cards & visibility</summary><div class="sbs-lp-fields">
      ${check('autoParty','Use characters assigned to players automatically',p.autoParty)}${select('hpMode','HP shown to players with sheet access',p.hpMode,{exact:'Exact HP + temporary HP',bar:'Health bar only',state:'Health description',private:'HP visible only to owner and GM'})}
      ${['showAC','showPassive','showConditions','showInspiration','showLevel','showPlayer'].map((k,i)=>check(k,['Show AC','Show passive Perception','Show conditions','Show Inspiration','Show class and level','Show player name'][i],p[k])).join('')}
      <div class="sbs-lp-wide"><p>Manual party selection (used when automatic selection is off). Everyone sees the selected characters’ names and portraits. Observer access enables stats and sheet actions.</p><div class="sbs-lp-choice-list">${actorChoices.map(a=>check(`actor:${a.id}`,a.name,p.actorIds.includes(a.id))).join('')}</div></div></div></details>
      <details open><summary>Handouts, journals & uploads</summary><p>Drag a journal or page here, or select entries below. Players see only handouts they can already access. Reorder selected handouts with the arrows.</p>
      <div class="sbs-lp-fields">
      ${field('handoutTitle','New handout title (optional)',this.handoutTitle ?? '')}
      ${check('handoutShared','Allow all players to view the new handout',this.handoutShared ?? true)}
      </div><div class="sbs-lp-buttons">${button('upload-handout','Upload / choose image or PDF')}${button('new-handout','Create text handout')}</div>
      <p>Use the file browser’s Upload button to upload an image or PDF, then select the file. A new journal is added to this draft. Publish the draft to add its handout button to the landing page.</p>
      <div class="sbs-lp-drop" tabindex="0">Drop journal entries or individual pages here</div>
      <div class="sbs-lp-selected">${(await Promise.all(p.journalRefs.map(async(ref,i)=>{let d;try{d=await fromUuid(ref);}catch{}return `<div><span>${esc(d?.name??'Unavailable handout')} ${d && game.users.some(u=>!u.isGM&&!permission(d,u))?'<small>(restricted for some players)</small>':''}</span>${button('handout-up','↑',`data-index="${i}" aria-label="Move handout up"`)}${button('handout-down','↓',`data-index="${i}" aria-label="Move handout down"`)}${button('handout-remove','Remove from preset',`data-index="${i}"`)}</div>`;}))).join('')}</div>
      <div class="sbs-lp-choice-list">${journalChoices.map(j=>button('handout-add',j.name,`data-uuid="${esc(j.uuid)}"`)).join('')}</div></details>
      <details><summary>SBS quests & evidence</summary><p>${qa?'Quests & Objectives detected. Only active quests appear; player visibility and objective reveal rules apply. Leave selection empty for all active quests.':'Quests & Objectives is not enabled; its dashboard section stays hidden.'}</p>
      <div class="sbs-lp-choice-list">${qa?.getState?qa.getState().quests.filter(q=>q.status==='active').map(q=>check(`quest:${q.id}`,q.title,p.questIds.includes(q.id))).join(''):''}</div>
      <p>${ea?'Evidence Board detected. Leave selection empty for all boards the player can access.':'Evidence Board is not enabled; its dashboard section stays hidden.'}</p>
      <div class="sbs-lp-choice-list">${ea?.listBoards?ea.listBoards().map(b=>check(`board:${b.id}`,b.name,p.boardIds.includes(b.id))).join(''):''}</div></details>
      <details open><summary>Useful links</summary>
      <div class="sbs-lp-link-rows">${(p.links.length?p.links:[{label:'',target:''}]).map((link,i)=>`<div class="sbs-lp-link-row">
        ${field(`link-label:${i}`,'Button label',link.label)}
        ${field(`link-target:${i}`,'Website address or document UUID',link.target)}
        ${button('remove-link','Remove',`data-index="${i}"`)}
      </div>`).join('')}</div>
      ${button('add-link','Add another link')}
      <p>Paste a full website address such as https://example.com, or a Foundry document UUID. Links are checked when you save, preview, or publish.</p></details>
      <details><summary>Appearance & text</summary>
      ${select('layoutMode','Layout',p.layoutMode ?? 'artwork',{artwork:'Artwork first — compact party and lower cards',expanded:'Expanded panels — use all available space'})}
      <p>Every box has its own text colors and sizes. Background opacity −1 uses the default above; 0 is fully transparent. Text wraps and long content scrolls at the selected size. Map zoom scales the whole page.</p>
      ${Object.entries(SECTIONS).map(([key,label])=>{
        const a=normalizeAppearance(p.appearance?.[key]);
        return `<details><summary>${esc(label)}</summary><div class="sbs-lp-fields">
          ${field(`style:${key}:body`,'Body and button text',a.body,'color')}
          ${field(`style:${key}:heading`,'Heading text',a.heading,'color')}
          ${field(`style:${key}:accent`,'Names, titles and highlights',a.accent,'color')}
          ${field(`style:${key}:size`,'Body text size (12–32)',a.size,'number')}
          ${field(`style:${key}:headingSize`,'Heading size (12–48)',a.headingSize,'number')}
          ${field(`style:${key}:opacity`,'Box opacity (−1 uses default; 0–1 override)',a.opacity,'number')}
        </div></details>`;
      }).join('')}</details>
      <details><summary>Sections & layout</summary><div class="sbs-lp-choice-list">${Object.entries(SECTIONS).map(([k,label])=>check(`section:${k}`,label,p.sections[k])).join('')}</div><p>Enabled sections automatically share the available scene area.</p></details></form>
      <div class="sbs-lp-publish"><h3>Preview & publish</h3><div class="sbs-lp-fields">${select('previewUser','Preview as player','',Object.fromEntries(game.users.filter(u=>!u.isGM).map(u=>[u.id,u.name])))}
      <label>Target landing scene<select name="targetScene"><option value="">Choose an existing landing scene…</option>${game.scenes.filter(s=>s.getFlag(ID,'landing')).map(s=>`<option value="${s.id}" ${s.id===viewedScene()?.id?'selected':''}>${esc(s.name)}</option>`).join('')}</select></label></div>
      <div class="sbs-lp-buttons">${button('preview','Preview as player')}${button('create-scene','Create NEW landing scene')}${button('publish','Publish to selected landing scene')}</div>
      <p>Publishing saves the draft and updates that landing scene’s dashboard. Publishing a selected image sets the native scene background and fits the scene dimensions to its proportions. Leave the image field empty to keep an existing background. Activate the scene using Foundry’s normal scene navigation.</p><div class="sbs-lp-player-preview" hidden></div></div></div>`;
  }
  capture(validate=false) {
    const form=this.element.querySelector('form');if(!form) return;
    const f=new FormData(form), p=clone(this.p);
    for (const key of ['name','campaign','arc','chapter','session','title','background','recap','notices','nextSession','hpMode']) p[key]=String(f.get(key)??'').trim();
    for (const key of ['showTitle','autoParty','showAC','showPassive','showConditions','showInspiration','showLevel','showPlayer']) p[key]=f.has(key);
    p.layoutMode=String(f.get('layoutMode')??'artwork');
    p.appearance=Object.fromEntries(Object.keys(SECTIONS).map(key=>[key,normalizeAppearance(
      Object.fromEntries(['body','heading','accent','size','headingSize','opacity'].map(property=>[
        property,f.get(`style:${key}:${property}`)
      ]))
    )]));
    p.opacity=Number(f.get('opacity'));p.textScale=Number(f.get('textScale'));
    p.links=[...f.keys()].filter(key=>key.startsWith('link-label:')).map(key=>{
      const index=key.slice('link-label:'.length);
      return {label:String(f.get(key)??''),target:String(f.get(`link-target:${index}`)??'')};
    });
    if(validate)p.links=validateLinkRows(p.links);
    this.handoutTitle=String(f.get('handoutTitle')??'').trim();
    this.handoutShared=f.has('handoutShared');
    for (const [prefix,key] of [['actor:','actorIds'],['quest:','questIds'],['board:','boardIds']]) p[key]=[...f.keys()].filter(k=>k.startsWith(prefix)).map(k=>k.slice(prefix.length));
    for (const key of Object.keys(SECTIONS)) p.sections[key]=f.has('section:'+key);
    if (p.background && !safeURL(p.background)) throw new Error('Choose a valid image path or https:// image URL.');
    this.p=normalize(p);
  }
  async save() {
    checkGM(); this.capture(true);
    let journal=this.presetId?game.journal.get(this.presetId):null;
    if (journal && !journal.getFlag(ID,'preset')) throw new Error('The selected journal is not a landing-page preset.');
    if (journal) await journal.update({[`flags.${ID}.preset`]:this.p});
    else {journal=await JournalEntry.create({name:'SBS Landing — Session preset',ownership:{default:CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE},flags:{[ID]:{preset:this.p}}});this.presetId=journal.id;}
    this.dirty=false;return journal;
  }
  async confirmDiscard() {
    if (!this.dirty) return true;
    return foundry.applications.api.DialogV2.confirm({window:{title:'Unsaved session draft'},content:'<p>Discard the unsaved edits in this editor?</p>'});
  }
  async _onRender(context,options) {
    await super._onRender(context,options);
    const form=this.element.querySelector('form');
    form?.addEventListener('input',()=>{this.dirty=true;});
    form?.addEventListener('submit',event=>event.preventDefault());
    form?.addEventListener('keydown',event=>{
      if(event.target.matches('input,textarea,select'))event.stopPropagation();
    });
    const zone=this.element.querySelector('.sbs-lp-drop');
    zone?.addEventListener('dragover',e=>{e.preventDefault();});
    zone?.addEventListener('drop',async e=>{
      e.preventDefault();try {this.capture(); const data=JSON.parse(e.dataTransfer.getData('text/plain'));const doc=await fromUuid(data.uuid);
        if (!['JournalEntry','JournalEntryPage'].includes(doc?.documentName) || doc.getFlag?.(ID,'preset') || doc.parent?.getFlag?.(ID,'preset')) return notice('Drop a journal entry or page, excluding private session presets.');
        if (!this.p.journalRefs.includes(doc.uuid)) this.p.journalRefs.push(doc.uuid);this.dirty=true;await this.render();
      }catch(error){handleError(error);}
    });
    this.element.querySelectorAll('[name^="style:"]').forEach(input=>{
      if(input.name.endsWith(':opacity')){input.step='0.05';input.min='-1';input.max='1';}
      if(input.name.endsWith(':size')){input.min='12';input.max='32';}
      if(input.name.endsWith(':headingSize')){input.min='12';input.max='48';}
    });
    for (const name of ['opacity','textScale']) {const input=this.element.querySelector(`[name="${name}"]`);input.step='0.05';input.min=name==='opacity'?'0':'0.8';input.max=name==='opacity'?'1':'1.5';}
  }
  async action(action,el) {
    checkGM(); if(this.saving) return;
    if (action==='macros') {
      for (const [key,name,method] of [['open','SBS — Landing Page','open'],['configure','SBS — Configure Landing Page','configure']]) {
        if(game.macros.some(m=>m.getFlag(ID,'launcher')===key))continue;
        await Macro.create({name,type:'script',img:'icons/svg/house.svg',scope:'global',ownership:{default:key==='open'?CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER:CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE},command:`game.modules.get("${ID}")?.api?.${method}();`,flags:{[ID]:{launcher:key}}});
      }
      return ui.notifications.info('Launcher macros ready. Drag SBS — Landing Page to your hotbar. Existing macros were preserved.');
    }
    if (action==='browse') {
      const Picker=foundry.applications.apps.FilePicker.implementation;
      return new Picker({type:'image',current:this.element.querySelector('[name="background"]').value,callback:path=>{this.element.querySelector('[name="background"]').value=path;this.dirty=true;}}).render(true);
    }
    if (action==='new' || action==='load') {
      if (!await this.confirmDiscard()) return;
      if (action==='new'){this.p=defaults();this.presetId='';}
      else {const id=this.element.querySelector('[name="presetChoice"]').value,j=game.journal.get(id);if(!j?.getFlag(ID,'preset'))return notice('Choose a saved preset first.');this.p=normalize(j.getFlag(ID,'preset'));this.presetId=id;}
      this.dirty=false;return this.render();
    }
    this.capture(['save','publish','create-scene','preview'].includes(action));
    if(action==='add-link' || action==='remove-link') {
      if(action==='add-link')this.p.links.push({label:'',target:''});
      else this.p.links.splice(Number(el.dataset.index),1);
      this.dirty=true;
      await this.render();
      if(action==='add-link')this.element.querySelector('.sbs-lp-link-row:last-child input')?.focus();
      return;
    }
    if(action==='upload-handout') {
      const Picker=foundry.applications.apps.FilePicker.implementation;
      return new Picker({type:'any',callback:path=>{
        this.createHandout(path).catch(handleError);
      }}).render(true);
    }
    if(action==='new-handout')return this.createHandout();
    if (action==='copy'){this.p.name+=' (copy)';this.presetId='';this.dirty=true;return this.render();}
    if (action.startsWith('handout-')) {
      const i=Number(el.dataset.index), refs=this.p.journalRefs;
      if(action==='handout-add'&&!refs.includes(el.dataset.uuid))refs.push(el.dataset.uuid);
      if(action==='handout-remove')refs.splice(i,1);
      if(action==='handout-up'&&i>0)[refs[i-1],refs[i]]=[refs[i],refs[i-1]];
      if(action==='handout-down'&&i<refs.length-1)[refs[i+1],refs[i]]=[refs[i],refs[i+1]];
      this.dirty=true;return this.render();
    }
    if (action==='preview') {
      const user=game.users.get(this.element.querySelector('[name="previewUser"]').value);if(!user)return notice('Choose a player to preview.');
      const preview = new LandingDashboard();
      preview.preview=user;
      preview.config=clone(this.p);
      const region=this.element.querySelector('.sbs-lp-player-preview');
      region.innerHTML=await preview.buildHTML();
      region.hidden=false;
      region.querySelectorAll('[data-lp-action]').forEach(control=>control.disabled=true);
      region.scrollIntoView({block:'nearest'});
      return;
    }
    if (['save','publish','create-scene'].includes(action)) {
      this.saving=true;
      try {
        const sceneId=this.element.querySelector('[name="targetScene"]').value;
        if (action==='publish'&&!sceneId) return notice('Choose a landing scene, or create a new one.');
        let imageSize;
        if (action !== 'save' && this.p.background) {
          const image = new Image();
          image.src = this.p.background;
          await image.decode();
          const scale = Math.max(1, 200 / Math.min(image.naturalWidth,image.naturalHeight));
          imageSize = {width:Math.round(image.naturalWidth*scale),height:Math.round(image.naturalHeight*scale)};
        }
        const journal=await this.save();
        if(action==='save'){ui.notifications.info('Private session preset saved.');return this.render();}
        const published=clone(this.p);published.presetId=journal.id;
        published.roster=partyFor({...this.p,roster:[]}).map(({id,name,img})=>({id,name,img:safeURL(img)}));
        // Do not publish the internal preset name or a deliberately unrevealed episode title.
        delete published.name;if(!published.showTitle)published.title='';
        let scene;
        if(action==='create-scene')scene=await Scene.create({name:`${this.p.campaign || 'Campaign'} — Landing`,...(imageSize ?? {width:1920,height:1080}),padding:0,grid:{type:0},navigation:true,tokenVision:false,background:{src:this.p.background || null},flags:{[ID]:{landing:published}}});
        else {scene=game.scenes.get(sceneId);if(!scene?.getFlag(ID,'landing'))throw new Error('Choose a landing scene created by this module.');await scene.update({[`flags.${ID}.landing`]:published,...(imageSize?{'background.src':this.p.background,...imageSize}:{})});}
        ui.notifications.info(`Session published to ${scene.name}. Activate or view it through scene navigation.`);
        if(scene.id===viewedScene()?.id){hiddenScene=null;await syncDashboard();}
        return this.render();
      } finally {this.saving=false;}
    }
  }
  async createHandout(path='') {
    checkGM();
    if(this.addingHandout)return;
    this.capture();
    const source=path?safeURL(path):'';
    if(path&&!source)throw new Error('Choose a valid image or PDF path.');
    const ext=source.split(/[?#]/)[0].split('.').pop().toLowerCase();
    const type=path?(ext==='pdf'?'pdf':Object.hasOwn(CONST.IMAGE_FILE_EXTENSIONS,ext)?'image':null):'text';
    if(!type)throw new Error('Choose an image or PDF for this handout.');
    const filename=source.split(/[?#]/)[0].split('/').pop();
    let fallback=filename || 'New handout';
    try { fallback=decodeURIComponent(fallback); } catch {}
    const name=this.handoutTitle || fallback;
    this.addingHandout=true;
    try {
      const journal=await JournalEntry.create({
        name,
        ownership:{default:this.handoutShared?CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER:CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE},
        pages:[{name,type,...(type==='text'?{text:{content:'<p></p>'}}:{src:source})}]
      });
      this.p.journalRefs.push(journal.uuid);
      this.p.sections.journals=true;
      this.dirty=true;
      if(this.rendered)await this.render();
      journal.sheet?.render(true);
      ui.notifications.info('New handout added to this draft. Save and publish when ready.');
      return journal;
    } finally {this.addingHandout=false;}
  }
  async close(options={}) {if(!await this.confirmDiscard())return this;return super.close(options);}
}

function openEditor() {
  checkGM();if(editor?.rendered){editor.bringToFront();return editor;}editor=new LandingEditor();editor.render(true).catch(handleError);return editor;
}
async function syncDashboard(force=false) {
  const scene=viewedScene(),p=currentConfig();
  if (!p){hiddenScene=null;dashboard?.close();return;}
  if (force){hiddenScene=null;if(dashboard)dashboard.fittedScene=null;}
  if(hiddenScene===scene.id && !force)return;
  if(!settings('autoOpen')&&!force && !(dashboard?.rendered && dashboard.sceneId===scene.id)){dashboard?.close();return;}
  if(!dashboard)dashboard=new LandingDashboard();
  dashboard.sceneId=scene.id;
  await dashboard.render(true);
}

Hooks.once('init',()=>{
  game.settings.register(ID,'autoOpen',{name:'Open dashboard on landing scenes',hint:'Applies only on your device. Use the launcher macro to reopen a hidden dashboard.',scope:'client',config:true,type:Boolean,default:true});
  game.settings.registerMenu(ID,'configure',{name:'Landing Page — Session Setup',label:'Configure landing page',hint:'Create private session presets and publish a player landing scene.',icon:'fa-solid fa-house',type:LandingEditor,restricted:true});
  game.keybindings.register(ID,'open',{name:'Open landing page',hint:'Open the current landing scene dashboard, or session setup for a GM.',editable:[],onDown:()=>{if(currentConfig())syncDashboard(true).catch(handleError);else if(game.user.isGM)openEditor();return true;}});
});
Hooks.once('ready',()=>{
  game.modules.get(ID).api={open:()=>currentConfig()?syncDashboard(true):game.user.isGM?openEditor():notice('View a landing scene first.'),configure:openEditor,hide:hideDashboard};
  // Let other modules finish exposing their ready-time integration APIs first.
  setTimeout(()=>syncDashboard().catch(handleError),0);
});
Hooks.on('canvasReady',()=>syncDashboard().catch(handleError));
Hooks.on('canvasTearDown',()=>{dashboard?.close();hiddenScene=null;});
for(const hook of ['updateActor','updateUser','createActiveEffect','updateActiveEffect','deleteActiveEffect','createItem','updateItem','deleteItem','updateJournalEntry','updateJournalEntryPage','deleteJournalEntry','deleteJournalEntryPage'])Hooks.on(hook,queueRefresh);
Hooks.on('updateScene',scene=>{if(scene.id===viewedScene()?.id)syncDashboard().catch(handleError);});
Hooks.on('updateSetting',setting=>{if(setting.key?.startsWith(QUESTS+'.'))queueRefresh();});
