import {DEFAULT_FAVOR_LEVELS, MODULE_ID} from "./constants.js";
import {getItemPrice} from "./utils.js";

export function relationForActor(data,actor){
  const rel=data?.favor?.relations?.[actor?.id]??{};
  const levels=data?.favor?.levels?.length?data.favor.levels:DEFAULT_FAVOR_LEVELS;
  const levelId=rel.favorId!==undefined&&rel.favorId!==null?String(rel.favorId):String(data?.favor?.defaultLevelId??"");
  const level=levelId?levels.find(l=>l.id===levelId)??null:null;
  return {relation:rel,level,levelId};
}

function optionalNumber(value){
  if(value===null||value===undefined||value==="")return null;
  const n=Number(value);return Number.isFinite(n)?n:null;
}

export function effectiveRates(data,actor){
  const {relation,level,levelId}=relationForActor(data,actor);
  const baseSell=Number(data?.pricing?.sellRate??100);
  const baseBuy=Number(data?.pricing?.buyRate??60);
  const customSell=optionalNumber(relation.customSellRate);
  const customBuy=optionalNumber(relation.customBuyRate);
  return {
    sellRate:customSell!==null?customSell:Number(level?.sellRate??baseSell),
    buyRate:customBuy!==null?customBuy:Number(level?.buyRate??baseBuy),
    favorId:levelId||"",favorName:level?.name??"Merchant Default"
  };
}

function roundPrice(value,mode="nearest"){
  if(mode==="down")return Math.floor(value);
  if(mode==="up")return Math.ceil(value);
  return Math.round(value);
}

export function stockSettings(item){
  const raw=item?.getFlag?.(MODULE_ID,"stock")??item?.flags?.[MODULE_ID]?.stock??{};
  return {
    infinite:Boolean(raw.infinite),
    visible:raw.visible!==false,
    allowZero:Boolean(raw.allowZero),
    customSellCp:raw.customSellCp===null||raw.customSellCp===undefined||raw.customSellCp===""?null:Number(raw.customSellCp),
    customBuyCp:raw.customBuyCp===null||raw.customBuyCp===undefined||raw.customBuyCp===""?null:Number(raw.customBuyCp),
    ignoreFavor:Boolean(raw.ignoreFavor),
    favorRequired:String(raw.favorRequired??""),
    maxPerCustomer:Math.max(0,Number(raw.maxPerCustomer??0)||0),
    resell:raw.resell!==false,
    source:String(raw.source??"")
  };
}

export function priceForCustomer(item,data,actor,side="sell"){
  const stock=stockSettings(item);
  const base=getItemPrice(item);
  const rates=effectiveRates(data,actor);
  const rounding=data?.pricing?.rounding??"nearest";
  if(side==="sell"){
    if(stock.customSellCp!==null&&Number.isFinite(stock.customSellCp))return Math.max(0,Math.round(stock.customSellCp));
    return Math.max(0,roundPrice(base*((stock.ignoreFavor?Number(data?.pricing?.sellRate??100):rates.sellRate)/100),rounding));
  }
  return Math.max(0,roundPrice(base*((stock.ignoreFavor?Number(data?.pricing?.buyRate??60):rates.buyRate)/100),rounding));
}

export function favorRank(data,id){const levels=data?.favor?.levels??[];return Math.max(0,levels.findIndex(l=>l.id===id));}
export function passesFavorGate(item,data,actor){const req=stockSettings(item).favorRequired;if(!req)return true;const rates=effectiveRates(data,actor);return favorRank(data,rates.favorId)>=favorRank(data,req);}

export function itemVisibleForCustomer(item,data,actor){
  const stock=stockSettings(item);if(!stock.visible||!passesFavorGate(item,data,actor))return false;
  const base=getItemPrice(item);if(base===0&&!stock.allowZero&&stock.customSellCp===null)return false;
  return true;
}

export function merchantAcceptsItem(item,data,actor){
  const rules=data?.buyingRules??{};
  const accepted=rules.acceptedTypes??[];
  if(accepted.length&&!accepted.includes(item.type))return{ok:false,reason:"This merchant does not buy that item type."};
  const base=getItemPrice(item);
  if(foundry.utils.getProperty(item,"system.equipped")===true&&!rules.acceptEquipped)return{ok:false,reason:"This merchant will not buy an item while it is equipped."};
  if(base===0&&!rules.acceptZeroValue)return{ok:false,reason:"This merchant has no offer for zero-value items."};
  const identified=foundry.utils.getProperty(item,"system.identified");
  if(identified===false&&!rules.acceptUnidentified)return{ok:false,reason:"This merchant does not buy unidentified items."};
  const magical=Boolean(foundry.utils.getProperty(item,"system.properties")?.has?.("mgc")||foundry.utils.getProperty(item,"system.properties")?.includes?.("mgc"));
  if(magical&&!rules.acceptMagic)return{ok:false,reason:"This merchant does not buy magical items."};
  if(!magical&&!rules.acceptMundane)return{ok:false,reason:"This merchant does not buy mundane items."};
  return{ok:true,reason:""};
}
