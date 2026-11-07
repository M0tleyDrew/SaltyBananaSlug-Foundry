import test from 'node:test';
import assert from 'node:assert/strict';
import {heightInLayoutPixels} from '../scripts/layout.js';
test('reported .75 UI transform needs 920 CSS pixels for 690 screen pixels',()=>{assert.equal(heightInLayoutPixels(698-8,690,517.5),920);});
test('height conversion works across smaller and larger UI scales',()=>{for(const scale of [.5,.75,.9,1,1.25,1.5])assert.ok(Math.abs(heightInLayoutPixels(690,800,800*scale)*scale-690)<1e-8);});
test('empty/hidden measurement falls back safely and height stays nonnegative',()=>{assert.equal(heightInLayoutPixels(690,0,0),690);assert.equal(heightInLayoutPixels(-40,400,300),0);});
