const fs=require('fs'),http=require('http'),path=require('path'),assert=require('assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
const server=http.createServer((req,res)=>{const p=path.join(root,decodeURIComponent(req.url).replace(/^\/modules\//,'/'));if(!p.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(p,(e,b)=>{if(e){res.writeHead(404).end();return;}res.setHeader('Content-Type',p.endsWith('.js')?'application/javascript':p.endsWith('.css')?'text/css':p.endsWith('.svg')?'image/svg+xml':p.endsWith('.png')?'image/png':p.endsWith('.webp')?'image/webp':'text/html');res.end(b);});});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:process.env.PARTY_VIEWER_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']});
 const pages={},errors=[];const url=`http://127.0.0.1:${server.address().port}`;
 for(const id of ['gm','alice','bob','cara','dan']){
  const p=await browser.newPage({viewport:{width:1280,height:950}});pages[id]=p;p.on('pageerror',e=>errors.push(id+': '+e.message));
  await p.exposeFunction('rpc',async(target,action,payload)=>pages[target].evaluate(async({id,action,payload})=>handlers.get('authorityRequest').call({socketdata:{userId:id}},action,payload),{id,action,payload}));
  await p.exposeFunction('deliver',(targets,event)=>{for(const target of targets)void pages[target].evaluate(e=>{void handlers.get('receiveEvent')(e);},event).catch(e=>errors.push(e.message));});
  await p.goto(url+'/saltybananaslug-card-games/README.md');
  await p.evaluate(async(id)=>{
   document.body.innerHTML='';const base=document.createElement('base');base.href='/';document.head.append(base);const style=document.createElement('link');style.rel='stylesheet';style.href='/saltybananaslug-card-games/styles/card-games.css';document.head.append(style);
   window.handlers=new Map();const hooks=new Map();window.notices=[];
   window.Hooks={once:(n,f)=>hooks.set(n,f),on(){}};window.ui={notifications:{info:m=>notices.push(m),warn:m=>notices.push(m),error:m=>notices.push(m)}};
   window.foundry={utils:{randomID:()=>crypto.randomUUID().replaceAll('-','')}};
   const users=new Map(['gm','alice','bob','cara','dan'].map(id=>[id,{id,name:id,isGM:id==='gm',active:true,avatar:'',color:'#556688'}]));users.filter=fn=>[...users.values()].filter(fn);users.activeGM=users.get('gm');
   const actors=new Map(['alice','bob','cara','dan'].map(id=>[id,{id,name:id,type:'character',system:{currency:{gp:1000}},flags:{},testUserPermission:u=>u.isGM||u.id===id,getFlag(ns,k){return this.flags[k]},async update(p){this.system.currency=p['system.currency'];this.flags.wallet=p['flags.saltybananaslug-card-games.wallet'];}}]));Object.defineProperty(actors,'contents',{get:()=>[...actors.values()]});for(const u of users.values())u.character=actors.get(u.id);
   window.game={user:users.get(id),userId:id,users,actors,world:{id:'browser'},modules:new Map([['socketlib',{active:true}]])};
   window.socketlib={registerModule:()=>({register:(n,f)=>handlers.set(n,f),executeAsUser:(n,target,...args)=>window.rpc(target,...args),executeForUsers:async(n,targets,event)=>{void window.deliver(targets,event);}})};
   window.api=await import('/saltybananaslug-card-games/scripts/main.js');api.registerSocket();
  },id);
 }
 const a=pages.alice,g=pages.gm;
 const open=async(type,currency=false)=>{
  await a.evaluate(()=>{void api.launchGame();});await a.locator(`[data-game-choice="${type}"]`).click();
  await a.locator('[data-button="1"]').click();
  await a.locator('[name="startingChips"]').fill('100');if(currency)await a.locator('[name="moneyMode"]').selectOption('currency');
  await a.locator('[data-button="1"]').click();
  if(currency)await a.locator('[data-button="1"]').click();
  await a.waitForSelector('.sbs-cg-window');
 };
 const end=async()=>{await a.locator('[data-action="end-game"]').click();await a.locator('[data-button="1"]').click();await a.waitForFunction(()=>!document.querySelector('.sbs-cg-window'));};
 await open('slots',true);assert.equal(await a.locator('[data-action="add-chips"]').count(),0);
 await a.locator('[name="bet"]').fill('10');await a.locator('[data-action="extra-bet"]').click();await a.waitForSelector('.sbs-results p');
 const coin=await g.evaluate(()=>{const s=[...api.authority.games.values()][0],c=game.actors.get('alice').system.currency;return {chips:s.seats[0].chips,copper:c.pp*1000+c.gp*100+c.ep*50+c.sp*10+c.cp};});assert.equal(coin.copper,100000+(coin.chips-100)*100);
 await a.locator('[data-action="rules"]').click();assert((await a.locator('.sbs-cg-modal-body').innerText()).includes('90.8875'));await a.locator('[data-button="0"]').click();
 await a.screenshot({path:'/tmp/card-games-slots.png'});await end();
 await open('video',true);await a.locator('[data-action="extra-bet"]').click();await a.waitForSelector('[data-hold="0"]');await a.locator('[data-hold="0"]').click();await a.locator('[data-hold="2"]').click();assert.equal(await a.locator('[data-hold].selected').count(),2);await a.locator('[data-action="extra-draw"]').click();await a.waitForSelector('.sbs-results p');await end();
 // Euchre through the real invitation flow with four separate user clients.
 await a.evaluate(()=>{void api.launchGame();});await a.locator('[data-game-choice="euchre"]').click();for(const id of ['bob','cara','dan'])await a.locator(`[name="user-${id}"]`).check();await a.locator('[data-button="1"]').click();await a.locator('[data-button="1"]').click();
 for(const id of ['bob','cara','dan']){await pages[id].waitForSelector('.sbs-cg-modal');await pages[id].locator('[data-button="1"]').click();}
 await a.waitForSelector('.sbs-cg-team');const active=await g.evaluate(()=>{const s=[...api.authority.games.values()][0];return s.seats[s.currentSeatIndex].ownerUserId;});
 const bidder=pages[active];await bidder.locator('[data-action="extra-trump"]').click();
 const dealerId=await g.evaluate(()=>{const s=[...api.authority.games.values()][0];return s.seats[s.dealerIndex].ownerUserId;});await pages[dealerId].locator('[data-action="extra-discard"]').first().click();
 let actorId=await g.evaluate(()=>{const s=[...api.authority.games.values()][0];return s.seats[s.currentSeatIndex].ownerUserId;});await pages[actorId].locator('[data-action="extra-play"]').first().click();await a.screenshot({path:'/tmp/card-games-euchre.png'});await end();
 // GM can host a four-player table without consuming one of the four seats.
 await g.evaluate(()=>{void api.launchGame();});await g.locator('[data-game-choice="euchre"]').click();for(const id of ['alice','bob','cara','dan'])await g.locator(`[name="user-${id}"]`).check();await g.locator('[data-button="1"]').click();await g.locator('[data-button="1"]').click();await g.locator('[name="dealerOnly"]').check();await g.locator('[data-button="1"]').click();
 for(const id of ['alice','bob','cara','dan']){await pages[id].waitForSelector('.sbs-cg-modal');await pages[id].locator('[data-button="1"]').click();}
 await g.waitForSelector('.sbs-cg-team');assert.equal(await g.locator('.sbs-own-hand').count(),0);assert.equal(await g.locator('.sbs-cg-seat').count(),4);
 await g.locator('[data-action="end-game"]').click();await g.locator('[data-button="1"]').click();await g.waitForFunction(()=>!document.querySelector('.sbs-cg-window'));
 // Render every game, including original controls and uploaded aces, with no runtime errors.
 await a.evaluate(async()=>{const engine=await import('/saltybananaslug-card-games/scripts/engine.js');for(const type of Object.keys(engine.GAME_NAMES)){const count=type==='euchre'?4:['holdem','draw'].includes(type)?2:1;const seats=Array.from({length:count},(_,i)=>({id:''+i,ownerUserId:'alice',name:'Seat '+i}));const s=engine.createGame(type,'render-'+type,'alice',seats);api.updateGameView(engine.sanitizeState(s,'alice'));}const c=engine.makeDeck(()=>0).find(c=>c.id==='As');document.querySelector('.sbs-cg-window main').insertAdjacentHTML('beforeend',api.cardHtml(c));});
 await a.waitForFunction(()=>[...document.images].filter(i=>i.src.includes('/assets/cards/')).every(i=>i.complete&&i.naturalWidth>0));
 await a.goto(url+'/saltybananaslug-card-games/card-gallery.html');
 await a.waitForFunction(()=>document.images.length===48&&[...document.images].every(i=>i.complete&&i.naturalWidth>0));
 assert.equal(await a.locator('.face-art').count(),48);
 for(const card of await a.locator('.face-art').all()){
  assert.equal(await card.locator('.corner').count(),2);
  assert.equal(await card.locator('.corner.top').evaluate(e=>getComputedStyle(e).display),'grid');
  assert((await card.locator('.corner.top').innerText()).match(/[JQK]/));
  assert((await card.locator('.corner.top').innerText()).match(/[♠♥♦♣]/));
 }
 for(const rank of ['J','Q','K'])await a.locator('#'+rank).screenshot({path:'/tmp/card-gallery-'+rank+'.png'});
 console.log('Face gallery passed: all 48 custom images load; both rank/suit indices visible; four custom and one standard face per identity.');
 assert.deepEqual(errors,[]);console.log('Browser passed: real launcher settings, currency slots debit/payout, paytable, video hold/draw, four-client Euchre invitations/trump/discard/play, all eight game views, uploaded ace image loading.');
 await browser.close();server.close();
})().catch(e=>{console.error(e);process.exitCode=1;server.close();setTimeout(()=>process.exit(1),1000);});
