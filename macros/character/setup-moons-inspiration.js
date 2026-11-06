// Run ONCE as GM with her bard token selected. Safe to run again.
await (async () => {
  if (!game.user.isGM) return ui.notifications.warn("Run this setup macro as the GM.");
  const bard = canvas.tokens.controlled.length === 1 ? canvas.tokens.controlled[0].actor : null;
  if (!bard) return ui.notifications.warn("Select only her bard's token, then run setup.");
  if (!game.modules.get("midi-qol")?.active) return ui.notifications.error("Enable Midi-QOL first.");
  const norm = s => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pick = async (title, docs) => {
    if (docs.length === 1) return docs[0];
    const id = await new Promise(resolve => {
      let picked = false;
      new Dialog({title, content:`<select style="width:100%">${docs.map(d=>`<option value="${d.id}">${esc(d.name)}</option>`).join("")}</select>`, buttons:{cancel:{label:"Cancel"},choose:{label:"Use This",callback:html=>{picked=true;resolve((html[0]??html).querySelector("select").value);}}}, default:"choose", close:()=>{if(!picked)resolve(null);}}).render(true);
    });
    return docs.find(d => d.id === id);
  };
  try {
    const features = bard.items.filter(i => i.type === "feat" && norm(i.name).includes("moonsinspiration"));
    if (!features.length) throw Error("Moon's Inspiration was not found on this bard's sheet.");
    const feature = await pick("Choose her Moon's Inspiration feature", features);
    if (!feature) return;
    const candidates = game.macros.filter(m => m.type === "script" && !m.getFlag("world","sbsMoonSheetLauncher") && !norm(m.name).includes("setup") && norm(m.name).includes("moonsinspiration"));
    if (!candidates.length) throw Error("Create the main Moon's Inspiration Script macro first, using the code I provided. Keep its name Moon's Inspiration.");
    const main = await pick("Choose the main Moon's Inspiration macro", candidates);
    if (!main) return;
    if (!main.command.includes("sbsMoonEclipse") || !main.command.includes("SBSMoonBusy")) throw Error("That is not the Moon's Inspiration ability macro from this conversation.");
    const activities = [...feature.system.activities.values()];
    let activity = activities.find(a => norm(a.name) === "inspiredeclipse");
    if (!activity && activities.length === 1 && activities[0].type === "utility" && ["", "use", "utility", norm(feature.name)].includes(norm(activities[0].name))) activity = activities[0];
    const activityId = activity?.id ?? foundry.utils.randomID(16);
    const backup = feature.getFlag("world", "sbsMoonSetupBackup") ?? {
      activities: foundry.utils.deepClone(feature.toObject().system.activities),
      onUseMacroName: feature.getFlag("midi-qol", "onUseMacroName") ?? "",
      at: new Date().toISOString()
    };
    const owners = game.users.filter(u => !u.isGM && bard.testUserPermission(u,"OWNER"));
    const ownership = doc => {
      const permissions = foundry.utils.deepClone(doc?.ownership ?? {default:0});
      for (const u of owners) permissions[u.id] = Math.max(Number(permissions[u.id]??0), CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER);
      return permissions;
    };
    // Await the ability macro, then abort normal item use before it can consume again.
    let command = main.command.replace(/(^|\n)(\s*)\(async\s*\(\)\s*=>\s*\{/, "$1$2await (async () => {");
    if (!/return\s+false\s*;\s*$/.test(command)) command += "\nreturn false;\n";
    await main.update({command,ownership:ownership(main)});
    const launcherName = `SBS Moon Eclipse - ${feature.id}`;
    const launcherCommand = `
const info = typeof args !== "undefined" ? args[0] : null;
const context = typeof scope !== "undefined" ? scope : {};
const wf = context.workflow ?? (info?.uuid ? MidiQOL.Workflow.getWorkflow(info.uuid) : null);
const active = wf?.activity ?? context.rolledActivity;
if (active && active.id !== ${JSON.stringify(activityId)}) return;
const featureDoc = await fromUuid(${JSON.stringify(feature.uuid)});
const source = wf?.actor ?? featureDoc?.actor;
if (!source?.isOwner) { ui.notifications.warn("You do not control this bard."); return false; }
let sourceToken = wf?.token?.document ? wf.token : wf?.token?.object;
if (!sourceToken && info?.tokenUuid) sourceToken = (await fromUuid(info.tokenUuid))?.object;
if (!sourceToken) {
  const matches = canvas.tokens.placeables.filter(t => t.actor?.uuid === source.uuid);
  sourceToken = matches.find(t => t.controlled) ?? (matches.length === 1 ? matches[0] : null);
}
if (!sourceToken || sourceToken.actor?.uuid !== source.uuid) { ui.notifications.warn("Select this bard's token on the current scene first."); return false; }
const abilityMacro = await fromUuid(${JSON.stringify(main.uuid)});
if (!abilityMacro) { ui.notifications.error("The main Moon's Inspiration macro was deleted."); return false; }
sourceToken.control({releaseOthers:true});
await abilityMacro.execute({actor:source,token:sourceToken});
return false;
`;
    let launcher = game.macros.find(m => m.getFlag("world","sbsMoonSheetLauncher") === feature.uuid);
    if (launcher) await launcher.update({name:launcherName,type:"script",command:launcherCommand,ownership:ownership(launcher)});
    else launcher = await Macro.create({name:launcherName,type:"script",command:launcherCommand,img:main.img,ownership:ownership(null),flags:{world:{sbsMoonSheetLauncher:feature.uuid}}});
    if (!activity) {
      await feature.createActivity("utility", {_id:activityId,name:"Inspired Eclipse",activation:{type:"bonus",value:1,override:true},consumption:{targets:[],spellSlot:false},target:{affects:{type:"self"},prompt:false}}, {renderSheet:false});
    }
    const old = String(feature.getFlag("midi-qol","onUseMacroName") ?? "");
    const ours = new Set([main.name,main.uuid,`Macro.${main.name}`,`Macro.${main.uuid}`,launcher.name]);
    const entries = old.split(",").map(s=>s.trim()).filter(Boolean).filter(s=>!ours.has(s.replace(/^\[[^\]]*\]/,"").split("|")[0].trim()));
    entries.push(`[preItemRoll]${launcher.name}`);
    await feature.update({
      [`system.activities.${activityId}.name`]:"Inspired Eclipse",
      [`system.activities.${activityId}.activation`]:{type:"bonus",value:1,override:true},
      [`system.activities.${activityId}.consumption.targets`]:[],
      [`system.activities.${activityId}.consumption.spellSlot`]:false,
      [`system.activities.${activityId}.target.affects.type`] :"self",
      [`system.activities.${activityId}.target.prompt`]:false,
      "flags.midi-qol.onUseMacroName":entries.join(","),
      "flags.world.sbsMoonSetupBackup":backup
    });
    const settings = foundry.utils.deepClone(game.settings.get("midi-qol","ConfigSettings"));
    if (settings.allowUseMacro === false) {settings.allowUseMacro=true;await game.settings.set("midi-qol","ConfigSettings",settings);}
    ui.notifications.info(`${bard.name}: Moon's Inspiration is ready. Activate Inspired Eclipse on her sheet. It uses the same macro and spends exactly one Bardic Inspiration use. Setup spent none.`);
    bard.sheet.render(true);
  } catch (error) {
    console.error("Moon's Inspiration setup", error);
    ui.notifications.error(error.message ?? String(error));
  }
})();
