import {ID,DEFAULT_RULES,DEFAULT_PROFILES,DEFAULT_RARITIES,DEFAULT_SHOPS,DEFAULT_DURABILITY,clone} from './core.mjs';
export function settings() {
 const get=k=>game.settings.get(ID,k);
 const old=get('profiles')??{},profiles={...clone(DEFAULT_PROFILES),...old};
 const d=get('durability')??{},durability=Object.fromEntries(Object.entries(DEFAULT_DURABILITY).map(([key,values])=>[key,{...clone(values),...(d[key]??{})}]));
 return {rules:{...DEFAULT_RULES,...get('rules'),blockBroken:true},profiles,rarities:{...clone(DEFAULT_RARITIES),...get('rarities')},shops:get('shops')??clone(DEFAULT_SHOPS),durability};
}
export function registerSettings(Tracker,Setup) {
 for(const [key,type,value]of [['rules',Object,DEFAULT_RULES],['profiles',Object,DEFAULT_PROFILES],['rarities',Object,DEFAULT_RARITIES],['shops',Array,DEFAULT_SHOPS],['durability',Object,DEFAULT_DURABILITY]])game.settings.register(ID,key,{scope:'world',config:false,type,default:clone(value),onChange:()=>Hooks.callAll(`${ID}.refresh`)});
 game.settings.register(ID,'releasePopups',{name:'Show welcome and update popups',hint:'Show each user a role-specific guide once, then notes once per new module version. The GM can disable this for everyone.',scope:'world',config:true,type:Boolean,default:true,onChange:value=>Hooks.callAll(`${ID}.notices`,value)});
 game.settings.register(ID,'useProfilesMigrated',{scope:'world',config:false,type:Boolean,default:false});
 game.settings.register(ID,'createMacro',{name:'Create Equipment Tracker macro',hint:'The active GM creates one shared SBS — Equipment Tracker launcher. No permanent canvas buttons are added.',scope:'world',config:true,type:Boolean,default:true});
 game.settings.registerMenu(ID,'tracker',{name:'Equipment Tracker',label:'Open Equipment Tracker',hint:'Check durability, repair equipment, and request paid repairs.',icon:'fas fa-hammer',type:Tracker,restricted:false});
 game.settings.registerMenu(ID,'setup',{name:'Breakable Items setup',label:'Configure durability and repairs',hint:'Set item profiles, rarity prices, repair requirements, available repairers, and create supply items.',icon:'fas fa-sliders',type:Setup,restricted:true});
}
export async function migrateUseProfiles(){
 if(game.settings.get(ID,'useProfilesMigrated'))return;
 const profiles=clone(game.settings.get(ID,'profiles')??{});let changed=false;
 for(const key of ['armor','leather','cloth','shield','tool','gear'])if(profiles[key]?.mode==='manual'&&profiles[key]?.usesPerWear===10){profiles[key]={...profiles[key],mode:'use',usesPerWear:DEFAULT_PROFILES[key].usesPerWear};changed=true;}
 if(changed)await game.settings.set(ID,'profiles',profiles);await game.settings.set(ID,'useProfilesMigrated',true);
}
