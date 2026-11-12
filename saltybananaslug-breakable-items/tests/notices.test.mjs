import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ID,VERSION} from '../scripts/core.mjs';
import {noticeContent,maybeShowReleaseNotice,releaseNotesAfter,compareVersions,closeReleaseNotice} from '../scripts/notices.mjs';
let count=0,dialogs,enabled,handler;
function setup({isGM=false,seen,world}={}){
 dialogs=[];enabled=true;handler=null;
 const flags=seen?{[ID]:{seenVersion:seen}}:{};
 const user={id:'u',isGM,flags,getFlag:(ns,key)=>flags[ns]?.[key],setFlag:async(ns,key,value)=>{(flags[ns]??={})[key]=value;}};
 globalThis.game={world:{id:world??`notice-test-${++count}`},user,settings:{get:()=>enabled,set:async(_id,_key,value)=>{enabled=value;}}};
 globalThis.foundry={applications:{api:{DialogV2:{wait:config=>{dialogs.push(config);config.render(null,{element:{querySelector:selector=>selector==='[data-bi-disable-popups]'?{addEventListener:(_event,fn)=>handler=fn}:null},close:()=>{}});return Promise.resolve(null);}}}}};return user;
}
test('first player guide explains player actions and rules',()=>{const text=noticeContent({isGM:false,first:true});assert.match(text,/Player guide/);assert.match(text,/Fix All/);assert.match(text,/Record Use/);assert.doesNotMatch(text,/data-bi-disable-popups/);});
test('GM guide explains setup and exposes the world-wide disable control',()=>{const text=noticeContent({isGM:true,first:true});assert.match(text,/GM guide/);assert.match(text,/Recalculate HP/);assert.match(text,/data-bi-disable-popups/);});
test('numeric version comparison handles two-digit patch versions',()=>{assert.equal(compareVersions('0.1.10','0.1.9'),1);assert.equal(compareVersions('0.2.0','0.2'),0);});
test('update notes contain only newer releases',()=>{const notes=releaseNotesAfter('0.1.2');assert.deepEqual(notes.map(x=>x.version),['0.2.0','0.2.1','0.2.2','0.3.0','0.4.0','0.4.1']);assert.deepEqual(releaseNotesAfter('0.2.0').map(x=>x.version),['0.2.1','0.2.2','0.3.0','0.4.0','0.4.1']);});
test('first popup persists the version on the current user',()=>{const u=setup();const r=maybeShowReleaseNotice();assert.equal(r.shown,true);assert.equal(r.first,true);assert.equal(u.flags[ID].seenVersion,VERSION);assert.equal(dialogs.length,1);});
test('joining again at the same version does not open another popup',()=>{setup({seen:VERSION});assert.equal(maybeShowReleaseNotice().shown,false);assert.equal(dialogs.length,0);});
test('temporarily downgrading does not repeat notices or overwrite a newer acknowledgement',()=>{const user=setup({seen:'9.0.0'});assert.equal(maybeShowReleaseNotice().shown,false);assert.equal(user.flags[ID].seenVersion,'9.0.0');assert.equal(dialogs.length,0);});
test('a new version shows an update once then stays acknowledged',()=>{setup({seen:'0.1.2'});const r=maybeShowReleaseNotice();assert.equal(r.first,false);assert.equal(r.shown,true);assert.match(dialogs[0].window.title,/Updated/);assert.equal(maybeShowReleaseNotice().shown,false);assert.equal(dialogs.length,1);});
test('acknowledgements belong to each user',()=>{setup();maybeShowReleaseNotice();const flags={};game.user={id:'other',isGM:true,flags,getFlag:()=>undefined,setFlag:async(ns,key,value)=>{(flags[ns]??={})[key]=value;}};assert.equal(maybeShowReleaseNotice().shown,true);assert.equal(dialogs.length,2);assert.match(dialogs[1].content,/GM guide/);});
test('world-wide disable suppresses automatic notices',()=>{setup();enabled=false;assert.equal(maybeShowReleaseNotice().shown,false);assert.equal(dialogs.length,0);});
test('GM popup control disables notices for everyone',async()=>{setup({isGM:true});maybeShowReleaseNotice();await handler({target:{checked:true}});assert.equal(enabled,false);game.user={id:'new-player',isGM:false,getFlag:()=>undefined};assert.equal(maybeShowReleaseNotice().shown,false);});
test('Help can be opened manually after acknowledgement or disabling automatic notices',()=>{setup({seen:VERSION});enabled=false;const r=maybeShowReleaseNotice({force:true});assert.equal(r.shown,true);assert.equal(r.first,true);});
test('closing a guide does not clear its saved version',()=>{const user=setup();maybeShowReleaseNotice();closeReleaseNotice();assert.equal(user.flags[ID].seenVersion,VERSION);assert.equal(maybeShowReleaseNotice().shown,false);});
test('manifest and package versions match the notice version and release notes',async()=>{for(const path of ['../module.json','../package.json']){const data=JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));assert.equal(data.version,VERSION);}assert.equal(releaseNotesAfter('0.0.0').at(-1).version,VERSION);});
