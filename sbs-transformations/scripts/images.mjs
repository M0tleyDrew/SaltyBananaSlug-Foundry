// Token artwork only. Never writes Actor.img. Includes distinct dynamic-ring subjects.
export const placedTokens=a=>{
 if(a.isToken)return[a.token?.document??a.token].filter(Boolean);
 const all=game.scenes.contents.flatMap(s=>s.tokens.contents.filter(t=>(t.actorLink||t.isLinked)&&t.actorId===a.id));
 const active=typeof a.getActiveTokens==='function'?a.getActiveTokens(true,true).map(t=>t.document??t):[];
 return[...new Map([...all,...active].filter(t=>t?.uuid).map(t=>[t.uuid,t])).values()];
};
const ringSubject=t=>{const s=t?._source?.ring?.subject;return s&&Object.hasOwn(s,'texture')?s.texture:t?.ring?.subject?.texture??null;};
export const snapshot=t=>({src:t?.texture?.src??null,ringSubject:ringSubject(t),randomImg:t?.randomImg??false});
const patch=(t,src)=>({'texture.src':src,...(t?.ring?{'ring.subject.texture':src}:{})});
export function capture(a){return{prototype:snapshot(a.prototypeToken),tokens:placedTokens(a).map(t=>({uuid:t.uuid,...snapshot(t)}))};}
export async function applyImage(a,src){
 if(!src)return;
 if(!a.isToken){const p=patch(a.prototypeToken,src);await a.update(Object.fromEntries(Object.entries(p).map(([k,v])=>['prototypeToken.'+k,v]).concat([['prototypeToken.randomImg',false]])),{sbsTransformations:true});}
 for(const t of placedTokens(a))await t.update(patch(t,src),{sbsTransformations:true});
}
export async function restoreImages(a,backup){
 if(!backup)return;
 const original=backup.prototype;
 if(original?.src&&!a.isToken){const p={'prototypeToken.texture.src':original.src,'prototypeToken.randomImg':original.randomImg??false};if(a.prototypeToken?.ring)p['prototypeToken.ring.subject.texture']=original.ringSubject??null;await a.update(p,{sbsTransformations:true});}
 for(const saved of backup.tokens??[]){const t=await fromUuid(saved.uuid);if(t){const p={'texture.src':saved.src};if(t.ring)p['ring.subject.texture']=saved.ringSubject??null;await t.update(p,{sbsTransformations:true});}}
}
export function oldBackup(old){if(!old)return null;return{prototype:{src:old.prototype,ringSubject:old.prototypeRingSubject??null,randomImg:old.prototypeRandomImg??false},tokens:(old.tokens??[]).map(t=>({uuid:t.uuid,src:t.src,ringSubject:t.ringSubject??null,randomImg:false}))};}
