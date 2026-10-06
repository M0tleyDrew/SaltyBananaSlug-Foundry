const adapters=new Map();
export function registerSheetAdapter(adapter) {
  if(!adapter?.id || typeof adapter.match!=='function' || typeof adapter.findHost!=='function')throw Error('Sheet adapter requires id, match and findHost functions');
  adapters.set(adapter.id,adapter);return ()=>adapters.delete(adapter.id);
}
export const biographyTab=actor=>actor.type==='vehicle'?'description':'biography';
export function biographyHost(app,root,actor) {
  if(!root?.querySelector)return null;
  for(const adapter of [...adapters.values()].reverse())if(adapter.match(app,root,actor)){
    const result=adapter.findHost(app,root,actor),host=result?.host ?? result;
    if(host?.insertAdjacentHTML && (root===host || root.contains(host)))return {host,tab:result.tab ?? host.dataset?.tab ?? biographyTab(actor),group:result.group ?? host.dataset?.group ?? 'primary'};
  }
  // Select content panels, excluding navigation links that also use data-tab.
  const tabs=[biographyTab(actor),...(actor.type==='vehicle'?['biography']:['description'])];
  for(const tab of tabs){
    const selector=`.tab[data-tab="${tab}"],section[data-tab="${tab}"],[role="tabpanel"][data-tab="${tab}"]`;
    const host=root.matches?.(selector)?root:root.querySelector(selector);
    if(host)return {host,tab,group:host.dataset?.group ?? 'primary'};
  }
  // Alternative sheets often put the native biography editor in a Notes panel.
  const fields=actor.type==='vehicle'?['system.details.description','system.details.biography.value']:['system.details.biography.value'];
  for(const field of fields){
    const editor=root.querySelector(`[name="${field}"],[data-edit="${field}"]`);
    if(!editor)continue;
    const host=editor.closest('.tab,[role="tabpanel"],section[data-tab],.sheet-body section') ?? editor.parentElement;
    if(host && host!==root && !['INPUT','TEXTAREA','PROSE-MIRROR'].includes(host.tagName))return {host,tab:host.dataset?.tab ?? biographyTab(actor),group:host.dataset?.group ?? 'primary'};
  }
  return null;
}
