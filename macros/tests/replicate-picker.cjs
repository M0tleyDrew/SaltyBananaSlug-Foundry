// DOM regression checks: npm install jsdom, then node macros/tests/replicate-picker.cjs
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {JSDOM}=require('jsdom');
const source=fs.readFileSync(path.join(__dirname,'../character/replicate-magic-item.js'),'utf8');
const render=source.slice(source.indexOf('  function enhancePickers('),source.indexOf('  const pick = async'));
const dom=new JSDOM(`<form><select name="uuid"><option value="bag">Bag of Holding — Long source / 2024</option><option value="boots">Boots of Elvenkind</option><option value="cloak">Cloak of Elvenkind</option></select><button>Continue</button></form>`,{runScripts:'outside-only'});
const w=dom.window,form=w.document.querySelector('form');
const enhance=w.eval(`(${render.trim()})`);
enhance(null,{element:form});enhance(null,{element:form});
assert.equal(form.querySelectorAll('.sbs-replication-picker').length,1);
assert(form.querySelector('select').disabled);assert(form.querySelector('select').hidden);
assert.equal(form.querySelector('label').style.minHeight,'48px');
assert.equal(form.querySelector('label span').style.whiteSpace,'normal');
const value=()=>new w.FormData(form).get('uuid');assert.equal(value(),'bag');
const search=form.querySelector('[type=search]');
const filter=text=>{search.value=text;search.dispatchEvent(new w.Event('input',{bubbles:true}));};
filter('boots');assert.equal([...form.querySelectorAll('label')].filter(l=>!l.hidden).length,1);assert.equal(value(),'boots');
filter('no match');assert.equal(value(),null);assert.equal(form.querySelector('.sbs-replication-picker p').hidden,false);
filter('');form.querySelector('input[value=cloak]').click();assert.equal(value(),'cloak');assert.equal(new w.FormData(form).getAll('uuid').length,1);
// Independent select fields keep distinct values when converted into radio rows.
const extra=w.document.createElement('select');extra.name='mode';extra.innerHTML='<option value="create">Create</option><option value="drain">Drain</option>';form.append(extra);enhance(null,{element:form});
assert.equal(value(),'cloak');assert.equal(new w.FormData(form).get('mode'),'create');
dom.window.close();console.log('PASS: searchable radio rows; explicit sizing/wrapping styles; filtering; empty results; click selection; correct FormData; independent fields; rerender idempotence.');
