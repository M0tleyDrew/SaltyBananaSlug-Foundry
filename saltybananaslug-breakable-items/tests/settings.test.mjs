import test from 'node:test';
import assert from 'node:assert/strict';
import {ID,clone,DEFAULT_PROFILES} from '../scripts/core.mjs';
import {migrateUseProfiles} from '../scripts/settings.mjs';

function setup(profiles,migrated=false){
 const values={profiles:clone(profiles),useProfilesMigrated:migrated},writes=[];
 globalThis.game={settings:{get:(id,key)=>{assert.equal(id,ID);return values[key];},set:async(id,key,value)=>{assert.equal(id,ID);values[key]=value;writes.push(key);}}};
 return {values,writes};
}
test('old default manual profiles migrate once to the new use rules',async()=>{
 const profiles=clone(DEFAULT_PROFILES);for(const key of ['armor','leather','cloth','shield','tool','gear'])profiles[key]={...profiles[key],mode:'manual',usesPerWear:10};
 const {values,writes}=setup(profiles);await migrateUseProfiles();
 for(const key of ['armor','leather','cloth','shield','tool','gear']){assert.equal(values.profiles[key].mode,'use');assert.equal(values.profiles[key].usesPerWear,DEFAULT_PROFILES[key].usesPerWear);}
 assert.equal(values.useProfilesMigrated,true);assert.deepEqual(writes,['profiles','useProfilesMigrated']);
});
test('profile migration preserves custom thresholds and unrelated settings',async()=>{
 const profiles=clone(DEFAULT_PROFILES);profiles.tool={...profiles.tool,mode:'manual',usesPerWear:99,max:37};profiles.weapon.damagePerWear=42;
 const {values}=setup(profiles);await migrateUseProfiles();assert.deepEqual(values.profiles,profiles);assert.equal(values.useProfilesMigrated,true);
});
test('saving a manual profile after the migration is respected on later joins',async()=>{
 const profiles=clone(DEFAULT_PROFILES);profiles.tool={...profiles.tool,mode:'manual',usesPerWear:10};const {values,writes}=setup(profiles,true);await migrateUseProfiles();assert.deepEqual(values.profiles,profiles);assert.deepEqual(writes,[]);
});
