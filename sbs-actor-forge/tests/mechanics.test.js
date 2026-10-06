import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseSourceBundle,catalogRows} from '../scripts/sources.js';
import {parseRows,ID} from '../scripts/core.js';
import {preparePlans,importPlans,undoImport} from '../scripts/engine.js';
import {world} from './mock-world.js';

const spark={name:'Tier Spark',source:'SBS04',level:0,school:'V',spellAttack:['R'],damageInflict:['fire'],entries:['Hit: {@damage 1d6} fire damage.'],scalingLevelDice:{label:'damage',scaling:{1:'1d6',5:'2d6',11:'3d6',17:'4d6'}}};
const surge={name:'Slot Surge',source:'SBS04',level:1,school:'V',spellAttack:['R'],damageInflict:['force'],entries:['Hit: {@damage 2d6} force damage.'],entriesHigherLevel:[{name:'At Higher Levels',entries:['The damage increases by {@scaledamage 1d6|1-9|1d6} for each slot level above 1st.']}]};
const record=(kind,raw,bundle={})=>parseSourceBundle({...bundle,[kind]:[raw]}).records.find(r=>r.kind===kind);
const activity=r=>Object.values(r.data.system.activities)[0];

test('cantrip damage gains one die per native tier while the level-one spell keeps its own baseline',()=>{
 const result=parseSourceBundle({spell:[spark,surge]});assert.deepEqual(result.records.map(r=>r.warnings),[[],[]]);
 const cantrip=activity(result.records[0]);assert.deepEqual(cantrip.damage.parts[0].scaling,{mode:'whole',number:1,formula:''});assert.equal(cantrip.consumption.spellSlot,true);
 const spell=activity(result.records[1]);assert.equal(spell.damage.parts[0].number,2);assert.equal(spell.damage.parts[0].scaling.number,1);assert.equal(spell.consumption.spellSlot,true);
});
test('irregular and multiple cantrip tables are left for explicit manual configuration',()=>{
 for(const scalingLevelDice of [{scaling:{1:'1d6',5:'2d6',11:'5d6',17:'6d6'}},[spark.scalingLevelDice,spark.scalingLevelDice],{scaling:{1:'1d6',5:'2d8',11:'3d8',17:'4d8'}}]) {
  const rec=record('spell',{...spark,scalingLevelDice});assert.equal(activity(rec).damage.parts[0].scaling.mode,'');assert.match(rec.warnings.join(' '),/manual/);
 }
});
test('healing upcasts preserve the fixed bonus and can add a different die size',()=>{
 const r=record('spell',{name:'Mend',source:'SBS04',level:1,entries:['Regain {@dice 1d4 + 2} hit points.'],entriesHigherLevel:['The healing increases by {@dice 1d8} for each slot level above 1st.']});
 const a=activity(r);assert.equal(a.type,'heal');assert.equal(a.healing.bonus,'2');assert.deepEqual(a.healing.scaling,{mode:'whole',number:0,formula:'1d8'});assert.deepEqual(r.warnings,[]);
});
test('target scaling and multiple damage expressions never become guessed damage scaling',()=>{
 const target=record('spell',{...surge,entriesHigherLevel:['Target another creature for each slot level above 1st.']});assert.equal(activity(target).damage.parts[0].scaling.mode,'');assert.match(target.warnings.join(' '),/targets/);
 const multiple=record('spell',{...spark,entries:['Hit: {@damage 1d6} fire damage, or {@damage 1d8} if the target is wet.']});assert.equal(activity(multiple).damage.parts[0].scaling.mode,'');assert.match(multiple.warnings.join(' '),/Multiple damage/);
});
test('light, medium, heavy armor and shields map to native AC, Dexterity cap and stealth',()=>{
 const raws=[{type:'LA',ac:12},{type:'MA',ac:14,stealth:true},{type:'HA',ac:17,strength:15},{type:'S',ac:2,bonusAc:1}];
 const systems=raws.map((r,i)=>record('item',{name:'Armor '+i,source:'SBS04',...r}).data.system);
 assert.deepEqual(systems.map(s=>s.type.value),['light','medium','heavy','shield']);assert.deepEqual(systems.map(s=>s.armor.dex),[null,2,0,0]);assert.deepEqual(systems.map(s=>s.armor.value),[12,14,17,2]);
 assert.ok(systems[1].properties.includes('stealthDisadvantage'));assert.equal(systems[2].strength,15);assert.equal(systems[3].armor.magicalBonus,1);assert.ok(systems.every(s=>!s.equipped));
});
test('a potion has a native healing activity, one use and automatic quantity consumption',()=>{
 const r=record('item',{name:'Broth',source:'SBS04',type:'P',edition:'one',entries:['Drink it to regain {@dice 2d4 + 2} hit points.']});const s=r.data.system,a=activity(r);
 assert.equal(s.type.value,'potion');assert.deepEqual(s.uses,{max:'1',spent:0,recovery:[],autoDestroy:true});assert.equal(a.activation.type,'bonus');assert.equal(a.healing.number,2);assert.equal(a.consumption.targets[0].type,'itemUses');assert.equal(a.consumption.spellSlot,false);
});
test('charged attunement item uses retain exact recovery formula and remain unattuned initially',()=>{
 const r=record('item',{name:'Battery',source:'SBS04',type:'WD',charges:7,recharge:'dawn',rechargeAmount:'{@dice 1d6 + 1}',reqAttune:'by a courier',entries:['Charge rules.']});const s=r.data.system;
 assert.equal(s.uses.max,'7');assert.equal(s.uses.autoDestroy,false);assert.equal(s.uses.recovery[0].formula,'1d6 + 1');assert.equal(s.uses.recovery[0].period,'dawn');assert.equal(s.attunement,'required');assert.equal(s.attuned,false);assert.match(r.warnings.join(' '),/eligibility/);assert.match(s.description.value,/by a courier/);
});
test('short/long-rest recovery and unsupported recovery are kept distinct',()=>{
 for(const [recharge,period] of [['restShort','sr'],['restLong','lr']]){const r=record('item',{name:'Device',source:'SBS04',type:'WD',charges:3,recharge,rechargeAmount:3});assert.equal(r.data.system.uses.recovery[0].period,period);}
 for(const raw of [{recharge:'special',rechargeAmount:3},{recharge:'dawn'}]){const r=record('item',{name:'Device',source:'SBS04',type:'WD',charges:3,...raw});assert.deepEqual(r.data.system.uses.recovery,[]);assert.match(r.warnings.join(' '),/Recharge/);}
});
test('item cast activities resolve supplied spells with exact per-spell charge costs',()=>{
 const bundle={spell:[surge,spark],item:[{name:'Dispatch Wand',source:'SBS04',type:'WD',charges:6,reqAttune:true,attachedSpells:{charges:{2:['Slot Surge|SBS04']},will:['Tier Spark|SBS04']}}]},before=JSON.stringify(bundle);
 const records=parseSourceBundle(bundle).records,wand=records.find(r=>r.kind==='item'),acts=Object.values(wand.data.system.activities);
 assert.deepEqual(acts.map(a=>a.type),['cast','cast']);assert.equal(acts[0].consumption.targets[0].value,'2');assert.equal(acts[0].spell.uuid,'@forge:spell:SBS04:Slot Surge');assert.equal(acts[0].spell.spellbook,false);assert.equal(acts[0].consumption.spellSlot,false);assert.deepEqual(acts[1].consumption.targets,[]);assert.equal(JSON.stringify(bundle),before);
});
test('unresolved item spells and variable charge costs explain the missing automation',()=>{
 const r=record('item',{name:'Wand',source:'SBS04',type:'WD',charges:6,attachedSpells:{charges:{'1+':['Slot Surge|SBS04'],2:['Missing|SBS04']}}},{spell:[surge]});assert.match(r.warnings.join(' '),/Variable/);assert.match(r.warnings.join(' '),/not supplied/);assert.equal(activity(r).type,'utility');
});
test('class saves and starting proficiencies apply only to the original class; multiclass grants are separate',()=>{
 const r=record('class',{name:'Courier',source:'SBS04',proficiency:['int','wis'],startingProficiencies:{armor:['light','medium','shields'],weapons:['simple','{@item light crossbow|phb|light crossbows}'],tools:["cartographer's tools"],skills:[{choose:{from:['arcana','investigation','perception'],count:2}}]},multiclassing:{proficienciesGained:{armor:['light'],weapons:['simple']}}});
 const a=r.data.system.advancement.find(a=>a.classRestriction==='primary'),m=r.data.system.advancement.find(a=>a.classRestriction==='secondary');
 assert.equal(a.level,1);assert.deepEqual(a.configuration.grants,['saves:int','saves:wis','armor:lgt','armor:med','armor:shl','weapon:sim','weapon:sim:lightcrossbow','tool:art:cartographer']);assert.equal(a.configuration.choices[0].count,2);assert.deepEqual(m.configuration.grants,['armor:lgt','weapon:sim']);assert.ok(!m.configuration.grants.some(g=>g.startsWith('saves:')));assert.deepEqual(r.warnings,[]);
});
test('background tool choices and species armor/weapons become native Trait advancements',()=>{
 const bg=record('background',{name:'Smith',source:'SBS04',toolProficiencies:[{"smith's tools":true,anyGamingSet:1}]});const a=bg.data.system.advancement.find(a=>a.type==='Trait');assert.ok(a.configuration.grants.includes('tool:art:smith'));assert.equal(a.configuration.choices[0].pool.length,4);
 const race=record('race',{name:'Slime',source:'SBS04',skillProficiencies:[{any:1}],armorProficiencies:[{light:true}],weaponProficiencies:[{dagger:true}]});assert.equal(race.data.system.advancement[0].configuration.choices[0].pool.length,18);assert.equal(race.data.system.advancement[1].configuration.grants[1],'weapon:sim:dagger');
});
test('alternative proficiency packages are not silently combined',()=>{
 const r=record('background',{name:'Choose',source:'SBS04',toolProficiencies:[{"smith's tools":true},{"thieves' tools":true}]});assert.equal(r.data.system.advancement.length,0);assert.match(r.warnings.join(' '),/Alternative/);
});
test('fixed supplied feats remain granted while alternative or open feat choices stay explicit',()=>{
 const bundle={feat:[{name:'Seal Expert',source:'SBS04',entries:['An original test feat.']}]};
 const fixed=record('background',{name:'Depot',source:'SBS04',feats:[{'Seal Expert|SBS04':true}]},bundle);assert.equal(fixed.data.system.advancement[0].configuration.items[0].uuid,'@forge:feat:SBS04:Seal Expert');assert.deepEqual(fixed.warnings,[]);
 for(const feats of [[{any:1}],[{'Seal Expert|SBS04':true},{'Seal Expert|SBS04':true}]]){const r=record('background',{name:'Depot',source:'SBS04',feats},bundle);assert.equal(r.data.system.advancement.length,0);assert.match(r.warnings.join(' '),/manual selection/);}
});
test('origin spells map fixed grants and explicit choices with native ability and free uses',()=>{
 const r=record('race',{name:'Glow Slug',source:'SBS04',additionalSpells:[{ability:{choose:['int','cha']},known:{1:['Tier Spark|SBS04#c']},innate:{3:{daily:{'1e':['Slot Surge|SBS04']}},5:{will:[{choose:{from:['Tier Spark|SBS04','Slot Surge|SBS04'],count:1}}]}}}]},{spell:[spark,surge]});
 const [cantrip,innate,choice]=r.data.system.advancement;assert.equal(cantrip.level,1);assert.equal(cantrip.configuration.spell.method,'spell');assert.deepEqual(innate.configuration.spell.uses,{max:'1',per:'lr',requireSlot:false});assert.equal(innate.configuration.spell.method,'innate');assert.deepEqual(innate.configuration.spell.ability,['int','cha']);assert.equal(choice.type,'ItemChoice');assert.equal(choice.configuration.allowDrops,false);assert.equal(choice.configuration.choices[5].count,1);assert.equal(choice.configuration.pool.length,2);
});
test('prepared class grants retain slot casting and always-prepared mode',()=>{
 const r=record('class',{name:'Courier',source:'SBS04',spellcastingAbility:'int',casterProgression:'full',additionalSpells:[{prepared:{1:['Slot Surge|SBS04']}}]},{spell:[surge]});const a=r.data.system.advancement[0];assert.equal(a.configuration.spell.method,'spell');assert.equal(a.configuration.spell.prepared,2);assert.deepEqual(a.configuration.spell.ability,['int']);assert.equal(a.configuration.spell.uses.max,'');
});
test('missing candidates never produce a partial spell-choice pool',()=>{
 const r=record('race',{name:'Slug',source:'SBS04',additionalSpells:[{innate:{1:[{choose:{from:['Tier Spark|SBS04','Missing|SBS04']}}]}}]},{spell:[spark]});assert.equal(r.data.system.advancement.length,0);assert.match(r.warnings.join(' '),/no partial choice/);
});
test('shared use pools, expanded spell lists and alternative packages are explicitly deferred',()=>{
 const cases=[{additionalSpells:[{innate:{1:{daily:{1:['Tier Spark|SBS04','Slot Surge|SBS04']}}}}]},{additionalSpells:[{expanded:{s1:['Slot Surge|SBS04']}}]},{additionalSpells:[{known:{1:['Tier Spark|SBS04']}},{known:{1:['Slot Surge|SBS04']}}]}];
 for(const raw of cases){const r=record('race',{name:'Slug',source:'SBS04',...raw},{spell:[spark,surge]});assert.equal(r.data.system.advancement.length,0);assert.ok(r.warnings.length);}
});
test('native IDs remain deterministic and unique as proficiencies, features and spell grants combine',()=>{
 const bundle={spell:[spark,surge],race:[{name:'Slug',source:'SBS04',size:['M'],toolProficiencies:[{"smith's tools":true}],additionalSpells:[{ability:'int',known:{1:['Tier Spark|SBS04#c']},innate:{3:{rest:{1:['Slot Surge|SBS04']}}}}],entries:[{name:'Slime',entries:['Sticky.']}]}]};
 const first=parseSourceBundle(bundle).records.find(r=>r.kind==='race').data,second=parseSourceBundle(bundle).records.find(r=>r.kind==='race').data;assert.deepEqual(first,second);const ids=first.system.advancement.map(a=>a._id);assert.equal(new Set(ids).size,ids.length);assert.ok(ids.every(id=>/^[A-Za-z0-9]{16}$/.test(id)));
});
test('workbook preview carries source review warnings and validates native UUIDs before writing',async()=>{
 const sources=parseSourceBundle({spell:[surge],item:[{name:'Wand',source:'SBS04',type:'WD',charges:3,reqAttune:'by a courier',attachedSpells:{charges:{1:['Slot Surge|SBS04']}}}]});
 const rows={Meta:[{'Schema Version':2}],Actors:[{'Actor Key':'04','Import?':'Yes',Name:'Tester',Type:'character'}],Items:[{'Actor Key':'04','Item Key':'wand',Name:'Wand',Type:'consumable','Source Format':'5etools',Source:'SBS04'}]};
 const plans=parseRows(rows),env=world(),originalValidate=env.validateActor;env.validateActor=d=>{assert.ok(!JSON.stringify(d).includes('@forge:'));return originalValidate(d);};plans[0].catalog=catalogRows(sources.records);await preparePlans(plans,env,sources.records);assert.deepEqual(plans[0].errors,[]);assert.match(plans[0].warnings.join(' '),/eligibility/);
 const result=await importPlans(plans,env),actor=result.imported.get('04'),wand=actor.items.find(i=>i.name==='Wand');assert.match(Object.values(wand.system.activities)[0].spell.uuid,/^Item\.[A-Za-z0-9]{16}$/);assert.equal(env.list('Item').length,1);await undoImport(env);assert.equal(env.list('Item').length,0);assert.equal(env.list('Actor').length,0);
});
