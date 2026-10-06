import {clone,esc} from './core.js';

const ABILITIES=['str','dex','con','int','wis','cha'];
const SKILLS={acrobatics:'acr','animal handling':'ani',arcana:'arc',athletics:'ath',deception:'dec',history:'his',insight:'ins',intimidation:'itm',investigation:'inv',medicine:'med',nature:'nat',perception:'prc',performance:'prf',persuasion:'per',religion:'rel','sleight of hand':'slt',stealth:'ste',survival:'sur'};
const ARMOR={light:'lgt',medium:'med',heavy:'hvy',shield:'shl',shields:'shl',lgt:'lgt',med:'med',hvy:'hvy',shl:'shl'};
const WEAPONS={simple:'sim',martial:'mar',sim:'sim',mar:'mar'};
const WEAPON_IDS={club:'sim:club',dagger:'sim:dagger',greatclub:'sim:greatclub',handaxe:'sim:handaxe',javelin:'sim:javelin','light hammer':'sim:lighthammer',mace:'sim:mace',quarterstaff:'sim:quarterstaff',sickle:'sim:sickle',spear:'sim:spear','light crossbow':'sim:lightcrossbow',dart:'sim:dart',shortbow:'sim:shortbow',sling:'sim:sling',battleaxe:'mar:battleaxe',flail:'mar:flail',glaive:'mar:glaive',greataxe:'mar:greataxe',greatsword:'mar:greatsword',halberd:'mar:halberd',lance:'mar:lance',longsword:'mar:longsword',maul:'mar:maul',morningstar:'mar:morningstar',pike:'mar:pike',rapier:'mar:rapier',scimitar:'mar:scimitar',shortsword:'mar:shortsword',trident:'mar:trident','war pick':'mar:warpick',warhammer:'mar:warhammer',whip:'mar:whip',blowgun:'mar:blowgun','hand crossbow':'mar:handcrossbow','heavy crossbow':'mar:heavycrossbow',longbow:'mar:longbow',musket:'mar:musket',pistol:'mar:pistol'};
const TOOLS={"alchemist's supplies":'art:alchemist',"brewer's supplies":'art:brewer',"calligrapher's supplies":'art:calligrapher',"carpenter's tools":'art:carpenter',"cartographer's tools":'art:cartographer',"cobbler's tools":'art:cobbler',"cook's utensils":'art:cook',"glassblower's tools":'art:glassblower',"jeweler's tools":'art:jeweler',"leatherworker's tools":'art:leatherworker',"mason's tools":'art:mason',"painter's supplies":'art:painter',"potter's tools":'art:potter',"smith's tools":'art:smith',"tinker's tools":'art:tinker',"weaver's tools":'art:weaver',"woodcarver's tools":'art:woodcarver',"disguise kit":'disg',"forgery kit":'forg',"herbalism kit":'herb',"navigator's tools":'navg',"poisoner's kit":'pois',"thieves' tools":'thief',bagpipes:'music:bagpipes',drum:'music:drum',dulcimer:'music:dulcimer',flute:'music:flute',horn:'music:horn',lute:'music:lute',lyre:'music:lyre',panflute:'music:panflute',shawm:'music:shawm',viol:'music:viol','dice set':'game:dice','playing card set':'game:card','dragonchess set':'game:chess','three-dragon ante set':'game:three','vehicles (land)':'vehicle:land','vehicles (water)':'vehicle:water'};
const DICE=/^(\d+)d(\d+)(?:\s*([+-])\s*(\d+))?$/i;
const plain=v=>typeof v==='string' ? v : JSON.stringify(v ?? []);
export function damageData(formula,type) {
  const m=String(formula).trim().match(DICE);
  return m ? {number:Number(m[1]),denomination:Number(m[2]),bonus:m[3]?m[3]==='-'?'-'+m[4]:m[4]:'',types:type?[type]:[],custom:{enabled:false},scaling:{mode:'',number:1,formula:''}}
    : {number:0,denomination:6,bonus:'',types:type?[type]:[],custom:{enabled:true,formula:String(formula)},scaling:{mode:'',number:0,formula:''}};
}

// Foundry computes cantrip steps from character level and slot steps above a spell's base level.
export function mapSpellScaling(record,activity,warnings) {
  const part=activity.healing ?? activity.damage?.parts?.[0];
  if(record.scalingLevelDice) {
    const table=record.scalingLevelDice;
    const values=Array.isArray(table)?null:[1,5,11,17].map(l=>String(table.scaling?.[l] ?? '').match(DICE));
    if(Number(record.level)===0 && part && !part.custom.enabled && values?.every(Boolean) && Object.keys(table.scaling ?? {}).length===4 &&
      values.every((m,i)=>Number(m[2])===part.denomination && (m[3]?m[3]==='-'?'-'+m[4]:m[4]:'')===part.bonus && Number(m[1])===part.number+i*(Number(values[1][1])-part.number)) && Number(values[1][1])>part.number) {
      part.scaling={mode:'whole',number:Number(values[1][1])-part.number,formula:''};
    } else warnings.push('Cantrip scaling is not a single standard 1/5/11/17 dice progression; configure its activity manually');
  }
  if(!record.entriesHigherLevel) return;
  const raw=plain(record.entriesHigherLevel);
  const tags=[...raw.matchAll(/\{@scale(?:damage|dice) ([^}]+)\}/gi)];
  const perSlot=/for each (?:spell )?slot level above|for each level (?:of the slot )?above/i.test(raw);
  let increment;
  if(tags.length===1 && perSlot) {
    const [base,range,step]=tags[0][1].split('|');
    if(Number(range?.split('-')[0])===Number(record.level) && base.trim()===step?.trim())increment=step;
  } else if(!tags.length && perSlot) {
    const matches=[...raw.matchAll(/(?:damage|healing|hit points[^.]*?)\s+increases? by\s+\{@(?:dice|damage) ([^}|]+)\}/gi)];
    if(matches.length===1)increment=matches[0][1];
  }
  const m=increment?.trim().match(DICE);
  if(Number(record.level)>0 && part && m && Number(m[1])>0) {
    part.scaling={mode:'whole',number:!part.custom.enabled && Number(m[2])===part.denomination && !m[3] ? Number(m[1]) : 0,
      formula:!part.custom.enabled && Number(m[2])===part.denomination && !m[3] ? '' : increment};
  } else warnings.push('Higher-level rules are retained in the description; damage/targets/other effects need manual scaling configuration');
}

function nativeAdv(type,configuration,index,title,level=0,classRestriction) {
  return {_id:'sbs04'+(type==='Trait'?'Profs':'Spell')+String(index).padStart(6,'0'),type,title,level,configuration,value:{},...(classRestriction?{classRestriction}:{})};
}
function traitKey(kind,value) {
  const name=String(value).toLowerCase().replace(/\{@(?:item|language) ([^}|]+)[^}]*\}/g,'$1').split('|')[0].replace(/[’‘]/g,"'").trim();
  const key=kind==='skills'?SKILLS[name]:kind==='armor'?ARMOR[name]:kind==='weapon'?(WEAPONS[name] || WEAPON_IDS[name]):kind==='tool'?TOOLS[name]:kind==='saves' && ABILITIES.includes(name)?name:kind==='languages' && /^[a-z]+$/.test(name)?name:null;
  return key ? kind+':'+key : null;
}
function collectTraits(blocks,kind,grants,choices,warnings) {
  if(!blocks)return;
  const packages=Array.isArray(blocks)?blocks:[blocks];
  if(packages.length>1 && !packages.every(x=>typeof x==='string')) {warnings.push(`Alternative ${kind} proficiency packages need manual selection`);return;}
  const addChoice=(from,count)=>{
    const pool=from.map(x=>traitKey(kind,x)).filter(Boolean);
    if(pool.length===from.length && Number.isInteger(count) && count>0 && count<=new Set(pool).size)choices.push({count,pool:[...new Set(pool)]});
    else warnings.push(`Unsupported ${kind} proficiency choice: review the source`);
  };
  for(const block of packages) {
    if(typeof block==='string') {const key=traitKey(kind,block);if(key)grants.push(key);else warnings.push(`Unsupported ${kind} proficiency: ${block}`);continue;}
    if(!block || typeof block!=='object')continue;
    for(const [name,value] of Object.entries(block)) {
      if(name==='choose' && Array.isArray(value?.from))addChoice(value.from,Number(value.count ?? 1));
      else if(value===true) {const key=traitKey(kind,name);if(key)grants.push(key);else warnings.push(`Unsupported ${kind} proficiency: ${name}`);}
      else if(name==='any' && kind==='skills')addChoice(Object.keys(SKILLS),Number(value));
      else if(name==='anyArtisansTool' && kind==='tool')addChoice(Object.keys(TOOLS).filter(k=>TOOLS[k].startsWith('art:')),Number(value));
      else if(name==='anyMusicalInstrument' && kind==='tool')addChoice(Object.keys(TOOLS).filter(k=>TOOLS[k].startsWith('music:')),Number(value));
      else if(name==='anyGamingSet' && kind==='tool')addChoice(Object.keys(TOOLS).filter(k=>TOOLS[k].startsWith('game:')),Number(value));
      else warnings.push(`Unsupported ${kind} proficiency rule: ${name}`);
    }
  }
}
export function mapSimpleTraits(record,grants,choices,warnings) {
  collectTraits(record.languageProficiencies,'languages',grants,choices,warnings);
  collectTraits(record.skillProficiencies,'skills',grants,choices,warnings);
}
export function mapOriginProficiencies(kind,record,system,warnings) {
  let index=1;
  const add=(title,grants,choices,level=0,restriction)=>{
    if(grants.length || choices.length)system.advancement.push(nativeAdv('Trait',{grants:[...new Set(grants)],choices,allowReplacements:false,mode:'default'},index++,title,level,restriction));
  };
  const grants=[],choices=[];
  for(const [field,trait] of [['armorProficiencies','armor'],['weaponProficiencies','weapon'],['toolProficiencies','tool']])collectTraits(record[field],trait,grants,choices,warnings);
  add('Origin proficiencies',grants,choices);
  if(kind!=='class')return;
  const starting=record.startingProficiencies ?? {},primary=[],pc=[];
  collectTraits(record.proficiency,'saves',primary,pc,warnings);
  for(const [field,trait] of [['armor','armor'],['weapons','weapon'],['tools','tool'],['skills','skills']])collectTraits(starting[field],trait,primary,pc,warnings);
  add('Starting class proficiencies',primary,pc,1,'primary');
  const secondary=[],sc=[],multiclass=record.multiclassing?.proficienciesGained ?? {};
  for(const [field,trait] of [['armor','armor'],['weapons','weapon'],['tools','tool'],['skills','skills']])collectTraits(multiclass[field],trait,secondary,sc,warnings);
  add('Multiclass proficiencies',secondary,sc,1,'secondary');
}

function resolveSpell(reference,records,owner,warnings) {
  // A #c tag identifies a cantrip. Cast-at-level suffixes require a separate casting activity.
  const [ref,suffix]=String(reference).split('#');
  if(suffix && suffix!=='c'){warnings.push(`Spell ${reference}: cast-at-level suffix needs manual configuration`);return;}
  const [name,source]=ref.split('|');
  const candidates=records.filter(r=>r.kind==='spell' && r.name.toLowerCase()===name.toLowerCase() && (!source || r.source.toLowerCase()===source.toLowerCase()));
  if(candidates.length===1)return candidates[0];
  warnings.push(candidates.length?`Spell ${name} is ambiguous; include its source in the reference`:`Spell ${reference} was not supplied; load its spell source file`);
}
export function mapAdditionalSpells(owner,records) {
  const packages=owner.raw.additionalSpells;if(!packages)return;
  const warnings=owner.warnings;
  if(!Array.isArray(packages) || packages.length!==1){warnings.push('Alternative spell packages need manual selection; no package is automatically chosen');return;}
  const pkg=packages[0];if(!pkg || typeof pkg!=='object'){warnings.push('Spell package requires manual configuration');return;}
  const abilities=typeof pkg.ability==='string'?[pkg.ability]:pkg.ability?.choose ?? (owner.raw.spellcastingAbility?[owner.raw.spellcastingAbility]:[]);
  if(!Array.isArray(abilities) || abilities.some(a=>!ABILITIES.includes(a))){warnings.push('Spellcasting ability requires manual configuration');return;}
  let index=1;
  for(const [mode,levels] of Object.entries(pkg)) {
    if(['ability','name','resourceName'].includes(mode))continue;
    if(!['innate','known','prepared'].includes(mode)){warnings.push(`${mode} spell-list rules need manual configuration`);continue;}
    for(const [levelKey,contents] of Object.entries(levels ?? {})) {
      // Underscore and sN denote spell-level availability, not a character/class level.
      if(!/^\d+$/.test(levelKey) || Number(levelKey)>20){warnings.push(`Spell availability ${levelKey} needs manual configuration`);continue;}
      const level=Number(levelKey),method=mode==='innate'?'innate':owner.data.system.spellcasting?.progression==='pact'?'pact':'spell';
      const emit=(list,max='',per='',ritual=false)=>{
        if(!Array.isArray(list)){warnings.push('Unsupported structured spell grant; review the source');return;}
        const spell={ability:[...new Set(abilities)],method:ritual?'ritual':method,prepared:mode==='prepared'?2:1,uses:{max:String(max),per,requireSlot:false}},items=[];
        for(const entry of list) {
          if(typeof entry==='string') {const rec=resolveSpell(entry,records,owner,warnings);if(rec)items.push({uuid:'@forge:'+rec.key,optional:false});}
          else if(entry?.choose && Array.isArray(entry.choose.from)) {
            const pool=entry.choose.from.map(ref=>resolveSpell(ref,records,owner,warnings)),count=Number(entry.choose.count ?? entry.count ?? 1);
            if(pool.every(Boolean) && Number.isInteger(count) && count>0 && count<=new Set(pool.map(r=>r.key)).size)owner.data.system.advancement.push(nativeAdv('ItemChoice',{
              allowDrops:false,type:'spell',choices:{[level]:{count,replacement:false}},pool:pool.map(r=>({uuid:'@forge:'+r.key})),restriction:{type:'spell'},spell:clone(spell)
            },index++,'Choose granted spell',level));
            else warnings.push('Spell choice needs all candidates supplied and a valid count; no partial choice is offered');
          } else warnings.push('Filtered/conditional spell choices need manual configuration');
        }
        if(items.length)owner.data.system.advancement.push(nativeAdv('ItemGrant',{items,optional:false,spell},index++,'Granted spells',level));
      };
      if(Array.isArray(contents)){emit(contents);continue;}
      for(const [frequency,spells] of Object.entries(contents ?? {})) {
        if(['daily','rest','restLong'].includes(frequency))for(const [count,list] of Object.entries(spells ?? {})) {
          // 1e means each spell has its own use pool; unmarked groups with several spells share uses.
          const m=count.match(/^(\d+)(e)?$/);
          if(!m || Number(m[1])<1 || !Array.isArray(list) || (!m[2] && list.length>1)){warnings.push('Shared or variable spell use pools need manual configuration');continue;}
          emit(list,m[1],frequency==='rest'?'sr':'lr');
        }
        else if(frequency==='will')emit(spells,'','');
        else if(frequency==='ritual')emit(spells,'','',true);
        else warnings.push(`Spell use frequency ${frequency} needs manual configuration`);
      }
    }
  }
}

export function mapItemMechanics(record,data,warnings) {
  const s=data.system,t=String(record.type ?? '').split('|')[0];
  if(['equipment','weapon','consumable','tool'].includes(data.type)){s.equipped=record.equipped===true;s.attuned=false;s.attunement=record.reqAttune?'required':'';}
  if(record.reqAttune) {
    s.description.value+=`<p><strong>Attunement:</strong> ${esc(typeof record.reqAttune==='string'?record.reqAttune:'Required')}</p>`;
    if(typeof record.reqAttune==='string')warnings.push('Attunement is required; verify the source’s eligibility restrictions before attuning');
  }
  const props=new Set(s.properties ?? []);
  if(record.rarity && record.rarity!=='none')s.rarity=({common:'common',uncommon:'uncommon',rare:'rare','very rare':'veryRare',legendary:'legendary',artifact:'artifact'}[record.rarity] || '');
  if(record.reqAttune || record.bonusAc || record.bonusWeapon || ['P','SC','WD','RD'].includes(t))props.add('mgc');
  if(data.type==='equipment') {
    s.type={value:({LA:'light',MA:'medium',HA:'heavy',S:'shield'}[t] || 'wondrous')};
    if(['LA','MA','HA','S'].includes(t)) {
      s.armor={value:Number(record.ac ?? (t==='S'?2:0)),dex:t==='LA'?null:t==='MA'?Number(record.dexterityMax ?? 2):0,magicalBonus:Number(record.bonusAc ?? 0)};
      s.strength=Number(record.strength ?? 0);
      if(record.stealth)props.add('stealthDisadvantage');
      if(!record.ac && t!=='S')warnings.push('Armor base AC was not supplied; set its Armor Class before equipping');
    }
  }
  if(data.type==='consumable')s.type={value:({P:'potion',SC:'scroll',WD:'wand',RD:'rod',A:'ammo',AF:'ammo'}[t] || (record.poison?'poison':'wondrous'))};
  if(data.type==='tool') {
    const mapped=TOOLS[String(record.name).toLowerCase().replace(/[’‘]/g,"'")];
    if(mapped){const p=mapped.split(':');s.type={value:p.length>1?p[0]:p[0],baseItem:p.at(-1)};}
  }
  const charges=Number(record.charges),limited=Number.isInteger(charges) && charges>0;
  const singleUse=data.type==='consumable' && ['potion','scroll','poison','food','ammo'].includes(s.type.value);
  if(limited || singleUse) {
    s.uses={max:String(limited?charges:1),spent:0,recovery:[],...(data.type==='consumable'?{autoDestroy:singleUse}:{})};
    if(limited && record.recharge) {
      const period=({dawn:'dawn',dusk:'dusk',midnight:'day',restShort:'sr',restLong:'lr',shortRest:'sr',longRest:'lr'}[record.recharge]);
      const amount=record.rechargeAmount;
      if(period && amount!==undefined)s.uses.recovery.push({period,type:'formula',formula:String(amount).replace(/^\{@dice ([^}|]+)[^}]*\}$/,'$1')});
      else if(period)warnings.push('Recharge amount was not supplied; set a native recovery amount from the description');
      else warnings.push(`Recharge timing ${record.recharge} needs native configuration`);
    }
    if(record.charges!==undefined && !limited)warnings.push('Variable or invalid charges require native configuration');
    if(!s.activities || !Object.keys(s.activities).length) {
      const raw=plain(record.entries),heals=[...raw.matchAll(/\{@(?:dice|damage) ([^}|]+)\}[^.]*?(?:hit points|healing)/gi)];
      const formula=heals.length===1 && singleUse?heals[0][1]:null;
      const a={_id:'sbsSourceAct0001',name:record.name,type:formula?'heal':'utility',activation:{type:record.edition==='one' && t==='P'?'bonus':'action',value:1,override:true},
        range:{units:'self',override:true},target:{affects:{type:'self'},override:true},duration:{units:'inst',override:true},consumption:{spellSlot:false,targets:[{type:'itemUses',target:'',value:'1',scaling:{mode:'',formula:''}}]},effects:[]};
      if(formula)a.healing=damageData(formula,'healing');
      s.activities={[a._id]:a};
      if(singleUse && !formula && !record.attachedSpells)warnings.push('Consumable use decrements its quantity; configure any complex effects from the description');
    } else for(const a of Object.values(s.activities))a.consumption.targets.push({type:'itemUses',target:'',value:'1'});
  } else if(record.charges!==undefined)warnings.push('Variable or invalid charges require native configuration');
  s.properties=[...props];
}

export function mapAttachedSpells(owner,records) {
  const refs=owner.raw.attachedSpells;if(!refs)return;
  const groups=[];
  if(Array.isArray(refs) && refs.every(r=>typeof r==='string')) {
    groups.push({refs,cost:1});owner.warnings.push('Item spell activities consume one use each; verify charge costs and casting level against the description');
  } else if(refs && typeof refs==='object' && !Array.isArray(refs) && Object.keys(refs).every(k=>['charges','will'].includes(k))) {
    for(const [cost,list] of Object.entries(refs.charges ?? {})) {
      if(/^\d+$/.test(cost) && Number(cost)>0 && Array.isArray(list) && list.every(r=>typeof r==='string'))groups.push({refs:list,cost:Number(cost)});
      else owner.warnings.push('Variable item spell costs need manual casting configuration');
    }
    if(refs.will && Array.isArray(refs.will) && refs.will.every(r=>typeof r==='string'))groups.push({refs:refs.will,cost:0});
  } else {owner.warnings.push('Structured item spell choices need manual casting configuration');return;}
  const activities={};let index=1;
  for(const group of groups)for(const ref of group.refs) {
    const spell=resolveSpell(ref,records,owner,owner.warnings);if(!spell)continue;
    if(group.cost && !owner.data.system.uses?.max){owner.warnings.push(`Spell ${spell.name}: item charge pool was not supplied; configure consumption manually`);continue;}
    const id='sbs04Cast'+String(index++).padStart(7,'0');
    activities[id]={_id:id,name:spell.name,type:'cast',activation:{override:false},duration:{override:false},range:{override:false},target:{override:false},
      spell:{uuid:'@forge:'+spell.key,level:spell.data.system.level,spellbook:false,ability:'',properties:[],challenge:{override:false}},
      consumption:{spellSlot:false,targets:group.cost?[{type:'itemUses',target:'',value:String(group.cost)}]:[]}};
  }
  if(Object.keys(activities).length) {
    owner.data.system.activities=activities;
  }
}
