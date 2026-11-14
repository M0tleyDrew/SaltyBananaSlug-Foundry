export const ID = 'saltybananaslug-landing-page';
export const QUESTS = 'saltybananaslug-quests-objectives';
export const EVIDENCE = 'saltybananaslugs-evidence-board';
export const SECTIONS = { header: 'Session title', party: 'The party', recap: 'Previously…', quests: 'Active quests', journals: 'Session handouts', evidence: 'Evidence boards', links: 'Useful links', notices: 'Announcements' };
export const INITIAL_LAYOUT = {
  header: {x:0,y:0,w:100,h:18}, party:{x:0,y:20,w:100,h:27},
  recap:{x:0,y:49,w:37,h:49}, quests:{x:39,y:49,w:30,h:25},
  journals:{x:71,y:49,w:29,h:25}, evidence:{x:39,y:76,w:30,h:22},
  links:{x:71,y:76,w:29,h:22}, notices:{x:0,y:100,w:100,h:20}
};
export const clone = value => JSON.parse(JSON.stringify(value));
export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function safeURL(value, externalOnly = false) {
  const s = String(value ?? '').trim();
  if (!s || /[\x00-\x1f]/.test(s)) return '';
  if (/^https?:\/\//i.test(s)) { try { return new URL(s).href; } catch { return ''; } }
  if (externalOnly || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(s) || /[<>"'\\]/.test(s)) return '';
  return s;
}
export function defaults() {
  return {version:1, name:'New session', campaign:'Your campaign', arc:'', chapter:'', session:'1', title:'The adventure continues', showTitle:true,
    background:'', fit:'cover', backgroundPosition:'center', opacity:0.25, textScale:1, layoutMode:"artwork", appearance:{},
    recap:'', notices:'', nextSession:'', actorIds:[], journalRefs:[], boardIds:[], links:[], questIds:[],
    autoParty:true, hpMode:'exact', showAC:true, showPassive:true, showConditions:true,
    showInspiration:true, showLevel:true, showPlayer:true,
    sections:Object.fromEntries(Object.keys(SECTIONS).map(k=>[k,true])), layout:clone(INITIAL_LAYOUT)};
}
const bounded = (n,min,max,fallback) => Number.isFinite(Number(n)) ? Math.max(min,Math.min(max,Number(n))) : fallback;
export function normalize(raw = {}) {
  const d=defaults(), p={...d,...clone(raw)};
  for (const key of ['actorIds','journalRefs','boardIds','questIds','links']) p[key]=Array.isArray(p[key]) ? p[key] : [];
  p.sections={...d.sections,...p.sections}; p.layout={};
  for (const key of Object.keys(SECTIONS)) {
    const r=raw.layout?.[key] ?? INITIAL_LAYOUT[key];
    const x=bounded(r.x,0,85,0), y=bounded(r.y,0,200,0);
    p.layout[key]={x,y,w:bounded(r.w,15,100-x,30),h:bounded(r.h,12,120,25)};
  }
  p.hpMode=['exact','bar','state','private'].includes(p.hpMode)?p.hpMode:'private';
  p.fit=['cover','contain'].includes(p.fit)?p.fit:'cover';
  p.backgroundPosition=['center','top','bottom','left','right'].includes(p.backgroundPosition)?p.backgroundPosition:'center';
  p.opacity=bounded(p.opacity,0,1,0.25); p.textScale=bounded(p.textScale,0.8,1.5,1);
  p.layoutMode=['artwork','expanded'].includes(p.layoutMode)?p.layoutMode:'artwork';
  p.appearance=Object.fromEntries(Object.keys(SECTIONS).map(key=>[key,normalizeAppearance(p.appearance?.[key])]));
  return p;
}
// Mirror the installed SBS Quests & Objectives v0.1.6 visibility rules.
// Filter objectives before counting progress: hidden objectives must not leak through totals.
export function projectQuests(state,user,selected=[]) {
  return (state?.quests ?? []).filter(q=>q.status==='active' && (!selected.length || selected.includes(q.id)))
    .filter(q=>user.isGM || (q.audience!=='gm' && q.revealed!==false && (q.audience!=='private' || q.ownerId===user.id)))
    .map(q=>({id:q.id,title:q.title,objectives:(q.objectives??[])
      .filter(o=>user.isGM || (o.revealMode!=='gm' && o.revealed===true))
      .map(o=>({title:o.title,completed:!!o.completed}))}));
}
export function health(hp,mode,owner=false) {
  if (mode==='private' && !owner) return {label:'HP private',percent:null};
  const value=Math.max(0,Number(hp?.value)||0), max=Math.max(0,Number(hp?.max)||0), temp=Math.max(0,Number(hp?.temp)||0);
  const percent=max ? Math.min(100,value/max*100) : 0;
  if (mode==='state') return {label:value===0?'Unconscious':percent<=25?'Critical':percent<=50?'Wounded':percent<100?'Hurt':'Healthy',percent:null};
  return {label:mode==='bar'?'Health':`${value} / ${max} HP${temp?` · +${temp} temp`:''}`,percent};
}
export function parseLinks(text) {
  return text.split(/\r?\n/).filter(x=>x.trim()).map(line=>{
    const index=line.indexOf('|');
    if (index<1) throw new Error('Use one link per line: Label | https://… or Document.UUID');
    const label=line.slice(0,index).trim(), target=line.slice(index+1).trim();
    if (!target || (!safeURL(target,true) && !/^(Actor|Item|JournalEntry|Scene|RollTable|Playlist|Cards|Compendium)\.[A-Za-z0-9_.-]+$/.test(target))) throw new Error(`Invalid destination for ${label}`);
    return {label,target};
  });
}

// Use the same scene origin, pivot, and scale as the v13 canvas.
export function mapPlacement(rect,stage,viewport,screen) {
  const width=Math.max(1440,720*rect.width/rect.height), height=width*rect.height/rect.width;
  const rx=viewport.width/screen[0], ry=viewport.height/screen[1];
  const x=viewport.left+(stage.position.x+(rect.x-stage.pivot.x)*stage.scale.x)*rx;
  const y=viewport.top+(stage.position.y+(rect.y-stage.pivot.y)*stage.scale.y)*ry;
  const sx=rect.width/width*stage.scale.x*rx;
  const sy=rect.height/height*stage.scale.y*ry;
  return {width:`${width}px`,height:`${height}px`,transform:`translate(${x}px,${y}px) scale(${sx},${sy})`};
}

export function validateLinkRows(rows) {
  return rows.map(({label,target})=>({label:String(label??'').trim(),target:String(target??'').trim()}))
    .filter(row=>row.label || row.target).map((row,index)=>{
      if(!row.label || !row.target)throw new Error(`Link ${index+1} needs both a button label and a destination.`);
      if(/[\r\n]/.test(row.target))throw new Error(`Link ${index+1} needs one destination.`);
      // Reuse the same website and document validation as existing presets.
      parseLinks(`Link | ${row.target}`);
      return row;
    });
}

export function normalizeAppearance(raw={}) {
  const color=(value,fallback)=>/^#[0-9a-f]{6}$/i.test(value??'')?value:fallback;
  return {
    body:color(raw.body,'#f4efe3'),heading:color(raw.heading,'#e8d9aa'),accent:color(raw.accent,'#f1d995'),
    size:bounded(raw.size,12,32,18),headingSize:bounded(raw.headingSize,12,48,18),
    opacity:bounded(raw.opacity,-1,1,-1)
  };
}
export function panelStyle(p,key) {
  const a=normalizeAppearance(p.appearance?.[key]);
  return `--lp-body:${a.body};--lp-heading:${a.heading};--lp-accent:${a.accent};--lp-size:${a.size}px;--lp-heading-size:${a.headingSize}px;--lp-panel-alpha:${a.opacity<0?p.opacity:a.opacity}`;
}
