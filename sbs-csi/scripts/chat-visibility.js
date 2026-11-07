const ID='sbs-csi';
export function hideFloatingChat({isGM,personal=true,playerPolicy='hide'}){
  if(isGM||playerPolicy==='personal')return personal;
  return playerPolicy==='hide';
}
export function syncChatVisibility(){
  if(!globalThis.game?.user||!globalThis.document?.body)return;
  const hide=hideFloatingChat({isGM:game.user.isGM,personal:game.settings.get(ID,'hideFloatingChatInput'),playerPolicy:game.settings.get(ID,'playerFloatingChatInput')});
  const tab=ui.sidebar?.tabGroups?.primary??ui.sidebar?.activeTab;
  const chatVisible=tab==='chat'&&ui.sidebar?.expanded!==false;
  document.body.classList.toggle('sbs-hide-floating-chat',hide&&!chatVisible);
}
let frame;
function schedule(){if(frame)return;frame=requestAnimationFrame(()=>{frame=null;syncChatVisibility();});}
Hooks.once('init',()=>{
  game.settings.register(ID,'hideFloatingChatInput',{name:'Hide my floating chat input outside Chat',hint:'Keeps the separate chat input hidden while another sidebar tab is open or the sidebar is collapsed. Chat remains usable in its own tab or a chat popout. The GM can override this preference for players.',scope:'client',config:true,type:Boolean,default:true,onChange:schedule});
  game.settings.register(ID,'playerFloatingChatInput',{name:'Player floating chat input',hint:'GM setting applied on every player client. Controls only the separate input outside Chat; the Chat tab and chat popouts keep their input.',scope:'world',config:true,type:String,choices:{hide:'Hide outside Chat',show:'Show (Foundry default)',personal:'Let each player choose'},default:'hide',onChange:schedule});
});
// renderChatInput is Foundry v13's public notification when its canonical input
// moves between the Chat tab, a chat popout, and the notification overlay.
for(const hook of ['ready','renderChatInput','changeSidebarTab','collapseSidebar','toggleSidebar','renderSidebar','renderChatLog','closeChatLog'])Hooks.on(hook,schedule);
Hooks.on('updateUser',user=>{if(user.id===game.user?.id)schedule();});
