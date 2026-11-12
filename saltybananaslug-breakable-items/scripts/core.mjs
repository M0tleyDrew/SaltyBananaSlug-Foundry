/** Pure rules, deliberately independent of Foundry so state and pricing can be verified. */
export const ID = "saltybananaslug-breakable-items";
export const BREAK_LIMIT = 3;
export const SCHEMA = 1;
export const VERSION = '0.4.1';
export const UNBREAKABLE_PROPERTY = 'sbsUnbreakable';
export const PHYSICAL_TYPES = new Set(["weapon", "equipment", "tool", "loot", "container", "backpack", "consumable"]);
export const TOOLS = {smith:"Smith's Tools",leatherworker:"Leatherworker's Tools",woodcarver:"Woodcarver's Tools",weaver:"Weaver's Tools",tinker:"Tinker's Tools",jeweler:"Jeweler's Tools",glassblower:"Glassblower's Tools",mason:"Mason's Tools",cobbler:"Cobbler's Tools",carpenter:"Carpenter's Tools",alchemist:"Alchemist's Supplies",calligrapher:"Calligrapher's Supplies",brewer:"Brewer's Supplies",cartographer:"Cartographer's Tools",cook:"Cook's Utensils",painter:"Painter's Supplies",potter:"Potter's Tools",disg:"Disguise Kit",forg:"Forgery Kit",herb:"Herbalism Kit",navg:"Navigator's Tools",pois:"Poisoner's Kit",thief:"Thieves' Tools",bagpipes:"Bagpipes",card:"Playing Cards",chess:"Dragonchess Set",dice:"Dice Set",drum:"Drum",dulcimer:"Dulcimer",flute:"Flute",horn:"Horn",lute:"Lute",lyre:"Lyre",panflute:"Pan Flute",shawm:"Shawm",viol:"Viol"};
export const MATERIALS = {metal:"Metal Repair Parts",leather:"Leather Repair Patches",wood:"Wood Repair Parts",cloth:"Cloth Repair Patches",mechanical:"Mechanical Repair Parts",gem:"Jewelry Repair Parts",glass:"Glass Repair Parts",stone:"Stone Repair Parts",paper:"Paper Repair Materials"};
export const COINS = {pp:1000,gp:100,ep:50,sp:10,cp:1};
export const DEFAULT_PROFILES = {
 weapon:{label:"Weapon",max:20,mode:"damage",damagePerWear:20,usesPerWear:10,tool:"smith",material:"metal",partsPerHP:0.2},
 bow:{label:"Bow / wooden weapon",max:18,mode:"damage",damagePerWear:20,usesPerWear:10,tool:"woodcarver",material:"wood",partsPerHP:0.2},
 armor:{label:"Metal armor",max:40,mode:"use",damagePerWear:20,usesPerWear:10,tool:"smith",material:"metal",partsPerHP:0.2},
 leather:{label:"Leather armor",max:30,mode:"use",damagePerWear:20,usesPerWear:10,tool:"leatherworker",material:"leather",partsPerHP:0.2},
 cloth:{label:"Clothing / cloth armor",max:15,mode:"use",damagePerWear:20,usesPerWear:50,tool:"weaver",material:"cloth",partsPerHP:0.2},
 shield:{label:"Shield",max:30,mode:"use",damagePerWear:20,usesPerWear:20,tool:"smith",material:"metal",partsPerHP:0.2},
 tool:{label:"Tools / mechanism",max:20,mode:"use",damagePerWear:20,usesPerWear:40,tool:"tinker",material:"mechanical",partsPerHP:0.2},
 gear:{label:"Other gear",max:10,mode:"use",damagePerWear:20,usesPerWear:60,tool:"tinker",material:"mechanical",partsPerHP:0.2},
 container:{label:"Container / pack",max:25,mode:"use",damagePerWear:20,usesPerWear:60,tool:"leatherworker",material:"leather",partsPerHP:0.2},
 rope:{label:"Rope / cord",max:15,mode:"use",damagePerWear:20,usesPerWear:40,tool:"weaver",material:"cloth",partsPerHP:0.2},
 book:{label:"Book / paper object",max:12,mode:"use",damagePerWear:20,usesPerWear:80,tool:"calligrapher",material:"paper",partsPerHP:0.2},
 focus:{label:"Wand / focus",max:18,mode:"use",damagePerWear:20,usesPerWear:30,tool:"woodcarver",material:"wood",partsPerHP:0.2},
 jewelry:{label:"Jewelry / small valuables",max:12,mode:"use",damagePerWear:20,usesPerWear:60,tool:"jeweler",material:"gem",partsPerHP:0.2},
 consumable:{label:"Consumable / charged item",max:8,mode:"use",damagePerWear:20,usesPerWear:80,tool:"alchemist",material:"glass",partsPerHP:0.2},
 ammunition:{label:"Ammunition",max:5,mode:"use",damagePerWear:20,usesPerWear:100,tool:"tinker",material:"metal",partsPerHP:0.2}
};
export const DEFAULT_DURABILITY = {
 rarities:{mundane:{hp:1,wear:1},common:{hp:1.25,wear:0.9},uncommon:{hp:1.5,wear:0.8},rare:{hp:2,wear:0.65},veryRare:{hp:3,wear:0.5},legendary:{hp:4,wear:0.35},artifact:{hp:5,wear:0.25}},
 materials:{metal:{hp:1,wear:1},mechanical:{hp:1,wear:1},wood:{hp:0.9,wear:1.1},leather:{hp:0.9,wear:1.1},cloth:{hp:0.75,wear:1.25},paper:{hp:0.5,wear:1.25},glass:{hp:0.5,wear:1.5},gem:{hp:0.8,wear:1.1},stone:{hp:1.5,wear:0.8},adamantine:{hp:2,wear:0.5}},
 qualities:{fragile:{hp:0.6,wear:1.5},poor:{hp:0.8,wear:1.25},standard:{hp:1,wear:1},fine:{hp:1.25,wear:0.8},masterwork:{hp:1.5,wear:0.65}},
 useWeights:{gentle:0.5,normal:1,strenuous:2,abuse:5}
};
export const DEFAULT_RARITIES = {
 mundane:{label:"Mundane",baseGP:0,valueRate:0.2,dc:10,minutes:60,reagents:0,arcana:false},
 common:{label:"Common magic",baseGP:20,valueRate:0.2,dc:12,minutes:120,reagents:4,arcana:true},
 uncommon:{label:"Uncommon",baseGP:100,valueRate:0.2,dc:14,minutes:240,reagents:4,arcana:true},
 rare:{label:"Rare",baseGP:500,valueRate:0.2,dc:16,minutes:480,reagents:4,arcana:true},
 veryRare:{label:"Very rare",baseGP:2500,valueRate:0.2,dc:18,minutes:1440,reagents:4,arcana:true},
 legendary:{label:"Legendary",baseGP:10000,valueRate:0.2,dc:20,minutes:4320,reagents:4,arcana:true},
 artifact:{label:"Artifact — custom recipe required",baseGP:0,valueRate:0.2,dc:25,minutes:10080,reagents:0,arcana:true,restricted:true}
};
export const DEFAULT_RULES = {autoWeapons:true,autoArmor:true,autoItems:true,mendingEnabled:true,mendingBroken:true,mendingHP:1,armorTrigger:'damage',armorDamagePerHit:1,damageDicePenalty:true,ignoreCriticals:true,showBadges:true,blockBroken:true,fumblePrompt:false,brokenSurcharge:0.25,consumeOnFailure:true,requireProficiency:true};
export const DEFAULT_SHOPS = [{id:"local",name:"Local repairer",enabled:false,rarities:["mundane","common","uncommon"],multiplier:1,checkBonus:5}];
export const clone = value => JSON.parse(JSON.stringify(value));
export const numeric = (v,f=0) => v!=="" && v!==null && Number.isFinite(Number(v)) ? Number(v) : f;
export const clamp = (v,low,high) => Math.max(low,Math.min(high,v));
export const normal = v => String(v??"").normalize("NFKD").toLowerCase().replace(/[’']/g,"").replace(/[^a-z0-9]/g,"");
export const labelKey = k => MATERIALS[k] ?? k;
export function hasItemProperty(item,key) {const p=item.system?.properties;return p?.has?.(key)===true||p?.includes?.(key)===true;}
export function protectionFor(item,worldTime=numeric(globalThis.game?.time?.worldTime)) {
 const saved=item.flags?.[ID]?.protection??{},temporary=saved.temporary??null;
 const base=item._source?.system?.properties??item.system?.properties;
 const permanent=base!==undefined?(base.has?.(UNBREAKABLE_PROPERTY)===true||base.includes?.(UNBREAKABLE_PROPERTY)===true):saved.permanent===true;
 const fromProperty=hasItemProperty(item,UNBREAKABLE_PROPERTY);
 const temporaryActive=!!temporary&&(temporary.expiresAt===null||Number.isFinite(temporary.expiresAt)&&worldTime<temporary.expiresAt);
 return {active:fromProperty||permanent||temporaryActive,permanent,fromProperty,temporary,temporaryActive,remainingSeconds:temporaryActive&&temporary.expiresAt!==null?Math.max(0,temporary.expiresAt-worldTime):null};
}
export function isBodyArmor(item) {return item.type==='equipment'&&['light','medium','heavy'].includes(item.system?.armor?.type??item.system?.type?.value);}
export function profileKey(item) {
 const sys=item.system??{},base=String(sys.type?.baseItem??sys.baseItem??"").toLowerCase();
 const name=`${base} ${item.name??''}`.toLowerCase(),type=String(sys.type?.value??'');
 if(item.type==="weapon") return /^(shortbow|longbow|club|greatclub|quarterstaff)$/.test(base)?"bow":"weapon";
 if(item.type==="equipment") {const t=sys.armor?.type??sys.type?.value;if(t==="shield")return "shield";if(t==="light"||/leather|hide/.test(base))return "leather";if(["medium","heavy"].includes(t))return "armor";if(/amulet|necklace|ring\b|jewel/.test(name))return 'jewelry';if(/wand|staff|focus/.test(name))return 'focus';return "cloth";}
 if(item.type==='tool')return 'tool';
 if(/rope|cord|twine/.test(name))return 'rope';
 if(/book|spellbook|tome|journal|scroll|parchment|paper/.test(name))return 'book';
 if(/wand|staff|focus/.test(name)||type==='wand'||type==='rod')return 'focus';
 if(/amulet|necklace|ring\b|jewel/.test(name))return 'jewelry';
 if(item.type==='container'||item.type==='backpack')return 'container';
 if(item.type==='consumable')return type==='ammo'?'ammunition':'consumable';
 return 'gear';
}
export function durabilityFactors(item,profiles=DEFAULT_PROFILES,durability=DEFAULT_DURABILITY){
 const saved=item.flags?.[ID]?.durability??{},key=saved.profile??profileKey(item),profile=profiles[key]??DEFAULT_PROFILES.gear,c=saved.config??{};
 const rarity=rarityKey(item,saved.rarity),material=c.durabilityMaterial??(hasItemProperty(item,'ada')?'adamantine':profile.material),quality=c.quality??'standard';
 const r=durability.rarities?.[rarity]??DEFAULT_DURABILITY.rarities.mundane,m=durability.materials?.[material]??{hp:1,wear:1},q=durability.qualities?.[quality]??DEFAULT_DURABILITY.qualities.standard;
 return {profile:key,rarity,material,quality,max:Math.max(1,Math.round(profile.max*numeric(r.hp,1)*numeric(m.hp,1)*numeric(q.hp,1))),wearMultiplier:Math.max(0.001,numeric(r.wear,1)*numeric(m.wear,1)*numeric(q.wear,1)*numeric(c.wearMultiplier,1))};
}
export function rarityKey(item,override) {
 if(override && DEFAULT_RARITIES[override])return override;
 const r=String(item.system?.rarity??"").replace(/[\s_-]/g,"").toLowerCase();
 return ({common:"common",uncommon:"uncommon",rare:"rare",veryrare:"veryRare",legendary:"legendary",artifact:"artifact"})[r] ?? ((item.system?.properties?.has?.("mgc")||item.system?.properties?.includes?.("mgc"))?"common":"mundane");
}
export function tracked(item,rules=DEFAULT_RULES) {
 if(!PHYSICAL_TYPES.has(item.type)||item.flags?.[ID]?.material)return false;
 const s=item.flags?.[ID]?.durability;
 if(s?.enabled!==undefined)return s.enabled===true;
 return item.type==='weapon'?rules.autoWeapons:isBodyArmor(item)?rules.autoArmor:rules.autoItems!==false;
}
export function stateFor(item,profiles=DEFAULT_PROFILES,durability=DEFAULT_DURABILITY) {
 const saved=item.flags?.[ID]?.durability??{},key=saved.profile??profileKey(item),p=profiles[key]??DEFAULT_PROFILES.gear;
 const factors=durabilityFactors(item,profiles,durability),max=Math.max(1,Math.floor(numeric(saved.max,factors.max))),breaks=clamp(Math.floor(numeric(saved.breaks)),0,BREAK_LIMIT);
 const destroyed=saved.destroyed===true||breaks>=BREAK_LIMIT;
 return {schema:SCHEMA,enabled:true,profile:key,max,hp:destroyed?0:clamp(Math.floor(numeric(saved.hp,max)),0,max),breaks,destroyed,unbreakable:protectionFor(item).active,
  hitsTaken:Math.max(0,Math.floor(numeric(saved.hitsTaken))),
  armorProgress:Math.max(0,numeric(saved.armorProgress)),
  wear:Math.max(0,numeric(saved.wear)),useProgress:Math.max(0,numeric(saved.useProgress)),uses:Math.max(0,numeric(saved.uses)),damageDealt:Math.max(0,numeric(saved.damageDealt)),
  revision:Math.max(0,Math.floor(numeric(saved.revision))),history:Array.isArray(saved.history)?saved.history.slice(-60):[],events:Array.isArray(saved.events)?saved.events.slice(-80):[],
  config:clone(saved.config??{}),...(saved.rarity?{rarity:saved.rarity}:{}),...(saved.pending?{pending:clone(saved.pending)}:{})};
}
export function condition(s) {
 if(s.destroyed)return "Destroyed";
 if(s.hp===0)return "Broken";
 const f=s.hp/s.max;
 return f===1?"Intact":f>0.5?"Worn":f>0.25?"Damaged":"Badly damaged";
}
export const damagePercent = s => Math.round((1-s.hp/s.max)*100);
export const usable = s => !s.destroyed&&s.hp>0;
export function history(s,entry) {s.history=[...s.history,{at:Date.now(),...entry}].slice(-60);return s;}
export function withEvent(s,id) {if(id)s.events=[...s.events,id].slice(-80);return s;}
export function applyDamage(source,amount,entry={}) {
 const s=clone(source),n=Math.max(0,Math.floor(numeric(amount)));
 if(!n||s.destroyed||s.unbreakable)return s;
 const before=s.hp;s.hp=Math.max(0,s.hp-n);
 if(before>0&&s.hp===0){s.breaks=Math.min(BREAK_LIMIT,s.breaks+1);s.destroyed=s.breaks>=BREAK_LIMIT;}
 s.revision++;
 return history(s,{kind:s.destroyed?"destroyed":before>0&&s.hp===0?"broken":"damage",amount:before-s.hp,...entry});
}
export function applyWear(source,amount,{critical=false,eventId,profile=DEFAULT_PROFILES.weapon,rules=DEFAULT_RULES,kind="damage",wearMultiplier=1,useWeight=1,...entry}={}) {
 let s=clone(source);if(!usable(s)||s.events.includes(eventId))return s;
 if(s.unbreakable){const n=Math.max(0,numeric(amount));if(!n)return s;s.uses+=kind==='use'?n:1;if(kind==='damage'&&!(critical&&rules.ignoreCriticals))s.damageDealt+=n;s.revision++;return withEvent(s,eventId);}
 if(critical&&rules.ignoreCriticals){s.uses++;s.revision++;return withEvent(s,eventId);}
 const n=Math.max(0,numeric(amount));if(!n)return s;
 const c={...profile,...s.config},mode=c.mode??"manual";
 s.uses+=kind==="use"?n:1;
 if(kind==="damage")s.damageDealt+=n;
 let wear=0;
 const weighted=n*Math.max(0.001,numeric(wearMultiplier,1))*Math.max(0.001,numeric(useWeight,1));
 if(kind==="damage"&&mode==="damage") {const total=s.wear+weighted;const threshold=Math.max(1,numeric(c.damagePerWear,20));wear=Math.floor((total+1e-9)/threshold);s.wear=Number((total-wear*threshold).toFixed(6));}
 if(kind==="use"&&mode!=="manual") {const total=s.useProgress+weighted;const threshold=Math.max(1,numeric(c.usesPerWear,10));wear=Math.floor((total+1e-9)/threshold);s.useProgress=Number((total-wear*threshold).toFixed(6));}
 if(wear)s=applyDamage(s,wear,{reason:kind==="damage"?`${n} qualifying weapon damage`:`${n} recorded use(s)`,...entry});else s.revision++;
 return withEvent(s,eventId);
}
export function applyArmorHit(source,{damagePerHit=1,eventId,wearMultiplier=1,...entry}={}) {
 let s=clone(source);if(!usable(s)||s.events.includes(eventId))return s;
 s.hitsTaken=numeric(s.hitsTaken)+1;
 if(s.unbreakable)s.revision++;else{const total=numeric(s.armorProgress)+Math.max(0.001,numeric(damagePerHit,1))*Math.max(0.001,numeric(wearMultiplier,1)),loss=Math.floor(total+1e-9);s.armorProgress=Number((total-loss).toFixed(6));if(loss)s=applyDamage(s,loss,{reason:'Hit while wearing armor',...entry});else s.revision++;}
 return withEvent(s,eventId);
}
/** Native attack totals versus the AC snapshotted by D&D5e on its chat card. */
export function attackHits(roll,ac) {
 if(ac===null||ac===undefined||!Number.isFinite(Number(ac)))return false;
 const active=roll.dice?.find(d=>d.faces===20)?.results?.filter(r=>r.active!==false)??[];
 if(roll.isFumble===true||active.length===1&&active[0].result===1)return false;
 if(roll.isCritical===true||active.length===1&&active[0].result===20)return true;
 return Number.isFinite(Number(roll.total))&&Number(roll.total)>=Number(ac);
}
export function restore(source,hp,entry={}) {
 if(source.destroyed)throw Error("Destroyed items cannot be repaired.");
 const n=Math.floor(numeric(hp));if(n<1)throw Error("Choose at least 1 HP to restore.");
 const s=clone(source),before=s.hp;s.hp=Math.min(s.max,s.hp+n);s.revision++;
 delete s.pending;
 return history(s,{kind:"repair",amount:s.hp-before,...entry});
}
export function moneyCP(currency={}) {return Object.entries(COINS).reduce((v,[k,rate])=>v+Math.floor(Math.max(0,numeric(currency[k])))*rate,0);}
export function spendCurrency(currency,costCP) {
 let owed=Math.max(0,Math.ceil(numeric(costCP)));if(moneyCP(currency)<owed)throw Error('Not enough currency for this repair.');
 const result=clone(currency);if(!owed)return result;
 const ascending=Object.entries(COINS).reverse();
 for(const [key,value]of ascending){const count=Math.min(Math.floor(Math.max(0,numeric(result[key]))),Math.floor(owed/value));if(count){result[key]-=count;owed-=count*value;}if(!owed)return result;}
 const larger=ascending.find(([key,value])=>numeric(result[key])>=1&&value>owed);if(!larger)throw Error('Not enough currency for this repair.');
 const [key,value]=larger;result[key]--;let change=value-owed;
 for(const [coin,rate]of [['gp',100],['sp',10],['cp',1]]){if(rate>=value)continue;const count=Math.floor(change/rate);if(count){result[coin]=numeric(result[coin])+count;change-=count*rate;}}
 return result;
}
export function itemValueGP(item) {
 const p=item.system?.price;if(typeof p==="number")return Math.max(0,p);
 return Math.max(0,numeric(p?.value)*(COINS[p?.denomination??"gp"]??100)/100);
}
export function repairQuote(item,s,{profiles=DEFAULT_PROFILES,rarities=DEFAULT_RARITIES,rules=DEFAULT_RULES,hp,shop={multiplier:1},supplyCreditGP=0}={}) {
 if(s.destroyed)throw Error("Destroyed items cannot be repaired.");
 const missing=s.max-s.hp;if(missing<=0)throw Error("This item is already at full HP.");
 const quantity=Math.floor(numeric(item.system?.quantity,1));if(quantity<1)throw Error('This inventory entry has no physical items to repair.');
 const key=rarityKey(item,s.rarity),r=rarities[key]??DEFAULT_RARITIES.mundane,c={...(profiles[s.profile]??DEFAULT_PROFILES.gear),...s.config};
 if(r.restricted&&!c.allowArtifact)throw Error("Artifacts require a GM-approved custom repair recipe.");
 const requested=hp===undefined?missing:Math.floor(numeric(hp,0));
 if(s.hp>0&&(requested<1||requested>missing))throw Error('Choose an amount between 1 and the missing HP.');
 const restored=s.hp===0?missing:requested,fraction=restored/s.max;
 const full=Math.max(numeric(r.baseGP),itemValueGP(item)*numeric(r.valueRate,0.2),numeric(c.fullRepairGP))*quantity;
 const laborBase=full*fraction,credit=Math.min(laborBase*0.8,Math.max(0,supplyCreditGP));
 const surcharge=s.hp===0?full*Math.max(0,numeric(rules.brokenSurcharge,0.25)):0;
 const priceCP=Math.max(1,Math.ceil(((laborBase-credit)+surcharge)*Math.max(0,numeric(shop.multiplier,1))*100));
 const requirements=[];
 const parts=Math.ceil(restored*Math.max(0,numeric(c.partsPerHP,0.2))*quantity);
 if(parts&&c.material)requirements.push({key:c.material,label:labelKey(c.material),quantity:parts});
 const reagents=Math.ceil(fraction*Math.max(0,numeric(c.reagents,r.reagents))*quantity);
 if(reagents)requirements.push({key:`reagent:${key}`,label:`${r.label} Repair Reagents`,quantity:reagents});
 for(const extra of c.extraParts??[]){if(extra.key&&numeric(extra.quantity)>0)requirements.push({key:String(extra.key),label:extra.label??String(extra.key),quantity:Math.ceil(numeric(extra.quantity)*fraction*quantity)});}
 return {hp:restored,fraction,rarity:key,rarityLabel:r.label,priceCP,fullPriceGP:full,surchargeGP:surcharge,creditGP:credit,minutes:Math.max(1,Math.ceil(numeric(r.minutes,60)*fraction*(s.hp===0?1.5:1))),dc:Math.max(1,numeric(c.dc,r.dc)),requiresCheck:s.hp===0,tool:c.tool,requireProficiency:c.requireProficiency??rules.requireProficiency,arcana:c.arcana??r.arcana,requirements};
}
export function inventoryPlan(items,requirements,{excludeId}={}) {
 const remaining=new Map(items.map(i=>[i.id,Math.max(0,numeric(i.system?.quantity,1))]));const allocations=[],missing=[];
 for(const req of requirements){let needed=req.quantity;
  for(const item of items){if(item.id===excludeId||needed<=0)continue;const key=item.flags?.[ID]?.material?.key;
   if(!(key===req.key||normal(item.name)===normal(req.key)||normal(item.name)===normal(req.label)))continue;
   const used=Math.min(remaining.get(item.id)??0,needed);if(used>0){allocations.push({id:item.id,key:req.key,name:item.name,quantity:used});remaining.set(item.id,remaining.get(item.id)-used);needed-=used;}}
  if(needed>0)missing.push({...req,missing:needed});
 }
 return {allocations,missing,updates:[...new Set(allocations.map(a=>a.id))].map(id=>({_id:id,"system.quantity":remaining.get(id)}))};
}
export function eligibleRepair({s,quote,toolPresent,proficient,arcanaProficient,missing=[],inCombat=false}) {
 const reasons=[];
 if(s.destroyed)reasons.push("Destroyed items cannot be repaired.");
 if(inCombat)reasons.push("Repairs are unavailable during combat.");
 if(s.hp===s.max)reasons.push("Already at full HP.");
 if(quote.tool&&!toolPresent)reasons.push(`Missing ${TOOLS[quote.tool]??quote.tool}.`);
 if(quote.requireProficiency&&quote.tool&&!proficient)reasons.push(`Requires proficiency with ${TOOLS[quote.tool]??quote.tool}.`);
 if(quote.arcana&&!arcanaProficient)reasons.push("Requires Arcana proficiency.");
 for(const m of missing)reasons.push(`Missing ${m.missing} × ${m.label}.`);
 return reasons;
}
