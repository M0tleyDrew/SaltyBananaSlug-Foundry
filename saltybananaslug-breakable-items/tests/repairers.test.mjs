import test from 'node:test';
import assert from 'node:assert/strict';
import {ID,TOOLS,DEFAULT_PROFILES,DEFAULT_DURABILITY,DEFAULT_RULES,clone} from '../scripts/core.mjs';
import {ARTISAN_TOOLS,APPROVAL_SERVICE,paidServices,repairService,toolSupport,inspectTool,createRepairer,migrateRepairerTokens} from '../scripts/repairers.mjs';
const cfg={profiles:DEFAULT_PROFILES,durability:DEFAULT_DURABILITY,rules:DEFAULT_RULES};
function item({name='Folding Hammer',type='weapon',system={},support,broken=false}={}){return {id:'i',name,type,system:{quantity:1,...system},flags:{[ID]:{...(support!==undefined?{toolSupport:support}:{}),...(broken?{durability:{max:20,hp:0,breaks:1}}:{})}}};}
const actor=(items=[],tools={})=>({items,system:{tools,skills:{arc:{value:0}}}});
test('a paid approval request is available with zero configured services',()=>{assert.equal(paidServices({shops:[]})[0].id,APPROVAL_SERVICE.id);assert.equal(repairService({shops:[]}).approvalOnly,true);});
test('configured services and the no-setup request stay distinct',()=>{const c={shops:[{id:'smith',enabled:true},{id:'off',enabled:false}]};assert.deepEqual(paidServices(c).map(s=>s.id),['smith',APPROVAL_SERVICE.id]);assert.equal(repairService(c,'off'),undefined);});
test('custom weapon roles can supply a smith tool without changing item type',()=>{const i=item({support:{keys:['smith']}}),info=inspectTool(actor([i],{smith:{value:1}}),'smith',cfg);assert.equal(info.tool,i);assert.equal(info.present,true);assert.equal(info.proficient,true);assert.equal(i.type,'weapon');});
test('custom equipment supplying a tool does not grant proficiency implicitly',()=>{const i=item({type:'equipment',support:{keys:['smith']}}),info=inspectTool(actor([i]),'smith',cfg);assert.equal(info.present,true);assert.equal(info.proficient,false);});
test('explicit item-granted proficiency satisfies only its chosen roles',()=>{const i=item({support:{keys:['smith'],grantProficiency:true}});assert.equal(inspectTool(actor([i]),'smith',cfg).proficient,true);assert.equal(inspectTool(actor([i]),'woodcarver',cfg).present,false);});
test('all-artisan tools cover every artisan but not kits instruments or games',()=>{const i=item({support:{allArtisan:true,grantProficiency:true}});for(const k of ARTISAN_TOOLS)assert.equal(inspectTool(actor([i]),k,cfg).present,true,k);for(const k of ['thief','disg','herb','navg','lute','dice'])assert.equal(inspectTool(actor([i]),k,cfg).present,false,k);});
test('a custom item may explicitly support kits and instruments',()=>{const i=item({support:{keys:['thief','lute']}});assert.equal(inspectTool(actor([i]),'thief',cfg).present,true);assert.equal(inspectTool(actor([i]),'lute',cfg).present,true);});
test('All-Purpose Tool is detected by item name and grants artisan roles when attuned',()=>{const i=item({name:'All-Purpose Tool +2',type:'equipment',system:{attuned:true}}),info=inspectTool(actor([i]),'smith',cfg);assert.equal(info.present,true);assert.equal(info.proficient,true);assert.equal(toolSupport(i).automatic,true);});
test('All-Purpose Tool supports imported identifiers and legacy attunement',()=>{const i=item({name:'Translated item',system:{identifier:'all-purpose-tool',attunement:2}});assert.equal(inspectTool(actor([i]),'weaver',cfg).present,true);});
test('unattuned All-Purpose Tool cannot supply a tool or proficiency',()=>{const i=item({name:'All-Purpose Tool',system:{attuned:false}});assert.equal(inspectTool(actor([i]),'smith',cfg).present,false);});
test('being an artificer alone does not provide missing physical tools',()=>{const a=actor();a.classes={artificer:{system:{levels:20}}};assert.equal(inspectTool(a,'smith',cfg).present,false);});
test('explicit configuration overrides All-Purpose Tool name detection',()=>{const i=item({name:'All-Purpose Tool',system:{attuned:true},support:{keys:['tinker'],grantProficiency:false}});assert.equal(inspectTool(actor([i]),'smith',cfg).present,false);assert.equal(inspectTool(actor([i]),'tinker',cfg).proficient,false);});
test('broken and empty custom tools cannot satisfy repair requirements',()=>{for(const i of [item({broken:true,support:{keys:['smith']}}),item({system:{quantity:0},support:{keys:['smith']}})])assert.equal(inspectTool(actor([i]),'smith',cfg).present,false);});
test('usable natural tools are preferred over an equally proficient transforming item',()=>{const multi=item({name:'All-Purpose Tool',system:{attuned:true}}),native=item({name:"Smith's Tools",type:'tool',system:{type:{baseItem:'smith'}}});assert.equal(inspectTool(actor([multi,native],{smith:{value:1}}),'smith',cfg).tool,native);});
test('a role granting proficiency is preferred over an untrained physical tool',()=>{const multi=item({support:{keys:['smith'],grantProficiency:true}}),native=item({name:"Smith's Tools",type:'tool',system:{type:{baseItem:'smith'}}});assert.equal(inspectTool(actor([native,multi]),'smith',cfg).tool,multi);});
test('custom attunement-gated roles do not activate before attunement',()=>{const i=item({support:{keys:['smith'],requiresAttunement:true,grantProficiency:true}});assert.equal(inspectTool(actor([i]),'smith',cfg).present,false);i.system.attuned=true;assert.equal(inspectTool(actor([i]),'smith',cfg).present,true);});

function creator({gm=true,scene=false,failSettings=false,failPlacement=false}={}){
 let data,deleted=false,placed=[],settings=[];
 globalThis.game={user:{isGM:gm},settings:{get:()=>settings,set:async(_id,_key,value)=>{if(failSettings)throw Error('Settings failed');settings=value;}}};
 globalThis.foundry={utils:{randomID:()=> 'unique'}};
 globalThis.Actor={create:async source=>{data=source;return {uuid:'Actor.smith',name:source.name,delete:async()=>{deleted=true;},getTokenDocument:async position=>({toObject:()=>({...position,actorId:'smith'})})};}};
 globalThis.canvas=scene?{scene:{width:1000,height:1000,grid:{size:100},createEmbeddedDocuments:async(_name,tokens)=>{if(failPlacement)throw Error('Token failed');placed=tokens;}},stage:{pivot:{x:450,y:450}},dimensions:{sceneRect:{x:0,y:0,width:1000,height:1000}}}:{};
 return {get data(){return data;},get deleted(){return deleted;},get placed(){return placed;},get settings(){return settings;}};
}
test('GM shortcut creates a reusable NPC, comprehensive workshop and enabled service',async()=>{const c=creator();const result=await createRepairer({name:'Juniper the Smith'});assert.equal(c.data.type,'npc');assert.equal(c.data.items[0].flags[ID].toolSupport.keys.length,Object.keys(TOOLS).length);assert.equal(c.settings[0].actorUuid,'Actor.smith');assert.equal(result.placed,false);});
test('repairer shortcut can place an independent token on the viewed scene',async()=>{const c=creator({scene:true});const result=await createRepairer({placeToken:true});assert.equal(result.placed,true);assert.equal(c.placed[0].actorLink,false);assert.equal(c.placed[0].x,400);});
test('players cannot create or place professional repairers',async()=>{const c=creator({gm:false,scene:true});await assert.rejects(createRepairer({placeToken:true}),/Only the GM/);assert.equal(c.data,undefined);});
test('failed service registration removes the newly created NPC',async()=>{const c=creator({failSettings:true});await assert.rejects(createRepairer(),/Settings failed/);assert.equal(c.deleted,true);});
test('token placement failure preserves the valid NPC/service and reports the problem',async()=>{const c=creator({scene:true,failPlacement:true});const r=await createRepairer({placeToken:true});assert.equal(r.placed,false);assert.match(r.placementError,/Token failed/);assert.equal(c.settings.length,1);assert.equal(c.deleted,false);});
test('requesting token placement with no scene creates no orphaned actor',async()=>{const c=creator();await assert.rejects(createRepairer({placeToken:true}),/Open a scene/);assert.equal(c.data,undefined);});

test('existing linked repairer tokens migrate to independent actors while ordinary NPCs stay linked',async()=>{
 const updates=[],actor={id:'smith',uuid:'Actor.smith',flags:{[ID]:{repairServiceId:'service'}},prototypeToken:{actorLink:true},async update(changes){this.prototypeToken.actorLink=changes['prototypeToken.actorLink'];}};
 class Docs extends Map{[Symbol.iterator](){return this.values();}}
 const scene={tokens:[{id:'placed',actorId:'smith',actorLink:true},{id:'ordinary',actorId:'other',actorLink:true}],async updateEmbeddedDocuments(_type,data){updates.push(...data);}};
 globalThis.game={user:{isGM:true},actors:new Docs([['smith',actor]]),scenes:new Docs([['s',scene]]),settings:{get:()=>[{id:'service',actorUuid:actor.uuid}]}};
 await migrateRepairerTokens();assert.deepEqual(updates,[{_id:'placed',actorLink:false}]);assert.equal(actor.prototypeToken.actorLink,false);
});
