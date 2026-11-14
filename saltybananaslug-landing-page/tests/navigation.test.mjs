
import test from 'node:test';
import assert from 'node:assert/strict';
import {fitView,zoomView,dragView} from '../scripts/navigation.mjs';
const viewport={left:10,top:20,width:1200,height:800},screen=[1200,800];
const stage={position:{x:600,y:400},pivot:{x:960,y:540},scale:{x:.5,y:.5}};
test('padded fit encloses the page inside sidebar-constrained view',()=>{
  const rect={x:200,y:100,width:1920,height:1080};
  const bounds={left:90,right:890,top:100,bottom:700};
  const view=fitView(rect,bounds,viewport,screen,stage.position);
  const left=viewport.left+stage.position.x+(rect.x-view.x)*view.scale;
  const top=viewport.top+stage.position.y+(rect.y-view.y)*view.scale;
  assert.ok(left>bounds.left && top>bounds.top);
  assert.ok(left+rect.width*view.scale<bounds.right);
  assert.ok(top+rect.height*view.scale<bounds.bottom);
});
test('cursor zoom preserves the world point below the cursor',()=>{
  const anchor={x:350,y:300},next=zoomView(stage,viewport,screen,anchor,.25);
  const before=stage.pivot.x+(anchor.x-viewport.left-stage.position.x)/stage.scale.x;
  const after=next.x+(anchor.x-viewport.left-stage.position.x)/next.scale;
  assert.equal(before,after);
});
test('drag moves the map the requested screen distance at different zooms',()=>{
  const view=dragView(stage,viewport,screen,100,-40);
  assert.equal((stage.pivot.x-view.x)*stage.scale.x,100);
  assert.equal((stage.pivot.y-view.y)*stage.scale.y,-40);
});
globalThis.Hooks={on(){},once(){}};
globalThis.foundry={applications:{api:{ApplicationV2:class{}}}};
const {LandingDashboard}=await import('../scripts/main.mjs');
test('zoom limit is scoped and restores without overwriting another module change',()=>{
  globalThis.canvas={dimensions:{scale:{min:.5,max:3}}};
  const dashboard=new LandingDashboard();
  dashboard.fittedView=()=>({scale:.2});
  dashboard.ensureZoomLimit();
  assert.equal(canvas.dimensions.scale.min,.05);
  dashboard.restoreZoomLimit();
  assert.equal(canvas.dimensions.scale.min,.5);
  dashboard.ensureZoomLimit();
  canvas.dimensions.scale.min=.01;
  dashboard.restoreZoomLimit();
  assert.equal(canvas.dimensions.scale.min,.01);
});
test('right drag captures the pointer, pans, and releases it',()=>{
  let captured=false,pan;
  globalThis.canvas={ready:true,stage,screenDimensions:screen,pan:value=>{pan=value}};
  const dashboard=new LandingDashboard();
  dashboard.canvasViewport=()=>viewport;
  dashboard.element={setPointerCapture(){captured=true},hasPointerCapture(){return captured},releasePointerCapture(){captured=false},classList:{add(){},remove(){}}};
  const event={button:2,pointerId:4,clientX:100,clientY:100,preventDefault(){},stopPropagation(){}};
  dashboard.startPan(event);
  assert.ok(captured);
  dashboard.movePan({...event,clientX:150});
  assert.equal(pan.x,860);
  dashboard.endPan();
  assert.equal(captured,false);
  assert.equal(dashboard.panGesture,null);
});
