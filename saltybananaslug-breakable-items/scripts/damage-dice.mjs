import {DEFAULT_RULES,tracked,stateFor,usable,numeric} from './core.mjs';

export const DICE_STEPS=Object.freeze([1,2,4,6,8,10,12,20,100]);
export const DICE_METADATA='sbsBreakableDice';
export const damageDicePenaltyActive=(item,state,rules=DEFAULT_RULES)=>item?.type==='weapon'&&rules.damageDicePenalty!==false&&tracked(item,rules)&&usable(state)&&state.hp*2<=state.max;
export function smallerDie(faces){const n=numeric(faces);return n<=1?1:DICE_STEPS.filter(f=>f<n).at(-1)??1;}

/** Change literal base dice only. Preserve annotations, modifiers, counts and numeric data refs. */
export function stepDiceFormula(formula,data={},depth=0){
 if(typeof formula!=='string'||depth>8)return formula;
 return formula.replace(/\[[^\]]*\]|@[\w.]+|(?<![\w@.])(\d*)[dD](\d+)/g,(token,count,faces)=>{
  if(token.startsWith('['))return token;
  if(token.startsWith('@')){
   const value=token.slice(1).split('.').reduce((o,k)=>o?.[k],data);
   if(typeof value!=='string'||value===token||!/(?:\d|\b)d\d+|\bd\d+/i.test(value))return token;
   return `(${stepDiceFormula(value,data,depth+1)})`;
  }
  return `${count}d${smallerDie(faces)}`;
 });
}

/** D&D5e tags the native weapon's primary damage roll with base:true. */
export function adjustWeaponRollConfig(process,rollConfig,{profiles,durability,rules=DEFAULT_RULES}={}){
 const item=process?.subject?.item;
 if(item?.type!=='weapon'||rollConfig?.base!==true||!Array.isArray(rollConfig.parts)||!rollConfig.parts.length)return false;
 if(['healing','temphp'].includes(rollConfig.options?.type))return false;
 const state=stateFor(item,profiles,durability),active=damageDicePenaltyActive(item,state,rules),mode=String(process.attackMode??'');
 const prior=rollConfig.options?.[DICE_METADATA],current=String(rollConfig.parts[0]);
 const original=prior?.itemUuid===item.uuid&&prior.attackMode===mode&&current===prior.reduced?prior.original:current;
 const reduced=stepDiceFormula(original,rollConfig.data??{});
 rollConfig.parts[0]=active?reduced:original;
 rollConfig.options??={};
 rollConfig.options[DICE_METADATA]={itemUuid:item.uuid,attackMode:mode,original,reduced,applied:active,parts:[original,...rollConfig.parts.slice(1)]};
 return active&&reduced!==original;
}

export function prepareWeaponDamageConfig(process,cfg){
 let changed=false;for(const roll of process?.rolls??[])changed=adjustWeaponRollConfig(process,roll,cfg)||changed;return changed;
}

/** Recheck after the native dialog closes, before evaluation. Never edit the Item's source damage. */
export function finalizeWeaponDamageDice(rolls,process,{profiles,durability,rules=DEFAULT_RULES}={}){
 const item=process?.subject?.item;if(item?.type!=='weapon')return;
 const state=stateFor(item,profiles,durability),active=damageDicePenaltyActive(item,state,rules);
 for(let i=0;i<rolls.length;i++){
  const roll=rolls[i],meta=roll.options?.[DICE_METADATA];
  if(!meta||meta.itemUuid!==item.uuid||!Array.isArray(meta.parts)||meta.applied===active)continue;
  const parts=[active?meta.reduced:meta.original,...meta.parts.slice(1)];
  rolls[i]=new roll.constructor(parts.join(' + '),roll.data,{...roll.options,preprocessed:false,configured:false,[DICE_METADATA]:{...meta,applied:active}});
 }
}

export function weaponDamageSummary(item,state,rules=DEFAULT_RULES){
 if(!damageDicePenaltyActive(item,state,rules))return '';
 const base=item.system?.damage?.base,formula=base?.formula??(base?.number&&base?.denomination?`${base.number}d${base.denomination}${base.bonus?` + ${base.bonus}`:''}`:'');
 return formula?`${formula} → ${stepDiceFormula(formula)}`:'Base damage dice reduced by one step';
}
