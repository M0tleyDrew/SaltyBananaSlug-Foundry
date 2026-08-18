import {MODULE_ID, MODULE_TITLE} from "./constants.js";
import {applyAppearance, setContainerLocked, ensureContainerShell, forkDuplicatedContainer} from "./container-service.js";
import {getContainerData, isContainer} from "./utils.js";
import {isLocked, lockAvailable, lockDebug, registerLockTypeHooks, syncLockMirror} from "./lock.js";
import {renameJournalForContainer, syncJournal} from "./journal.js";
import {setupSocket} from "./socket.js";
import {ContainerWizard} from "./apps/wizard.js";
import {ContainerManager} from "./apps/manager.js";
import {handleContainerLockChanged, openContainer} from "./apps/container-sheet.js";

Hooks.once("init", () => {
  console.log(`${MODULE_TITLE} | Initializing`);
  registerLockTypeHooks();
  game.settings.register(MODULE_ID,"allowPlayerCreation",{name:"Allow Player Container Creation",hint:"Players may create simple unlocked containers at the center of their current scene view. GM container creation is always available.",scope:"world",config:true,type:Boolean,default:false});
  game.settings.register(MODULE_ID,"doubleClickOpen",{name:"Double-click Opens Containers",hint:"Double-click an SBS container token to open/interact with it.",scope:"world",config:true,type:Boolean,default:true});
  game.settings.register(MODULE_ID,"allowPlayerCurrencySplit",{name:"Allow Players to Split Container Currency",hint:"Players with withdrawal permission may split all container currency evenly among active non-GM users who have assigned characters. GMs can always split.",scope:"world",config:true,type:Boolean,default:true});
});

Hooks.once("ready", () => {
  setupSocket();
  if (!game.modules.get("LocknKey")?.active) ui.notifications.error(`${MODULE_TITLE} requires Lock & Key 5.0.5 or newer.`);
  else if (!lockAvailable()) ui.notifications.warn(`${MODULE_TITLE}: Lock & Key is active, but its API was not available. Lock features may not work until reload.`);

  game.sbsContainers = {
    create: () => new ContainerWizard().render(true),
    manager: () => new ContainerManager().render(true),
    open: token => openContainer(token?.document ?? token ?? canvas.tokens.controlled[0]?.document),
    edit: token => new ContainerWizard(token?.document ?? token ?? canvas.tokens.controlled[0]?.document).render(true),
    debugLock: token => lockDebug(token?.document ?? token ?? canvas.tokens.controlled[0]?.document),
    lock: token => setContainerLocked(token?.document ?? token ?? canvas.tokens.controlled[0]?.document, true, {user:game.user}),
    unlock: token => setContainerLocked(token?.document ?? token ?? canvas.tokens.controlled[0]?.document, false, {user:game.user}),
    toggleLock: token => { const doc=token?.document ?? token ?? canvas.tokens.controlled[0]?.document; return setContainerLocked(doc, !isLocked(doc), {user:game.user}); },
    harden: () => game.user.isGM ? hardenExistingContainers() : Promise.reject(new Error("GM only.")),
    version: game.modules.get(MODULE_ID)?.version
  };
  installLockKeyOpenBridge();
  installDoubleClick();
  if (game.user.isGM) {
    ensureLauncherMacros().catch(err=>console.warn(`${MODULE_ID} | Could not create launcher macros`,err));
    // Repair/migrate every SBS token to a valid GM-only shell Actor. The real
    // inventory remains on its separate private Actor. This repairs v0.1.7
    // actorless tokens and older inventory-linked tokens without touching loot.
    hardenExistingContainers().catch(err=>console.error(`${MODULE_ID} | Container shell migration failed`,err));
  }
});

Hooks.on("getSceneControlButtons", controls => {
  const tokenTools = controls.tokens?.tools;
  if (!tokenTools) return;
  tokenTools.sbsContainerCreate = {
    name:"sbsContainerCreate", title: game.user.isGM ? "Create SBS Container" : "Create Personal Container", icon:"fa-solid fa-box-open",
    order:Object.keys(tokenTools).length, button:true,
    visible: game.user.isGM || game.settings.get(MODULE_ID,"allowPlayerCreation"),
    onChange:()=>new ContainerWizard().render(true)
  };
  if (game.user.isGM) tokenTools.sbsContainerManager = {
    name:"sbsContainerManager", title:"SBS Container Manager", icon:"fa-solid fa-boxes-stacked",
    order:Object.keys(tokenTools).length+1, button:true, visible:true,
    onChange:()=>new ContainerManager().render(true)
  };
});

Hooks.on("updateToken", async (tokenDoc, changes) => {
  if (!isContainer(tokenDoc)) return;
  try {
    const lockChanged = foundry.utils.hasProperty(changes,"flags.LocknKey") || Object.keys(changes ?? {}).some(k=>k.startsWith("flags.LocknKey"));
    if (lockChanged && game.user.isGM) await syncLockMirror(tokenDoc);
    if (lockChanged) await handleContainerLockChanged(tokenDoc);
    // Player clients only need to close/redact a stale window. All document
    // mutations and journal/image synchronization are performed by the GM.
    if (!game.user.isGM) return;
    if (lockChanged && isLocked(tokenDoc)) {
      const data = getContainerData(tokenDoc);
      if (data?.state === "open") {
        const next = foundry.utils.deepClone(data);
        next.state = "closed";
        await tokenDoc.setFlag(MODULE_ID, "container", next);
      }
    }
    if (lockChanged || foundry.utils.hasProperty(changes,`flags.${MODULE_ID}.container.state`)) await applyAppearance(tokenDoc);
    if (Object.prototype.hasOwnProperty.call(changes,"name")) await renameJournalForContainer(tokenDoc);
    if (lockChanged || foundry.utils.hasProperty(changes,`flags.${MODULE_ID}`) || Object.prototype.hasOwnProperty.call(changes,"name")) await syncJournal(tokenDoc);
  } catch(err) { console.warn(`${MODULE_ID} | Post-update sync failed`,err); }
});

async function syncInventoryActor(actor) {
  if (!game.user.isGM || !actor?.getFlag?.(MODULE_ID,"isInventory")) return;
  const ref = actor.getFlag(MODULE_ID,"tokenRef");
  const token = game.scenes.get(ref?.sceneId)?.tokens.get(ref?.tokenId);
  if (token && isContainer(token)) await syncJournal(token);
}
Hooks.on("updateActor", actor => syncInventoryActor(actor).catch(err=>console.warn(`${MODULE_ID} | inventory journal sync failed`,err)));
Hooks.on("createItem", item => syncInventoryActor(item.parent).catch(err=>console.warn(`${MODULE_ID} | item journal sync failed`,err)));
Hooks.on("updateItem", item => syncInventoryActor(item.parent).catch(err=>console.warn(`${MODULE_ID} | item journal sync failed`,err)));
Hooks.on("deleteItem", item => syncInventoryActor(item.parent).catch(err=>console.warn(`${MODULE_ID} | item journal sync failed`,err)));

Hooks.on("updateScene", async (scene, changes) => {
  if (!game.user.isGM || !Object.prototype.hasOwnProperty.call(changes,"name")) return;
  for (const token of scene.tokens) {
    if (!isContainer(token)) continue;
    try { await renameJournalForContainer(token); await syncJournal(token); }
    catch (err) { console.warn(`${MODULE_ID} | scene rename journal sync failed`,err); }
  }
});

Hooks.on("createToken", async tokenDoc => {
  if (!game.user.isGM || !isContainer(tokenDoc)) return;
  // Copy/paste safety: a pasted container must never share another token's inventory.
  setTimeout(()=>forkDuplicatedContainer(tokenDoc).catch(err=>console.error(`${MODULE_ID} | duplicate fork failed`,err)),100);
});

Hooks.on("deleteToken", async tokenDoc => {
  const data=getContainerData(tokenDoc); if(!data||!game.user.isGM)return;
  const actor=game.actors.get(data.inventoryActorId);
  if(actor) await actor.setFlag(MODULE_ID,"orphanedFrom",{sceneId:tokenDoc.parent?.id,sceneName:tokenDoc.parent?.name,tokenName:tokenDoc.name,deletedAt:new Date().toISOString()});
  ui.notifications.info(`${tokenDoc.name}'s inventory Actor and journal were preserved for recovery.`);
});

async function ensureLauncherMacros() {
  let folder=game.folders?.find(f=>f.type==="Macro" && f.name==="SBS Containers") ?? null;
  if(!folder) folder=await Folder.create({name:"SBS Containers",type:"Macro"});
  const defs=[
    {flag:"maker",name:"SBS Container Maker",command:"game.sbsContainers.create();",img:`modules/${MODULE_ID}/assets/logo.png`},
    {flag:"manager",name:"SBS Container Manager",command:"game.sbsContainers.manager();",img:`modules/${MODULE_ID}/assets/logo.png`}
  ];
  for(const def of defs){
    const existing=game.macros?.find(m=>m.getFlag?.(MODULE_ID,"launcher")===def.flag);
    if(existing){
      const update={};
      if(existing.command!==def.command) update.command=def.command;
      if(existing.name!==def.name) update.name=def.name;
      if(existing.img!==def.img) update.img=def.img;
      if(Object.keys(update).length) await existing.update(update);
      continue;
    }
    await Macro.create({name:def.name,type:"script",command:def.command,img:def.img,folder:folder?.id,flags:{[MODULE_ID]:{launcher:def.flag}}});
  }
}

function installLockKeyOpenBridge() {
  // Lock & Key has an additional canvas path for non-owned tokens that
  // invokes TokendblClick directly. We participate only for players. Its own
  // LockManager listener is registered first; a locked token stops normal
  // Hooks.call before reaching us, while its callAll fallback still reaches us
  // but is rejected by our strict lock check below.
  Hooks.on("LocknKey.TokendblClick", (tokenDoc) => {
    if (!isContainer(tokenDoc) || game.user.isGM) return true;
    if (isLocked(tokenDoc)) return false;
    openContainer(tokenDoc).catch(err=>console.error(`${MODULE_ID} | Lock & Key player-open bridge failed`,err));
    // SBS owns the UI for an allowed container; do not continue into a native
    // Actor sheet even if another wrapper/path exists.
    return false;
  });
}

async function hardenExistingContainers() {
  let repaired = 0;
  for (const scene of game.scenes ?? []) {
    for (const tokenDoc of scene.tokens ?? []) {
      if (!isContainer(tokenDoc)) continue;
      const data = getContainerData(tokenDoc);
      const actor = game.actors.get(data?.inventoryActorId);
      if (actor) {
        const desired = {default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE};
        const hasExtraOwnership = Object.keys(actor.ownership ?? {}).some(k => k !== "default") || Number(actor.ownership?.default) !== CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE;
        if (hasExtraOwnership) await actor.update({ownership: desired});
      }
      const beforeActorId = tokenDoc.actorId;
      const shell = await ensureContainerShell(tokenDoc, data);
      if (shell && beforeActorId !== shell.id) repaired++;
      await syncLockMirror(tokenDoc);
    }
  }
  if (repaired) console.log(`${MODULE_TITLE} | Repaired ${repaired} container token(s) with GM-only shell Actors.`);
}

function installDoubleClick(){
  if(!game.settings.get(MODULE_ID,"doubleClickOpen")) return;

  /**
   * SBS Containers owns double-click for SBS tokens only.
   *
   * IMPORTANT: do not subscribe to LocknKey.TokendblClick as the opener. Lock &
   * Key itself uses that hook as a permission gate inside its _onClickLeft2
   * wrapper, and it deliberately allows the normal Actor sheet to continue for
   * GMs. Opening SBS from that same hook therefore creates two competing UI
   * paths (and its canvas fallback uses callAll).
   *
   * Instead, wrap the actual token double-click. For a player we explicitly ask
   * Lock & Key's own TokendblClick gate whether this exact token may be opened.
   * If Lock & Key returns false it also performs its normal locked popup/sound;
   * SBS stops and never constructs a loot window. If allowed (or GM), SBS opens
   * its own interface and NEVER calls the wrapped/native Actor-sheet path.
   */
  const intercept = async function(wrapped, ...args) {
    const tokenDoc = this?.document;
    if(!isContainer(tokenDoc)) return wrapped(...args);

    const event = args[0];
    event?.stopPropagation?.();

    if(!game.user.isGM && isLocked(tokenDoc)) {
      // Do NOT use Lock & Key's UserCanopenToken result to decide SBS access.
      // Lock & Key can intentionally bypass a lock for owned tokens when its
      // always-open-owned setting is enabled. SBS requires an actually unlocked
      // lock for players. We call its hook only to preserve its normal popup/sound.
      const original = event?.data?.originalEvent ?? event;
      const infos = {altKey:Boolean(original?.altKey), ctrlKey:Boolean(original?.ctrlKey), shiftKey:Boolean(original?.shiftKey)};
      try { Hooks.call("LocknKey.TokendblClick", tokenDoc, infos); } catch (_) {}
      return;
    }

    try { await openContainer(tokenDoc); }
    catch(err) { console.error(`${MODULE_ID} | Could not open container`, err); }
    // NEVER call wrapped() for SBS tokens. That would open the hidden inventory
    // Actor's normal sheet underneath the SBS interface (especially for GMs).
    return;
  };

  // Prefer libWrapper when present. Lock & Key recommends it and may itself be
  // wrapping this method. The logic above is safe whether SBS becomes an inner
  // or outer wrapper because SBS never forwards an allowed SBS interaction to
  // the native Actor-sheet call.
  if(globalThis.libWrapper?.register) {
    try {
      globalThis.libWrapper.register(MODULE_ID, "Token.prototype._onClickLeft2", intercept, "MIXED");
      console.log(`${MODULE_TITLE} | Installed SBS token double-click via libWrapper.`);
      return;
    } catch(err) {
      console.warn(`${MODULE_ID} | libWrapper registration failed; using direct fallback`, err);
    }
  }

  // Fallback for worlds without libWrapper. This is installed during ready,
  // after Lock & Key's init-time wrapper, so it becomes the outer guard.
  const prior = Token.prototype._onClickLeft2;
  Token.prototype._onClickLeft2 = async function(...args) {
    return intercept.call(this, prior.bind(this), ...args);
  };
  console.log(`${MODULE_TITLE} | Installed SBS token double-click fallback.`);
}

