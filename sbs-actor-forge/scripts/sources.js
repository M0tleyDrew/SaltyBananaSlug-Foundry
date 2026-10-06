import {ID,clone,esc,itemKey} from './core.js';
import {damageData,mapSpellScaling,mapSimpleTraits,mapOriginProficiencies,mapAdditionalSpells,mapItemMechanics,mapAttachedSpells} from './source-mechanics.js';

const ability={strength:'str',dexterity:'dex',constitution:'con',intelligence:'int',wisdom:'wis',charisma:'cha'};
const school={A:'abj',C:'con',D:'div',E:'enc',V:'evo',I:'ill',N:'nec',T:'trs'};
const size={T:'tiny',S:'sm',M:'med',L:'lg',H:'huge',G:'grg'};
const skills={acrobatics:'acr','animal handling':'ani',arcana:'arc',athletics:'ath',deception:'dec',history:'his',insight:'ins',intimidation:'itm',investigation:'inv',medicine:'med',nature:'nat',perception:'prc',performance:'prf',persuasion:'per',religion:'rel','sleight of hand':'slt',stealth:'ste',survival:'sur'};
const units={feet:'ft',miles:'mi',self:'self',touch:'touch',sight:'spec',unlimited:'any',plane:'spec'};
const slug=s=>String(s).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
export const sourceIdentity=(kind,r)=>{
  const source=r.source || 'custom';
  if(kind==='classFeature')return `${kind}:${source}:${r.className || ''}:${r.classSource || source}:${r.level ?? 0}:${r.name}`;
  if(kind==='subclassFeature')return `${kind}:${source}:${r.className || ''}:${r.classSource || source}:${r.subclassShortName || r.subclassName || ''}:${r.subclassSource || source}:${r.level ?? 0}:${r.name}`;
  if(kind==='subclass')return `${kind}:${source}:${r.className || ''}:${r.name}`;
  return `${kind}:${source}:${r.name}`;
};
const sourceKey=sourceIdentity;
const safeText=s=>esc(String(s).replace(/\{@\w+\s+([^}]+)\}/g,(_m,x)=>x.split('|')[0]));
export function entriesHTML(entries) {
  if (entries==null) return '';
  if (typeof entries==='string' || typeof entries==='number') return `<p>${safeText(entries)}</p>`;
  if (Array.isArray(entries)) return entries.map(entriesHTML).join('');
  if (entries.type==='list') return `<ul>${(entries.items ?? []).map(x=>'<li>'+entriesHTML(x)+'</li>').join('')}</ul>`;
  if (entries.type==='table') return `<table><thead><tr>${(entries.colLabels ?? []).map(x=>'<th>'+safeText(x)+'</th>').join('')}</tr></thead><tbody>${(entries.rows ?? []).map(r=>'<tr>'+r.map(x=>'<td>'+entriesHTML(x)+'</td>').join('')+'</tr>').join('')}</tbody></table>`;
  return (entries.name ? `<h3>${safeText(entries.name)}</h3>` : '')+entriesHTML(entries.entries ?? entries.entry ?? entries.items ?? '');
}
function text(entries) { return typeof entries==='string' ? entries : JSON.stringify(entries ?? []); }
const damage=damageData;
function activity(kind,system,formula,damageType,record) {
  // Native level-0 spells never require slots. Keep casting consumption enabled so limited-use grants work.
  const a={_id:'sbsSourceAct0001',name:record.name,type:kind,activation:{...system.activation,override:true},range:{...system.range,override:true},target:{...clone(system.target),override:true,prompt:true},duration:{...clone(system.duration),override:true},consumption:{spellSlot:system.level!==undefined,targets:[]},effects:[]};
  if (kind==='attack') a.attack={ability:'',type:{value:record.spellAttack?.includes('M') ? 'melee' : 'ranged',classification:system.level!==undefined ? 'spell' : 'weapon'}};
  if (kind==='save') a.save={ability:(record.savingThrow ?? []).map(x=>ability[x] || x),dc:{calculation:'spellcasting',formula:''}};
  if (formula && ['attack','save','damage'].includes(kind)) a.damage={parts:[damage(formula,damageType)],includeBase:false,onSave:record.savingThrow?.length ? 'half' : 'none'};
  if (formula && kind==='heal') a.healing=damage(formula,'healing');
  return {[a._id]:a};
}
function base(kind,r,type) {
  const data={name:r.name,type,img:typeof r.img==='string' && r.img.trim() ? r.img.trim() : ({spell:'icons/svg/book.svg',race:'icons/svg/mystery-man.svg',background:'icons/svg/book.svg',class:'icons/svg/book.svg',feat:'icons/svg/upgrade.svg',weapon:'icons/svg/sword.svg'}[type] || 'icons/svg/item-bag.svg'),
    system:{identifier:slug(r.name),description:{value:entriesHTML(r.entries)+entriesHTML(r.additionalEntries)},source:{custom:r.source || '5e.tools JSON',rules:r.edition==='one' ? '2024' : '2014'}},effects:[],flags:{[ID]:{itemKey:sourceKey(kind,r),sourceFormat:'5etools',source:r.source || 'custom'}}};
  return data;
}
function spell(r,warnings) {
  const d=base('spell',r,'spell'),s=d.system,t=r.time?.[0],dist=r.range?.distance,dur=r.duration?.[0];
  Object.assign(s,{level:Number(r.level ?? 0),school:school[r.school] || 'evo',method:'spell',prepared:1,
    activation:{type:({bonus:'bonus',reaction:'reaction',action:'action',minute:'minute',hour:'hour'}[t?.unit] || 'action'),value:Number(t?.number ?? 1),condition:t?.condition || ''},
    range:{value:dist?.amount ?? null,units:units[dist?.type] || 'spec'},
    target:{affects:{count:'1',type:r.range?.type==='point' ? 'creature' : 'creature'},template:{type:({cone:'cone',cube:'cube',sphere:'radius',radius:'radius',line:'line',cylinder:'cylinder'}[r.range?.type] || ''),size:String(dist?.amount || ''),units:'ft'}},
    duration:{value:String(dur?.duration?.amount || ''),units:dur?.type==='instant' ? 'inst' : dur?.type==='permanent' ? 'perm' : ({round:'round',minute:'minute',hour:'hour',day:'day'}[dur?.duration?.type] || 'spec')},
    properties:[...(r.components?.v ? ['vocal'] : []),...(r.components?.s ? ['somatic'] : []),...(r.components?.m ? ['material'] : []),...(dur?.concentration ? ['concentration'] : []),...(r.meta?.ritual ? ['ritual'] : [])],
    materials:{value:typeof r.components?.m==='string' ? r.components.m : r.components?.m?.text || '',cost:(r.components?.m?.cost ?? 0)/100,consumed:Boolean(r.components?.m?.consume)}});
  const raw=text(r.entries),dice=raw.match(/\{@damage ([^}|]+)/)?.[1] || r.scalingLevelDice?.scaling?.['1'],heal=raw.match(/\{@dice ([^}|]+)\}[^]*?(?:hit points|healing)/i)?.[1];
  const kind=r.savingThrow?.length ? 'save' : r.spellAttack?.length ? 'attack' : dice ? 'damage' : heal ? 'heal' : 'utility';
  s.activities=activity(kind,s,dice || heal,r.damageInflict?.[0] || 'force',r);
  if(kind==='save' && s.activities.sbsSourceAct0001.damage)s.activities.sbsSourceAct0001.damage.onSave=/half (?:as much|the) damage/i.test(raw)?'half':'none';
  if ((r.damageInflict?.length || r.savingThrow?.length) && !dice) warnings.push('Review damage formula; the source did not supply a simple damage expression');
  const parts=[...raw.matchAll(/\{@damage ([^}|]+)/g)];
  if(parts.length>1)warnings.push('Multiple damage expressions: the first is mapped; configure additional/conditional activity damage');
  if(parts.length<=1)mapSpellScaling(r,s.activities.sbsSourceAct0001,warnings);
  else if(r.scalingLevelDice || r.entriesHigherLevel)warnings.push('Multiple damage expressions require manual scaling configuration');
  if (r.entriesHigherLevel) s.description.value+=entriesHTML(r.entriesHigherLevel);
  if ((r.duration?.length || 0)>1 || (r.time?.length || 0)>1) warnings.push('Multiple casting/duration options: the first option is mapped; all rules remain in the description');
  return d;
}
function makeAdv(type,config,index,title='') { return {_id:('sbsSourceAdv'+String(index).padStart(4,'0')).slice(0,16),type,title,level:0,configuration:config,value:{}}; }
function origin(kind,r,warnings) {
  const type=kind==='race' ? 'race' : kind==='background' ? 'background' : kind==='subclass' ? 'subclass' : 'class',d=base(kind,r,type),s=d.system;
  s.advancement=[];
  if (kind==='race') {
    if (r.size?.length) s.advancement.push(makeAdv('Size',{sizes:r.size.map(x=>size[x]).filter(Boolean)},1));
    const speed=typeof r.speed==='number' ? {walk:r.speed} : r.speed;
    if (speed) s.movement={...Object.fromEntries(Object.entries(speed).filter(([_k,v])=>typeof v==='number')),units:'ft'};
    if (r.darkvision) s.senses={darkvision:r.darkvision,units:'ft'};
    s.type={value:typeof r.creatureTypes?.[0]==='string' ? r.creatureTypes[0] : 'humanoid'};
  }
  if (kind==='class') { s.levels=1;s.hd={denomination:'d'+(r.hd?.faces || 8)};s.spellcasting={progression:({full:'full',half:'half',third:'third',pact:'pact'}[r.casterProgression] || 'none'),ability:r.spellcastingAbility || ''}; }
  if (kind==='subclass') { s.classIdentifier=slug(r.className || '');warnings.push('Verify subclass level and class association'); }
  const grants=[];
  const choices=[];
  mapSimpleTraits(r,grants,choices,warnings);
  for (const [field,trait] of [['resist','dr'],['immune','di']]) for (const v of r[field] ?? []) if (typeof v==='string') grants.push(trait+':'+v); else warnings.push('Conditional resistance retained as text');
  if (grants.length || choices.length) s.advancement.push(makeAdv('Trait',{grants,choices,allowReplacements:false,mode:'default'},2));
  const asi=r.ability?.[0];
  if (asi) {
    const fixed=Object.fromEntries(Object.entries(asi).filter(([k,v])=>['str','dex','con','int','wis','cha'].includes(k) && typeof v==='number'));
    if (Object.keys(fixed).length) s.advancement.push(makeAdv('AbilityScoreImprovement',{fixed,points:0,cap:2},3));
    if (asi.choose) {
      const from=asi.choose.from || asi.choose.weighted?.from,weights=asi.choose.weighted?.weights;
      if(from)s.advancement.push(makeAdv('AbilityScoreImprovement',{fixed:{},points:weights?weights.reduce((a,b)=>a+b,0):(asi.choose.amount || 1)*(asi.choose.count || 1),cap:weights?Math.max(...weights):(asi.choose.amount || 1),locked:['str','dex','con','int','wis','cha'].filter(x=>!from.includes(x))},4));
      else warnings.push('Ability score choice needs native configuration');
      if((r.ability?.length || 0)>1)warnings.push('Multiple ability-score packages: the first is mapped; review alternatives before applying');
    }
  }
  mapOriginProficiencies(kind,r,s,warnings);
  if (r.startingEquipment) warnings.push('Starting equipment choices need manual selection; supply items or Catalog grants');
  return d;
}
function monster(r,warnings) {
  const d={name:r.name,type:'npc',img:'icons/svg/mystery-man.svg',system:{abilities:Object.fromEntries(['str','dex','con','int','wis','cha'].map(k=>[k,{value:Number(r[k] ?? 10)}])),attributes:{hp:{value:r.hp?.average || 1,max:r.hp?.average || 1},ac:{calc:'flat',flat:typeof r.ac?.[0]==='number' ? r.ac[0] : r.ac?.[0]?.ac || 10},movement:{...Object.fromEntries(Object.entries(r.speed ?? {walk:30}).filter(([_k,v])=>typeof v==='number')),units:'ft'}},details:{cr:Number(r.cr?.cr ?? r.cr ?? 0),type:{value:typeof r.type==='string' ? r.type : r.type?.type || 'humanoid'},biography:{value:entriesHTML(r.entries)}},traits:{size:size[r.size?.[0]] || 'med'}},items:[],effects:[],flags:{[ID]:{key:sourceKey('monster',r),sourceFormat:'5etools'}}};
  const cr=r.cr?.cr ?? r.cr; if (typeof cr==='string' && cr.includes('/')) { const [n,m]=cr.split('/').map(Number);d.system.details.cr=n/m; }
  for (const [f,target] of [['resist','dr'],['immune','di'],['conditionImmune','ci']]) if(r[f]) d.system.traits[target]={value:r[f].filter(x=>typeof x==='string'),custom:r[f].filter(x=>typeof x!=='string').map(x=>text(x)).join('; ')};
  for (const group of ['trait','action','bonus','reaction','legendary','spellcasting']) for (const x of r[group] ?? []) {
    const i=base('feat',{...x,source:r.source},'feat'); i.system.description.value=entriesHTML(x.entries ?? x.headerEntries)+entriesHTML(x.footerEntries);
    const hit=text(x.entries).match(/\{@hit ([+-]?\d+)\}/)?.[1],dice=text(x.entries).match(/\{@damage ([^}|]+)/)?.[1];
    if (hit && dice) { const stub={activation:{type:group==='bonus' ? 'bonus' : group==='reaction' ? 'reaction' : 'action',value:1},range:{value:5,units:'ft'},target:{affects:{count:'1',type:'creature'}},duration:{units:'inst'}};i.system.activities=activity('attack',stub,dice,text(x.entries).match(/\}\s+(\w+) damage/)?.[1] || 'bludgeoning',{name:x.name});Object.values(i.system.activities)[0].attack={flat:true,bonus:hit,type:{value:'melee',classification:'weapon'}}; }
    else warnings.push(`${x.name}: rules retained as text; review its activity`);
    d.items.push(i);
  }
  if(r.saves || r.save || r.skill || r.spellcasting)warnings.push('Review saves, skills, spellcasting and conditional abilities after conversion');
  return d;
}
function item(r,warnings) {
  const t=String(r.type ?? '').split('|')[0],type=({M:'weapon',R:'weapon',LA:'equipment',MA:'equipment',HA:'equipment',S:'equipment',P:'consumable',SC:'consumable',WD:'consumable',RD:'consumable',A:'consumable',AF:'consumable',AT:'tool',INS:'tool',GS:'tool',T:'tool',W:'equipment',RG:'equipment',SCF:'equipment'}[t] || (r.wondrous?'equipment':r.poison?'consumable':'loot'));
  const d=base('item',r,type); Object.assign(d.system,{quantity:1,weight:{value:Number(r.weight ?? 0),units:'lb'},price:{value:Number(r.value ?? 0)/100,denomination:'gp'}});
  if(type==='weapon' && r.dmg1) {
    const damageTypes={A:'acid',B:'bludgeoning',C:'cold',F:'fire',O:'force',L:'lightning',N:'necrotic',P:'piercing',I:'poison',R:'radiant',S:'slashing',T:'thunder',Y:'psychic'};
    const propertyMap={A:'amm',F:'fin',H:'hvy',L:'lgt',R:'rch',S:'spc',T:'thr',V:'ver','2':'two',LD:'lod'};
    const suppliedProperties=(r.property ?? []).map(x=>String(x).split('|')[0]);
    const properties=suppliedProperties.map(x=>propertyMap[x]).filter(Boolean),ranged=t==='R',range=String(r.range || '').split('/').map(Number),damageType=damageTypes[r.dmgType] || 'bludgeoning';
    const bonus=Number(r.bonusWeapon || 0);
    if(Number.isFinite(bonus) && bonus)properties.push('mgc');
    Object.assign(d.system,{type:{value:(r.weaponCategory==='martial' ? 'martial' : 'simple')+(ranged ? 'R' : 'M')},
      damage:{base:damage(r.dmg1,damageType),...(r.dmg2 ? {versatile:damage(r.dmg2,damageType)} : {})},
      properties:[...new Set(properties)],magicalBonus:Number.isFinite(bonus) ? bonus : 0,
      range:{value:range[0]>0 ? range[0] : null,long:range[1]>0 ? range[1] : null,reach:ranged ? null : properties.includes('rch') ? 10 : 5,units:'ft'}});
    const stub={activation:{type:'action',value:1},range:{value:ranged ? d.system.range.value : d.system.range.reach,units:'ft'},target:{affects:{count:'1',type:'creature'}},duration:{units:'inst'}};
    d.system.activities=activity('attack',stub,null,null,r);
    const attack=d.system.activities.sbsSourceAct0001;attack.attack={ability:'',type:{value:ranged ? 'ranged' : 'melee',classification:'weapon'}};attack.damage={includeBase:true,parts:[],onSave:'none'};
    if(suppliedProperties.some(x=>!propertyMap[x]))warnings.push('Some weapon properties are unsupported; review the original source');
    if(r.mastery || r.bonusWeaponAttack || r.bonusWeaponDamage)warnings.push('Review mastery and conditional weapon bonuses; basic weapon mechanics are mapped');
    if(properties.includes('amm'))warnings.push('Choose the ammunition source in the native weapon activity');
  } else if(type==='loot')warnings.push('Descriptive content and basic weight/price are mapped; configure special item mechanics manually');
  mapItemMechanics(r,d,warnings);
  return d;
}
function expandCopy(kind,raw,bundle,trail=new Set()) {
  if(!raw._copy)return clone(raw);
  if(trail.has(raw))throw Error('inherited source cycle; use expanded JSON or Plutonium');
  const copy=raw._copy;
  if(copy._mod && Object.keys(copy._mod).length || copy._trait || copy._templates)throw Error('copy modifications need expanded JSON or Plutonium');
  const pool=kind==='item' || kind==='baseitem' ? [...(bundle.item ?? []),...(bundle.baseitem ?? [])] : bundle[kind] ?? [];
  const candidates=pool.filter(r=>r!==raw && r.name===copy.name && r.source===(copy.source || raw.source) &&
    ['className','classSource','subclassShortName','subclassSource','level'].every(k=>copy[k]===undefined || r[k]===copy[k]));
  if(candidates.length!==1)throw Error(candidates.length ? 'ambiguous inherited source; use expanded JSON' : `inherited source ${copy.name} was not supplied; load its source file or use expanded JSON`);
  const next=new Set(trail);next.add(raw);
  const result={...expandCopy(kind,candidates[0],bundle,next),...clone(raw)};delete result._copy;
  return result;
}
export function parseSourceBundle(bundle) {
  const records=[],warnings=[];
  if (!bundle || typeof bundle!=='object' || Array.isArray(bundle)) throw Error('5e.tools source must be a JSON object containing content arrays');
  const kinds=['monster','spell','race','background','class','subclass','classFeature','subclassFeature','feat','item','baseitem'];
  for (const kind of kinds) for (const supplied of bundle[kind] ?? []) {
    let raw;
    try{raw=expandCopy(kind,supplied,bundle);}catch(err){warnings.push(`${supplied.name || kind}: ${err.message}; skipped`);continue;}
    if (!raw.name) {warnings.push(`${kind} record without a name was skipped`);continue;}
    const w=[];let data;
    if(kind==='monster')data=monster(raw,w);
    else if(kind==='spell')data=spell(raw,w);
    else if(['race','background','class','subclass'].includes(kind))data=origin(kind,raw,w);
    else if(['item','baseitem'].includes(kind))data=item(raw,w);
    else data=base(kind,raw,'feat');
    records.push({key:sourceKey(kind,raw),kind,source:raw.source || 'custom',name:raw.name,context:[raw.className,raw.subclassShortName,raw.level!==undefined?'level '+raw.level:''].filter(Boolean).join(' · '),data,warnings:w,raw:clone(raw)});
  }
  if (!records.length) throw Error(warnings.join('\n') || 'No supported 5e.tools content arrays found');
  // Expand class feature references into native Item Grant advancements backed by Catalog items.
  for (const rec of records.filter(r=>['class','subclass'].includes(r.kind))) {
    const byLevel=new Map();
    const isSubclass=rec.kind==='subclass',featureKind=isSubclass ? 'subclassFeature' : 'classFeature';
    for (const ref of (isSubclass ? rec.raw.subclassFeatures ?? [] : rec.raw.classFeatures ?? []).flat(Infinity)) {
      const s=typeof ref==='string' ? ref : ref[featureKind];if(!s)continue;
      const parts=s.split('|'),[name,className,classSource]=parts;
      const [shortName,subclassSource,level,src]=isSubclass ? parts.slice(3) : ['', '', ...parts.slice(3)];
      const feat=records.find(r=>r.kind===featureKind && r.name===name && r.raw.className===className && (r.raw.classSource || r.source)===classSource && Number(r.raw.level)===Number(level) && r.source===(src || subclassSource || classSource) && (!isSubclass || (r.raw.subclassShortName || r.raw.subclassName)===shortName && (r.raw.subclassSource || r.source)===subclassSource));
      if (!feat) {rec.warnings.push(`${isSubclass?'Subclass':'Class'} feature ${name} was not included in the source files`);continue;}
      const l=Number(level);if(!byLevel.has(l))byLevel.set(l,[]);byLevel.get(l).push({uuid:'@forge:'+feat.key,optional:false});
    }
    let n=10;for (const [level,items] of byLevel) rec.data.system.advancement.push({...makeAdv('ItemGrant',{items},n++,isSubclass ? 'Subclass features' : 'Class features'),level});
  }
  for(const rec of [...records].filter(r=>['race','background'].includes(r.kind))){
    const grants=[];
    for(const entry of rec.raw.entries ?? [])if(entry && typeof entry==='object' && entry.name && entry.entries){
      const raw={name:rec.name+' — '+entry.name,source:rec.source,entries:entry.entries,img:entry.img},key=sourceKey('feat',raw),data=base('feat',raw,'feat');data.system.type={value:rec.kind};
      records.push({key,kind:'feat',source:rec.source,name:raw.name,data,warnings:['Passive rules text: review activities/effects if automation is needed'],raw});grants.push({uuid:'@forge:'+key,optional:false});
    }
    const featPackages=rec.raw.feats ?? [];
    if(featPackages.length>1)rec.warnings.push('Alternative feat packages need manual selection');
    else for(const featList of featPackages)for(const [ref,wanted]of Object.entries(featList)){
      if(wanted!==true){rec.warnings.push('Feat choices need manual selection or an explicit Catalog ItemChoice advancement');continue;}
      const [name,src]=ref.split('|');const feat=records.find(r=>r.kind==='feat' && r.name.toLowerCase()===name.toLowerCase() && r.source.toLowerCase()===(src || rec.source).toLowerCase());if(feat)grants.push({uuid:'@forge:'+feat.key,optional:false});else rec.warnings.push(`Feat ${name} was not supplied; add its source file or Catalog item`);
    }
    if(grants.length)rec.data.system.advancement.push(makeAdv('ItemGrant',{items:grants},20,'Origin features'));
  }
  for(const rec of [...records]) {
    if(['class','subclass','race','background','feat','classFeature','subclassFeature'].includes(rec.kind)){
      rec.data.system.advancement ??=[];mapAdditionalSpells(rec,records);
    }
    if(['item','baseitem'].includes(rec.kind))mapAttachedSpells(rec,records);
  }
  return {records,warnings};
}
export function catalogRows(records) { return records.filter(r=>r.data.type!=='npc').map(r=>({'Source Key':r.key,Name:r.name,Type:r.data.type,'Raw JSON':JSON.stringify(r.data)})); }
export function findSource(records,name,type,source='',warnings) {
  const matches=records.filter(r=>r.data.name===name && (!type || r.data.type===type) && (!source || r.source===source));
  if(matches.length!==1)throw Error(matches.length ? `Ambiguous source ${name}; specify Source or UUID` : `Source item not found: ${name}`);
  if(warnings)warnings.push(...matches[0].warnings.map(w=>`${name}: ${w}`));
  return clone(matches[0].data);
}
