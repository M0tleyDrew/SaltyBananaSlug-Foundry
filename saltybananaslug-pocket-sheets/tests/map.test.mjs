import test from 'node:test';
import assert from 'node:assert/strict';
import { findMapToken, mapCamera, mapTokenAt } from '../scripts/pocket-map.js';

const token = (id, extra = {}) => ({id, actor: {id: 'bard'}, isOwner: true, document: {hidden: false}, visible: true, ...extra});
test('only the assigned, owned, visible token is selected', () => {
  const c = {tokens: {placeables: [
    token('other', {actor: {id: 'fighter'}}),
    token('hidden', {document: {hidden: true}}),
    token('unowned', {isOwner: false}),
    token('not-visible', {visible: false}),
    token('valid')
  ]}};
  assert.equal(findMapToken(c, 'bard').id, 'valid');
  assert.equal(findMapToken(c, 'missing'), null);
  assert.equal(findMapToken(null, 'bard'), null);
});
test('select controlled copy initially, then follow the same token', () => {
  const c = {tokens: {placeables: [token('first'), token('second', {controlled: true})]}};
  assert.equal(findMapToken(c, 'bard').id, 'second');
  assert.equal(findMapToken(c, 'bard', 'first').id, 'first');
  c.tokens.placeables[0].document.hidden = true;
  assert.equal(findMapToken(c, 'bard', 'first').id, 'second');
});
test('camera puts the token in the map slot center at different zooms and sizes', () => {
  const center = {x: 1200, y: 800};
  for (const screen of [{width: 390, height: 844}, {width: 844, height: 390}]) {
    const viewport = {left: 0, top: 172, width: screen.width, height: screen.height - 230};
    for (const scale of [0.2, 0.8, 1, 3]) {
      const camera = mapCamera(center, viewport, screen, scale);
      assert.ok(Math.abs((center.x - camera.x) * scale + screen.width / 2 - (viewport.left + viewport.width / 2)) < 1e-8);
      assert.ok(Math.abs((center.y - camera.y) * scale + screen.height / 2 - (viewport.top + viewport.height / 2)) < 1e-8);
    }
  }
});

test('map tap hits only visible tokens and chooses the top token at overlaps', () => {
  const visible = {id:'visible',x:10,y:20,w:50,h:50,zIndex:1,visible:true,document:{hidden:false}};
  const hidden = {...visible,id:'hidden',zIndex:5,document:{hidden:true}};
  const unseen = {...visible,id:'unseen',zIndex:6,visible:false};
  const top = {...visible,id:'top',zIndex:2};
  const c = {tokens:{placeables:[visible,top,hidden,unseen]}};
  assert.equal(mapTokenAt(c,{x:25,y:35}).id,'top');
  assert.equal(mapTokenAt(c,{x:200,y:35}),null);
  assert.equal(mapTokenAt({tokens:{placeables:[hidden,unseen]}},{x:25,y:35}),null);
});
