export const ID='sbs-csi', VERSION='0.1.7', SCHEMA='1';
export const HEADERS={
  Scenes:['scene_id','name','type','image','folder','grid_columns','grid_size','distance','units','show_grid','padding','darkness','global_light','token_vision','fog','background_color'],
  Walls:['scene_id','wall_id','kind','x1','y1','x2','y2','state','direction','sight','light','sound','move','window_range','pick_dc','break_dc','door_sound'],
  Lights:['scene_id','light_id','x','y','bright','dim','color','alpha','angle','rotation','animation','speed','intensity','walls','hidden'],
  Keys:['scene_id','key_id','name','description','doors','consume','image']
};
export const clone=o=>JSON.parse(JSON.stringify(o));
export const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const blank=v=>v===undefined||v===null||v==='';
export function number(v,fallback,label,min=-Infinity,max=Infinity){if(blank(v))return fallback;const n=Number(v);if(!Number.isFinite(n)||n<min||n>max)throw Error(`${label}: expected a number from ${min} to ${max}.`);return n;}
export function bool(v,fallback,label){if(blank(v))return fallback;if(v===true||v===1||String(v).toLowerCase()==='true'||String(v).toLowerCase()==='yes')return true;if(v===false||v===0||String(v).toLowerCase()==='false'||String(v).toLowerCase()==='no')return false;throw Error(`${label}: use TRUE or FALSE.`);}
export function choice(v,values,fallback,label){const s=blank(v)?fallback:String(v).toLowerCase().trim();if(!values.includes(s))throw Error(`${label}: use ${values.join(', ')}.`);return s;}
export function identifier(v,label){const s=String(v??'').trim();if(!/^[a-zA-Z0-9_-]{1,80}$/.test(s))throw Error(`${label}: use 1–80 letters, numbers, underscores or hyphens.`);return s;}
export function assetPath(v){const s=String(v??'').replace(/\\/g,'/');if(!s||s.startsWith('/')||s.includes(':')||s.split('/').some(p=>!p||p==='.'||p==='..'))throw Error(`Invalid relative image path: ${s}`);return s;}
export function imagePath(v){const s=assetPath(v);if(!/\.(webp|png|jpg|jpeg|avif)$/i.test(s))throw Error(`Unsupported image: ${s}. Use WebP, PNG, JPEG or AVIF.`);return s;}
export function rowsFromWorkbook(book,XLSX){
  const meta=XLSX.utils.sheet_to_json(book.Sheets.Metadata??{}, {header:1,defval:''});
  if(String(meta.find(r=>r[0]==='schema_version')?.[1])!==SCHEMA)throw Error('Missing or unsupported CSI schema_version in Metadata. Download the current blank worksheet.');
  const result={};
  for(const [sheet,headers]of Object.entries(HEADERS)){
    if(!book.Sheets[sheet])throw Error(`Missing worksheet: ${sheet}`);
    const matrix=XLSX.utils.sheet_to_json(book.Sheets[sheet],{header:1,defval:''});
    const actual=(matrix[0]??[]).map(String);
    for(const h of headers)if(!actual.includes(h))throw Error(`${sheet}: missing column ${h}.`);
    result[sheet]=matrix.slice(1).filter(r=>r.some(v=>!blank(v))).map((r,i)=>Object.fromEntries([...headers.map(h=>[h,r[actual.indexOf(h)]??'']),['_row',i+2]]));
  }
  return result;
}
export function groupRows(rows){
  const plans=[],seen=new Set();if(!rows.Scenes?.length)throw Error('The Scenes worksheet has no scenes.');
  for(const r of rows.Scenes){const key=identifier(r.scene_id,'scene_id');if(seen.has(key))throw Error(`Duplicate scene_id: ${key}`);seen.add(key);plans.push({key,row:r,walls:[],lights:[],keys:[],warnings:[]});}
  for(const [sheet,prop,id]of [['Walls','walls','wall_id'],['Lights','lights','light_id'],['Keys','keys','key_id']]){
    const seenIds=new Set();for(const r of rows[sheet]??[]){const p=plans.find(p=>p.key===String(r.scene_id));if(!p)throw Error(`${sheet} row ${r._row}: unknown scene_id ${r.scene_id}`);const k=identifier(r[id],`${sheet} ${id}`);const full=p.key+'/'+k;if(seenIds.has(full))throw Error(`Duplicate ${sheet} ID: ${full}`);seenIds.add(full);p[prop].push(r);}
  }return plans;
}
const senses={none:0,limited:10,normal:20,proximity:30,distance:40};
function restriction(v,fallback,label){return senses[choice(v,Object.keys(senses),fallback,label)];}
export function keyLink(scene,key){return `sbs-csi:${scene}:${key}`;}
export function validateOpenings(rows){
  for(const opening of rows.filter(r=>['door','secret','window'].includes(String(r.kind).toLowerCase()))){
    const a=[Number(opening.x1),Number(opening.y1)],v=[Number(opening.x2)-a[0],Number(opening.y2)-a[1]],length=Math.hypot(...v);
    if(!length)continue;
    for(const wall of rows){
      if(wall===opening||!['wall','terrain','invisible',''].includes(String(wall.kind??'').toLowerCase()))continue;
      const p=[Number(wall.x1)-a[0],Number(wall.y1)-a[1]],q=[Number(wall.x2)-a[0],Number(wall.y2)-a[1]];
      const u=[Number(wall.x2)-Number(wall.x1),Number(wall.y2)-Number(wall.y1)],cross=(x,y)=>x[0]*y[1]-x[1]*y[0],den=cross(v,u);
      let blocked=false;
      if(Math.abs(den)>1e-8){const t=cross(p,u)/den,k=cross(p,v)/den;blocked=t>.08&&t<.92&&k>=0&&k<=1;}
      else if(Math.abs(cross(p,v))/length<1){const ts=[p,q].map(x=>(x[0]*v[0]+x[1]*v[1])/(length*length));blocked=Math.min(...ts)<.92&&Math.max(...ts)>.08;}
      if(blocked)throw Error(`${opening.wall_id}: opening is crossed by solid wall ${wall.wall_id}. Split the solid wall at the door/window jambs.`);
    }
  }
}
export function compile(p,dimensions){
  const r=p.row, warnings=[];
  validateOpenings(p.walls??[]);
  const type=choice(r.type,['battle','scenic','custom'],'battle','type');
  const width=number(dimensions.width,undefined,'Image width',1,50000),height=number(dimensions.height,undefined,'Image height',1,50000);
  if(!String(r.name??'').trim())throw Error(`${p.key}: name is required.`);
  const scenic=type==='scenic';
  const columns=number(r.grid_columns,null,'grid_columns',1,1000);
  const sourceGrid=columns?width/columns:number(r.grid_size,100,'grid_size',1,4000);
  if(!scenic&&blank(r.grid_columns)&&blank(r.grid_size))warnings.push('Scale defaults to 100 px/square. Set grid_columns, grid_size, or use preview calibration.');
  const scale=scenic?1:Math.max(1,50/sourceGrid), gridSize=Math.round(sourceGrid*scale);
  const w=Math.round(width*scale),h=Math.round(height*scale);
  if(w>50000||h>50000)throw Error('Scaled image exceeds 50,000 pixels. Reduce grid_columns.');
  const scene={name:String(r.name).trim(),width:w,height:h,padding:number(r.padding,scenic?0:0.25,'padding',0,0.5),
    background:{src:'',offsetX:0,offsetY:0,scaleX:1,scaleY:1,rotation:0},backgroundColor:blank(r.background_color)?'#17251b':String(r.background_color),
    grid:{type:scenic?0:1,color:'#ffffff',size:gridSize,distance:number(r.distance,5,'distance',0.01,100000),units:String(r.units||'ft'),alpha:scenic?0:(bool(r.show_grid,true,'show_grid')?0.35:0)},
    tokenVision:bool(r.token_vision,!scenic,'token_vision'),fog:{exploration:bool(r.fog,!scenic,'fog')},
    environment:{darknessLevel:number(r.darkness,0,'darkness',0,1),globalLight:{enabled:bool(r.global_light,true,'global_light')}}};
  if(!/^#[0-9a-f]{6}$/i.test(scene.backgroundColor))throw Error('background_color: use #RRGGBB.');
  if(scenic&&(p.walls.length||p.lights.length||p.keys.length))throw Error(`${p.key}: scenic scenes must have empty Walls, Lights and Keys rows. Use custom for interactive artwork.`);
  const xy=(x,y,label)=>[number(x,undefined,label+' x',0,width)*w/width,number(y,undefined,label+' y',0,height)*h/height];
  const requiredXY=(x,y,label)=>{if(blank(x)||blank(y))throw Error(`${label}: both coordinates are required.`);return xy(x,y,label);};
  const walls=p.walls.map(r=>{
    const kind=choice(r.kind,['wall','door','secret','window','terrain','invisible'],'wall','kind');
    const a=requiredXY(r.x1,r.y1,r.wall_id),b=requiredXY(r.x2,r.y2,r.wall_id);if(a[0]===b[0]&&a[1]===b[1])throw Error(`${r.wall_id}: wall has zero length.`);
    const door=kind==='door'?1:kind==='secret'?2:0;
    const ds={closed:0,open:1,locked:2}[choice(r.state,['closed','open','locked'],'closed','state')];
    if(!door&&ds!==0)throw Error(`${r.wall_id}: state only applies to doors.`);
    const transparent=kind==='window'||kind==='invisible',terrain=kind==='terrain';
    const data={c:[...a,...b],door,ds,dir:{both:0,left:1,right:2}[choice(r.direction,['both','left','right'],'both','direction')],
      sight:restriction(r.sight,transparent?'none':terrain?'limited':'normal','sight'),
      light:restriction(r.light,transparent?'none':terrain?'limited':'normal','light'),
      sound:restriction(r.sound,kind==='window'?'limited':'normal','sound'),
      move:restriction(r.move,'normal','move'),threshold:{sight:null,light:null,sound:null,attenuation:true},doorSound:String(r.door_sound||''),flags:{[ID]:{key:r.wall_id}}};
    const range=number(r.window_range,null,'window_range',0,100000);
    if(range!==null){if(kind!=='window')throw Error('window_range is only valid for windows.');data.sight=40;data.light=40;data.threshold={sight:range,light:range,attenuation:true};}
    if(door){data.flags.LocknKey={LockableFlag:true,IDKeysFlag:'',LockDCFlag:number(r.pick_dc,15,'pick_dc',-1,1000),LockBreakDCFlag:number(r.break_dc,20,'break_dc',-1,1000)};}
    return {key:r.wall_id,data};
  });
  const keys=p.keys.map(r=>{
    if(!String(r.name??'').trim())throw Error(`${r.key_id}: key name is required.`);
    const doors=String(r.doors??'').split(';').map(s=>s.trim()).filter(Boolean);
    if(!doors.length)throw Error(`${r.key_id}: list at least one door ID in doors.`);
    const link=keyLink(p.key,r.key_id);
    for(const id of doors){const wall=walls.find(w=>w.key===id);if(!wall?.data.door)throw Error(`${r.key_id}: unknown door ${id}.`);const flags=wall.data.flags.LocknKey;flags.IDKeysFlag=[flags.IDKeysFlag,link].filter(Boolean).join(';');}
    return {key:r.key_id,image:blank(r.image)?null:imagePath(r.image),data:{name:String(r.name).trim(),type:'loot',img:'icons/commodities/treasure/key-brass.webp',system:{description:{value:`<p>${esc(r.description||'A key.')}</p>`},quantity:1,weight:{value:0,units:'lb'},price:{value:0,denomination:'gp'}},flags:{[ID]:{scene:p.key,key:r.key_id},LocknKey:{IDKeysFlag:link,RemoveKeyonUseFlag:bool(r.consume,false,'consume')}}}};
  });
  for(const wall of walls)if(wall.data.ds===2&&!wall.data.flags.LocknKey?.IDKeysFlag)warnings.push(`${wall.key}: locked door has no key; GM, lockpicking or force must open it.`);
  const lights=p.lights.map(r=>{
    const [x,y]=requiredXY(r.x,r.y,r.light_id);const color=String(r.color||'#ffcc77');if(!/^#[0-9a-f]{6}$/i.test(color))throw Error(`${r.light_id}: color must use #RRGGBB.`);
    const bright=number(r.bright,0,'bright',0,100000),dim=number(r.dim,20,'dim',0,100000);if(bright>dim)throw Error(`${r.light_id}: dim radius must be at least bright radius.`);
    return {key:r.light_id,data:{x,y,rotation:number(r.rotation,0,'rotation',0,360),walls:bool(r.walls,true,'walls'),hidden:bool(r.hidden,false,'hidden'),config:{bright,dim,color,alpha:number(r.alpha,0.5,'alpha',0,1),angle:number(r.angle,360,'angle',0,360),animation:{type:blank(r.animation)?null:String(r.animation),speed:number(r.speed,5,'speed',1,10),intensity:number(r.intensity,5,'intensity',1,10)}},flags:{[ID]:{key:r.light_id}}}};
  });
  return {key:p.key,type,scene,walls,lights,keys,warnings,folder:String(r.folder||'SBS CSI'),sourceWidth:width,sourceHeight:height};
}
export function offsetElements(compiled,{sceneX=0,sceneY=0}){
  const c=clone(compiled);for(const w of c.walls)w.data.c=w.data.c.map((n,i)=>n+(i%2?sceneY:sceneX));for(const l of c.lights){l.data.x+=sceneX;l.data.y+=sceneY;}return c;
}
export function project(current,template){
  if(template===null||typeof template!=='object')return current??null;
  if(Array.isArray(template))return Array.isArray(current)?current:null;
  return Object.fromEntries(Object.entries(template).map(([k,v])=>[k,project(current?.[k],v)]));
}
export function equal(a,b){if(a===b)return true;if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;const ak=Object.keys(a),bk=Object.keys(b);return ak.length===bk.length&&ak.every(k=>Object.hasOwn(b,k)&&equal(a[k],b[k]));}
export function assertUnchanged(current,baseline,label){if(!baseline||!equal(project(current,baseline),baseline))throw Error(`${label} has been edited since its last CSI import. Keep this category unchecked, or explicitly enable overwrite.`);}
