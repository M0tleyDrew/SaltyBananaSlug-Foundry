import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, normalize, health, projectQuests, parseLinks, safeURL, esc } from '../scripts/model.mjs';

test('private, unrevealed and GM quests do not leak to another player',()=>{
  const quests=[
    {id:'party',status:'active',title:'Visible',audience:'party',revealed:true,objectives:[{title:'Visible step',revealed:true},{title:'Secret step',revealed:false},{title:'GM step',revealed:true,revealMode:'gm'}]},
    {id:'gm',status:'active',audience:'gm',revealed:true},
    {id:'hidden',status:'active',audience:'party',revealed:false},
    {id:'private',status:'active',audience:'private',revealed:true,ownerId:'other'},
    {id:'own',status:'active',audience:'private',revealed:true,ownerId:'player'},
    {id:'done',status:'completed',audience:'party',revealed:true}
  ];
  const result=projectQuests({quests},{id:'player',isGM:false});
  assert.deepEqual(result.map(q=>q.id),['party','own']);
  assert.deepEqual(result[0].objectives.map(o=>o.title),['Visible step']);
  assert.deepEqual(projectQuests({quests},{id:'player',isGM:false},['private']),[]);
  assert.equal(projectQuests({quests},{isGM:true}).length,5);
});
test('HP privacy modes avoid numbers and owner access remains available',()=>{
  const hp={value:12,max:40,temp:5};
  assert.deepEqual(health(hp,'private',false),{label:'HP private',percent:null});
  assert.equal(health(hp,'private',true).label,'12 / 40 HP · +5 temp');
  assert.deepEqual(health(hp,'state'),{label:'Wounded',percent:null});
  assert.deepEqual(health(hp,'bar'),{label:'Health',percent:30});
  assert.equal(health({value:0,max:0},'exact').percent,0);
});
test('unsafe links, executable URLs and attribute injection are rejected or escaped',()=>{
  for(const url of ['javascript:alert(1)','data:image/svg+xml,<svg>','//tracking.test/image','file:///c:/secret','image" onload="alert(1)']) assert.equal(safeURL(url),'');
  assert.equal(safeURL('worlds/my-world/bg.webp'),'worlds/my-world/bg.webp');
  assert.equal(safeURL('https://example.test/map.png'),'https://example.test/map.png');
  assert.throws(()=>parseLinks('Bad | javascript:alert(1)'));
  assert.throws(()=>parseLinks('Bad | Macro.secret'));
  assert.deepEqual(parseLinks('Rules | JournalEntry.example\nMap | https://example.test/map'),[{label:'Rules',target:'JournalEntry.example'},{label:'Map',target:'https://example.test/map'}]);
  assert.equal(esc('<img onerror="bad">'),'&lt;img onerror=&quot;bad&quot;&gt;');
});
test('normalization bounds panel geometry and keeps defaults independent',()=>{
  const p=normalize({opacity:99,textScale:-2,layout:{party:{x:-200,y:999,w:999,h:-10}}});
  assert.equal(p.opacity,1);assert.equal(p.textScale,.8);
  assert.deepEqual(p.layout.party,{x:0,y:200,w:100,h:12});
  const a=defaults(),b=defaults();a.layout.party.x=44;assert.equal(b.layout.party.x,0);
});
