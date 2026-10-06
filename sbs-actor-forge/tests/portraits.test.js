import {test} from 'node:test';import assert from 'node:assert/strict';
import {pickPortrait} from '../scripts/portraits.js';
test('native portrait picker starts at the current path and its selection updates the preview input',async()=>{
  let options,browsed=false,event;const input={value:'old.svg',dispatchEvent:e=>event=e};
  class Picker{constructor(o){options=o;}async browse(){browsed=true;options.callback('assets/test-portrait.webp');}}
  await pickPortrait(input,Picker);assert.equal(options.type,'image');assert.equal(options.current,'old.svg');assert.ok(browsed);
  assert.equal(input.value,'assets/test-portrait.webp');assert.equal(event.type,'change');assert.equal(event.bubbles,true);
});
