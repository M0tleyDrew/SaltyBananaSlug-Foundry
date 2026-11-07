import {catalog,register,sortEntries} from './hub-catalog.js';
import {esc} from './core.js';
import {report} from './reports.js';
import {availableHeight,measuredScale} from './layout.js';
const ID='sbs-csi';
export class SlugHub extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.sidebar.AbstractSidebarTab){
  static tabName='sbs';
  static DEFAULT_OPTIONS={id:'sbs',classes:['sbs-hub-tab'],window:{title:'SaltyBananaSlug Tools'}};
  static PARTS={hub:{template:'modules/sbs-csi/templates/hub.hbs',scrollable:['.sbs-hub-list']}};
  async _prepareContext(options){
    const context=await super._prepareContext(options),pins=game.settings.get(ID,'hubMacros')??[];
    this.entries=sortEntries(catalog(game),game.settings.get(ID,'hubSort'),game.settings.get(ID,'hubOrder')??[]);
    const shortcuts=[...game.macros].filter(m=>m.canExecute&&(pins.includes(m.id)||/\bSBS\b|SaltyBananaSlug/i.test(m.name))).map(m=>({id:m.id,name:m.name,search:m.name.toLowerCase()}));
    return {...context,shortcuts,count:this.entries.length,showVersions:game.settings.get(ID,'hubShowVersions'),entries:this.entries.map(e=>({...e,search:[e.title,e.label,e.id,...e.tools.map(t=>t.label),...e.macros.map(m=>m.name)].join(' ').toLowerCase(),tools:e.tools.map(t=>({id:t.id,label:t.label})),macros:e.macros.map(m=>({id:m.id,name:m.name}))})),isGM:game.user.isGM};
  }
  _onRender(context,options){
    super._onRender(context,options);this.events?.abort();this.events=new AbortController();const signal=this.events.signal,root=this.element;
    root.addEventListener('input',event=>{if(event.target.matches('[data-search]'))this.filter(event.target.value);},{signal});
    root.addEventListener('click',event=>{
      const b=event.target.closest('button');if(!b||!root.contains(b))return;
      if(b.matches('[data-tool]')){event.preventDefault();const tool=this.entries.flatMap(e=>e.tools).find(t=>t.id===b.dataset.tool);if(tool)void this.launch(tool.open);}
      else if(b.matches('[data-macro]')){event.preventDefault();const macro=game.macros.get(b.dataset.macro);if(macro?.canExecute)void this.launch(()=>macro.execute());}
      else if(b.matches('[data-refresh]')){event.preventDefault();this.render({force:true});}
      else if(b.matches('[data-layout]')){event.preventDefault();void this.launch(()=>report('SBS Hub — Layout details',this.layoutReport(),{label:'Layout report',filename:'SBS_Hub_Layout.txt'}));}
      else if(b.matches('[data-pin]')){event.preventDefault();void this.launch(()=>this.chooseShortcuts());}
      else if(b.matches('[data-order]')){event.preventDefault();void this.launch(()=>this.arrange());}
    },{signal});
    this.filter(this.query??'');const input=root.querySelector('[data-search]');if(input)input.value=this.query??'';
    this.watchLayout(root,signal);this.scheduleFit();
  }
  setStyle(element,key,value,priority='important'){
    if(element.style.getPropertyValue(key)!==value||element.style.getPropertyPriority(key)!==priority)element.style.setProperty(key,value,priority);
  }
  releaseDockHosts(){
    for(const [host,saved] of this.dockHosts??[]){
      host.classList.remove('sbs-hub-height-host');
      for(const [key,{value,priority}] of Object.entries(saved)){if(value)host.style.setProperty(key,value,priority);else host.style.removeProperty(key);}
    }
    this.dockHosts=new Map();
  }
  rememberHost(host){
    this.dockHosts??=new Map();if(this.dockHosts.has(host))return;
    const saved={};for(const key of ['height','max-height','min-height','box-sizing','--sbs-hub-available-height'])saved[key]={value:host.style.getPropertyValue(key),priority:host.style.getPropertyPriority(key)};
    this.dockHosts.set(host,saved);host.classList.add('sbs-hub-height-host');
  }
  layoutNodes(){
    const root=this.element,nodes=[root];
    for(let host=root?.parentElement;host&&host!==document.body&&host!==document.documentElement;host=host.parentElement){nodes.push(host);if(host.id==='ui-right')break;}
    const content=root?.querySelector('.sbs-hub-content');
    for(let host=content?.parentElement;host&&host!==root;host=host.parentElement)if(!nodes.includes(host))nodes.push(host);
    return nodes.filter(Boolean);
  }
  watchLayout(root,signal){
    this.resize?.disconnect();this.layoutObserver?.disconnect();
    const nodes=this.layoutNodes();
    if(globalThis.ResizeObserver){this.resize=new ResizeObserver(()=>this.scheduleFit());for(const node of nodes)this.resize.observe(node);}
    if(globalThis.MutationObserver){this.layoutObserver=new MutationObserver(()=>this.scheduleFit());for(const node of nodes)this.layoutObserver.observe(node,{attributes:true,attributeFilter:['style','class']});}
    window.addEventListener('resize',()=>this.scheduleFit(),{signal});
    window.addEventListener('transitionend',()=>this.scheduleFit(),{signal,capture:true});
    window.visualViewport?.addEventListener('resize',()=>this.scheduleFit(),{signal});
  }
  scheduleFit(){
    if(this.hubDockActive===false||this.fitFrame)return;
    this.fitFrame=requestAnimationFrame(()=>{this.fitFrame=null;this.fit();});
  }
  fit(){
    const root=this.element;if(this.hubDockActive===false||!root?.isConnected||!root.getClientRects().length)return;
    const top=root.getBoundingClientRect().top;
    const viewport=Math.min(window.innerHeight,document.documentElement.clientHeight||window.innerHeight);
    if(this.isPopout){
      this.releaseDockHosts();if(root.classList.contains('sbs-hub-docked'))root.classList.remove('sbs-hub-docked');
      const frame=root.parentElement?.closest('.application, .sidebar-popout');
      const bottom=frame?Math.min(viewport,frame.getBoundingClientRect().bottom):viewport;
      const height=availableHeight(root,bottom-8);this.setStyle(root,'height',height);this.setStyle(root,'max-height',height);return;
    }
    if(!root.classList.contains('sbs-hub-docked'))root.classList.add('sbs-hub-docked');
    const height=availableHeight(root,viewport-8);
    this.setStyle(root,'--sbs-hub-available-height',height);this.setStyle(root,'height',height);this.setStyle(root,'max-height',height);
    // Foundry may dock content beside #sidebar rather than inside it. Size the
    // local ancestor chain, including inner frame wrappers, after it is visible.
    // Each height accounts for inherited UI transforms and CSS zoom.
    for(const host of this.layoutNodes().slice(1)){
      // #ui-right is shared with floating chat and other UI; never resize it.
      if(host.id==='ui-right')continue;
      this.rememberHost(host);
      const available=availableHeight(host,viewport-8);
      this.setStyle(host,'--sbs-hub-available-height',available);
      this.setStyle(host,'height',available);this.setStyle(host,'max-height',available);this.setStyle(host,'min-height','0px');this.setStyle(host,'box-sizing','border-box');
    }
  }
  layoutReport(){
    const describe=node=>{const rect=node.getBoundingClientRect(),style=getComputedStyle(node);return {element:node.tagName.toLowerCase()+(node.id?'#'+node.id:''),classes:node.className,top:rect.top,bottom:rect.bottom,height:rect.height,width:rect.width,display:style.display,position:style.position,heightCSS:style.height,maxHeight:style.maxHeight,overflowY:style.overflowY,flex:style.flex,measuredScaleY:measuredScale(node).scaleY,zoom:style.zoom,transform:style.transform};};
    return JSON.stringify({moduleVersion:game.modules.get('sbs-csi')?.version,viewport:{width:window.innerWidth,height:window.innerHeight,clientHeight:document.documentElement.clientHeight,pixelRatio:window.devicePixelRatio},active:this.active,isPopout:this.isPopout,nodes:this.layoutNodes().map(describe)},null,2);
  }
  async _postRender(context,options){await super._postRender(context,options);this.scheduleFit();}
  _onPosition(position){super._onPosition(position);this.scheduleFit();}
  _onDeactivate(options){this.hubDockActive=false;cancelAnimationFrame(this.fitFrame);this.fitFrame=null;for(const timer of this.activationTimers??[])clearTimeout(timer);this.activationTimers=[];this.releaseDockHosts();super._onDeactivate(options);}

  filter(value){this.query=value;const query=value.toLowerCase().trim();let shown=0;for(const row of this.element.querySelectorAll('[data-module]')){row.hidden=!!query&&!row.dataset.search.includes(query);if(!row.hidden)shown++;}for(const row of this.element.querySelectorAll('[data-shortcut]'))row.hidden=!!query&&!row.dataset.search.includes(query);const count=this.element.querySelector('[data-count]');if(count)count.textContent=`${shown} of ${this.entries.length} enabled SBS modules`;const empty=this.element.querySelector('[data-empty]');if(empty)empty.hidden=shown>0;}
  async launch(fn){try{await fn();}catch(e){console.error('SBS Hub',e);ui.notifications.error(e.message);}}
  async chooseShortcuts(){const macros=[...game.macros].filter(m=>m.canExecute).sort((a,b)=>a.name.localeCompare(b.name)),pins=game.settings.get(ID,'hubMacros')??[];const picked=await foundry.applications.api.DialogV2.wait({window:{title:'SBS Hub — Macro shortcuts'},position:{width:550},content:`<div class="sbs-csi"><p>Select existing macros to keep in the slug tab. These choices apply to your user.</p><div class="csi-scroll">${macros.map(m=>`<label><input type="checkbox" value="${esc(m.id)}" ${pins.includes(m.id)?'checked':''}>${esc(m.name)}</label>`).join('')}</div></div>`,buttons:[{action:'save',label:'Save shortcuts',default:true,callback:(_e,_b,d)=>[...d.element.querySelectorAll('input:checked')].map(e=>e.value)},{action:'cancel',label:'Cancel'}]});if(Array.isArray(picked)){await game.settings.set(ID,'hubMacros',picked);this.render({force:true});}}
  async arrange(){
    let entries=[...this.entries];const mode=game.settings.get(ID,'hubSort');
    const result=await foundry.applications.api.DialogV2.wait({window:{title:'SBS Hub — Tool order'},position:{width:600},content:`<div class="sbs-csi"><label>Order<select name="mode"><option value="csi-first" ${mode==='csi-first'?'selected':''}>CSI first, then alphabetical (default)</option><option value="alphabetical" ${mode==='alphabetical'?'selected':''}>Alphabetical</option><option value="custom" ${mode==='custom'?'selected':''}>My custom order</option></select></label><p>Use Up/Down to set a custom order.</p><div class="csi-scroll" data-order-list></div></div>`,render:(_e,d)=>{
      const list=d.element.querySelector('[data-order-list]');const draw=()=>{list.innerHTML=entries.map((e,i)=>`<div class="csi-order-row"><span>${esc(e.label)}</span><button type="button" data-move="${i}" data-dir="-1" ${i===0?'disabled':''}>Up</button><button type="button" data-move="${i}" data-dir="1" ${i===entries.length-1?'disabled':''}>Down</button></div>`).join('');};
      list.addEventListener('click',event=>{const b=event.target.closest('[data-move]');if(!b)return;event.preventDefault();const i=Number(b.dataset.move),j=i+Number(b.dataset.dir);if(j<0||j>=entries.length)return;[entries[i],entries[j]]=[entries[j],entries[i]];d.element.querySelector('[name=mode]').value='custom';draw();});draw();
    },buttons:[{action:'save',label:'Save order',default:true,callback:(_e,_b,d)=>({mode:d.element.querySelector('[name=mode]').value,ids:entries.map(e=>e.id)})},{action:'cancel',label:'Cancel'}]});
    if(result?.ids){await game.settings.set(ID,'hubOrder',result.ids);await game.settings.set(ID,'hubSort',result.mode);this.render({force:true});}
  }
  _onActivate(options){
    this.hubDockActive=true;super._onActivate(options);
    void Promise.resolve(this.render({force:true})).then(()=>this.scheduleFit());
    for(const timer of this.activationTimers??[])clearTimeout(timer);
    this.activationTimers=[0,75,250,600].map(delay=>setTimeout(()=>this.scheduleFit(),delay));
  }
  async _onClose(options){this._onDeactivate(options);this.events?.abort();this.resize?.disconnect();this.layoutObserver?.disconnect();return super._onClose(options);}
}
Hooks.once('init',()=>{
  const refresh=()=>ui.sbs?.render({force:true});
  game.settings.register(ID,'hubMacros',{scope:'client',config:false,type:Array,default:[]});
  game.settings.register(ID,'hubOrder',{scope:'client',config:false,type:Array,default:[]});
  game.settings.register(ID,'hubSort',{name:'SBS hub tool order',hint:'Use Arrange tools in the slug tab to edit a custom order.',scope:'client',config:true,type:String,choices:{'csi-first':'CSI first, then alphabetical','alphabetical':'Alphabetical','custom':'My custom order'},default:'csi-first',onChange:refresh});
  game.settings.register(ID,'hubShowVersions',{name:'Show module versions in SBS hub',scope:'client',config:true,type:Boolean,default:false,onChange:refresh});
  CONFIG.ui.sbs=SlugHub;CONFIG.ui.sidebar.TABS.sbs={icon:'sbs-hub-icon',tooltip:'SaltyBananaSlug Tools',gmOnly:false};
  game.sbsHub={register(entry){register(entry);refresh();},open:()=>{ui.sidebar.changeTab('sbs','primary');ui.sidebar.expand();},refresh};
});
Hooks.once('ready',()=>{Hooks.callAll('sbsHubReady',game.sbsHub);ui.sbs?.render({force:true});});
