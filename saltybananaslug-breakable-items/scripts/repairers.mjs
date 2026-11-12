import {ID,TOOLS,DEFAULT_RARITIES,clone,numeric,normal,tracked,stateFor,usable} from './core.mjs';

export const ARTISAN_TOOLS=new Set(['alchemist','brewer','calligrapher','carpenter','cartographer','cobbler','cook','glassblower','jeweler','leatherworker','mason','painter','potter','smith','tinker','weaver','woodcarver']);
export const APPROVAL_SERVICE={id:'__gm-approved__',name:'Find a repairer — request GM approval',enabled:true,rarities:Object.keys(DEFAULT_RARITIES),multiplier:1,checkBonus:5,approvalOnly:true};
export function paidServices(cfg,user=globalThis.game?.user){
 const sceneId=user?.viewedScene??(user?.id===globalThis.game?.user?.id?globalThis.canvas?.scene?.id:null),scene=globalThis.game?.scenes?.get?.(sceneId)??(sceneId&&globalThis.canvas?.scene?.id===sceneId?globalThis.canvas.scene:null),instances=[];
 for(const token of scene?.tokens??[]){
  if(token.hidden&&!user?.isGM)continue;const actor=token.actor,base=game.actors?.get?.(token.actorId),id=actor?.flags?.[ID]?.repairServiceId??base?.flags?.[ID]?.repairServiceId,service=cfg.shops?.find(s=>s.enabled&&(s.id===id||s.actorUuid&&[actor?.uuid,base?.uuid].includes(s.actorUuid)));
  if(!service)continue;instances.push({...service,id:`token:${token.uuid}`,name:`${token.name??service.name} (on map)`,templateId:service.id,tokenUuid:token.uuid,sceneId:scene.id,actorUuid:actor?.uuid,automatic:true});
 }
 return [...instances,...(cfg.shops??[]).filter(s=>s.enabled&&s.id!==APPROVAL_SERVICE.id&&!instances.some(i=>i.templateId===s.id)),clone(APPROVAL_SERVICE)];
}
export const repairService=(cfg,id,user)=>paidServices(cfg,user).find(s=>s.id===(id||APPROVAL_SERVICE.id));
export async function migrateRepairerTokens(){
 if(!game.user.isGM)return;const ids=new Set((game.settings.get(ID,'shops')??[]).map(s=>s.actorUuid));
 for(const scene of game.scenes??[]){const updates=[...(scene.tokens??[])].filter(t=>t.actorLink&&(ids.has(`Actor.${t.actorId}`)||game.actors?.get?.(t.actorId)?.flags?.[ID]?.repairServiceId)).map(t=>({_id:t.id,actorLink:false}));if(updates.length)await scene.updateEmbeddedDocuments('Token',updates);}
 for(const actor of game.actors??[])if(actor.flags?.[ID]?.repairServiceId&&actor.prototypeToken?.actorLink)await actor.update({'prototypeToken.actorLink':false});
}
export function toolSupport(item){
 const saved=item.flags?.[ID]?.toolSupport;
 if(saved!==undefined&&saved!==null)return {keys:Array.isArray(saved.keys)?saved.keys:[],allArtisan:saved.allArtisan===true,grantProficiency:saved.grantProficiency===true,requiresAttunement:saved.requiresAttunement===true,automatic:false};
 const automatic=/allpurposetool/.test(normal(item.name)+' '+normal(item.system?.identifier));
 return {keys:[],allArtisan:automatic,grantProficiency:automatic,requiresAttunement:automatic,automatic};
}
export const isAttuned=item=>item.system?.attuned===true||item.system?.attunement===2;
export function inspectTool(actor,key,cfg){
 const base=Math.max(numeric(actor?.system?.tools?.[key]?.effectValue),numeric(actor?.system?.tools?.[key]?.value));
 const candidates=[];
 for(const item of actor?.items??[]){
  if(numeric(item.system?.quantity,1)<=0||tracked(item,cfg.rules)&&!usable(stateFor(item,cfg.profiles,cfg.durability)))continue;
  const support=toolSupport(item),native=item.type==='tool'&&(item.system?.type?.baseItem===key||normal(item.name)===normal(TOOLS[key]??key));
  const supported=support.keys.includes(key)||support.allArtisan&&ARTISAN_TOOLS.has(key);
  if(!native&&!supported||!native&&support.requiresAttunement&&!isAttuned(item))continue;
  const grant=supported&&(!support.requiresAttunement||isAttuned(item))&&support.grantProficiency;
  const value=Math.max(base,native?numeric(item.system?.proficient):0,grant?1:0);
  candidates.push({tool:item,value,native,granted:grant,support});
 }
 candidates.sort((a,b)=>b.value-a.value||Number(b.native)-Number(a.native));
 const chosen=candidates[0];return {...chosen,tool:chosen?.tool,present:!key||!!chosen,proficient:!key||(chosen?.value??base)>=1,arcana:numeric(actor?.system?.skills?.arc?.value)>=1,value:chosen?.value??base};
}

export async function createRepairer({name='Traveling Master Artisan',placeToken=false,multiplier=1,checkBonus=10}={}){
 if(!game.user.isGM)throw Error('Only the GM can create repair services.');
 name=String(name).trim();if(!name)throw Error('Give the repairer a name.');
 if(!Number.isFinite(Number(multiplier))||Number(multiplier)<0||!Number.isFinite(Number(checkBonus)))throw Error('Use a nonnegative price multiplier and a numeric check bonus.');
 if(placeToken&&!globalThis.canvas?.scene)throw Error('Open a scene before placing the repairer.');
 const id=`artisan-${foundry.utils.randomID(16)}`,img='icons/skills/trades/smithing-anvil-silver-red.webp';
 const actor=await Actor.create({name,type:'npc',img,ownership:{default:0},flags:{[ID]:{repairServiceId:id}},prototypeToken:{name,actorLink:false,texture:{src:img}},system:{abilities:{int:{value:18}},attributes:{hp:{value:22,max:22}},details:{biography:{value:'A master artisan offering mundane and magical equipment repairs. Placed repairers process paid repairs directly; unplaced service requests need GM approval and available downtime.'}},skills:{arc:{value:2}},tools:Object.fromEntries(Object.keys(TOOLS).map(k=>[k,{value:2}]))},items:[{name:'Master Repair Workshop',type:'tool',img,system:{quantity:1,type:{value:'art',baseItem:'tinker'},proficient:2},flags:{[ID]:{toolSupport:{keys:Object.keys(TOOLS),allArtisan:true,grantProficiency:true,requiresAttunement:false}}}}]});
 const service={id,name,enabled:true,rarities:Object.keys(DEFAULT_RARITIES),multiplier:Number(multiplier),checkBonus:Number(checkBonus),actorUuid:actor.uuid};
 try{await game.settings.set(ID,'shops',[...(game.settings.get(ID,'shops')??[]),service]);}catch(error){try{await actor.delete();}catch{}throw error;}
 let placed=false,placementError;
 if(placeToken){try{
  const rect=canvas.dimensions?.sceneRect??{x:0,y:0,width:canvas.scene.width,height:canvas.scene.height},size=numeric(canvas.scene.grid?.size,100),center=canvas.stage?.pivot??{x:rect.x+rect.width/2,y:rect.y+rect.height/2};
  const x=Math.max(rect.x,Math.min(rect.x+rect.width-size,Math.floor((center.x-size/2)/size)*size)),y=Math.max(rect.y,Math.min(rect.y+rect.height-size,Math.floor((center.y-size/2)/size)*size));
  const token=await actor.getTokenDocument({x,y,actorLink:false,hidden:false});await canvas.scene.createEmbeddedDocuments('Token',[token.toObject()]);placed=true;
 }catch(error){placementError=error.message;}}
 return {actor,service,placed,placementError};
}
