import test from 'node:test';
import assert from 'node:assert/strict';
import {faceArt,makeDeck,cardText,FACE_SUBJECTS} from '../scripts/engine.js';
globalThis.Hooks={on(){},once(){}};
const {cardHtml}=await import('../scripts/main.js');
test('all twelve face cards have four distinct custom variants and a fifth standard face in equal-width 20% buckets',()=>{
 for(const rank of ['J','Q','K'])for(const suit of ['s','h','d','c']){
  const options=[];
  for(let i=0;i<5;i++){
   const middle=(i+.5)/5;
   const value=faceArt(rank,suit,()=>middle);
   assert.equal(value,i<4?`faces/${rank}${suit}-${i+1}.webp`:null);options.push(value);
   for(const n of [i/5,(i+1)/5-.000001])assert.equal(faceArt(rank,suit,()=>n),value);
  }
  assert.equal(new Set(options).size,5);assert(FACE_SUBJECTS[rank+suit]);
 }
});
test('custom faces retain exact J/Q/K and suit in BOTH corners, accessible label, and subject tooltip',()=>{
 const symbols={s:'♠',h:'♥',d:'♦',c:'♣'};
 for(const c of makeDeck(()=>0).filter(c=>['J','Q','K'].includes(c.rank))){
  const html=cardHtml(c);
  assert(html.includes('face-art'));assert(html.includes(`aria-label="${c.rank}${symbols[c.suit]}"`));
  assert.equal((html.match(new RegExp(`>${c.rank}<i>${symbols[c.suit]}</i>`,'g'))??[]).length,2);
  assert(html.includes(FACE_SUBJECTS[c.rank+c.suit]));
  assert(html.includes(['h','d'].includes(c.suit)?'face red':'face black'));
 }
});
test('standard branch preserves card identity and the 52-card deck without affecting ace variants or tens',()=>{
 for(const random of [()=>0,()=>.5,()=>.999999]){
  const deck=makeDeck(random);assert.equal(deck.length,52);assert.equal(new Set(deck.map(c=>c.id)).size,52);
  for(const suit of ['s','h','d','c'])assert.equal(deck.filter(c=>c.id==='A'+suit).length,1);
  for(const c of deck.filter(c=>c.rank==='T')){assert.equal(c.value,10);assert(cardText(c).startsWith('10'));assert(cardHtml(c).includes('>10<i>'));}
 }
 for(const c of makeDeck(()=>.99999).filter(c=>['J','Q','K'].includes(c.rank))){assert.equal(c.art,null);assert(!cardHtml(c).includes('face-art'));}
});
