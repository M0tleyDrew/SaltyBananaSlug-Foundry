export const WALLET_FLAG = "saltybananaslug-card-games";
const COINS={cp:1,sp:10,ep:50,gp:100,pp:1000};
export function copper(currency={}) {
  let total=0;
  for(const [key,rate] of Object.entries(COINS)){
    const n=Number(currency[key]??0);
    if(!Number.isSafeInteger(n)||n<0)throw new Error("Character currency must contain nonnegative whole coins.");
    total+=n*rate;
  }
  if(!Number.isSafeInteger(total))throw new Error("Currency balance is too large.");
  return total;
}
export function coins(total) {
  if(!Number.isSafeInteger(total)||total<0)throw new Error("Insufficient character currency.");
  const result={};for(const key of ["pp","gp","ep","sp","cp"]){result[key]=Math.floor(total/COINS[key]);total%=COINS[key];}return result;
}
export function walletChanges(before,after) {
  if(after.settings.moneyMode!=="currency")return [];
  return after.seats.filter(p=>p.actorId).map(p=>{
    const old=before.seats.find(x=>x.id===p.id);
    const exact=(p.chips-(old?.chips??p.chips))*100;
    if(Math.abs(exact-Math.round(exact))>0.00001)throw new Error("Payout cannot be represented in copper pieces.");
    return {actorId:p.actorId,delta:Math.round(exact)};
  }).filter(c=>c.delta!==0);
}
export function preflightWallet(changes,tableId,actors) {
  for(const c of changes){const a=actors.get(c.actorId);if(!a)throw new Error("A wagering actor is missing; restore it before settling this table.");
    const marker=a.getFlag(WALLET_FLAG,"wallet");
    if(marker?.tableId&&marker.tableId!==tableId)throw new Error(`${a.name} is already playing at another currency table.`);
    coins(copper(a.system.currency)+c.delta);
  }
}
// One atomic Actor update includes both currency and the transaction receipt.
// A durable pending table journal is written by main.js before calling this routine.
export async function applyWallet(changes,tableId,txId,actors,closing=false) {
  for(const c of changes){const a=actors.get(c.actorId);if(!a)throw new Error("Wagering actor missing.");
    const marker=a.getFlag(WALLET_FLAG,"wallet");
    if(marker?.txId===txId)continue;
    if(marker?.tableId&&marker.tableId!==tableId)throw new Error(`${a.name} is already at another currency table.`);
    const currency=coins(copper(a.system.currency)+c.delta);
    await a.update({"system.currency":currency,[`flags.${WALLET_FLAG}.wallet`]:{tableId:closing?null:tableId,txId}});
  }
}
export function refundUnfinished(state) {
  if(state.settings.moneyMode!=="currency")return;
  if(["holdem","draw"].includes(state.type)&&!["complete","game-over"].includes(state.phase)){
    for(const p of state.seats)p.chips+=p.committed;
  }else if(state.type==="blackjack"&&!["complete","game-over"].includes(state.phase)){
    for(const p of state.seats)for(const h of p.bjHands)p.chips+=(h.status==="surrender"?h.bet-h.bet/2:h.bet)+(h.insurance??0);
  }else if(state.type==="euchre"&&!state.matchFinished){
    for(const p of state.seats)p.chips+=p.committed;
  }else if(["war","baccarat","video"].includes(state.type)){
    for(const p of state.seats)if(p.extra&&!p.extra.done)p.chips+=p.extra.bet+(p.extra.additionalBet??0);
  }
  state.closed=true;
}
