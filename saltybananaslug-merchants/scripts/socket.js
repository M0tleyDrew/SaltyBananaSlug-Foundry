import {MODULE_ID, SOCKET_NAME} from "./constants.js";
import {activeGM, notifyError, userOwnsActor} from "./utils.js";
import {buyFromMerchant, merchantSnapshot, quotePlayerItem, sellToMerchant} from "./merchant-service.js";
import {playMerchantSound, primeMerchantAudio} from "./sound.js";

const pending=new Map();
export function setupSocket(){game.socket.on(SOCKET_NAME,async msg=>{if(!msg||typeof msg!=="object")return;
  if(msg.type==="sound"&&msg.target===game.user.id){primeMerchantAudio();await playMerchantSound({sound:msg.sound??{}},game.user,{force:true});return;}
  if(msg.type==="response"&&msg.target===game.user.id){const p=pending.get(msg.requestId);if(!p)return;pending.delete(msg.requestId);msg.ok?p.resolve(msg.result):p.reject(new Error(msg.error||"Merchant request failed."));return;}
  if(msg.type!=="request"||!game.user.isGM)return;const gm=activeGM();if(!gm||gm.id!==game.user.id)return;
  try{
    const result=await processRequest(msg);
    // A successful storefront snapshot is the authoritative "merchant opened" event.
    // Trigger the greeting explicitly on the requesting client instead of coupling
    // sound playback to Application render timing.
    if(msg.action==="snapshot"&&msg.payload?.playGreeting!==false){
      const sound=result?.sound??{};
      const audience=sound.audience??"players";
      if(sound.enabled&&sound.path&&(audience==="players"||audience==="all")){
        game.socket.emit(SOCKET_NAME,{type:"sound",target:msg.sender,sound});
      }
    }
    game.socket.emit(SOCKET_NAME,{type:"response",requestId:msg.requestId,target:msg.sender,ok:true,result});
  }catch(err){console.error(`${MODULE_ID} | socket request failed`,err);game.socket.emit(SOCKET_NAME,{type:"response",requestId:msg.requestId,target:msg.sender,ok:false,error:err?.message??String(err)});}
});}

async function docs(payload,user){const token=await fromUuid(payload.tokenUuid);const actor=await fromUuid(payload.actorUuid);if(!token||token.documentName!=="Token")throw new Error("Merchant token could not be resolved.");if(!actor||actor.documentName!=="Actor"||!userOwnsActor(user,actor))throw new Error("Choose a character you own.");return{token,actor};}
async function processRequest(msg){const user=game.users.get(msg.sender);if(!user)throw new Error("Requesting user not found.");const {action,payload={}}=msg;
  if(action==="snapshot"){const {token,actor}=await docs(payload,user);return merchantSnapshot(token,user,actor);}
  if(action==="buy"){const {token,actor}=await docs(payload,user);return buyFromMerchant({tokenDoc:token,user,actor,lines:payload.lines??[]});}
  if(action==="quoteSell"){const {token,actor}=await docs(payload,user);const item=actor.items.get(payload.itemId);if(!item)throw new Error("Item not found on that character.");return quotePlayerItem(token,actor,item,payload.quantity??1,user);}
  if(action==="sell"){const {token,actor}=await docs(payload,user);return sellToMerchant({tokenDoc:token,user,actor,lines:payload.lines??[]});}
  throw new Error(`Unknown merchant action: ${action}`);
}

export function requestGM(action,payload={}){if(game.user.isGM)return Promise.reject(new Error("GM should execute merchant actions directly."));const gm=activeGM();if(!gm)return Promise.reject(new Error("No active GM is available to process this merchant transaction."));const requestId=foundry.utils.randomID();return new Promise((resolve,reject)=>{pending.set(requestId,{resolve,reject});setTimeout(()=>{if(!pending.has(requestId))return;pending.delete(requestId);reject(new Error("The GM did not respond to the merchant request."));},15000);game.socket.emit(SOCKET_NAME,{type:"request",requestId,sender:game.user.id,action,payload});}).catch(err=>{notifyError(err);throw err;});}
