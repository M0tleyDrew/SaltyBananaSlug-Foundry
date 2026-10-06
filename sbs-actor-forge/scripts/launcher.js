import {ID} from './core.js';
export const LAUNCHER_NAME='SaltyBananaSlug’s Actor Forge';
export const LAUNCHER_ICON=`modules/${ID}/assets/forge.svg`;
export const LAUNCHER_COMMAND=`const forge = game.modules.get("${ID}");\nif (!forge?.active || !forge.api) ui.notifications.error("Enable SaltyBananaSlug’s Actor Forge first.");\nelse await forge.api.open();`;
export function findLauncher(macros){const all=[...macros];return all.find(m=>m.flags?.[ID]?.launcher===true)??all.find(m=>m.type==='script'&&m.command===LAUNCHER_COMMAND)??all.find(m=>m.type==='script'&&['Actor Forge',LAUNCHER_NAME,"SaltyBananaSlug's Actor Forge"].includes(m.name)&&m.command?.includes(ID)&&(/\.api\??\.open|\.api\.open|forge\.api\.open/.test(m.command)));}
export async function ensureLauncher(game,Macro){
 if(!game.user?.isGM)return null;
 if(game.users.activeGM&&game.users.activeGM.id!==game.user.id)return null;
 const existing=findLauncher(game.macros);
 if(existing){const patch={};if(existing.img!==LAUNCHER_ICON)patch.img=LAUNCHER_ICON;if(existing.flags?.[ID]?.launcher!==true)patch[`flags.${ID}.launcher`]=true;if(Object.keys(patch).length)await existing.update(patch);return existing;}
 return (Macro.implementation??Macro).create({name:LAUNCHER_NAME,type:'script',img:LAUNCHER_ICON,command:LAUNCHER_COMMAND,flags:{[ID]:{launcher:true}},ownership:{default:0}},{});
}
export function addSettingsLauncher(app,html,game,open,document){
 if(!game.user?.isGM)return;
 const root=html?.querySelector?html:html?.[0]?.querySelector?html[0]:app.element?.querySelector?app.element:app.element?.[0];
 if(!root?.querySelector||root.querySelector('[data-sbs-actor-forge-launcher]'))return;
 const anchor=root.querySelector('[data-action="configure"]')??root.querySelector('[data-action="configureSettings"]')??root.querySelector('button[data-action]');
 if(!anchor)return;
 const button=document.createElement('button');button.type='button';button.dataset.sbsActorForgeLauncher='true';button.className='sbs-forge-settings-button';
 const icon=document.createElement('img');icon.src=LAUNCHER_ICON;icon.alt='';button.append(icon,document.createTextNode('Open Actor Forge'));
 button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();void open();});anchor.after(button);
}
