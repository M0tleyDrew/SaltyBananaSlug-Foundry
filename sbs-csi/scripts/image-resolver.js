import {imagePath} from './core.js';
const normalize=s=>s.normalize('NFC').toLowerCase().trim();
const basename=s=>s.replaceAll('\\','/').split('/').pop();
const downloadName=s=>normalize(basename(s)).replace(/ \(\d+\)(?=\.[^.]+$)/,'');
export function resolveImage(all,value,prefix=''){
  const path=imagePath(value);
  for(const exact of [prefix+path,path])if(all.has(exact))return {file:all.get(exact),path:exact,renamed:false};
  const entries=[...all].filter(([p])=>/\.(png|jpe?g|webp|avif)$/i.test(p));
  const stages=[entries.filter(([p])=>normalize(p)===normalize(prefix+path)||normalize(p)===normalize(path)),entries.filter(([p])=>normalize(basename(p))===normalize(basename(path))),entries.filter(([p])=>downloadName(p)===downloadName(path))];
  for(const matches of stages){if(matches.length===1)return {file:matches[0][1],path:matches[0][0],renamed:true};if(matches.length>1)throw Error(`Ambiguous image "${path}": ${matches.map(([p])=>p).join(', ')}. Supply the exact relative path or remove duplicate artwork.`);}
  throw Error(`Missing image "${path}". Select the complete scene ZIP, or add its artwork using the separate Images / Folder field. The worksheet contains filenames, not the original map files.`);
}
