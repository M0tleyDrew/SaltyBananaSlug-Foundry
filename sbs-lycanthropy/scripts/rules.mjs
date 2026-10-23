// Mechanical summaries; no book text or artwork is bundled.
export const ID = "sbs-lycanthropy";
export const VERSION = "0.1.1";
export const SOURCE = "https://5e.tools/charcreationoptions.html#lycanthrope_grimhollowpg24";
export const OPTIONS = {
  1: [
    {id:"wolf",name:"Hybrid Wolf Form",summary:"STR floor 18; walking Speed +10; Bonus Action Dash; d8 Claw/Bite; Bonus Action attack after Attack."},
    {id:"bear",name:"Hybrid Bear Form",summary:"STR floor 20; climb at walking Speed; d8 Claw; Bonus Action grapple after a Claw hit."},
    {id:"rat",name:"Hybrid Rat Form",summary:"DEX floor 18; Stealth expertise; Bonus Action Hide/Disengage; d6 Claw/Bite; opportunistic attack advantage."}
  ],
  2: [
    {id:"focus",name:"Hunter’s Focus",summary:"Hybrid Bonus Action: mark prey within 60 feet for 1 hour; melee hits add d6 of their damage type; advantage finding prey."},
    {id:"pelt",name:"Iron Pelt",summary:"Hybrid resistance to physical damage; magical and silvered weapons bypass it."},
    {id:"kindred",name:"Kindred Form",summary:"Animal form using the 2024 Polymorph preset: Wolf, Black Bear, or Giant Rat. Equipment falls off; animal communication."}
  ],
  3: [
    {id:"vigor",name:"Bestial Vigor",summary:"Maximum HP gains character level; hybrid gains 5 temporary HP at turn start."},
    {id:"savagery",name:"Shapeshifter’s Savagery",summary:"Hybrid Claw/Bite add d8 Slashing; immune to Charmed and Frightened."}
  ],
  4: [
    {id:"affinity",name:"Hybrid Form Affinity",summary:"Voluntary hybrid: normal speech, spellcasting with component exemptions, and allied Wisdom advantage within 20 feet."},
    {id:"instincts",name:"Savage Instincts",summary:"Hybrid Claw/Bite hits against Bloodied creatures add d8 Slashing."}
  ]
};
export const FLAWS = {
  1:{name:"Lust for the Hunt",summary:"First becoming Bloodied after a rest: DC 10 WIS or feral hybrid; full-moon light auto-fails. Full-HP turn-start recovery, Remove Curse, or 1 hour ends feral form."},
  2:{name:"Silver Sensitivity",summary:"All forms: silvered weapon physical damage is vulnerable and cannot be resisted."},
  3:{name:"Frayed Thoughts",summary:"Disadvantage on Intelligence checks and saves."},
  4:{name:"Ultimate Predator",summary:"Sensing Bloodied creatures penalizes WIS saves. Sensing Unconscious creatures at turn start triggers DC 15 WIS; success protects until Long Rest. Hybrid kills lock reversion until next dawn."}
};
export const ANIMALS = {wolf:"Wolf",bear:"Black Bear",rat:"Giant Rat"};
export const blank = () => ({
  config:{granted:0,choices:{},images:{hybrid:{token:""},kindred:{token:""}},animalUuid:""},
  state:{form:"normal",feral:false,expires:0,huntUsed:false,predatorImmune:false,lockDawn:0,prey:null,senses:{bloodied:false,unconscious:false},fullMoon:false,images:null,animalUuid:null}
});
export const clone = x => structuredClone(x);
export function normalize(data) {
  const b=blank();
  if(!data) return b;
  return {...b,...clone(data),config:{...b.config,...clone(data.config??{}),choices:{...(data.config?.choices??{})},images:{hybrid:{...b.config.images.hybrid,...data.config?.images?.hybrid},kindred:{...b.config.images.kindred,...data.config?.images?.kindred}}},state:{...b.state,...clone(data.state??{}),senses:{...b.state.senses,...data.state?.senses}}};
}
export function stage(data) {
  let n=0;
  for(let s=1;s<=Math.min(4,data.config.granted);s++) {
    if(!OPTIONS[s].some(o=>o.id===data.config.choices[s])) break;
    n=s;
  }
  return n;
}
export const has = (d,boon) => Object.entries(d.config.choices).some(([s,b])=>Number(s)<=stage(d)&&b===boon);
export const isHybrid = d => d.state.form==="hybrid";
export const affinity = d => isHybrid(d)&&!d.state.feral&&has(d,"affinity");
export const pending = d => stage(d)<d.config.granted ? stage(d)+1 : null;
export function choose(data,s,boon) {
  const d=normalize(data);
  if(s!==pending(d)||!OPTIONS[s]?.some(o=>o.id===boon)) throw Error("This boon is not available for the pending stage.");
  d.config.choices[s]=boon;
  return d;
}
export function grant(data,n) {
  if(!Number.isInteger(n)||n<0||n>4) throw Error("Stage must be 0 through 4.");
  const d=normalize(data);d.config.granted=n;
  for(const k of Object.keys(d.config.choices)) if(Number(k)>n)delete d.config.choices[k];
  return d;
}
export const bloodied = hp => !!hp&&Number(hp.max)>0&&Number(hp.value)<=Number(hp.max)/2;
export const crossedBloodied = (old,hp) => !!old&&!bloodied(old)&&bloodied(hp);
export function assertTransition(d,form,now,{force=false}={}) {
  if(!stage(d))throw Error("Finish the Stage 1 choice first.");
  if(form==="kindred"&&!has(d,"kindred"))throw Error("Kindred Form is not selected.");
  if(!force&&d.state.lockDawn>now)throw Error("Ultimate Predator prevents reversion until the next dawn.");
  if(!force&&d.state.feral)throw Error("Feral form cannot end voluntarily. Resolve recovery, Remove Curse, or its timer.");
  if(!["normal","hybrid","kindred"].includes(form))throw Error("Invalid form.");
}
export function nextDawn(now,hour=6) {
  const day=86400;const dawn=Math.floor(now/day)*day+hour*3600;
  return dawn<=now?dawn+day:dawn;
}
export function damageFactor(d,{type,properties=[],weapon=false}) {
  const physical=["bludgeoning","piercing","slashing"].includes(type);
  if(!physical)return {resist:false,vulnerable:false};
  const props=new Set(properties);
  const silver=weapon&&props.has("sil");
  return {vulnerable:stage(d)>=2&&silver,resist:isHybrid(d)&&has(d,"pelt")&&!silver&&!(weapon&&props.has("mgc"))};
}
export function choiceName(d,s) {return OPTIONS[s]?.find(o=>o.id===d.config.choices[s])?.name??"Pending";}
