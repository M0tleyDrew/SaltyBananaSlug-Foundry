import {clone} from './core.js';
export function normalizeOwnership(value){
 const parsed=(typeof value==='string'&&value.trim())?JSON.parse(value):value;
 if(parsed==null||parsed==='')return {default:0};
 if(typeof parsed!=='object'||Array.isArray(parsed))throw Error('Workbook ownership must be an object.');
 const data=clone(parsed);for(const [key,level] of Object.entries(data)){if(['__proto__','constructor','prototype'].includes(key)||!Number.isInteger(level)||level<0||level>3)throw Error('Workbook ownership levels must be 0, 1, 2 or 3.');}
 if(data.default==null)data.default=0;return data;
}
export function ownershipChoices(ownership,users){const data=normalizeOwnership(ownership);return [...users].filter(u=>!u.isGM).map(u=>({id:u.id,name:u.name,level:Object.hasOwn(data,u.id)?data[u.id]:-1}));}
export function applyOwnershipChoices(base,defaultLevel,choices){const data=normalizeOwnership(base);data.default=Number(defaultLevel);for(const {id,level} of choices){const n=Number(level);if(n===-1)delete data[id];else data[id]=n;}return normalizeOwnership(data);}
