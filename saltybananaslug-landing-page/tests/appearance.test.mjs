
import test from 'node:test';
import assert from 'node:assert/strict';
import {normalize,normalizeAppearance,panelStyle,defaults} from '../scripts/model.mjs';
test('legacy presets keep their opacity while receiving per-section styles',()=>{
  const p=normalize({opacity:.7});
  assert.equal(p.opacity,.7);
  assert.equal(p.layoutMode,'artwork');
  assert.equal(p.appearance.party.opacity,-1);
  assert.match(panelStyle(p,'party'),/--lp-panel-alpha:0.7/);
});
test('transparent backgrounds and independent colors and sizes survive saving',()=>{
  const p=normalize({opacity:0,appearance:{party:{body:'#123456',heading:'#abcdef',accent:'#fedcba',size:24,headingSize:30,opacity:.2}}});
  assert.match(panelStyle(p,'party'),/--lp-body:#123456/);
  assert.match(panelStyle(p,'party'),/--lp-panel-alpha:0.2/);
  assert.match(panelStyle(p,'links'),/--lp-panel-alpha:0/);
  assert.equal(normalize(p).appearance.party.size,24);
  assert.equal(defaults().opacity,.25);
});
test('appearance rejects injected CSS and bounds extreme text sizes',()=>{
  const a=normalizeAppearance({body:'red;background:url(x)',size:900,headingSize:-2});
  assert.equal(a.body,'#f4efe3');
  assert.equal(a.size,32);
  assert.equal(a.headingSize,12);
});
