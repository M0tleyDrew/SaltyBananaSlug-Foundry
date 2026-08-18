const MODULE_ID = "saltybananaslugs-danger-zones";
const MODULE_TITLE = "SaltyBananaSlug's Danger Zones";
const FLAG_ZONES = "zones";
const MACRO_IMG = `modules/${MODULE_ID}/assets/zones.png`;
const LOGO_IMG = `modules/${MODULE_ID}/assets/danger-zones.png`;

const { DialogV2 } = foundry.applications.api;

let overlayContainer = null;
let placementPreview = null;
let placementCleanup = null;
let pulseTickerBound = false;
const processedHazardBoundaries = new Set();
let warnedNativeDamageFallback = false;

const DEFAULT_ZONE = Object.freeze({
  name: "Danger Zone",
  shape: "circle",
  geometry: {
    radius: 10,
    innerRadius: 5,
    width: 10,
    height: 20,
    distance: 30,
    beamWidth: 5,
    angle: 90,
    rotation: 0
  },
  appearance: {
    color: "#ff3b30",
    opacity: 0.28,
    pulse: true,
    label: true,
    showCountdown: true,
    visibility: "all",
    revealAt: 999,
    hiddenToPlayers: false
  },
  safeZone: false,
  targeting: {
    creatures: "all",
    disposition: "all",
    elevationMin: null,
    elevationMax: null,
    restrainedByWalls: false
  },
  timing: {
    enabled: true,
    mode: "countdown",
    initiativeMode: "top",
    fixedInitiative: 20,
    trigger: "start",
    countdown: 1,
    remaining: 1,
    repeat: false,
    repeatEvery: 1,
    repeatCount: 0,
    activations: 0,
    resolved: false,
    combatantId: null
  },
  follow: {
    enabled: false,
    tokenId: null,
    rotateWithToken: false,
    offsetX: 0,
    offsetY: 0
  },
  effects: {
    message: "",
    notification: "",
    sound: "",
    saveEnabled: false,
    saveAbility: "dex",
    saveDC: 15,
    saveSuccess: "half",
    damageFormula: "",
    damageType: "bludgeoning",
    healFormula: "",
    macroRef: ""
  },
  pattern: {
    moveX: 0,
    moveY: 0,
    rotate: 0,
    radiusDelta: 0,
    widthDelta: 0,
    heightDelta: 0,
    pingPong: false,
    direction: 1
  },
  lifecycle: {
    deleteWhenDone: true,
    keepAfterCombat: false
  },
  position: { x: 0, y: 0 },
  id: null,
  sceneId: null
});

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "presets", {
    name: "Danger Zone Presets",
    scope: "world",
    config: false,
    type: Object,
    default: {}
  });

  const api = {
    open: openLauncher,
    openLauncher,
    createZone: createZoneWizard,
    manageZones,
    managePresets,
    clearScene: clearZonesOnCurrentScene,
    fireZone: async id => fireZoneById(canvas.scene, id, { manual: true }),
    renderZones,
    getZones: scene => getZones(scene ?? canvas.scene),
    armZones: async () => armZonesForCombat(getSceneCombat(canvas.scene?.id))
  };

  game.modules.get(MODULE_ID).api = api;
  game.saltyBananaSlugDangerZones = api;
});

Hooks.once("ready", async () => {
  if (game.user.isGM) await ensureLauncherMacro();
});

Hooks.on("canvasReady", async () => {
  renderZones();
  if (!isProcessingGM()) return;
  const combat = getSceneCombat(canvas.scene?.id);
  if (combat) await armZonesForCombat(combat);
});

Hooks.on("canvasTearDown", () => destroyOverlay());

Hooks.on("updateScene", scene => {
  if (scene.id === canvas.scene?.id) renderZones();
});

Hooks.on("updateToken", token => {
  if (token.parent?.id === canvas.scene?.id) renderZones();
});

Hooks.on("createToken", token => {
  if (token.parent?.id === canvas.scene?.id) renderZones();
});

Hooks.on("deleteToken", token => {
  if (token.parent?.id === canvas.scene?.id) renderZones();
});

// Wall-restrained zones need to be recomputed when the Scene's wall geometry changes.
for (const hookName of ["createWall", "updateWall", "deleteWall"]) {
  Hooks.on(hookName, wall => {
    if (wall.parent?.id === canvas.scene?.id) renderZones();
  });
}

Hooks.on("createCombat", combat => {
  if (!isProcessingGM()) return;
  setTimeout(() => armZonesForCombat(combat), 50);
});

Hooks.on("combatStart", async combat => {
  if (!isProcessingGM()) return;
  await armZonesForCombat(combat);
  const current = combat.current ?? {
    combatantId: combat.combatant?.id ?? null,
    round: combat.round ?? 0,
    turn: combat.turn ?? null
  };
  if (current.combatantId) await processBoundary(combat, current, "start");
});

// Foundry v13 provides a dedicated post-update hook for turn progression.
// Using it is substantially more reliable than trying to infer turn changes from updateCombat.
Hooks.on("combatTurnChange", async (combat, prior, current) => {
  if (!isProcessingGM()) return;
  await armZonesForCombat(combat);
  if (prior?.combatantId) await processBoundary(combat, prior, "end");
  if (current?.combatantId) await processBoundary(combat, current, "start");
});

Hooks.on("deleteCombat", combat => {
  for (const key of [...processedHazardBoundaries]) {
    if (key.startsWith(`${combat.id}:`)) processedHazardBoundaries.delete(key);
  }
  if (isProcessingGM()) setTimeout(() => cleanupZonesAfterCombat(combat), 0);
});

async function cleanupZonesAfterCombat(combat) {
  const sceneId = getCombatSceneId(combat);
  const scene = game.scenes?.get(sceneId);
  if (!scene) return;

  const zones = getZones(scene);
  if (!zones.length) return;

  const kept = zones
    .filter(zone => zone.lifecycle?.keepAfterCombat)
    .map(zone => {
      const copy = foundry.utils.deepClone(zone);
      copy.timing.combatantId = null;
      copy.timing.remaining = Math.max(1, integer(copy.timing.countdown, 1));
      copy.timing.activations = 0;
      copy.timing.resolved = false;
      return copy;
    });

  if (kept.length !== zones.length || kept.some((zone, i) => zone.timing?.combatantId !== zones[i]?.timing?.combatantId)) {
    await setZones(scene, kept);
  }
}

async function ensureLauncherMacro() {
  const existing = game.macros?.find(m => m.getFlag(MODULE_ID, "launcher") === true);
  let macro = existing;
  if (!macro) {
    macro = await Macro.create({
      name: "Danger Zones",
      type: "script",
      img: MACRO_IMG,
      command: `game.modules.get("${MODULE_ID}")?.api?.openLauncher();`,
      ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE, [game.user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER },
      flags: { [MODULE_ID]: { launcher: true } }
    });
  }

  if (!macro) return;
  try {
    const desiredCommand = `game.modules.get("${MODULE_ID}")?.api?.openLauncher();`;
    const changes = {};
    if (macro.img !== MACRO_IMG) changes.img = MACRO_IMG;
    if (macro.command !== desiredCommand) changes.command = desiredCommand;
    if (Object.keys(changes).length) await macro.update(changes);
  } catch (err) {
    console.warn(`${MODULE_TITLE} | Could not refresh the launcher macro.`, err);
  }
  try {
    const hotbar = game.user.hotbar ?? {};
    const alreadyAssigned = Object.values(hotbar).includes(macro.id);
    if (!alreadyAssigned && typeof game.user.assignHotbarMacro === "function") {
      const empty = Array.from({ length: 10 }, (_, i) => i + 1).find(slot => !hotbar[slot]);
      if (empty) await game.user.assignHotbarMacro(macro, empty);
    }
  } catch (err) {
    console.warn(`${MODULE_TITLE} | Could not automatically assign the launcher macro to the hotbar.`, err);
  }
}

async function openLauncher() {
  if (!game.user.isGM) return ui.notifications.warn("Danger Zones is a GM tool.");
  if (!canvas?.scene) return ui.notifications.warn("Open a Scene first.");

  const content = wrapContent(`
    ${hero("Danger Zones", "Telegraph it. Count it down. Then make the floor somebody else's problem.")}
    <div class="sbs-dz-launcher" role="navigation" aria-label="Danger Zones launcher">
      <button type="button" class="sbs-dz-launch-tile" data-action="create">
        <i class="fa-solid fa-plus" aria-hidden="true"></i>
        <span><strong>Create Zone</strong><small>New danger or safe zone using the guided wizard.</small></span>
      </button>
      <button type="button" class="sbs-dz-launch-tile" data-action="manage">
        <i class="fa-solid fa-layer-group" aria-hidden="true"></i>
        <span><strong>Active Zones</strong><small>Fire, delay, hide, duplicate, edit, or delete existing zones.</small></span>
      </button>
      <button type="button" class="sbs-dz-launch-tile" data-action="presets">
        <i class="fa-solid fa-floppy-disk" aria-hidden="true"></i>
        <span><strong>Presets</strong><small>Deploy or remove reusable hazard recipes.</small></span>
      </button>
      <button type="button" class="sbs-dz-launch-tile" data-action="arm">
        <i class="fa-solid fa-swords" aria-hidden="true"></i>
        <span><strong>Arm Zones</strong><small>Attach unarmed timed zones to the current encounter tracker.</small></span>
      </button>
      <button type="button" class="sbs-dz-launch-tile sbs-dz-launch-tile-danger" data-action="clear">
        <i class="fa-solid fa-trash-can" aria-hidden="true"></i>
        <span><strong>Clear Scene Zones</strong><small>Remove every Danger Zone from the currently open Scene only. Other scenes are untouched.</small></span>
      </button>
    </div>
  `);

  const result = await DialogV2.wait({
    window: { title: MODULE_TITLE, icon: "fa-solid fa-triangle-exclamation", resizable: true, contentClasses: ["sbs-danger-zones-window"] },
    classes: ["sbs-danger-zones-dialog", "sbs-dz-launcher-dialog"],
    position: { width: fitDialogWidth(560), height: fitDialogHeight(700) },
    content,
    rejectClose: false,
    buttons: [
      { action: "create", label: "Create Zone", icon: "fa-solid fa-plus", default: true },
      { action: "manage", label: "Active Zones", icon: "fa-solid fa-layer-group" },
      { action: "presets", label: "Presets", icon: "fa-solid fa-floppy-disk" },
      { action: "arm", label: "Arm Zones", icon: "fa-solid fa-swords" },
      { action: "clear", label: "Clear Scene Zones", icon: "fa-solid fa-trash-can" }
    ]
  });

  if (result === "create") return createZoneWizard();
  if (result === "manage") return manageZones();
  if (result === "presets") return managePresets();
  if (result === "arm") {
    await armZonesForCombat(getSceneCombat(canvas.scene?.id), true);
    return openLauncher();
  }
  if (result === "clear") {
    await clearZonesOnCurrentScene();
    return openLauncher();
  }
}

async function createZoneWizard(initial = null, options = {}) {
  if (!game.user.isGM) return;
  const draft = mergeZone(initial ?? DEFAULT_ZONE);
  const controlledToken = canvas.tokens?.controlled?.[0] ?? null;
  const existingFollowToken = draft.follow?.tokenId ? canvas.tokens?.get(draft.follow.tokenId) ?? null : null;
  const selected = controlledToken ?? existingFollowToken;
  const verb = options.editId ? "Edit" : "Create";

  const step1 = await inputDialog({
    title: `${verb} Danger Zone — 1/5`,
    width: 580,
    okLabel: "Next: Shape",
    content: wrapContent(`
      ${hero(options.editId ? "Edit Zone" : "New Zone", "First: what does the warning look like? Consequences can wait their turn. Literally.")}
      <div class="sbs-dz-grid">
        ${field("Zone Name", `<input type="text" name="name" value="${esc(draft.name)}" required>`)}
        ${field("Shape", select("shape", {
          circle: "Circle",
          rectangle: "Rectangle",
          cone: "Cone",
          line: "Line / Beam",
          ring: "Ring"
        }, draft.shape))}
        ${field("Overlay Color", `<input type="color" name="color" value="${esc(draft.appearance.color)}">`)}
        ${field("Opacity", `<input type="number" name="opacity" min="0.05" max="0.85" step="0.05" value="${num(draft.appearance.opacity, 0.28)}">`)}
        ${field("Player Visibility", select("visibility", { all: "Visible to Players", gm: "GM Only" }, draft.appearance.visibility))}
        ${field("Reveal At Countdown", `<input type="number" name="revealAt" min="0" step="1" value="${num(draft.appearance.revealAt, 999)}"><span class="hint">999 = visible immediately. Set 1 to reveal only when one hazard turn remains.</span>`)}
      </div>
      <fieldset class="sbs-dz-section">
        <legend>Zone Style</legend>
        ${check("safeZone", "Safe Zone — affect qualifying tokens OUTSIDE the shape", draft.safeZone)}
        ${check("pulse", "Pulse the overlay", draft.appearance.pulse)}
        ${check("label", "Show zone name on the canvas", draft.appearance.label)}
        ${check("showCountdown", "Show countdown on the canvas", draft.appearance.showCountdown)}
      </fieldset>
    `)
  });
  if (!step1) return;

  draft.name = cleanString(step1.name, "Danger Zone");
  draft.shape = step1.shape;
  draft.safeZone = bool(step1.safeZone);
  draft.appearance.color = step1.color || (draft.safeZone ? "#36c96b" : "#ff3b30");
  draft.appearance.opacity = clamp(number(step1.opacity, 0.28), 0.05, 0.85);
  draft.appearance.visibility = step1.visibility;
  draft.appearance.revealAt = Math.max(0, integer(step1.revealAt, 999));
  draft.appearance.pulse = bool(step1.pulse);
  draft.appearance.label = bool(step1.label);
  draft.appearance.showCountdown = bool(step1.showCountdown);

  const step2 = await inputDialog({
    title: `${verb} Danger Zone — 2/5`,
    width: 600,
    okLabel: "Next: Behavior",
    content: wrapContent(`
      ${hero("Shape & Placement", "Measurements use the Scene's distance units. Pixels remain banished to the shadow realm.")}
      ${shapeFields(draft)}
      <fieldset class="sbs-dz-section">
        <legend>Attachment</legend>
        ${selected ? `<div class="sbs-dz-warning">Current token: <strong>${esc(selected.name)}</strong>. You can still click a different token during placement.</div>` : `<div class="sbs-dz-warning">No token is selected — that's okay. If Follow Token is enabled, you'll pick the token directly on the Scene after the wizard.</div>`}
        ${check("follow", "Follow a token", draft.follow.enabled)}
        ${check("rotateWithToken", "Match the token's rotation", draft.follow.rotateWithToken)}
        <div class="hint"><strong>Follow Token:</strong> after the wizard, hover a token to preview the zone, then <strong>single-click the token</strong> to attach it. Danger Zones temporarily captures that click so merchant/container interactions do not steal it. Clicking empty ground will not place a following zone. Once attached, the zone tracks the token continuously while it moves.</div>
      </fieldset>
    `)
  });
  if (!step2) return;
  applyShapeFields(draft, step2);
  draft.follow.enabled = bool(step2.follow);
  draft.follow.tokenId = draft.follow.enabled ? (selected?.document?.id ?? draft.follow.tokenId ?? null) : null;
  draft.follow.rotateWithToken = draft.follow.enabled && bool(step2.rotateWithToken);
  if (!draft.follow.enabled) {
    draft.follow.offsetX = 0;
    draft.follow.offsetY = 0;
  }

  const step3 = await inputDialog({
    title: `${verb} Danger Zone — 3/5`,
    width: 620,
    okLabel: "Next: Timing",
    content: wrapContent(`
      ${hero("Behavior & Targets", "Countdown and repeat are different jobs now. No more making the boulder fill out recurring-payment paperwork.")}
      <fieldset class="sbs-dz-section">
        <legend>What should this zone do?</legend>
        ${field("Activation Style", select("timingMode", {
          countdown: "Countdown, then fire ONCE",
          repeat: "Countdown, then REPEAT",
          manual: "Manual only — no encounter tracker entry"
        }, draft.timing.mode))}
        <div class="sbs-dz-mode-help">
          <p><strong>Countdown:</strong> ideal for falling rocks, called boss attacks, collapsing ceilings, delayed explosions.</p>
          <p><strong>Repeat:</strong> ideal for pendulums, lava pulses, rotating beams, healing fields.</p>
          <p><strong>Manual:</strong> place it now and use <em>Active Zones → Fire Now</em> whenever you decide.</p>
        </div>
      </fieldset>
      <fieldset class="sbs-dz-section">
        <legend>Who Can Be Affected?</legend>
        <div class="sbs-dz-grid">
          ${field("Creature Type", select("creatures", { all: "All Tokens", pc: "Characters / PCs", npc: "NPCs / Other Actors" }, draft.targeting.creatures))}
          ${field("Disposition", select("disposition", { all: "Any Disposition", friendly: "Friendly", hostile: "Hostile", neutral: "Neutral" }, draft.targeting.disposition))}
          ${field("Minimum Elevation", `<input type="number" name="elevationMin" step="1" value="${nullableNum(draft.targeting.elevationMin)}" placeholder="Any">`)}
          ${field("Maximum Elevation", `<input type="number" name="elevationMax" step="1" value="${nullableNum(draft.targeting.elevationMax)}" placeholder="Any">`)}
        </div>
        ${check("restrainedByWalls", "Restrained by Walls — walls block the zone's effective area", draft.targeting.restrainedByWalls)}
        <div class="hint">Token center determines whether it is inside. A Safe Zone reverses the effective-area test. With <strong>Restrained by Walls</strong> enabled, closed/solid movement-blocking walls cut off the zone: the overlay is clipped and tokens behind those walls are treated as outside the effective area.</div>
      </fieldset>
    `)
  });
  if (!step3) return;

  draft.timing.mode = ["countdown", "repeat", "manual"].includes(step3.timingMode) ? step3.timingMode : "countdown";
  draft.timing.enabled = draft.timing.mode !== "manual";
  draft.timing.repeat = draft.timing.mode === "repeat";
  draft.targeting.creatures = step3.creatures;
  draft.targeting.disposition = step3.disposition;
  draft.targeting.elevationMin = nullableNumber(step3.elevationMin);
  draft.targeting.elevationMax = nullableNumber(step3.elevationMax);
  draft.targeting.restrainedByWalls = bool(step3.restrainedByWalls);

  if (draft.timing.mode !== "manual") {
    const repeatFields = draft.timing.mode === "repeat" ? `
      ${field("Repeat Every", `<input type="number" name="repeatEvery" min="1" step="1" value="${num(draft.timing.repeatEvery, 1)}"><span class="hint">After the first activation, wait this many hazard turns before firing again.</span>`)}
      ${field("Total Activations", `<input type="number" name="repeatCount" min="0" step="1" value="${num(draft.timing.repeatCount, 0)}"><span class="hint">0 = repeat until you delete it or combat ends.</span>`)}
    ` : "";

    const step4 = await inputDialog({
      title: `${verb} Danger Zone — 4/5`,
      width: 620,
      okLabel: "Next: Effects",
      content: wrapContent(`
        ${hero(draft.timing.mode === "repeat" ? "Repeating Timing" : "Countdown Timing", draft.timing.mode === "repeat"
          ? "The first countdown happens once; the repeat interval only matters after the first activation."
          : "This zone counts down, fires once, and is finished. Nice and civilized. Until the damage dice arrive.")}
        <fieldset class="sbs-dz-section">
          <legend>Encounter Tracker</legend>
          <div class="sbs-dz-grid">
            ${field("Initiative", select("initiativeMode", {
              top: "Top of Initiative",
              bottom: "Bottom of Initiative",
              fixed: "Fixed Initiative",
              roll: "Roll 1d20"
            }, draft.timing.initiativeMode))}
            ${field("Fixed Initiative", `<input type="number" name="fixedInitiative" step="1" value="${num(draft.timing.fixedInitiative, 20)}"><span class="hint">Used only when Fixed Initiative is selected.</span>`)}
            ${field("Trigger", select("trigger", { start: "Start of Hazard Turn", end: "End of Hazard Turn" }, draft.timing.trigger))}
            ${field("Turns Until First Action", `<input type="number" name="countdown" min="1" step="1" value="${Math.max(1, num(draft.timing.countdown, 1))}"><span class="hint">2 means the tracker shows [2], then [1], then the action resolves on that second hazard turn.</span>`)}
            ${repeatFields}
          </div>
        </fieldset>
        <div class="sbs-dz-warning"><strong>Important:</strong> the hazard receives its own actorless combatant entry in the encounter tracker. The number in brackets is the remaining hazard turns before the next action.</div>
      `)
    });
    if (!step4) return;

    draft.timing.initiativeMode = step4.initiativeMode;
    draft.timing.fixedInitiative = number(step4.fixedInitiative, 20);
    draft.timing.trigger = step4.trigger;
    draft.timing.countdown = Math.max(1, integer(step4.countdown, 1));
    draft.timing.remaining = draft.timing.countdown;
    if (draft.timing.mode === "repeat") {
      draft.timing.repeatEvery = Math.max(1, integer(step4.repeatEvery, 1));
      draft.timing.repeatCount = Math.max(0, integer(step4.repeatCount, 0));
    } else {
      draft.timing.repeatEvery = 1;
      draft.timing.repeatCount = 0;
    }
  } else {
    draft.timing.countdown = 0;
    draft.timing.remaining = 0;
    draft.timing.repeatEvery = 1;
    draft.timing.repeatCount = 0;
  }

  draft.timing.activations = 0;
  draft.timing.resolved = false;

  const damageTypes = getDamageTypeChoices();
  const patternSection = draft.timing.mode === "repeat" ? `
      <fieldset class="sbs-dz-section">
        <legend>Optional Movement / Pattern Between Repeats</legend>
        <div class="hint">Leave these at 0 for a stationary repeating zone. These changes happen only AFTER the zone fires.</div>
        <div class="sbs-dz-grid">
          ${field("Move X", `<input type="number" name="moveX" step="1" value="${num(draft.pattern.moveX, 0)}"><span class="hint">Scene distance units each activation.</span>`)}
          ${field("Move Y", `<input type="number" name="moveY" step="1" value="${num(draft.pattern.moveY, 0)}">`)}
          ${field("Rotate", `<input type="number" name="patternRotate" step="1" value="${num(draft.pattern.rotate, 0)}"><span class="hint">Degrees each activation.</span>`)}
          ${field("Radius Change", `<input type="number" name="radiusDelta" step="1" value="${num(draft.pattern.radiusDelta, 0)}">`)}
          ${field("Width Change", `<input type="number" name="widthDelta" step="1" value="${num(draft.pattern.widthDelta, 0)}">`)}
          ${field("Length Change", `<input type="number" name="heightDelta" step="1" value="${num(draft.pattern.heightDelta, 0)}">`)}
        </div>
        ${check("pingPong", "Reverse those movement/size changes every activation (pendulum mode)", draft.pattern.pingPong)}
      </fieldset>` : "";

  const step5 = await inputDialog({
    title: `${verb} Danger Zone — 5/5`,
    width: 680,
    okLabel: options.editId ? "Re-place Zone" : "Place Zone",
    content: wrapContent(`
      ${hero("Effects", "Choose any combination. Damage, healing, saves, messages, sound, and macros can all happen together.")}
      <fieldset class="sbs-dz-section">
        <legend>Saving Throw</legend>
        ${check("saveEnabled", "Require an automatic saving throw", draft.effects.saveEnabled)}
        <div class="sbs-dz-grid">
          ${field("Ability", select("saveAbility", abilityChoices(), draft.effects.saveAbility))}
          ${field("DC", `<input type="number" name="saveDC" min="1" step="1" value="${num(draft.effects.saveDC, 15)}">`)}
          ${field("On Success", select("saveSuccess", { half: "Half Damage", none: "No Damage", full: "Full Damage" }, draft.effects.saveSuccess))}
        </div>
      </fieldset>
      <fieldset class="sbs-dz-section">
        <legend>Actions</legend>
        <div class="sbs-dz-grid">
          ${field("Damage Formula", `<input type="text" name="damageFormula" value="${esc(draft.effects.damageFormula)}" placeholder="6d6">`)}
          ${field("Damage Type", select("damageType", damageTypes, draft.effects.damageType))}
          ${field("Healing Formula", `<input type="text" name="healFormula" value="${esc(draft.effects.healFormula)}" placeholder="1d8+3">`)}
          ${field("Sound Path", `<input type="text" name="sound" value="${esc(draft.effects.sound)}" placeholder="sounds/rumble.ogg">`)}
        </div>
        ${field("Chat Message", `<textarea name="message" rows="3" placeholder="A boulder introduces itself to the floor at terminal velocity.">${esc(draft.effects.message)}</textarea>`)}
        ${field("GM Notification", `<input type="text" name="notification" value="${esc(draft.effects.notification)}" placeholder="Optional popup text">`)}
        ${field("Run Macro (name or UUID)", `<input type="text" name="macroRef" value="${esc(draft.effects.macroRef)}" placeholder="Optional advanced action">`)}
      </fieldset>
      ${patternSection}
      <fieldset class="sbs-dz-section">
        <legend>Cleanup</legend>
        ${check("deleteWhenDone", draft.timing.mode === "repeat" ? "Delete the zone after its final activation (if it has a finite limit)" : "Delete the zone after it resolves", draft.lifecycle.deleteWhenDone)}
        ${check("keepAfterCombat", "Keep the zone after combat ends", draft.lifecycle.keepAfterCombat)}
      </fieldset>
    `)
  });
  if (!step5) return;

  draft.effects.saveEnabled = bool(step5.saveEnabled);
  draft.effects.saveAbility = step5.saveAbility;
  draft.effects.saveDC = Math.max(1, integer(step5.saveDC, 15));
  draft.effects.saveSuccess = step5.saveSuccess;
  draft.effects.damageFormula = cleanString(step5.damageFormula, "");
  draft.effects.damageType = step5.damageType;
  draft.effects.healFormula = cleanString(step5.healFormula, "");
  draft.effects.sound = cleanString(step5.sound, "");
  draft.effects.message = cleanString(step5.message, "");
  draft.effects.notification = cleanString(step5.notification, "");
  draft.effects.macroRef = cleanString(step5.macroRef, "");

  if (draft.timing.mode === "repeat") {
    draft.pattern.moveX = number(step5.moveX, 0);
    draft.pattern.moveY = number(step5.moveY, 0);
    draft.pattern.rotate = number(step5.patternRotate, 0);
    draft.pattern.radiusDelta = number(step5.radiusDelta, 0);
    draft.pattern.widthDelta = number(step5.widthDelta, 0);
    draft.pattern.heightDelta = number(step5.heightDelta, 0);
    draft.pattern.pingPong = bool(step5.pingPong);
  } else {
    draft.pattern.moveX = 0;
    draft.pattern.moveY = 0;
    draft.pattern.rotate = 0;
    draft.pattern.radiusDelta = 0;
    draft.pattern.widthDelta = 0;
    draft.pattern.heightDelta = 0;
    draft.pattern.pingPong = false;
  }
  draft.pattern.direction = 1;
  draft.lifecycle.deleteWhenDone = bool(step5.deleteWhenDone);
  draft.lifecycle.keepAfterCombat = bool(step5.keepAfterCombat);

  return beginPlacement(draft, { editId: options.editId ?? null });
}

async function beginPlacement(draft, { editId = null } = {}) {
  if (!canvas?.scene) return;
  cancelPlacement();

  const followsToken = !!draft.follow?.enabled;
  if (followsToken) {
    ui.notifications.info(`Danger Zones: hover a token to preview “${draft.name}”, then single-click that token to attach it. The picker temporarily takes priority over normal token interactions. Press Esc to cancel.`);
  } else {
    ui.notifications.info(`Danger Zones: click the Scene to place “${draft.name}”. Press Esc to cancel.`);
  }

  placementPreview = new PIXI.Graphics();
  placementPreview.eventMode = "none";
  canvas.interface?.addChild(placementPreview);

  let placementCommitting = false;
  const directTokenHandlers = new Map();

  const pointerMove = event => {
    const point = event.getLocalPosition(canvas.stage);
    if (followsToken) {
      const token = tokenAtCanvasPoint(point);
      if (!token) {
        placementPreview.clear();
        return;
      }

      const preview = mergeZone(draft);
      preview.follow.enabled = true;
      preview.follow.tokenId = token.document.id;
      preview.follow.offsetX = 0;
      preview.follow.offsetY = 0;
      preview.position = { x: token.center.x, y: token.center.y };
      drawZoneGraphic(placementPreview, preview, { preview: true });
      return;
    }

    drawZoneGraphic(placementPreview, { ...draft, position: { x: point.x, y: point.y } }, { preview: true });
  };

  const swallowPickerEvent = event => {
    // Merchant/container modules commonly claim token double-clicks (and some
    // claim pointerdown itself). While Follow Token placement is active,
    // Danger Zones owns the *single* picking click so those handlers cannot
    // turn the same gesture into "open this merchant/container" instead.
    try { event?.preventDefault?.(); } catch (_) {}
    try { event?.stopImmediatePropagation?.(); } catch (_) {}
    try { event?.stopPropagation?.(); } catch (_) {}
    try { event?.nativeEvent?.preventDefault?.(); } catch (_) {}
    try { event?.nativeEvent?.stopImmediatePropagation?.(); } catch (_) {}
    try { event?.nativeEvent?.stopPropagation?.(); } catch (_) {}
  };

  const placeOnToken = async (token, event = null) => {
    if (!followsToken || placementCommitting || !token?.document) return;
    placementCommitting = true;
    swallowPickerEvent(event);

    draft.follow.tokenId = token.document.id;
    draft.follow.offsetX = 0;
    draft.follow.offsetY = 0;
    const placementPoint = { x: token.center.x, y: token.center.y };

    cancelPlacement();
    try {
      await commitPlacedZone(draft, placementPoint, { editId });
      ui.notifications.info(`Danger Zones: “${draft.name}” attached to ${token.name ?? token.document.name ?? "token"}.`);
    } catch (err) {
      console.error(`${MODULE_TITLE} | Failed to attach zone to token`, err);
      ui.notifications.error("Danger Zones could not attach that zone. Check the console for details.");
    }
  };

  const pointerDown = async event => {
    const point = event.getLocalPosition(canvas.stage);

    if (followsToken) {
      const token = tokenAtCanvasPoint(point);
      if (!token) {
        swallowPickerEvent(event);
        ui.notifications.warn("Danger Zones: that zone is set to Follow Token. Single-click directly on a token, or press Esc to cancel.");
        return;
      }
      await placeOnToken(token, event);
      return;
    }

    event.stopPropagation?.();
    cancelPlacement();
    try {
      await commitPlacedZone(draft, point, { editId });
      ui.notifications.info(`Danger Zones: “${draft.name}” armed.`);
    } catch (err) {
      console.error(`${MODULE_TITLE} | Failed to create zone`, err);
      ui.notifications.error("Danger Zones could not create that zone. Check the console for details.");
    }
  };

  // Capture-phase token picking is the important bit for Item Piles / merchant
  // / container tokens. Foundry's canvas uses Pixi's federated event model,
  // which supports capture. Catching pointerdown on the Stage during capture
  // lets Danger Zones claim the picker click *before* a Token's normal click or
  // double-click interaction is allowed to open its sheet/store/container.
  const pointerDownCapture = event => {
    if (!followsToken || placementCommitting) return;
    const point = event.getLocalPosition(canvas.stage);
    const token = tokenAtCanvasPoint(point);
    if (!token) return;
    swallowPickerEvent(event);
    void placeOnToken(token, event);
  };

  // Direct token listeners are an additional fallback for token implementations
  // which stop bubbling before the Stage listener. This makes the picker work
  // with ordinary Actors as well as merchant/container-style Tokens supplied by
  // other modules.
  if (followsToken) {
    for (const token of canvas.tokens?.placeables ?? []) {
      const handler = event => {
        if (placementCommitting) return;
        swallowPickerEvent(event);
        void placeOnToken(token, event);
      };
      directTokenHandlers.set(token, handler);
      try { token.on?.("pointerdown", handler); } catch (_) {}
    }
  }

  const keyDown = event => {
    if (event.key !== "Escape") return;
    cancelPlacement();
    ui.notifications.info("Danger Zone placement cancelled.");
  };

  canvas.stage.on("pointermove", pointerMove);
  canvas.stage.on("pointerdown", pointerDown);
  if (followsToken) {
    try { canvas.stage.on("pointerdowncapture", pointerDownCapture); } catch (_) {}
  }
  window.addEventListener("keydown", keyDown);

  placementCleanup = () => {
    try { canvas.stage.off("pointermove", pointerMove); } catch (_) {}
    try { canvas.stage.off("pointerdown", pointerDown); } catch (_) {}
    try { canvas.stage.off("pointerdowncapture", pointerDownCapture); } catch (_) {}
    for (const [token, handler] of directTokenHandlers) {
      try { token.off?.("pointerdown", handler); } catch (_) {}
    }
    directTokenHandlers.clear();
    window.removeEventListener("keydown", keyDown);
    if (placementPreview) {
      try { placementPreview.parent?.removeChild(placementPreview); } catch (_) {}
      try { placementPreview.destroy(); } catch (_) {}
    }
    placementPreview = null;
    placementCleanup = null;
  };
}

/**
 * Return the top-most Token beneath a canvas-space point.
 *
 * We prefer TokenLayer.hover because Foundry v13 exposes it specifically as the
 * currently hovered PlaceableObject. A simple bounds hit-test is kept as a
 * fallback so token attachment still works when another layer or interaction
 * mode prevents the hover state from updating before pointerdown.
 */
function tokenAtCanvasPoint(point) {
  const hovered = canvas.tokens?.hover ?? null;
  if (hovered && tokenContainsCanvasPoint(hovered, point)) return hovered;

  const placeables = [...(canvas.tokens?.placeables ?? [])].reverse();
  return placeables.find(token => tokenContainsCanvasPoint(token, point)) ?? null;
}

function tokenContainsCanvasPoint(token, point) {
  if (!token || !point) return false;
  try {
    const bounds = token.bounds;
    if (bounds?.contains?.(point.x, point.y)) return true;
  } catch (_) {}

  const doc = token.document;
  if (!doc) return false;
  const gridSize = Number(canvas.grid?.size ?? canvas.scene?.grid?.size ?? 100) || 100;
  const width = Math.max(1, Number(doc.width) || 1) * gridSize;
  const height = Math.max(1, Number(doc.height) || 1) * gridSize;
  const x = Number(doc.x) || 0;
  const y = Number(doc.y) || 0;
  return point.x >= x && point.x <= x + width && point.y >= y && point.y <= y + height;
}

function cancelPlacement() {
  placementCleanup?.();
}

async function commitPlacedZone(draft, point, { editId = null } = {}) {
  const scene = canvas.scene;
  const zones = getZones(scene);
  let prior = null;
  if (editId) prior = zones.find(z => z.id === editId) ?? null;

  const zone = mergeZone(draft);
  zone.id = editId ?? foundry.utils.randomID();
  zone.sceneId = scene.id;
  zone.position = { x: point.x, y: point.y };
  zone.timing.combatantId = prior?.timing?.combatantId ?? null;
  zone.timing.resolved = false;
  zone.timing.activations = 0;
  zone.timing.remaining = zone.timing.enabled ? Math.max(1, integer(zone.timing.countdown, 1)) : 0;

  if (zone.follow.enabled) {
    const token = zone.follow.tokenId ? canvas.tokens?.get(zone.follow.tokenId) : null;
    if (!token) throw new Error("A Follow Token zone must be attached to a token on the current Scene.");
    zone.follow.offsetX = 0;
    zone.follow.offsetY = 0;
    zone.position = { x: token.center.x, y: token.center.y };
  }

  const sceneCombat = getSceneCombat(scene.id);
  if (prior?.timing?.combatantId && sceneCombat) {
    await safeDeleteCombatant(sceneCombat, prior.timing.combatantId);
    zone.timing.combatantId = null;
  }

  const next = editId ? zones.map(z => z.id === editId ? zone : z) : [...zones, zone];
  await setZones(scene, next);
  if (zone.timing.enabled && sceneCombat) {
    await ensureCombatant(zone.id, sceneCombat);
  } else if (zone.timing.enabled) {
    ui.notifications.info(`Danger Zones: “${zone.name}” is waiting for an encounter on this Scene; it will arm automatically.`);
  }
  renderZones();
}

async function manageZones() {
  if (!canvas?.scene) return;
  const zones = getZones(canvas.scene);
  if (!zones.length) {
    await DialogV2.prompt({
      window: { title: "Danger Zones — Active Zones" },
      content: wrapContent(`${hero("No Active Zones", "The floor is suspiciously safe. This seems fixable.")}<p>Create a zone first.</p>`),
      rejectClose: false,
      ok: { label: "Okay" }
    });
    return openLauncher();
  }

  const optionsHtml = zones.map(z => `<option value="${z.id}">${esc(z.name)} — ${esc(z.shape)} — ${z.timing.remaining ?? 0}</option>`).join("");
  const cards = zones.map(zoneCard).join("");
  const result = await DialogV2.wait({
    window: { title: "Danger Zones — Active Zones", icon: "fa-solid fa-layer-group", resizable: true, contentClasses: ["sbs-danger-zones-window"] },
    classes: ["sbs-danger-zones-dialog"],
    position: { width: fitDialogWidth(720), height: fitDialogHeight(760) },
    content: wrapContent(`
      ${hero("Active Zones", "Select a zone, then commit whatever administrative violence the situation requires.")}
      ${field("Selected Zone", `<select name="zoneId">${optionsHtml}</select>`)}
      <div>${cards}</div>
    `),
    rejectClose: false,
    buttons: [
      { action: "fire", label: "Fire Now", icon: "fa-solid fa-bolt", callback: (_e, b) => ({ action: "fire", id: b.form.elements.zoneId.value }) },
      { action: "delay", label: "+1 Count", icon: "fa-solid fa-clock", callback: (_e, b) => ({ action: "delay", id: b.form.elements.zoneId.value }) },
      { action: "toggle", label: "Hide/Reveal", icon: "fa-solid fa-eye-slash", callback: (_e, b) => ({ action: "toggle", id: b.form.elements.zoneId.value }) },
      { action: "edit", label: "Edit", icon: "fa-solid fa-pen", callback: (_e, b) => ({ action: "edit", id: b.form.elements.zoneId.value }) },
      { action: "duplicate", label: "Duplicate", icon: "fa-solid fa-copy", callback: (_e, b) => ({ action: "duplicate", id: b.form.elements.zoneId.value }) },
      { action: "preset", label: "Save Preset", icon: "fa-solid fa-floppy-disk", callback: (_e, b) => ({ action: "preset", id: b.form.elements.zoneId.value }) },
      { action: "delete", label: "Delete", icon: "fa-solid fa-trash", callback: (_e, b) => ({ action: "delete", id: b.form.elements.zoneId.value }) },
      { action: "clear", label: "Clear Scene", icon: "fa-solid fa-trash-can", callback: () => ({ action: "clear" }) },
      { action: "close", label: "Close", icon: "fa-solid fa-xmark" }
    ]
  });

  if (!result || result === "close") return;
  if (result.action === "clear") {
    await clearZonesOnCurrentScene();
    return manageZones();
  }
  const zone = getZones(canvas.scene).find(z => z.id === result.id);
  if (!zone) return manageZones();

  if (result.action === "fire") await fireZoneById(canvas.scene, zone.id, { manual: true });
  if (result.action === "delay") await delayZone(zone.id, 1);
  if (result.action === "toggle") await toggleZoneVisibility(zone.id);
  if (result.action === "duplicate") await duplicateZone(zone.id);
  if (result.action === "preset") await saveZoneAsPreset(zone);
  if (result.action === "delete") await deleteZone(zone.id);
  if (result.action === "edit") return createZoneWizard(zone, { editId: zone.id });
  return manageZones();
}

async function managePresets() {
  const presets = getPresets();
  const entries = Object.values(presets);
  if (!entries.length) {
    await DialogV2.prompt({
      window: { title: "Danger Zone Presets" },
      content: wrapContent(`${hero("No Presets Yet", "Save any active zone as a preset and it will live here, waiting patiently to ruin someone's round.")}<p>Use <strong>Active Zones → Save Preset</strong>.</p>`),
      rejectClose: false,
      ok: { label: "Okay" }
    });
    return openLauncher();
  }

  const selectHtml = entries.map(p => `<option value="${p.presetId}">${esc(p.presetName)}</option>`).join("");
  const result = await DialogV2.wait({
    window: { title: "Danger Zone Presets", icon: "fa-solid fa-floppy-disk", resizable: true, contentClasses: ["sbs-danger-zones-window"] },
    classes: ["sbs-danger-zones-dialog"],
    position: { width: fitDialogWidth(540), height: fitDialogHeight(700) },
    content: wrapContent(`${hero("Presets", "Reusable danger. Economies of scale, but for boss mechanics.")}${field("Preset", `<select name="presetId">${selectHtml}</select>`)}`),
    rejectClose: false,
    buttons: [
      { action: "deploy", label: "Place As-Is", icon: "fa-solid fa-location-crosshairs", default: true, callback: (_e, b) => ({ action: "deploy", id: b.form.elements.presetId.value }) },
      { action: "customize", label: "Customize", icon: "fa-solid fa-sliders", callback: (_e, b) => ({ action: "customize", id: b.form.elements.presetId.value }) },
      { action: "delete", label: "Delete Preset", icon: "fa-solid fa-trash", callback: (_e, b) => ({ action: "delete", id: b.form.elements.presetId.value }) },
      { action: "close", label: "Close", icon: "fa-solid fa-xmark" }
    ]
  });

  if (!result || result === "close") return;
  if (result.action === "delete") {
    const selectedPreset = getPresets()[result.id];
    if (selectedPreset?.builtin) {
      ui.notifications.warn("Danger Zones: built-in presets cannot be deleted.");
      return managePresets();
    }
    const copy = foundry.utils.deepClone(getStoredPresets());
    delete copy[result.id];
    await game.settings.set(MODULE_ID, "presets", copy);
    return managePresets();
  }
  if (result.action === "deploy" || result.action === "customize") {
    const preset = getPresets()[result.id];
    if (!preset) return;
    const zone = mergeZone(preset.zone);
    zone.id = null;
    zone.sceneId = null;
    zone.timing.combatantId = null;
    zone.timing.remaining = zone.timing.enabled ? Math.max(1, zone.timing.countdown) : 0;
    zone.timing.activations = 0;
    zone.timing.resolved = false;
    if (result.action === "customize") return createZoneWizard(zone);
    return beginPlacement(zone);
  }
}

async function saveZoneAsPreset(zone) {
  const fd = await inputDialog({
    title: "Save Danger Zone Preset",
    width: 460,
    okLabel: "Save Preset",
    content: wrapContent(`${hero("Save Preset", "Bottle this particular flavor of impending doom for later.")}${field("Preset Name", `<input name="presetName" type="text" value="${esc(zone.name)}" required>`)}`)
  });
  if (!fd) return;

  const presetId = foundry.utils.randomID();
  const copy = mergeZone(zone);
  copy.id = null;
  copy.sceneId = null;
  copy.position = { x: 0, y: 0 };
  copy.follow.enabled = false;
  copy.follow.tokenId = null;
  copy.follow.offsetX = 0;
  copy.follow.offsetY = 0;
  copy.timing.combatantId = null;
  copy.timing.remaining = copy.timing.enabled ? Math.max(1, copy.timing.countdown) : 0;
  copy.timing.activations = 0;
  copy.timing.resolved = false;

  const presets = foundry.utils.deepClone(getStoredPresets());
  presets[presetId] = { presetId, presetName: cleanString(fd.presetName, zone.name), builtin: false, zone: copy };
  await game.settings.set(MODULE_ID, "presets", presets);
  ui.notifications.info("Danger Zone preset saved.");
}

function getStoredPresets() {
  return game.settings.get(MODULE_ID, "presets") ?? {};
}

function getBuiltinPresets() {
  const fallingBoulder = mergeZone({
    name: "Falling Boulder",
    shape: "circle",
    geometry: { radius: 10 },
    appearance: {
      color: "#e4572e",
      opacity: 0.32,
      pulse: true,
      label: true,
      showCountdown: true,
      visibility: "all",
      revealAt: 999
    },
    safeZone: false,
    timing: {
      enabled: true,
      mode: "countdown",
      initiativeMode: "top",
      fixedInitiative: 20,
      trigger: "start",
      countdown: 2,
      remaining: 2,
      repeat: false,
      repeatEvery: 1,
      repeatCount: 0,
      activations: 0,
      resolved: false,
      combatantId: null
    },
    effects: {
      message: "A massive boulder crashes into the marked area!",
      notification: "Falling Boulder resolves.",
      saveEnabled: true,
      saveAbility: "dex",
      saveDC: 14,
      saveSuccess: "half",
      damageFormula: "4d10",
      damageType: "bludgeoning",
      healFormula: "",
      sound: "",
      macroRef: ""
    },
    lifecycle: { deleteWhenDone: true, keepAfterCombat: false }
  });

  const healingZone = mergeZone({
    name: "Healing Zone",
    shape: "circle",
    geometry: { radius: 10 },
    appearance: {
      color: "#2ecc71",
      opacity: 0.28,
      pulse: true,
      label: true,
      showCountdown: true,
      visibility: "all",
      revealAt: 999
    },
    safeZone: false,
    timing: {
      enabled: true,
      mode: "repeat",
      initiativeMode: "bottom",
      fixedInitiative: 0,
      trigger: "start",
      countdown: 1,
      remaining: 1,
      repeat: true,
      repeatEvery: 1,
      repeatCount: 0,
      activations: 0,
      resolved: false,
      combatantId: null
    },
    effects: {
      message: "Restorative energy washes over creatures standing in the zone.",
      notification: "Healing Zone pulses.",
      saveEnabled: false,
      saveAbility: "dex",
      saveDC: 15,
      saveSuccess: "half",
      damageFormula: "",
      damageType: "radiant",
      healFormula: "1d8+3",
      sound: "",
      macroRef: ""
    },
    lifecycle: { deleteWhenDone: false, keepAfterCombat: false }
  });

  return {
    "builtin-falling-boulder": {
      presetId: "builtin-falling-boulder",
      presetName: "Falling Boulder (Built-in)",
      builtin: true,
      zone: fallingBoulder
    },
    "builtin-healing-zone": {
      presetId: "builtin-healing-zone",
      presetName: "Healing Zone (Built-in)",
      builtin: true,
      zone: healingZone
    }
  };
}

function getPresets() {
  return { ...getBuiltinPresets(), ...getStoredPresets() };
}

async function delayZone(zoneId, amount) {
  const scene = canvas.scene;
  const zones = getZones(scene);
  const index = zones.findIndex(z => z.id === zoneId);
  if (index < 0) return;
  zones[index].timing.remaining = Math.max(0, integer(zones[index].timing.remaining, 0) + amount);
  await setZones(scene, zones);
  await updateCombatantLabel(zones[index]);
}

async function toggleZoneVisibility(zoneId) {
  const scene = canvas.scene;
  const zones = getZones(scene);
  const index = zones.findIndex(z => z.id === zoneId);
  if (index < 0) return;
  zones[index].appearance.hiddenToPlayers = !zones[index].appearance.hiddenToPlayers;
  await setZones(scene, zones);
}

async function duplicateZone(zoneId) {
  const scene = canvas.scene;
  const zones = getZones(scene);
  const source = zones.find(z => z.id === zoneId);
  if (!source) return;
  const clone = mergeZone(source);
  clone.id = foundry.utils.randomID();
  clone.name = `${source.name} Copy`;
  clone.position.x += canvas.grid?.size ?? 100;
  clone.position.y += canvas.grid?.size ?? 100;
  clone.timing.combatantId = null;
  clone.timing.remaining = clone.timing.enabled ? Math.max(1, clone.timing.countdown) : 0;
  clone.timing.activations = 0;
  clone.timing.resolved = false;
  await setZones(scene, [...zones, clone]);
  const combat = getSceneCombat(scene.id);
  if (clone.timing.enabled && combat) await ensureCombatant(clone.id, combat);
}

async function deleteZone(zoneId) {
  const scene = canvas.scene;
  if (!scene) return;
  const zones = getZones(scene);
  const zone = zones.find(z => z.id === zoneId);
  if (!zone) return;

  // Remove the Scene data FIRST. Combat hooks can fire while a Combatant is deleted;
  // if the zone still exists at that instant armZonesForCombat can recreate it.
  await setZones(scene, zones.filter(z => z.id !== zoneId));

  const combat = getSceneCombat(scene.id);
  if (combat) {
    const ids = new Set();
    if (zone.timing?.combatantId) ids.add(zone.timing.combatantId);
    for (const combatant of combat.combatants ?? []) {
      if (combatant.getFlag(MODULE_ID, "zoneId") === zoneId) ids.add(combatant.id);
    }
    if (ids.size) await safeDeleteCombatants(combat, [...ids]);
  }
  renderZones();
}

async function clearZonesOnCurrentScene({ confirm = true } = {}) {
  const scene = canvas?.scene;
  if (!scene) return ui.notifications.warn("Danger Zones: open a Scene first.");
  const zones = getZones(scene);
  if (!zones.length) {
    ui.notifications.info(`Danger Zones: “${scene.name}” has no zones to clear.`);
    return false;
  }

  if (confirm) {
    const approved = await DialogV2.confirm({
      window: { title: "Clear Danger Zones From This Scene?", icon: "fa-solid fa-trash-can" },
      content: wrapContent(`${hero("Clear Scene Zones", `This removes ${zones.length} Danger Zone${zones.length === 1 ? "" : "s"} from the currently open Scene only.`)}<div class="sbs-dz-danger"><strong>${esc(scene.name)}</strong> will be cleared. Zones on every other Scene are untouched.</div>`),
      rejectClose: false,
      modal: true,
      yes: { label: "Clear This Scene", icon: "fa-solid fa-trash-can" },
      no: { label: "Cancel", icon: "fa-solid fa-xmark" }
    });
    if (!approved) return false;
  }

  const zoneIds = new Set(zones.map(z => z.id));
  const storedCombatantIds = new Set(zones.map(z => z.timing?.combatantId).filter(Boolean));

  // As with single deletion, clear Scene data before touching initiative so combat hooks
  // cannot re-arm hazards while their tracker entries are disappearing.
  await setZones(scene, []);

  const combat = getSceneCombat(scene.id);
  if (combat) {
    for (const combatant of combat.combatants ?? []) {
      const zoneId = combatant.getFlag(MODULE_ID, "zoneId");
      if (zoneIds.has(zoneId)) storedCombatantIds.add(combatant.id);
    }
    if (storedCombatantIds.size) await safeDeleteCombatants(combat, [...storedCombatantIds]);
  }

  renderZones();
  ui.notifications.info(`Danger Zones: cleared ${zones.length} zone${zones.length === 1 ? "" : "s"} from “${scene.name}” only.`);
  return true;
}

async function armZonesForCombat(combat, notify = false) {
  const sceneId = getCombatSceneId(combat);
  if (!combat || !sceneId) {
    if (notify) ui.notifications.warn("Danger Zones: there is no encounter linked to this Scene yet.");
    return;
  }
  const scene = game.scenes.get(sceneId);
  if (!scene) return;
  const zones = getZones(scene).filter(z => z.timing.enabled && z.timing.mode !== "manual" && !z.timing.resolved);
  let armed = 0;
  for (const zone of zones) {
    const result = await ensureCombatant(zone.id, combat);
    if (result) armed += 1;
  }
  if (notify) ui.notifications.info(`Danger Zones: ${armed} of ${zones.length} timed zone${zones.length === 1 ? "" : "s"} armed in this encounter.`);
}

async function ensureCombatant(zoneId, combat) {
  if (!isProcessingGM() || !combat) return null;
  const sceneId = getCombatSceneId(combat);
  const scene = sceneId ? game.scenes.get(sceneId) : null;
  if (!scene) return null;
  const zones = getZones(scene);
  const index = zones.findIndex(z => z.id === zoneId);
  if (index < 0) return null;
  const zone = zones[index];
  if (!zone.timing.enabled || zone.timing.mode === "manual" || zone.timing.resolved) return null;

  // Recover from stale flags by looking up our own zoneId flag in the tracker.
  let existing = zone.timing.combatantId ? combat.combatants.get(zone.timing.combatantId) : null;
  if (!existing) existing = combat.combatants.find(c => c.getFlag(MODULE_ID, "zoneId") === zone.id) ?? null;
  if (existing) {
    if (zone.timing.combatantId !== existing.id) {
      zones[index].timing.combatantId = existing.id;
      await setZones(scene, zones);
    }
    await updateCombatantLabel(zones[index], combat);
    return existing;
  }

  let initiative = number(zone.timing.fixedInitiative, 20);
  const allInit = combat.combatants.map(c => Number(c.initiative)).filter(Number.isFinite);
  if (zone.timing.initiativeMode === "top") initiative = (allInit.length ? Math.max(...allInit) : 20) + 1;
  if (zone.timing.initiativeMode === "bottom") initiative = (allInit.length ? Math.min(...allInit) : 0) - 1;
  if (zone.timing.initiativeMode === "roll") initiative = Number((await (new Roll("1d20")).evaluate()).total) || 10;

  try {
    const combatantType = CONFIG.Combatant?.documentClass?.TYPES?.[0] ?? "base";
    const data = {
      type: combatantType,
      name: combatantName(zone),
      img: MACRO_IMG,
      initiative,
      hidden: false,
      defeated: false,
      flags: { [MODULE_ID]: { zoneId: zone.id } }
    };
    const [combatant] = await combat.createEmbeddedDocuments("Combatant", [data]);
    if (!combatant) throw new Error("Foundry returned no Combatant document.");
    zones[index].timing.combatantId = combatant.id;
    await setZones(scene, zones);
    console.log(`${MODULE_TITLE} | Armed “${zone.name}” at initiative ${initiative}.`, combatant);
    return combatant;
  } catch (err) {
    console.error(`${MODULE_TITLE} | Failed to create actorless hazard combatant`, err);
    ui.notifications.error(`Danger Zones could not add “${zone.name}” to the encounter tracker. Check F12 console.`);
    return null;
  }
}

async function processBoundary(combat, state, phase) {
  const sceneId = getCombatSceneId(combat);
  const scene = sceneId ? game.scenes.get(sceneId) : null;
  if (!scene || !state?.combatantId) return;
  const zones = getZones(scene);
  const zone = zones.find(z => z.timing.combatantId === state.combatantId || combat.combatants.get(state.combatantId)?.getFlag(MODULE_ID, "zoneId") === z.id);
  if (!zone || zone.timing.resolved || zone.timing.trigger !== phase) return;

  const key = `${combat.id}:${zone.id}:${state.round ?? combat.round}:${state.turn ?? combat.turn}:${phase}`;
  if (processedHazardBoundaries.has(key)) return;
  processedHazardBoundaries.add(key);
  // Keep the guard bounded during long campaigns.
  if (processedHazardBoundaries.size > 500) {
    for (const old of [...processedHazardBoundaries].slice(0, 250)) processedHazardBoundaries.delete(old);
  }
  await processHazardTurn(scene, zone.id, combat);
}

async function processHazardTurn(scene, zoneId, combat) {
  const zones = getZones(scene);
  const index = zones.findIndex(z => z.id === zoneId);
  if (index < 0) return;
  const zone = zones[index];
  if (zone.timing.resolved || !zone.timing.enabled || zone.timing.mode === "manual") return;

  const remaining = Math.max(1, integer(zone.timing.remaining, zone.timing.countdown || 1));
  if (remaining > 1) {
    zone.timing.remaining = remaining - 1;
    zones[index] = zone;
    await setZones(scene, zones);
    await updateCombatantLabel(zone, combat);
    return;
  }

  zone.timing.remaining = 0;
  zones[index] = zone;
  await setZones(scene, zones);
  await updateCombatantLabel(zone, combat);
  await activateZone(scene, zone.id, { manual: false, combat });
}

async function fireZoneById(scene, zoneId, { manual = false } = {}) {
  if (!scene) return;
  if (!isProcessingGM() && !manual) return;
  return activateZone(scene, zoneId, { manual, combat: getSceneCombat(scene.id) });
}

async function activateZone(scene, zoneId, { manual = false, combat = null } = {}) {
  let zones = getZones(scene);
  let index = zones.findIndex(z => z.id === zoneId);
  if (index < 0) return;
  let zone = zones[index];

  const targets = collectTargets(zone, scene);
  const targetNames = targets.map(t => t.name);

  let damageRoll = null;
  let healRoll = null;
  if (zone.effects.damageFormula) {
    try {
      damageRoll = await (new Roll(zone.effects.damageFormula)).evaluate();
      await damageRoll.toMessage({
        speaker: ChatMessage.getSpeaker(),
        flavor: `<strong>${esc(zone.name)}</strong> — Damage`
      });
    } catch (err) {
      ui.notifications.error(`Danger Zones: invalid damage formula “${zone.effects.damageFormula}”.`);
      console.error(err);
    }
  }
  if (zone.effects.healFormula) {
    try {
      healRoll = await (new Roll(zone.effects.healFormula)).evaluate();
      await healRoll.toMessage({
        speaker: ChatMessage.getSpeaker(),
        flavor: `<strong>${esc(zone.name)}</strong> — Healing`
      });
    } catch (err) {
      ui.notifications.error(`Danger Zones: invalid healing formula “${zone.effects.healFormula}”.`);
      console.error(err);
    }
  }

  const results = [];
  for (const token of targets) {
    const actor = token.actor;
    if (!actor) continue;
    let save = null;
    if (zone.effects.saveEnabled) save = await rollAutomaticSave(actor, zone);

    let damage = damageRoll?.total ?? 0;
    if (save?.success) {
      if (zone.effects.saveSuccess === "half") damage = Math.floor(damage / 2);
      if (zone.effects.saveSuccess === "none") damage = 0;
    }

    if (damage > 0) await applyDamage(actor, damage, zone.effects.damageType);
    const healing = healRoll?.total ?? 0;
    if (healing > 0) await applyHealing(actor, healing);
    results.push({ token, save, damage, healing });
  }

  if (zone.effects.message) {
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker(),
      content: `<div class="sbs-danger-zone-chat"><h3>⚠ ${esc(zone.name)}</h3><p>${formatMessage(zone.effects.message)}</p><p><strong>Affected:</strong> ${targetNames.length ? targetNames.map(esc).join(", ") : "Nobody"}</p></div>`
    });
  }

  if (zone.effects.notification) ui.notifications.info(`${zone.name}: ${zone.effects.notification}`);
  if (zone.effects.sound) await playSound(zone.effects.sound);
  if (zone.effects.macroRef) await runZoneMacro(zone.effects.macroRef, zone, targets, results);

  if (!zone.effects.message && (zone.effects.saveEnabled || damageRoll || healRoll)) {
    const summaries = results.map(r => {
      const bits = [];
      if (r.save) bits.push(`${r.save.success ? "SAVE" : "FAIL"} ${r.save.total} vs DC ${zone.effects.saveDC}`);
      if (r.damage) bits.push(`${r.damage} damage`);
      if (r.healing) bits.push(`${r.healing} healing`);
      return `<li><strong>${esc(r.token.name)}</strong>: ${bits.join("; ") || "no effect"}</li>`;
    }).join("");
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker(),
      content: `<h3>⚠ ${esc(zone.name)}</h3>${summaries ? `<ul>${summaries}</ul>` : `<p>No qualifying tokens were affected.</p>`}`
    });
  }

  zones = getZones(scene);
  index = zones.findIndex(z => z.id === zoneId);
  if (index < 0) return;
  zone = zones[index];
  zone.timing.activations = integer(zone.timing.activations, 0) + 1;

  const isRepeating = zone.timing.mode === "repeat";
  const repeatFinished = isRepeating && zone.timing.repeatCount > 0 && zone.timing.activations >= zone.timing.repeatCount;
  if (isRepeating && !repeatFinished) {
    zone.timing.remaining = Math.max(1, integer(zone.timing.repeatEvery, 1));
    transformZoneForRepeat(zone, scene);
    zones[index] = zone;
    await setZones(scene, zones);
    await updateCombatantLabel(zone, combat);
    return;
  }

  zone.timing.resolved = true;
  zone.timing.remaining = 0;

  // IMPORTANT: persist the resolved/deleted Scene state BEFORE removing the hazard
  // Combatant. Deleting a Combatant can fire combat hooks; if those hooks still see
  // an unresolved Scene flag they can re-arm the hazard during this tiny window.
  // The old order produced "delete after resolve" zones which visually came back.
  const combatantIds = new Set();
  if (zone.timing.combatantId) combatantIds.add(zone.timing.combatantId);
  if (combat) {
    for (const combatant of combat.combatants ?? []) {
      if (combatant.getFlag(MODULE_ID, "zoneId") === zoneId) combatantIds.add(combatant.id);
    }
  }

  if (zone.lifecycle.deleteWhenDone) {
    // Delete from Scene first so renderZones removes the overlay immediately and
    // armZonesForCombat has nothing left to resurrect.
    await setZones(scene, zones.filter(z => z.id !== zoneId));
  } else {
    zone.timing.combatantId = null;
    zones[index] = zone;
    await setZones(scene, zones);
  }

  if (combat && combatantIds.size) await safeDeleteCombatants(combat, [...combatantIds]);
}

function transformZoneForRepeat(zone, scene) {
  const direction = number(zone.pattern.direction, 1) || 1;
  const ppu = pixelsPerUnit(scene);
  const dx = number(zone.pattern.moveX, 0) * ppu * direction;
  const dy = number(zone.pattern.moveY, 0) * ppu * direction;
  if (zone.follow.enabled) {
    zone.follow.offsetX += dx;
    zone.follow.offsetY += dy;
  } else {
    zone.position.x += dx;
    zone.position.y += dy;
  }
  zone.geometry.rotation = normalizeDegrees(number(zone.geometry.rotation, 0) + number(zone.pattern.rotate, 0) * direction);
  zone.geometry.radius = Math.max(0.5, number(zone.geometry.radius, 10) + number(zone.pattern.radiusDelta, 0) * direction);
  zone.geometry.innerRadius = Math.max(0, Math.min(zone.geometry.radius - 0.1, number(zone.geometry.innerRadius, 5) + number(zone.pattern.radiusDelta, 0) * direction));
  zone.geometry.width = Math.max(0.5, number(zone.geometry.width, 10) + number(zone.pattern.widthDelta, 0) * direction);
  zone.geometry.beamWidth = Math.max(0.5, number(zone.geometry.beamWidth, 5) + number(zone.pattern.widthDelta, 0) * direction);
  zone.geometry.height = Math.max(0.5, number(zone.geometry.height, 20) + number(zone.pattern.heightDelta, 0) * direction);
  zone.geometry.distance = Math.max(0.5, number(zone.geometry.distance, 30) + number(zone.pattern.heightDelta, 0) * direction);
  if (zone.pattern.pingPong) zone.pattern.direction = direction * -1;
}

async function rollAutomaticSave(actor, zone) {
  const ability = zone.effects.saveAbility;
  const dc = zone.effects.saveDC;
  const abilityData = actor.system?.abilities?.[ability] ?? {};
  let mod = abilityData.save?.value;
  if (!Number.isFinite(Number(mod))) mod = abilityData.save;
  if (!Number.isFinite(Number(mod))) mod = abilityData.mod;
  mod = Number(mod) || 0;

  const roll = await (new Roll("1d20 + @mod", { mod })).evaluate();
  const total = Number(roll.total) || 0;
  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: `<strong>${esc(zone.name)}</strong> — ${ability.toUpperCase()} Saving Throw, DC ${dc}`
  });
  return { total, success: total >= dc, roll };
}

async function applyDamage(actor, amount, damageType) {
  if (game.system.id === "dnd5e" && typeof actor.applyDamage === "function") {
    try {
      await actor.applyDamage([{ value: amount, type: damageType }], {});
      return;
    } catch (err) {
      if (!warnedNativeDamageFallback) {
        warnedNativeDamageFallback = true;
        console.warn(`${MODULE_TITLE} | D&D5e native applyDamage call failed; using direct HP fallback for this session.`, err);
      }
    }
  }
  return fallbackHpChange(actor, -Math.abs(amount));
}

async function applyHealing(actor, amount) {
  return fallbackHpChange(actor, Math.abs(amount));
}

async function fallbackHpChange(actor, delta) {
  const hp = actor.system?.attributes?.hp;
  if (!hp) return;
  let value = Number(hp.value) || 0;
  const max = Number(hp.max) || value;
  let temp = Number(hp.temp) || 0;

  if (delta < 0) {
    let incoming = Math.abs(delta);
    const usedTemp = Math.min(temp, incoming);
    temp -= usedTemp;
    incoming -= usedTemp;
    value = Math.max(0, value - incoming);
  } else {
    value = Math.min(max, value + delta);
  }

  await actor.update({ "system.attributes.hp.value": value, "system.attributes.hp.temp": temp });
}

async function playSound(src) {
  try {
    const helper = foundry.audio?.AudioHelper ?? globalThis.AudioHelper;
    if (helper?.play) await helper.play({ src, volume: 0.8, autoplay: true, loop: false }, true);
  } catch (err) {
    console.warn(`${MODULE_TITLE} | Failed to play sound`, err);
  }
}

async function runZoneMacro(ref, zone, targets, results) {
  try {
    let macro = game.macros.getName(ref) ?? null;
    if (!macro && ref.includes(".")) {
      const doc = await fromUuid(ref);
      if (doc?.documentName === "Macro") macro = doc;
    }
    if (!macro) return ui.notifications.warn(`Danger Zones: macro “${ref}” was not found.`);
    await macro.execute({ zone: foundry.utils.deepClone(zone), targets, results });
  } catch (err) {
    console.error(`${MODULE_TITLE} | Zone macro failed`, err);
    ui.notifications.error(`Danger Zones: macro “${ref}” failed.`);
  }
}

function collectTargets(zone, scene) {
  if (scene.id !== canvas.scene?.id) return [];
  return (canvas.tokens?.placeables ?? []).filter(token => {
    if (!token.actor) return false;
    const actorType = token.actor.type;
    if (zone.targeting.creatures === "pc" && actorType !== "character") return false;
    if (zone.targeting.creatures === "npc" && actorType === "character") return false;

    const disp = token.document.disposition;
    if (zone.targeting.disposition === "friendly" && disp !== CONST.TOKEN_DISPOSITIONS.FRIENDLY) return false;
    if (zone.targeting.disposition === "hostile" && disp !== CONST.TOKEN_DISPOSITIONS.HOSTILE) return false;
    if (zone.targeting.disposition === "neutral" && disp !== CONST.TOKEN_DISPOSITIONS.NEUTRAL) return false;

    const elevation = Number(token.document.elevation) || 0;
    if (Number.isFinite(zone.targeting.elevationMin) && elevation < zone.targeting.elevationMin) return false;
    if (Number.isFinite(zone.targeting.elevationMax) && elevation > zone.targeting.elevationMax) return false;

    const center = token.center ?? {
      x: token.document.x + (token.document.width * canvas.grid.size / 2),
      y: token.document.y + (token.document.height * canvas.grid.size / 2)
    };
    let inside = pointInZone(center.x, center.y, zone, scene);
    if (inside && zone.targeting.restrainedByWalls) {
      inside = !wallBlocksPoint(zone, center, elevation);
    }
    return zone.safeZone ? !inside : inside;
  });
}

function pointInZone(x, y, zone, scene) {
  const center = resolvedCenter(zone);
  const ppu = pixelsPerUnit(scene);
  const rotation = resolvedRotation(zone);
  const dx = x - center.x;
  const dy = y - center.y;
  const r = Math.hypot(dx, dy);

  if (zone.shape === "circle") return r <= zone.geometry.radius * ppu;
  if (zone.shape === "ring") return r <= zone.geometry.radius * ppu && r >= zone.geometry.innerRadius * ppu;

  if (zone.shape === "cone") {
    if (r > zone.geometry.distance * ppu) return false;
    const pointAngle = normalizeDegrees(radToDeg(Math.atan2(dy, dx)));
    return angularDifference(pointAngle, rotation) <= zone.geometry.angle / 2;
  }

  const local = rotatePoint(dx, dy, -rotation);
  if (zone.shape === "rectangle") {
    return Math.abs(local.x) <= (zone.geometry.width * ppu / 2) && Math.abs(local.y) <= (zone.geometry.height * ppu / 2);
  }
  if (zone.shape === "line") {
    return Math.abs(local.x) <= (zone.geometry.distance * ppu / 2) && Math.abs(local.y) <= (zone.geometry.beamWidth * ppu / 2);
  }
  return false;
}

/**
 * Return true when a movement-blocking wall separates the zone's origin from
 * the supplied point. "move" walls are used intentionally: a window which can
 * be seen through but cannot be walked through still restrains a physical area
 * effect, while an open door does not.
 */
function wallBlocksPoint(zone, point, elevation = 0) {
  if (!zone?.targeting?.restrainedByWalls) return false;
  const Sweep = foundry.canvas?.geometry?.ClockwiseSweepPolygon;
  if (!Sweep?.testCollision) return false;

  const origin = resolvedCenter(zone);
  const sourceElevation = zone.follow?.enabled && zone.follow?.tokenId
    ? Number(canvas.tokens?.get(zone.follow.tokenId)?.document?.elevation ?? 0) || 0
    : 0;

  try {
    return Boolean(Sweep.testCollision(
      { x: origin.x, y: origin.y, elevation: sourceElevation },
      { x: point.x, y: point.y, elevation: Number(elevation) || 0 },
      { type: "move", mode: "any" }
    ));
  } catch (err) {
    console.warn(`${MODULE_TITLE} | Wall collision test failed; treating the point as unblocked.`, err);
    return false;
  }
}

/**
 * Draw a wall-constrained mask around a zone. The underlying telegraph is still
 * responsible for its circle/rectangle/cone/etc. shape; this mask simply cuts
 * away portions which cannot be reached from the zone origin without crossing
 * a movement-blocking wall.
 */
function drawWallMask(mask, zone) {
  mask.clear();
  const Sweep = foundry.canvas?.geometry?.ClockwiseSweepPolygon;
  if (!Sweep?.create) return;

  const center = resolvedCenter(zone);
  const radius = Math.max(2, zoneBoundingRadiusPixels(zone, canvas.scene) + 4);
  const sourceElevation = zone.follow?.enabled && zone.follow?.tokenId
    ? Number(canvas.tokens?.get(zone.follow.tokenId)?.document?.elevation ?? 0) || 0
    : 0;

  try {
    const polygon = Sweep.create(
      { x: center.x, y: center.y, elevation: sourceElevation },
      { type: "move", radius }
    );
    const points = polygonPointsToObjects(polygon?.points ?? polygon);
    if (points.length < 3) return;
    mask.beginFill(0xFFFFFF, 1);
    drawPolygonPath(mask, points);
    mask.endFill();
  } catch (err) {
    // Fail open visually if Foundry changes the polygon backend. Targeting also
    // fails open in wallBlocksPoint, so display and mechanics remain consistent.
    console.warn(`${MODULE_TITLE} | Could not build wall-restrained zone mask.`, err);
    mask.beginFill(0xFFFFFF, 1);
    mask.drawCircle(center.x, center.y, radius);
    mask.endFill();
  }
}

function polygonPointsToObjects(points) {
  if (!points) return [];
  if (Array.isArray(points)) {
    if (!points.length) return [];
    if (typeof points[0] === "number") {
      const out = [];
      for (let i = 0; i + 1 < points.length; i += 2) out.push({ x: points[i], y: points[i + 1] });
      return out;
    }
    return points.map(p => ({ x: Number(p.x) || 0, y: Number(p.y) || 0 }));
  }
  // PIXI/Foundry polygons generally expose a flat .points array, but tolerate
  // iterable point collections for future compatibility.
  try { return polygonPointsToObjects([...points]); } catch (_) { return []; }
}

function zoneBoundingRadiusPixels(zone, scene = canvas.scene) {
  const ppu = pixelsPerUnit(scene);
  const g = zone.geometry;
  if (zone.shape === "circle" || zone.shape === "ring") return Math.max(1, number(g.radius, 10) * ppu);
  if (zone.shape === "cone") return Math.max(1, number(g.distance, 30) * ppu);
  if (zone.shape === "line") {
    return Math.hypot(number(g.distance, 30) * ppu / 2, number(g.beamWidth, 5) * ppu / 2);
  }
  if (zone.shape === "rectangle") {
    return Math.hypot(number(g.width, 10) * ppu / 2, number(g.height, 20) * ppu / 2);
  }
  return 100 * ppu;
}

function renderZones() {
  if (!canvas?.ready || !canvas.scene || !canvas.interface) return;
  destroyOverlay();
  overlayContainer = new PIXI.Container();
  overlayContainer.eventMode = "none";
  overlayContainer.zIndex = 9999;
  canvas.interface.addChild(overlayContainer);

  for (const zone of getZones(canvas.scene)) {
    if (!shouldRenderZone(zone)) continue;
    try {
      const group = new PIXI.Container();
      group.eventMode = "none";
      group._sbsPulse = !!zone.appearance.pulse;
      group._sbsZone = zone;

      const g = new PIXI.Graphics();
      group._sbsGraphic = g;
      drawZoneGraphic(g, zone);
      group.addChild(g);

      // A restrained zone is visually clipped by the same movement-blocking wall
      // geometry that is used for target resolution. The mask lives beside the
      // group in the overlay container so it does not recursively mask itself.
      if (zone.targeting.restrainedByWalls) {
        const mask = new PIXI.Graphics();
        mask.eventMode = "none";
        drawWallMask(mask, zone);
        group._sbsWallMask = mask;
        overlayContainer.addChild(mask);
        group.mask = mask;
      }

      if (zone.appearance.label) {
        const remaining = zone.timing.enabled && !zone.timing.resolved ? integer(zone.timing.remaining, 0) : null;
        const suffix = zone.appearance.showCountdown && remaining !== null ? `\n${Math.max(1, remaining)}` : "";
        const label = new PIXI.Text(`${zone.safeZone ? "✓ " : "⚠ "}${zone.name}${suffix}`, {
          fontFamily: "Arial",
          fontSize: 22,
          fontWeight: "bold",
          fill: 0xFFFFFF,
          align: "center",
          stroke: 0x000000,
          strokeThickness: 5
        });
        label.anchor.set(0.5);
        const center = resolvedCenter(zone);
        label.position.set(center.x, center.y);
        group._sbsLabel = label;
        group.addChild(label);
      }

      const initialCenter = resolvedCenter(zone);
      group._sbsLastCenter = { x: initialCenter.x, y: initialCenter.y };
      group._sbsLastRotation = resolvedRotation(zone);
      overlayContainer.addChild(group);
    } catch (err) {
      console.error(`${MODULE_TITLE} | Could not render ${zone.shape} zone “${zone.name}”.`, err, zone);
    }
  }

  bindPulseTicker();
}

function shouldRenderZone(zone) {
  if (game.user.isGM) return true;
  if (zone.appearance.visibility === "gm") return false;
  if (zone.appearance.hiddenToPlayers) return false;
  if (zone.timing.enabled && !zone.timing.resolved && zone.timing.remaining > zone.appearance.revealAt) return false;
  return true;
}

function bindPulseTicker() {
  if (pulseTickerBound || !canvas?.app?.ticker) return;
  pulseTickerBound = true;
  canvas.app.ticker.add(() => {
    if (!overlayContainer) return;
    const pulse = 0.78 + (Math.sin(Date.now() / 230) + 1) * 0.11;
    for (const child of overlayContainer.children) {
      child.alpha = child._sbsPulse ? pulse : 1;
      refreshFollowingZoneGroup(child);
    }
  });
}

/**
 * Keep attached telegraphs centered on the Token's *rendered* position while a
 * Foundry movement animation is in progress. updateToken fires when the
 * document changes, before the Token has necessarily finished animating across
 * the canvas; a one-shot redraw therefore left overlays behind on long moves.
 * The lightweight ticker check redraws only when the rendered center/rotation
 * actually changes.
 */
function refreshFollowingZoneGroup(group) {
  const zone = group?._sbsZone;
  if (!zone?.follow?.enabled || !group._sbsGraphic) return;
  const token = zone.follow.tokenId ? canvas.tokens?.get(zone.follow.tokenId) : null;
  if (!token) return;

  const center = resolvedCenter(zone);
  const rotation = resolvedRotation(zone);
  const prior = group._sbsLastCenter ?? center;
  const moved = Math.hypot(center.x - prior.x, center.y - prior.y) > 0.25;
  const rotated = angularDifference(rotation, number(group._sbsLastRotation, rotation)) > 0.05;
  if (!moved && !rotated) return;

  drawZoneGraphic(group._sbsGraphic, zone);
  if (group._sbsLabel) group._sbsLabel.position.set(center.x, center.y);
  if (group._sbsWallMask) drawWallMask(group._sbsWallMask, zone);
  group._sbsLastCenter = { x: center.x, y: center.y };
  group._sbsLastRotation = rotation;
}

function destroyOverlay() {
  if (!overlayContainer) return;
  try { overlayContainer.parent?.removeChild(overlayContainer); } catch (_) {}
  try { overlayContainer.destroy({ children: true }); } catch (_) {}
  overlayContainer = null;
}

function drawZoneGraphic(g, zone, { preview = false } = {}) {
  g.clear();
  const scene = canvas.scene;
  const ppu = pixelsPerUnit(scene);
  const color = hexToNumber(zone.appearance.color);
  const alpha = preview ? Math.min(0.18, zone.appearance.opacity) : zone.appearance.opacity;
  const center = resolvedCenter(zone);
  const rotation = resolvedRotation(zone);
  const strokeWidth = preview ? 2 : 4;

  if (zone.shape === "circle") {
    g.lineStyle(strokeWidth, color, 0.95);
    g.beginFill(color, alpha);
    g.drawCircle(center.x, center.y, Math.max(1, zone.geometry.radius * ppu));
    g.endFill();
    return;
  }

  if (zone.shape === "ring") {
    drawAnnulus(g, center.x, center.y, zone.geometry.innerRadius * ppu, zone.geometry.radius * ppu, color, alpha, strokeWidth);
    return;
  }

  let points = [];
  if (zone.shape === "rectangle") {
    points = rotatedRectangle(center.x, center.y, zone.geometry.width * ppu, zone.geometry.height * ppu, rotation);
  } else if (zone.shape === "line") {
    points = rotatedRectangle(center.x, center.y, zone.geometry.distance * ppu, zone.geometry.beamWidth * ppu, rotation);
  } else if (zone.shape === "cone") {
    points = conePolygon(center.x, center.y, zone.geometry.distance * ppu, zone.geometry.angle, rotation);
  }

  if (points.length >= 3) {
    g.lineStyle(strokeWidth, color, 0.95);
    g.beginFill(color, alpha);
    drawPolygonPath(g, points);
    g.endFill();
  }
}

// Use moveTo/lineTo paths instead of passing raw number arrays to drawPolygon.
// Foundry v13's canvas is Pixi-powered and path primitives are the most boring,
// dependable option across the Graphics implementations it exposes. Boring is good.
function drawPolygonPath(g, points) {
  if (!points?.length) return;
  g.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) g.lineTo(points[i].x, points[i].y);
  g.closePath();
}

// Draw a ring as small filled quadrilaterals instead of using beginHole/endHole.
// This avoids the renderer-specific hole behavior that caused rings to appear as
// solid circles on some Foundry v13 installations.
function drawAnnulus(g, cx, cy, innerRadius, outerRadius, color, alpha, strokeWidth) {
  const outer = Math.max(1, Number(outerRadius) || 1);
  const inner = Math.max(0, Math.min(outer - 1, Number(innerRadius) || 0));
  if (inner <= 0) {
    g.lineStyle(strokeWidth, color, 0.95);
    g.beginFill(color, alpha);
    g.drawCircle(cx, cy, outer);
    g.endFill();
    return;
  }

  const steps = Math.max(48, Math.min(144, Math.ceil(outer / 8)));
  g.lineStyle(0, color, 0);
  g.beginFill(color, alpha);
  for (let i = 0; i < steps; i++) {
    const a0 = (Math.PI * 2 * i) / steps;
    const a1 = (Math.PI * 2 * (i + 1)) / steps;
    drawPolygonPath(g, [
      { x: cx + Math.cos(a0) * outer, y: cy + Math.sin(a0) * outer },
      { x: cx + Math.cos(a1) * outer, y: cy + Math.sin(a1) * outer },
      { x: cx + Math.cos(a1) * inner, y: cy + Math.sin(a1) * inner },
      { x: cx + Math.cos(a0) * inner, y: cy + Math.sin(a0) * inner }
    ]);
  }
  g.endFill();

  g.lineStyle(strokeWidth, color, 0.95);
  g.drawCircle(cx, cy, outer);
  g.drawCircle(cx, cy, inner);
}

function resolvedCenter(zone) {
  if (zone.follow.enabled && zone.follow.tokenId && canvas?.tokens) {
    const token = canvas.tokens.get(zone.follow.tokenId);
    if (token) return { x: token.center.x + zone.follow.offsetX, y: token.center.y + zone.follow.offsetY };
  }
  return zone.position;
}

function resolvedRotation(zone) {
  let rotation = number(zone.geometry.rotation, 0);
  if (zone.follow.enabled && zone.follow.rotateWithToken && zone.follow.tokenId && canvas?.tokens) {
    const token = canvas.tokens.get(zone.follow.tokenId);
    if (token) rotation += number(token.document.rotation, 0);
  }
  return normalizeDegrees(rotation);
}

function rotatedRectangle(cx, cy, width, height, degrees) {
  const corners = [
    { x: -width / 2, y: -height / 2 },
    { x: width / 2, y: -height / 2 },
    { x: width / 2, y: height / 2 },
    { x: -width / 2, y: height / 2 }
  ];
  return corners.map(p => {
    const r = rotatePoint(p.x, p.y, degrees);
    return { x: cx + r.x, y: cy + r.y };
  });
}

function conePolygon(cx, cy, distance, angle, rotation) {
  const points = [{ x: cx, y: cy }];
  const steps = Math.max(8, Math.ceil(angle / 10));
  const start = rotation - angle / 2;
  for (let i = 0; i <= steps; i++) {
    const a = degToRad(start + angle * i / steps);
    points.push({ x: cx + Math.cos(a) * distance, y: cy + Math.sin(a) * distance });
  }
  return points;
}

function shapeFields(draft) {
  const commonRotation = field("Rotation / Direction", `<input type="number" name="rotation" step="1" value="${num(draft.geometry.rotation, 0)}"><span class="hint">0° points right/east; 90° points down/south on the canvas.</span>`);
  if (draft.shape === "circle") return `<div class="sbs-dz-grid">${field("Radius", `<input type="number" name="radius" min="0.5" step="0.5" value="${num(draft.geometry.radius, 10)}">`)}</div>`;
  if (draft.shape === "ring") return `<div class="sbs-dz-grid">${field("Outer Radius", `<input type="number" name="radius" min="0.5" step="0.5" value="${num(draft.geometry.radius, 10)}">`)}${field("Inner Radius", `<input type="number" name="innerRadius" min="0" step="0.5" value="${num(draft.geometry.innerRadius, 5)}">`)}</div>`;
  if (draft.shape === "rectangle") return `<div class="sbs-dz-grid">${field("Width", `<input type="number" name="width" min="0.5" step="0.5" value="${num(draft.geometry.width, 10)}">`)}${field("Length / Height", `<input type="number" name="height" min="0.5" step="0.5" value="${num(draft.geometry.height, 20)}">`)}${commonRotation}</div>`;
  if (draft.shape === "line") return `<div class="sbs-dz-grid">${field("Beam Length", `<input type="number" name="distance" min="0.5" step="0.5" value="${num(draft.geometry.distance, 30)}">`)}${field("Beam Width", `<input type="number" name="beamWidth" min="0.5" step="0.5" value="${num(draft.geometry.beamWidth, 5)}">`)}${commonRotation}</div>`;
  if (draft.shape === "cone") return `<div class="sbs-dz-grid">${field("Distance", `<input type="number" name="distance" min="0.5" step="0.5" value="${num(draft.geometry.distance, 30)}">`)}${field("Cone Angle", `<input type="number" name="angle" min="1" max="359" step="1" value="${num(draft.geometry.angle, 90)}">`)}${commonRotation}</div>`;
  return "";
}

function applyShapeFields(draft, fd) {
  if ("radius" in fd) draft.geometry.radius = Math.max(0.5, number(fd.radius, 10));
  if ("innerRadius" in fd) draft.geometry.innerRadius = Math.max(0, Math.min(draft.geometry.radius - 0.1, number(fd.innerRadius, 5)));
  if ("width" in fd) draft.geometry.width = Math.max(0.5, number(fd.width, 10));
  if ("height" in fd) draft.geometry.height = Math.max(0.5, number(fd.height, 20));
  if ("distance" in fd) draft.geometry.distance = Math.max(0.5, number(fd.distance, 30));
  if ("beamWidth" in fd) draft.geometry.beamWidth = Math.max(0.5, number(fd.beamWidth, 5));
  if ("angle" in fd) draft.geometry.angle = clamp(number(fd.angle, 90), 1, 359);
  if ("rotation" in fd) draft.geometry.rotation = normalizeDegrees(number(fd.rotation, 0));
}

async function updateCombatantLabel(zone, combat = getSceneCombat(zone.sceneId ?? canvas.scene?.id)) {
  if (!combat || !zone.timing.combatantId) return;
  const combatant = combat.combatants.get(zone.timing.combatantId);
  if (!combatant) return;
  try { await combatant.update({ name: combatantName(zone) }); } catch (_) {}
}

function combatantName(zone) {
  const remaining = Math.max(0, integer(zone.timing.remaining, 0));
  const count = remaining > 0 ? remaining : "NOW";
  const repeat = zone.timing.mode === "repeat" ? " ↻" : "";
  return `${zone.safeZone ? "✓" : "⚠"} ${zone.name}${repeat} [${count}]`;
}

async function safeDeleteCombatant(combat, combatantId) {
  if (!combatantId) return;
  return safeDeleteCombatants(combat, [combatantId]);
}

async function safeDeleteCombatants(combat, combatantIds) {
  if (!combat) return;
  const ids = [...new Set(combatantIds ?? [])].filter(id => combat.combatants?.get(id));
  if (!ids.length) return;
  try {
    await combat.deleteEmbeddedDocuments("Combatant", ids);
  } catch (err) {
    console.warn(`${MODULE_TITLE} | Could not remove one or more hazard Combatants.`, err);
  }
}

function getSceneCombat(sceneId = canvas.scene?.id) {
  if (!sceneId || !game.combats) return null;
  const candidates = [game.combats.active, game.combats.viewed, ...(game.combats.combats ?? []), ...(game.combats.contents ?? [])].filter(Boolean);
  const unique = [...new Map(candidates.map(c => [c.id, c])).values()];
  return unique.find(c => getCombatSceneId(c) === sceneId) ?? null;
}

function getCombatSceneId(combat) {
  if (!combat) return null;
  const direct = combat.scene;
  if (typeof direct === "string" && direct) return direct;
  if (direct?.id) return direct.id;
  const source = combat._source?.scene;
  if (typeof source === "string" && source) return source;
  if (source?.id) return source.id;
  if (combat.isActive && canvas?.scene?.id) return canvas.scene.id;
  return null;
}



function isProcessingGM() {
  if (!game.user?.isGM) return false;
  const activeGMs = game.users.filter(u => u.active && u.isGM).sort((a, b) => a.id.localeCompare(b.id));
  return !activeGMs.length || activeGMs[0].id === game.user.id;
}

function getZones(scene) {
  if (!scene) return [];
  const raw = scene.getFlag(MODULE_ID, FLAG_ZONES) ?? [];
  return Array.isArray(raw) ? foundry.utils.deepClone(raw).map(mergeZone) : [];
}

async function setZones(scene, zones) {
  await scene.setFlag(MODULE_ID, FLAG_ZONES, zones);
  if (scene.id === canvas.scene?.id) renderZones();
}

function mergeZone(input) {
  const merged = foundry.utils.mergeObject(foundry.utils.deepClone(DEFAULT_ZONE), foundry.utils.deepClone(input ?? {}), {
    inplace: false,
    insertKeys: true,
    insertValues: true,
    overwrite: true,
    recursive: true
  });

  // Migrate v0.1.x zones into the clearer v0.2 behavior model.
  if (!input?.timing?.mode) {
    if (input?.timing?.enabled === false) merged.timing.mode = "manual";
    else if (input?.timing?.repeat) merged.timing.mode = "repeat";
    else merged.timing.mode = "countdown";
  }
  if (!["countdown", "repeat", "manual"].includes(merged.timing.mode)) merged.timing.mode = "countdown";
  merged.timing.enabled = merged.timing.mode !== "manual";
  merged.timing.repeat = merged.timing.mode === "repeat";
  merged.timing.resolved = Boolean(merged.timing.resolved);
  if (merged.timing.enabled && !merged.timing.resolved) {
    merged.timing.countdown = Math.max(1, integer(merged.timing.countdown, 1));
    if (!Number.isFinite(Number(merged.timing.remaining)) || merged.timing.remaining < 1) merged.timing.remaining = merged.timing.countdown;
  }
  merged.targeting.restrainedByWalls = Boolean(merged.targeting.restrainedByWalls);
  return merged;
}

function pixelsPerUnit(scene = canvas.scene) {
  const size = Number(scene?.grid?.size ?? canvas.grid?.size ?? 100) || 100;
  const distance = Number(scene?.grid?.distance ?? canvas.scene?.grid?.distance ?? 5) || 5;
  return size / distance;
}

function getDamageTypeChoices() {
  if (game.system.id === "dnd5e") {
    const raw = CONFIG.DND5E?.damageTypes ?? {};
    const choices = {};
    for (const [key, value] of Object.entries(raw)) {
      choices[key] = typeof value === "string" ? value : (value?.label ?? key);
    }
    if (Object.keys(choices).length) return choices;
  }
  return {
    bludgeoning: "Bludgeoning",
    piercing: "Piercing",
    slashing: "Slashing",
    acid: "Acid",
    cold: "Cold",
    fire: "Fire",
    force: "Force",
    lightning: "Lightning",
    necrotic: "Necrotic",
    poison: "Poison",
    psychic: "Psychic",
    radiant: "Radiant",
    thunder: "Thunder"
  };
}

function abilityChoices() {
  const raw = game.system.id === "dnd5e" ? (CONFIG.DND5E?.abilities ?? {}) : {};
  const choices = {};
  for (const [key, value] of Object.entries(raw)) choices[key] = typeof value === "string" ? value : (value?.label ?? key.toUpperCase());
  return Object.keys(choices).length ? choices : { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" };
}

function zoneShapeSummary(zone) {
  const g = zone.geometry ?? {};
  if (zone.shape === "circle") return `Circle · r ${num(g.radius, 0)}`;
  if (zone.shape === "ring") return `Ring · ${num(g.innerRadius, 0)}–${num(g.radius, 0)}`;
  if (zone.shape === "rectangle") return `Rectangle · ${num(g.width, 0)}×${num(g.height, 0)} @ ${num(g.rotation, 0)}°`;
  if (zone.shape === "line") return `Beam · ${num(g.distance, 0)}×${num(g.beamWidth, 0)} @ ${num(g.rotation, 0)}°`;
  if (zone.shape === "cone") return `Cone · ${num(g.distance, 0)} / ${num(g.angle, 0)}° @ ${num(g.rotation, 0)}°`;
  return String(zone.shape ?? "Zone");
}

function zoneCard(zone) {
  const behavior = zone.timing.mode === "manual" ? "Manual" : zone.timing.mode === "repeat" ? `Repeats · ${zone.timing.remaining} to next` : zone.timing.resolved ? "Resolved" : `Countdown · ${zone.timing.remaining}`;
  const shapeDetail = zoneShapeSummary(zone);
  const vis = zone.appearance.hiddenToPlayers ? "Hidden" : zone.appearance.visibility === "gm" ? "GM Only" : "Visible";
  const armed = zone.timing.mode === "manual" ? "No tracker" : zone.timing.combatantId ? "Tracker armed" : "Waiting for encounter";
  return `<div class="sbs-dz-zone-card" style="--dz-color:${esc(zone.appearance.color)}">
    <div>
      <strong>${zone.safeZone ? "✓" : "⚠"} ${esc(zone.name)}</strong><br>
      <span class="sbs-dz-badge">${esc(shapeDetail)}</span>
      <span class="sbs-dz-badge">${esc(behavior)}</span>
      <span class="sbs-dz-badge">${esc(armed)}</span>
      <span class="sbs-dz-badge">${vis}</span>
      ${zone.follow.enabled ? `<span class="sbs-dz-badge">Follows Token</span>` : ""}
      ${zone.targeting.restrainedByWalls ? `<span class="sbs-dz-badge">Wall-Restrained</span>` : ""}
    </div>
    <div class="hint">${zone.safeZone ? "Outside is dangerous" : "Inside is dangerous"}</div>
  </div>`;
}

function fitDialogWidth(preferred) {
  const viewport = Number(globalThis.innerWidth) || preferred;
  return Math.max(300, Math.min(preferred, viewport - 48));
}

function fitDialogHeight(preferred) {
  const viewport = Number(globalThis.innerHeight) || preferred;
  return Math.max(420, Math.min(preferred, viewport - 72));
}

async function inputDialog({ title, content, width = 560, okLabel = "Next" }) {
  return DialogV2.input({
    classes: ["sbs-danger-zones-dialog"],
    window: { title, icon: "fa-solid fa-triangle-exclamation", resizable: true, contentClasses: ["sbs-danger-zones-window"] },
    position: { width: fitDialogWidth(width), height: fitDialogHeight(760) },
    content,
    rejectClose: false,
    ok: { label: okLabel, icon: "fa-solid fa-arrow-right" }
  });
}

function wrapContent(inner) {
  // DialogV2 requires an HTMLElement content root to be a completely plain DIV.
  const wrapper = document.createElement("div");
  wrapper.innerHTML = `<div class="sbs-dz"><div class="sbs-dz-scroll">${inner}</div></div>`;
  return wrapper;
}

function hero(title, subtitle) {
  return `<div class="sbs-dz-hero"><img src="${LOGO_IMG}" alt="Danger Zones"><div><h2>${esc(title)}</h2><div class="hint">${esc(subtitle)}</div></div></div>`;
}

function field(label, input) {
  return `<div class="sbs-dz-field"><label>${esc(label)}</label>${input}</div>`;
}

function check(name, label, checked = false, disabled = false) {
  return `<div class="sbs-dz-field inline"><label for="${name}">${esc(label)}</label><input id="${name}" type="checkbox" name="${name}" ${checked ? "checked" : ""} ${disabled ? "disabled" : ""}></div>`;
}

function select(name, choices, selected) {
  return `<select name="${name}">${Object.entries(choices).map(([value, label]) => `<option value="${esc(value)}" ${value === selected ? "selected" : ""}>${esc(label)}</option>`).join("")}</select>`;
}

function formatMessage(text) {
  return esc(text).replace(/\n/g, "<br>");
}

function esc(value) {
  return foundry.utils.escapeHTML(String(value ?? ""));
}

function cleanString(value, fallback = "") {
  const s = String(value ?? "").trim();
  return s || fallback;
}

function bool(value) {
  return value === true || value === "true" || value === "on" || value === 1 || value === "1";
}

function number(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function integer(value, fallback = 0) {
  return Math.trunc(number(value, fallback));
}

function nullableNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function nullableNum(value) {
  return Number.isFinite(Number(value)) ? Number(value) : "";
}

function num(value, fallback = 0) {
  return number(value, fallback);
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function normalizeDegrees(deg) {
  return ((deg % 360) + 360) % 360;
}

function angularDifference(a, b) {
  const d = Math.abs(normalizeDegrees(a) - normalizeDegrees(b));
  return Math.min(d, 360 - d);
}

function degToRad(deg) { return deg * Math.PI / 180; }
function radToDeg(rad) { return rad * 180 / Math.PI; }

function rotatePoint(x, y, degrees) {
  const r = degToRad(degrees);
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: x * c - y * s, y: x * s + y * c };
}

function hexToNumber(hex) {
  const clean = String(hex ?? "#ff3b30").replace("#", "");
  const n = Number.parseInt(clean, 16);
  return Number.isFinite(n) ? n : 0xff3b30;
}
