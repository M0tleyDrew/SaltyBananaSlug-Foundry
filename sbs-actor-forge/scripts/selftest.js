import {ID,clone,parseRows,exportRows,markItems} from './core.js';
import {CATEGORIES} from './updates.js';
import {preparePlans,importPlans,undoImport} from './engine.js';
import {readUndo,writeUndo,readPrivateDetails} from './privacy.js';
import {folderLabel,folderInUse} from './folders.js';
import {parseSourceBundle} from './sources.js';
import {biographyHTML} from './biography.js';
import {replaceCatalogReferences} from './advancements.js';
import {validateItemDocumentIds} from './documents.js';

export function mechanicsProbeRecords() {
  return parseSourceBundle({
    spell:[{name:'Check Spark',source:'SBS-CHECK',level:0,spellAttack:['R'],damageInflict:['lightning'],entries:['Hit: {@damage 1d6} lightning damage.'],scalingLevelDice:{scaling:{1:'1d6',5:'2d6',11:'3d6',17:'4d6'}}},
      {name:'Check Burst',source:'SBS-CHECK',level:1,spellAttack:['R'],damageInflict:['force'],entries:['Hit: {@damage 2d6} force damage.'],entriesHigherLevel:['Damage increases by {@scaledamage 1d6|1-9|1d6} for each slot level above 1st.']}],
    item:[{name:'Check Coat',source:'SBS-CHECK',type:'MA',ac:14,stealth:true},{name:'Check Broth',source:'SBS-CHECK',type:'P',entries:['Regain {@dice 2d4 + 2} hit points.']},
      {name:'Check Wand',source:'SBS-CHECK',type:'WD',charges:6,reqAttune:true,recharge:'dawn',rechargeAmount:'1d4 + 2',attachedSpells:{charges:{2:['Check Burst|SBS-CHECK']}}}],
    class:[{name:'Check Courier',source:'SBS-CHECK',proficiency:['int','wis'],startingProficiencies:{armor:['light','medium','shields'],weapons:['simple'],skills:[{choose:{from:['arcana','investigation'],count:1}}]},multiclassing:{proficienciesGained:{armor:['light']}},casterProgression:'full',spellcastingAbility:'int',additionalSpells:[{prepared:{1:['Check Burst|SBS-CHECK']}}]}],
    race:[{name:'Check Signal Species',source:'SBS-CHECK',size:['S'],additionalSpells:[{ability:{choose:['int','cha']},innate:{3:{daily:{'1e':['Check Burst|SBS-CHECK']}}}}]}],
    background:[{name:'Check Surveyor',source:'SBS-CHECK',toolProficiencies:[{"cartographer's tools":true,anyGamingSet:1}],additionalSpells:[{ability:'int',known:{1:[{choose:{from:['Check Spark|SBS-CHECK','Check Burst|SBS-CHECK']}}]}}]}]
  }).records;
}

export function probeRows(prefix='SBS-CHECK') {
  const item=(name,type,key,system={})=>({name,type,system,flags:{[ID]:{itemKey:key}}});
  const actors=[
    {name:prefix+' Mage',type:'character',system:{abilities:{int:{value:16}},attributes:{hp:{value:12,max:12}}},items:[item('Check Species','race','check-species',{identifier:'check-species',advancement:[{_id:'probeSizeAdv0001',type:'Size',level:0,configuration:{sizes:['sm','med']},value:{}}]}),item('Check Background','background','check-background',{identifier:'check-background'}),item('Check Feature','feat','check-feature',{description:{value:'Initial feature'}})]},
    {name:prefix+' Guard',type:'npc',system:{attributes:{hp:{value:18,max:18},ac:{calc:'flat',flat:14}},details:{cr:1}}},
    {name:prefix+' Wagon',type:'vehicle',system:{details:{type:'land'},crew:{max:2},passengers:{max:4}}},
    {name:prefix+' Party',type:'group',system:{}}
  ];
  return {Meta:[{'Schema Version':2}],Actors:actors.map((a,i)=>({'Import?':'Yes','Actor Key':prefix+'-'+i,Name:a.name,Type:a.type,'Raw JSON':JSON.stringify(a)})),
    Relationships:[{ 'Actor Key':prefix+'-2',Relation:'crew','Target Key':prefix+'-1',Quantity:1},{'Actor Key':prefix+'-2',Relation:'passenger','Target Key':prefix+'-0',Quantity:1},{'Actor Key':prefix+'-3',Relation:'member','Target Key':prefix+'-0'},{'Actor Key':prefix+'-3',Relation:'member','Target Key':prefix+'-1'},{'Actor Key':prefix+'-3',Relation:'member','Target Key':prefix+'-2'},{'Actor Key':prefix+'-3',Relation:'primaryVehicle','Target Key':prefix+'-2'}],
    Details:[{'Actor Key':prefix+'-0',Section:'Public',Label:'Check',Value:'Public note',Visibility:'Public'},{'Actor Key':prefix+'-0',Section:'GM',Label:'Secret',Value:'SBS_CONFIDENTIAL_PROBE',Visibility:'GM'}]};
}
export async function runCompatibilityChecks(env) {
  if(!env.isGM)throw Error('Compatibility checks require a GM');
  const saved=clone(await readUndo(env)),created=new Map(['Actor','Item','JournalEntry','Folder'].map(k=>[k,new Set()])),lines=[];
  const originalEnv=env;
  env={...env,create:async(kind,data)=>{const doc=await originalEnv.create(kind,data);created.get(kind).add(doc.id);return doc;}};
  const check=(ok,label)=>{lines.push(`${ok?'PASS':'FAIL'}: ${label}`);if(!ok)throw Error(label);};
  try {
    const prefix='SBS-CHECK-'+env.randomID(),rows=probeRows(prefix);for(const row of rows.Actors)row.Folder=prefix+' / Actors';
    const plans=parseRows(rows);await preparePlans(plans,env);check(plans.every(p=>!p.errors.length),'Native schemas accept all four actor types');
    const initial=await importPlans(plans,env);check(initial.imported.size===4,'Create all four actors');
    const [pc,guard,wagon,party]=plans.map(p=>initial.imported.get(p.key));
    const raw=pc.toObject();check(raw.system.details.race && raw.items.some(i=>i._id===raw.system.details.race),'Species field links to the embedded species');
    check(folderLabel(env.get('Folder',raw.folder),env.list('Folder'))===prefix+' / Actors','Nested Actor folders are created and assigned');
    const viewerHTML=biographyHTML(pc,{...env,isGM:false,user:{id:'sbs-check-viewer',isGM:false}});
    check(viewerHTML.includes('Public note') && !viewerHTML.includes('SBS_CONFIDENTIAL_PROBE') && !viewerHTML.includes('data-sbs-gm'),'Biography markup keeps GM notes out of the player view');
    const nativeWeapon=parseSourceBundle({item:[{name:'Check Blade',source:'SBS-CHECK',type:'M',weaponCategory:'simple',dmg1:'1d6',dmgType:'S',property:[]}]}).records[0].data;
    env.validateItem(nativeWeapon);check(true,'Converted weapon passes the installed native Item schema');
    const mechanics=mechanicsProbeRecords(),schemaIDs=new Map(mechanics.map((r,i)=>[r.key,'sbsCheck'+String(i).padStart(8,'0')]));
    for(const record of mechanics){validateItemDocumentIds(record.data);env.validateItem(replaceCatalogReferences(record.data,schemaIDs));}
    check(true,'v0.4 converted spell scaling, armor, consumables, charges/attunement and origin grants pass the installed native Item schemas');
    check(raw.system.details.background && raw.items.some(i=>i._id===raw.system.details.background),'Background field links to the embedded background');
    check(wagon.toObject().system.crew.value.includes(guard.uuid),'Vehicle crew resolves to the NPC UUID');
    check(wagon.toObject().system.passengers.value.includes(pc.uuid),'Vehicle passenger resolves to the character UUID');
    check(party.toObject().system.primaryVehicle===wagon.id && party.toObject().system.members.some(m=>m.actor===pc.id),'Native group members and primary vehicle are linked');
    check(!JSON.stringify(raw).includes('SBS_CONFIDENTIAL_PROBE') && !JSON.stringify(env.getSetting('undo')).includes('SBS_CONFIDENTIAL_PROBE'),'GM note is absent from actor data and public settings');
    check(readPrivateDetails(env,pc.id)[0]?.value==='SBS_CONFIDENTIAL_PROBE','GM note is retrievable by the GM');
    const exported=exportRows([pc,guard,wagon,party],{folders:env.list('Folder'),privateDetails:{[pc.id]:readPrivateDetails(env,pc.id)}}),roundtrip=parseRows(exported);
    check(roundtrip.length===4 && roundtrip[0].gmDetails.length===1 && roundtrip[3].relations.length===4,'Workbook export round trip retains notes and relationships');
    const update=parseRows(probeRows('unused'))[0];update.key=plans[0].key;update.target=pc.id;update.folder=rows.Actors[0].Folder;update.data=clone(plans[0].data);update.data.items.find(i=>i.flags[ID].itemKey==='check-feature').system.description.value='Updated feature';update.data.system.abilities.int.value=17;update.gmDetails=[];update.detailsSupplied=false;update.relations=[];update.categories=CATEGORIES.filter(k=>k!=='permissions');
    await pc.update({'system.attributes.hp.value':9});const manual=await pc.createEmbeddedDocuments('Item',[{name:'Manual Inventory Check',type:'loot',system:{quantity:1}}]);
    const oldHP=pc.toObject().system.attributes.hp.value;await importPlans([update],env);
    check(pc.toObject().system.attributes.hp.value===oldHP,'Merge keeps HP edited after import');
    check(pc.items.get(manual[0].id) && pc.toObject().system.abilities.int.value===17,'Merge keeps manual inventory and applies unchanged fields');
    await undoImport(env);check(pc.toObject().system.abilities.int.value===16 && pc.items.get(manual[0].id),'Undo restores pre-update data including manual inventory');
    const fresh=parseRows(probeRows('SBS-UNDO-'+env.randomID().slice(0,5)));await preparePlans(fresh,env);const freshResult=await importPlans(fresh,env);await undoImport(env);check([...freshResult.imported.values()].every(a=>!env.get('Actor',a.id)),'Undo removes a newly created linked batch');
  } catch(e) {lines.push('Stopped: '+e.message);}
  finally {
    for(const kind of ['Actor','Item','JournalEntry'])for(const id of created.get(kind)){const doc=env.get(kind,id);if(doc)try{await doc.delete();}catch(e){lines.push(`Cleanup failed for ${doc.name}: ${e.message}`);}}
    const folders=env.list('Folder').filter(f=>created.get('Folder').has(f.id));
    folders.sort((a,b)=>folderLabel(b,folders).split('/').length-folderLabel(a,folders).split('/').length);
    for(const folder of folders)try{if(folderInUse(folder.id,env))lines.push(`Kept ${folder.name}: folder now has other contents`);else await folder.delete();}catch(e){lines.push(`Cleanup failed for ${folder.name}: ${e.message}`);}
    await writeUndo(originalEnv,saved?.entries ? saved : {entries:[]});
  }
  lines.push('Temporary test documents cleaned up; previous Undo batch restored.');return lines;
}
