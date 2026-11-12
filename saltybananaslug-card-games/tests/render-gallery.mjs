import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {makeDeck,FACE_SUBJECTS} from '../scripts/engine.js';
globalThis.Hooks={on(){},once(){}};
const {cardHtml}=await import('../scripts/main.js');
const symbols={s:'♠',h:'♥',d:'♦',c:'♣'};
let body='';
for(const rank of ['J','Q','K']){
 body+=`<section id="${rank}"><h2>${{J:'Jacks',Q:'Queens',K:'Kings'}[rank]}</h2>`;
 for(const suit of ['s','h','d','c']){
  body+=`<article><h3>${rank}${symbols[suit]} — ${FACE_SUBJECTS[rank+suit]}</h3><div class="gallery-row">`;
  for(let n=0;n<5;n++){
   const c=makeDeck(()=>(n+.5)/5).find(c=>c.id===rank+suit);
   body+=`<figure>${cardHtml(c).replaceAll('modules/saltybananaslug-card-games/','')}<figcaption>${n<4?`Custom ${n+1}`:'Standard'} · 20%</figcaption></figure>`;
  }
  body+='</div></article>';
 }
 body+='</section>';
}
const html=`<!doctype html><html lang="en"><meta charset="utf-8"><title>SBS Welch/Marl face-card gallery</title><link rel="stylesheet" href="styles/card-games.css"><style>body{margin:0;padding:24px;background:#17231d;color:#fff3d7;font:16px/1.4 system-ui,sans-serif}h1{margin:0}h2{color:#f5cf6b;margin-top:28px}h3{font-size:18px;margin:14px 0 8px}section{max-width:1040px}article{break-inside:avoid}.gallery-row{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:18px}figure{margin:0;text-align:center}.gallery-row .sbs-card{width:100%;height:auto;aspect-ratio:2/3;max-width:180px;border-radius:9px}.gallery-row .sbs-card.custom-art{width:100%;height:auto}.gallery-row .corner{font-size:26px}.gallery-row .corner i{font-size:24px}.gallery-row .face-art>.corner{font-size:26px;padding:5px;min-width:26px}.gallery-row .face-art>.corner i{font-size:24px}figcaption{font-size:13px;margin-top:5px;color:#ddcc9e}.gallery-row .sbs-card>b{font-size:65px}@media(max-width:700px){body{padding:12px}.gallery-row{gap:6px}.gallery-row .corner,.gallery-row .face-art>.corner{font-size:16px;padding:2px;min-width:14px}.gallery-row .corner i,.gallery-row .face-art>.corner i{font-size:15px}figcaption{font-size:10px}}</style><h1>Welch/Marl face cards</h1><p>Four custom versions + one standard version for every face card. Each option: 20%. Rank and suit stay unchanged.</p>${body}</html>`;
await writeFile(fileURLToPath(new URL('../card-gallery.html',import.meta.url)),html);
console.log('Built 60-card gallery: 48 custom faces and 12 standard faces.');
