
import test from 'node:test';
import assert from 'node:assert/strict';
import {choosePartyFit} from '../scripts/party-layout.mjs';
test('two party rows stay full-sized when the top region can grow',()=>{
  const fit=choosePartyFit([{columns:4,width:1000,height:340},{columns:8,width:2000,height:170}],1000,400);
  assert.equal(fit.columns,4);
  assert.equal(fit.scale,1);
});
test('tight spaces choose a column arrangement that fits the entire roster',()=>{
  const fit=choosePartyFit([{columns:4,width:1000,height:900},{columns:6,width:1500,height:580},{columns:8,width:2000,height:400}],1000,400);
  assert.equal(fit.columns,6);
  assert.ok(fit.width*fit.scale<=1000);
  assert.ok(fit.height*fit.scale<=400);
});
test('long wrapped names and large text fit without cropping rows',()=>{
  const fit=choosePartyFit([{columns:3,width:800,height:1600},{columns:6,width:1600,height:700}],800,300);
  assert.ok(fit.height*fit.scale<=300);
  assert.ok(fit.width*fit.scale<=800);
});
