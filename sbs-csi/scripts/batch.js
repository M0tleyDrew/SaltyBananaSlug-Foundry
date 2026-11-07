import {refresh} from './files.js';
import {categories,preflight,importScene} from './engine.js';
export async function runBatch(plans,env,options,{prepare=refresh,onProgress=()=>{}}={}){
  const lines=[],eligible=[];let failed=false,complete=0,skipped=0,failedCount=0,stopped=false;
  // Validate every candidate before starting writes, collecting scene-specific failures.
  for(const p of plans){try{if(p.error)throw Error(p.error);prepare(p);const target=preflight(p.compiled,env,options);env.validate(p.compiled,target,target?options.categories:categories);eligible.push(p);}catch(e){failed=true;skipped++;lines.push(`SKIPPED: ${p.row.name||p.key}`,e.message);}}
  for(let i=0;i<eligible.length;i++){
    const p=eligible[i];onProgress(i+1,eligible.length,p);
    try{const result=await importScene(p.compiled,env,options);complete++;lines.push(`COMPLETE: ${result.scene.name}`,`  ${p.compiled.walls.length} wall/opening segments; ${p.compiled.lights.length} lights; ${p.compiled.keys.length} keys.`,...result.warnings.map(w=>'  Note: '+w));}
    catch(e){failed=true;failedCount++;lines.push(`FAILED: ${p.row.name||p.key}`,e.message);if(e.message.includes('ROLLBACK NEEDS ATTENTION')){stopped=true;lines.push(`Stopped because recovery was incomplete. ${eligible.length-i-1} later scene(s) were not attempted.`);break;}lines.push('Continuing with the remaining scenes.');}
  }
  lines.unshift(`${complete} complete; ${skipped} skipped during validation; ${failedCount} failed during import.`);
  return {lines,failed,complete,skipped,failedCount,stopped};
}
