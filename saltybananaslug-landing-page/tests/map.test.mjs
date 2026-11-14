
import test from 'node:test';
import assert from 'node:assert/strict';
import {mapPlacement} from '../scripts/model.mjs';
test('scene alignment preserves aspect and follows pivot and zoom',()=>{
  const rect={x:100,y:50,width:1920,height:1080};
  const stage={position:{x:800,y:450},pivot:{x:1060,y:590},scale:{x:.5,y:.5}};
  const viewport={left:0,top:0,width:1600,height:900};
  const a=mapPlacement(rect,stage,viewport,[1600,900]);
  assert.equal(a.transform,'translate(320px,180px) scale(0.6666666666666666,0.6666666666666666)');
  stage.pivot.x+=100;
  assert.match(mapPlacement(rect,stage,viewport,[1600,900]).transform,/translate\(270px,180px\)/);
  stage.scale={x:1,y:1};
  const wide=mapPlacement({...rect,height:400},stage,viewport,[1600,900]);
  assert.equal(parseFloat(wide.width)/parseFloat(wide.height),1920/400);
});
