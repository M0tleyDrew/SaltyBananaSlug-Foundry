import {MODULE_ID} from "./constants.js";

export function primeMerchantAudio(){
  try{
    const audio=game?.audio;
    const ctx=audio?.interface ?? audio?.context ?? foundry?.audio?.AudioHelper?.context;
    if(ctx?.state==="suspended") ctx.resume?.().catch?.(()=>{});
    // Foundry v13 exposes an unlock Promise which resolves after a valid user gesture.
    // Merely touching it here ensures Foundry's normal unlock machinery is engaged.
    void audio?.unlock;
  }catch(_){}
}

function audienceAllows(sound,user,force=false){
  if(force)return true;
  const audience=sound?.audience??"players";
  if(audience==="players"&&user?.isGM)return false;
  if(audience==="gm"&&!user?.isGM)return false;
  return true;
}

async function brieflyAwaitUnlock(){
  try{
    const unlock=game?.audio?.unlock;
    if(!unlock?.then)return;
    await Promise.race([unlock,new Promise(resolve=>setTimeout(resolve,350))]);
  }catch(_){}
}

export async function playMerchantSound(config,user=game.user,{force=false,notify=false}={}){
  const s=config?.sound??{};
  if(!s.enabled&&!force)return false;
  if(!s.path){if(notify)ui.notifications.warn("Choose a merchant greeting sound first.");return false;}
  if(!audienceAllows(s,user,force))return false;

  const volume=Math.max(0,Math.min(1,Number(s.volume??0.8)));
  const source=String(s.path).trim();
  if(!source)return false;
  let lastError=null;

  primeMerchantAudio();
  await brieflyAwaitUnlock();

  // Foundry's supported one-off sound-effect path. Keeping playback local here is
  // intentional; the SBS socket targets the correct client before this function runs.
  for(const Helper of [foundry?.audio?.AudioHelper,globalThis.AudioHelper]){
    if(typeof Helper?.play!=="function")continue;
    try{
      const result=await Helper.play({src:source,volume,autoplay:true,loop:false,channel:"interface"},false);
      if(notify)ui.notifications.info("Merchant greeting sound played.");
      return result??true;
    }catch(err){lastError=err;}
  }

  // Instance API compatibility path.
  try{
    if(typeof game?.audio?.play==="function"){
      const result=await game.audio.play(source,{context:game.audio.interface??game.audio.context});
      try{if(result&&"volume" in result)result.volume=volume;}catch(_){}
      if(notify)ui.notifications.info("Merchant greeting sound played.");
      return result??true;
    }
  }catch(err){lastError=err;}

  // Last-resort browser audio. This is primarily useful for custom hosts/themes.
  try{
    const audio=new Audio(source);audio.volume=volume;audio.preload="auto";await audio.play();
    if(notify)ui.notifications.info("Merchant greeting sound played.");
    return audio;
  }catch(err){lastError=err;}

  console.warn(`${MODULE_ID} | Could not play merchant sound`,lastError);
  if(notify)ui.notifications.error(`Could not play merchant sound${lastError?.message?`: ${lastError.message}`:"."}`);
  return false;
}
