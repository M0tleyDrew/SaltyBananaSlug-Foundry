const MODULE_ID = "saltybananaslug-actor-journal";
const MODULE_TITLE = "SaltyBananaSlug's Actor Journal";
const LOGO_PATH = `modules/${MODULE_ID}/assets/banana-slug.svg`;
const GENERATED_PAGE_FLAG = "generatedPage";
const FORM_FLAG = "savedForm";
const ACTOR_UUID_FLAG = "actorUuid";
const JOURNAL_UUID_FLAG = "journalUuid";

const OWNERSHIP = () => CONST.DOCUMENT_OWNERSHIP_LEVELS;
const PAGE_FORMAT = () => CONST.JOURNAL_ENTRY_PAGE_FORMATS?.HTML ?? 1;

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "launcherMacroCreated", {
    scope: "world",
    config: false,
    type: Boolean,
    default: false
  });

  const api = {
    open: (actor = null) => ActorJournalWizard.open(actor),
    createOrUpdate: (actor, options = {}) => ActorJournalBuilder.createOrUpdate(actor, options),
    findLinkedJournal: actor => findLinkedJournal(actor)
  };

  game.modules.get(MODULE_ID).api = api;
  globalThis.SBSActorJournal = api;
});

Hooks.once("ready", async () => {
  if (!game.user.isGM) return;
  await createLauncherMacroOnce();
});

const actorContextOption = () => ({
  name: "Create / Update Actor Journal",
  icon: '<i class="fas fa-book-open"></i>',
  condition: () => game.user.isGM,
  callback: async target => {
    const element = target?.[0] ?? target;
    const actorId = target?.data?.("documentId")
      ?? target?.data?.("entryId")
      ?? target?.attr?.("data-document-id")
      ?? element?.dataset?.documentId
      ?? element?.dataset?.entryId
      ?? element?.closest?.("[data-document-id]")?.dataset?.documentId;
    const actor = game.actors.get(actorId);
    if (!actor) return ui.notifications.error("Could not find that Actor.");
    ActorJournalWizard.open(actor);
  }
});

// Foundry v13 uses the ApplicationV2 document context hook. The legacy hook is
// also registered so the option survives alternate/legacy Actor directories.
Hooks.on("getActorContextOptions", (_application, options) => {
  if (!options.some(option => option.name === "Create / Update Actor Journal")) options.push(actorContextOption());
});

Hooks.on("getActorDirectoryEntryContext", (_html, options) => {
  if (!options.some(option => option.name === "Create / Update Actor Journal")) options.push(actorContextOption());
});

async function createLauncherMacroOnce() {
  const name = "Actor to Journal";
  const command = `const api = game.modules.get("${MODULE_ID}")?.api;\nif (!api) ui.notifications.error("${MODULE_TITLE} is not enabled.");\nelse api.open();`;
  let macro = game.macros.find(m => m.name === name && m.type === "script");
  let created = false;

  if (!macro) {
    macro = await Macro.create({
      name,
      type: "script",
      img: LOGO_PATH,
      command,
      scope: "global",
      ownership: { default: OWNERSHIP().NONE, [game.user.id]: OWNERSHIP().OWNER },
      flags: { [MODULE_ID]: { launcher: true } }
    });
    created = true;
  } else {
    const updates = {};
    if (macro.img !== LOGO_PATH) updates.img = LOGO_PATH;
    if (macro.command !== command) updates.command = command;
    if (Object.keys(updates).length && macro.isOwner) await macro.update(updates);
  }

  if (!game.settings.get(MODULE_ID, "launcherMacroCreated")) {
    await game.settings.set(MODULE_ID, "launcherMacroCreated", true);
  }
  if (created) ui.notifications.info(`Created the “${name}” macro in the Macro Directory.`);
}

class ActorJournalWizard {
  static async open(actor = null) {
    if (!game.user.isGM) {
      return ui.notifications.warn("Only a GM can create Actor journals.");
    }

    actor ??= getSelectedActor();
    const initialSaved = actor ? getSavedForm(findLinkedJournal(actor)) : null;
    const content = buildDialogHTML(actor, initialSaved);
    const height = Math.max(620, Math.min(860, window.innerHeight - 110));
    const width = Math.max(760, Math.min(980, window.innerWidth - 100));

    const dialog = new Dialog({
      title: "Create or Update Actor Journal",
      content,
      buttons: {
        create: {
          icon: '<i class="fas fa-book-medical"></i>',
          label: actor && findLinkedJournal(actor) ? "Update Journal" : "Create Journal",
          callback: html => this._submit(html)
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel"
        }
      },
      default: "create",
      render: html => this._activate(html, actor)
    }, {
      classes: ["dialog", "sbs-aj-dialog"],
      width,
      height,
      resizable: true
    });

    dialog.render(true);
  }

  static _activate(html, initialActor) {
    const root = html[0];
    const form = root.querySelector(".sbs-aj-form");
    if (!form) return;

    const titleInput = form.elements.journalTitle;
    titleInput.dataset.userEdited = titleInput.value && titleInput.value !== initialActor?.name ? "true" : "false";
    titleInput.addEventListener("input", () => titleInput.dataset.userEdited = "true");

    const dropZone = root.querySelector(".sbs-aj-drop-zone");
    dropZone.addEventListener("dragover", event => {
      event.preventDefault();
      dropZone.classList.add("dragover");
    });
    dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
    dropZone.addEventListener("drop", async event => {
      event.preventDefault();
      dropZone.classList.remove("dragover");
      try {
        const actor = await actorFromDrop(event);
        if (!actor) return ui.notifications.warn("Drop an Actor or a Token with an Actor here.");
        await this._setActor(root, actor, true);
      } catch (error) {
        console.error(`${MODULE_TITLE} | Actor drop failed`, error);
        ui.notifications.error("That drop did not resolve to an Actor.");
      }
    });

    root.querySelector("[data-action='selected-token']")?.addEventListener("click", async event => {
      event.preventDefault();
      const selected = canvas?.tokens?.controlled?.filter(t => t.actor) ?? [];
      if (!selected.length) return ui.notifications.warn("Select a token first.");
      if (selected.length > 1) ui.notifications.info(`Using ${selected[0].name}; only one Actor can become one journal at a time.`);
      await this._setActor(root, selected[0].actor, true);
    });

    root.querySelector("[data-action='clear-actor']")?.addEventListener("click", event => {
      event.preventDefault();
      this._clearActor(root);
    });

    root.querySelector("select[name='worldActor']")?.addEventListener("change", async event => {
      if (!event.target.value) return;
      const selected = game.actors.get(event.target.value);
      if (selected) await this._setActor(root, selected, true);
    });

    root.querySelector("select[name='visibility']")?.addEventListener("change", () => this._syncVisibility(root));
    root.querySelector("[data-action='add-question']")?.addEventListener("click", event => {
      event.preventDefault();
      this._addCustomQuestion(root);
    });

    root.querySelector(".sbs-aj-custom-list")?.addEventListener("click", event => {
      const button = event.target.closest("[data-action='remove-question']");
      if (!button) return;
      event.preventDefault();
      button.closest(".sbs-aj-custom-question")?.remove();
    });

    this._syncVisibility(root);
    if (initialActor) this._refreshActorDisplay(root, initialActor);
  }

  static async _setActor(root, actor, loadSaved = false) {
    root.querySelector("input[name='actorUuid']").value = actor.uuid;
    root.querySelector("select[name='worldActor']").value = actor.pack ? "" : actor.id;
    this._refreshActorDisplay(root, actor);

    const title = root.querySelector("input[name='journalTitle']");
    if (title.dataset.userEdited !== "true") title.value = actor.name;

    const linked = findLinkedJournal(actor);
    const update = root.querySelector("input[name='updateExisting']");
    update.checked = Boolean(linked);
    update.disabled = !linked;

    const status = root.querySelector(".sbs-aj-status");
    status.innerHTML = linked
      ? `<i class="fas fa-link"></i> Linked journal found: <strong>${escapeHTML(linked.name)}</strong>. Generated pages can be safely refreshed.`
      : `<i class="fas fa-plus-circle"></i> No linked journal found. A new one will be created.`;

    if (loadSaved && linked) {
      const saved = getSavedForm(linked);
      if (saved) this._applySavedForm(root, saved, linked.name);
    }

    this._syncVisibility(root);
  }

  static _clearActor(root) {
    root.querySelector("input[name='actorUuid']").value = "";
    root.querySelector("select[name='worldActor']").value = "";
    root.querySelector(".sbs-aj-actor-thumb").src = "icons/svg/mystery-man.svg";
    root.querySelector(".sbs-aj-actor-name").textContent = "No Actor selected";
    root.querySelector(".sbs-aj-actor-source").textContent = "Drag an Actor here, choose one below, or use a selected token.";
    root.querySelector("input[name='updateExisting']").checked = false;
    root.querySelector("input[name='updateExisting']").disabled = true;
    root.querySelector(".sbs-aj-status").innerHTML = '<i class="fas fa-circle-question"></i> Choose an Actor to continue.';
  }

  static _refreshActorDisplay(root, actor) {
    root.querySelector(".sbs-aj-actor-thumb").src = actor.img || "icons/svg/mystery-man.svg";
    root.querySelector(".sbs-aj-actor-name").textContent = actor.name;
    root.querySelector(".sbs-aj-actor-source").textContent = actor.pack
      ? `Compendium Actor • ${actor.uuid}`
      : `${capitalize(actor.type)} Actor • ${actor.uuid}`;
  }

  static _syncVisibility(root) {
    const visibility = root.querySelector("select[name='visibility']")?.value ?? "gm";
    root.querySelector(".sbs-aj-custom-users")?.classList.toggle("sbs-aj-hidden", visibility !== "custom");

    const sharing = root.querySelector(".sbs-aj-page-sharing");
    sharing?.classList.toggle("sbs-aj-hidden", visibility === "gm");
  }

  static _addCustomQuestion(root, data = {}) {
    const list = root.querySelector(".sbs-aj-custom-list");
    const index = Number(list.dataset.nextIndex || list.children.length || 0);
    list.dataset.nextIndex = String(index + 1);
    list.insertAdjacentHTML("beforeend", customQuestionHTML(index, data));
  }

  static _applySavedForm(root, saved, journalName) {
    const form = root.querySelector("form");
    const simpleFields = [
      "visibility", "imageSource", "descriptionLength", "folderId",
      "publicFirstImpression", "publicPersonality", "publicVoice", "publicHistory",
      "publicRelationship", "publicGoals", "publicStatus", "publicHooks", "publicNotes",
      "gmTrueMotivation", "gmSecrets", "gmRelationships", "gmPlans",
      "gmRoleplay", "gmTactics", "gmLoot", "gmNotes"
    ];

    for (const name of simpleFields) {
      const element = form.elements[name];
      if (element && saved[name] !== undefined) element.value = saved[name];
    }

    const checkboxFields = [
      "openWhenDone", "linkToActor", "updateExisting", "shareBiography", "shareMechanics",
      "includeBiography", "includeCoreStats", "includeAbilities", "includeSkills", "includeClasses",
      "includeFeatures", "includeSpells", "includeInventory", "includeEffects", "includeActorLink",
      "includeEmptySections", "excludeUnidentified"
    ];

    for (const name of checkboxFields) {
      const element = form.elements[name];
      if (element && saved[name] !== undefined && !element.disabled) element.checked = Boolean(saved[name]);
    }

    if (journalName) {
      const title = form.elements.journalTitle;
      if (title.dataset.userEdited !== "true") title.value = journalName;
    }

    const selectedUsers = new Set(saved.customUsers ?? []);
    root.querySelectorAll("input[name='customUsers']").forEach(input => input.checked = selectedUsers.has(input.value));

    const list = root.querySelector(".sbs-aj-custom-list");
    list.innerHTML = "";
    list.dataset.nextIndex = "0";
    for (const question of saved.customQuestions ?? []) this._addCustomQuestion(root, question);

    this._syncVisibility(root);
  }

  static async _submit(html) {
    const root = html[0];
    const form = root.querySelector("form");
    const data = collectFormData(form);
    if (!data.actorUuid) {
      ui.notifications.error("Choose an Actor before creating the journal.");
      return false;
    }

    const actorDocument = await fromUuid(data.actorUuid);
    const actor = actorDocument?.documentName === "Token" ? actorDocument.actor : actorDocument;
    if (!actor || actor.documentName !== "Actor") {
      ui.notifications.error("The selected document is no longer a valid Actor.");
      return false;
    }

    if (!data.journalTitle?.trim()) data.journalTitle = actor.name;

    try {
      await ActorJournalBuilder.createOrUpdate(actor, data);
    } catch (error) {
      console.error(`${MODULE_TITLE} | Journal generation failed`, error);
      ui.notifications.error(`Journal generation failed: ${error.message ?? error}`);
      return false;
    }
  }
}

class ActorJournalBuilder {
  static async createOrUpdate(actor, options = {}) {
    const data = withDefaults(options, actor);
    const linked = findLinkedJournal(actor);
    const shouldUpdate = Boolean(data.updateExisting && linked);
    const folderId = await resolveJournalFolder(data.folderId);
    const journalOwnership = buildJournalOwnership(data, actor);
    const pageSets = await buildPages(actor, data, journalOwnership);

    let journal;
    if (shouldUpdate) {
      journal = linked;
      await journal.update({
        name: data.journalTitle.trim() || actor.name,
        folder: folderId,
        ownership: journalOwnership,
        [`flags.${MODULE_ID}.${ACTOR_UUID_FLAG}`]: actor.uuid,
        [`flags.${MODULE_ID}.${FORM_FLAG}`]: data
      });

      const generatedIds = journal.pages
        .filter(page => page.getFlag(MODULE_ID, GENERATED_PAGE_FLAG))
        .map(page => page.id);
      if (generatedIds.length) await journal.deleteEmbeddedDocuments("JournalEntryPage", generatedIds);
      await journal.createEmbeddedDocuments("JournalEntryPage", pageSets);
    } else {
      journal = await JournalEntry.create({
        name: data.journalTitle.trim() || actor.name,
        folder: folderId,
        ownership: journalOwnership,
        pages: pageSets,
        flags: {
          [MODULE_ID]: {
            [ACTOR_UUID_FLAG]: actor.uuid,
            [FORM_FLAG]: data,
            generated: true,
            version: "1.0.1"
          }
        }
      });
    }

    if (data.linkToActor && !actor.pack && actor.isOwner) {
      await actor.setFlag(MODULE_ID, JOURNAL_UUID_FLAG, journal.uuid);
    }

    ui.notifications.info(`${shouldUpdate ? "Updated" : "Created"} journal “${journal.name}”.`);
    if (data.openWhenDone) journal.sheet?.render(true);
    return journal;
  }
}

function buildDialogHTML(actor, saved = null) {
  const folders = game.folders
    .filter(folder => folder.type === "JournalEntry")
    .sort((a, b) => a.name.localeCompare(b.name));
  const actors = game.actors
    .filter(a => a.isOwner)
    .sort((a, b) => a.name.localeCompare(b.name));
  const players = game.users.filter(user => !user.isGM);
  const linked = actor ? findLinkedJournal(actor) : null;
  const actorImage = actor?.img || "icons/svg/mystery-man.svg";
  const actorSource = actor
    ? (actor.pack ? `Compendium Actor • ${actor.uuid}` : `${capitalize(actor.type)} Actor • ${actor.uuid}`)
    : "Drag an Actor here, choose one below, or use a selected token.";
  const value = (name, fallback = "") => escapeAttr(saved?.[name] ?? fallback);
  const checked = (name, fallback = false) => (saved?.[name] ?? fallback) ? "checked" : "";

  return `
  <form class="sbs-aj-form" autocomplete="off">
    <input type="hidden" name="actorUuid" value="${escapeAttr(actor?.uuid ?? "")}">
    <header class="sbs-aj-brand">
      <img src="${LOGO_PATH}" alt="SaltyBananaSlug logo">
      <div>
        <div class="sbs-aj-brand-title">SaltyBananaSlug's Actor Journal</div>
        <div class="sbs-aj-brand-subtitle">Turn an Actor into a useful journal without exposing the villain monologue early.</div>
      </div>
    </header>
    <div class="sbs-aj-scroll">
      <details open>
        <summary><i class="fas fa-user"></i> Actor Selection</summary>
        <div class="sbs-aj-panel">
          <div class="sbs-aj-drop-zone" tabindex="0">
            <img class="sbs-aj-actor-thumb" src="${escapeAttr(actorImage)}" alt="Actor portrait">
            <div>
              <div class="sbs-aj-actor-name">${escapeHTML(actor?.name ?? "No Actor selected")}</div>
              <div class="sbs-aj-actor-source">${escapeHTML(actorSource)}</div>
              <div class="sbs-aj-help">Drop an Actor from the directory or a compendium. A dropped Token also works.</div>
            </div>
          </div>
          <div class="sbs-aj-grid" style="margin-top:0.65rem">
            <div class="sbs-aj-field">
              <label>Choose a world Actor</label>
              <select name="worldActor">
                <option value="">— Choose Actor —</option>
                ${actors.map(a => `<option value="${a.id}" ${actor?.id === a.id && !actor.pack ? "selected" : ""}>${escapeHTML(a.name)} (${escapeHTML(a.type)})</option>`).join("")}
              </select>
            </div>
            <div class="sbs-aj-button-row">
              <button type="button" data-action="selected-token"><i class="fas fa-bullseye"></i> Use Selected Token</button>
              <button type="button" data-action="clear-actor"><i class="fas fa-eraser"></i> Clear Actor</button>
            </div>
          </div>
        </div>
      </details>

      <details open>
        <summary><i class="fas fa-book"></i> Journal & Player Visibility</summary>
        <div class="sbs-aj-panel">
          <div class="sbs-aj-grid">
            <div class="sbs-aj-field">
              <label>Journal title</label>
              <input type="text" name="journalTitle" value="${value("journalTitle", linked?.name ?? actor?.name ?? "")}" placeholder="Defaults to the Actor name">
            </div>
            <div class="sbs-aj-field">
              <label>Journal folder</label>
              <select name="folderId">
                <option value="">Journal root</option>
                <option value="__actor_profiles__" ${saved?.folderId === "__actor_profiles__" ? "selected" : ""}>Create / use “Actor Profiles” folder</option>
                ${folders.map(folder => `<option value="${folder.id}" ${saved?.folderId === folder.id ? "selected" : ""}>${escapeHTML(folder.name)}</option>`).join("")}
              </select>
            </div>
            <div class="sbs-aj-field">
              <label>Who may see the journal?</label>
              <select name="visibility">
                ${option("gm", "GM only — default", saved?.visibility ?? "gm")}
                ${option("all", "All players — Observer", saved?.visibility ?? "gm")}
                ${option("owners", "Players who own this Actor", saved?.visibility ?? "gm")}
                ${option("custom", "Specific players", saved?.visibility ?? "gm")}
              </select>
              <div class="sbs-aj-help">Players are never granted Owner permission. Shared access is Observer only.</div>
            </div>
            <div class="sbs-aj-field">
              <label>Image shown in the journal</label>
              <select name="imageSource">
                ${option("portrait", "Actor portrait", saved?.imageSource ?? "portrait")}
                ${option("token", "Prototype token art", saved?.imageSource ?? "portrait")}
                ${option("none", "No image", saved?.imageSource ?? "portrait")}
              </select>
            </div>
          </div>

          <div class="sbs-aj-custom-users sbs-aj-hidden" style="margin-top:0.7rem">
            <div class="sbs-aj-label">Specific players</div>
            <div class="sbs-aj-user-list">
              ${players.length ? players.map(user => `
                <label class="sbs-aj-check">
                  <input type="checkbox" name="customUsers" value="${user.id}" ${(saved?.customUsers ?? []).includes(user.id) ? "checked" : ""}>
                  <span>${escapeHTML(user.name)}</span>
                </label>`).join("") : '<div class="sbs-aj-help">No player users exist in this world.</div>'}
            </div>
          </div>

          <div class="sbs-aj-page-sharing sbs-aj-hidden">
            <div class="sbs-aj-subheading">Player-visible pages</div>
            <div class="sbs-aj-checks">
              ${checkbox("shareBiography", "Players may see the full Biography page", saved?.shareBiography ?? false, "The Overview can still show the Actor's public biography. Keep this off when the full bio contains GM information.")}
              ${checkbox("shareMechanics", "Players may see mechanical pages", saved?.shareMechanics ?? false, "Leave this off for NPCs unless you enjoy handing out stat blocks like restaurant menus.")}
            </div>
          </div>

          <div class="sbs-aj-subheading">Creation behavior</div>
          <div class="sbs-aj-checks">
            ${checkbox("updateExisting", "Update the linked journal instead of creating a duplicate", saved?.updateExisting ?? Boolean(linked), "Only module-generated pages are replaced; your manual pages are preserved.", !linked)}
            ${checkbox("linkToActor", "Link the resulting journal back to the Actor", saved?.linkToActor ?? true)}
            ${checkbox("openWhenDone", "Open the journal after creation", saved?.openWhenDone ?? true)}
          </div>
          <div class="sbs-aj-status">
            ${linked
              ? `<i class="fas fa-link"></i> Linked journal found: <strong>${escapeHTML(linked.name)}</strong>. Generated pages can be safely refreshed.`
              : '<i class="fas fa-plus-circle"></i> No linked journal found. A new one will be created.'}
          </div>
        </div>
      </details>

      <details open>
        <summary><i class="fas fa-list-check"></i> Information to Include</summary>
        <div class="sbs-aj-panel">
          <div class="sbs-aj-checks">
            ${checkbox("includeBiography", "Biography and written description", saved?.includeBiography ?? true)}
            ${checkbox("includeCoreStats", "Identity and combat overview", saved?.includeCoreStats ?? true)}
            ${checkbox("includeAbilities", "Ability scores and saving throws", saved?.includeAbilities ?? true)}
            ${checkbox("includeSkills", "Skills and passive scores", saved?.includeSkills ?? true)}
            ${checkbox("includeClasses", "Classes, subclasses, and levels", saved?.includeClasses ?? true)}
            ${checkbox("includeFeatures", "Features, abilities, actions, and attacks", saved?.includeFeatures ?? true)}
            ${checkbox("includeSpells", "Spells grouped by level", saved?.includeSpells ?? true)}
            ${checkbox("includeInventory", "Weapons, armor, tools, consumables, and gear", saved?.includeInventory ?? true)}
            ${checkbox("includeEffects", "Active effects and conditions", saved?.includeEffects ?? true)}
            ${checkbox("includeActorLink", "Clickable link back to the Actor sheet", saved?.includeActorLink ?? true)}
            ${checkbox("excludeUnidentified", "Exclude unidentified items", saved?.excludeUnidentified ?? true)}
            ${checkbox("includeEmptySections", "Show sections even when they are empty", saved?.includeEmptySections ?? false)}
          </div>
          <div class="sbs-aj-grid" style="margin-top:0.75rem">
            <div class="sbs-aj-field">
              <label>Ability and item explanation length</label>
              <select name="descriptionLength">
                ${option("brief", "Brief — first sentence / about 180 characters", saved?.descriptionLength ?? "medium")}
                ${option("medium", "Medium — about 420 characters", saved?.descriptionLength ?? "medium")}
                ${option("full", "Full description", saved?.descriptionLength ?? "medium")}
              </select>
              <div class="sbs-aj-help">Descriptions are taken from the Actor's existing item text; the module does not invent new rules.</div>
            </div>
          </div>
        </div>
      </details>

      <details open>
        <summary><i class="fas fa-comments"></i> Public-Facing DM Questions</summary>
        <div class="sbs-aj-panel">
          <div class="sbs-aj-help" style="margin-bottom:0.6rem">These answers appear on the Overview page and can be seen by players whenever the journal is shared.</div>
          <div class="sbs-aj-grid wide">
            ${textareaField("publicFirstImpression", "What do the characters notice first?", value("publicFirstImpression"), "Appearance, smell, posture, clothing, aura, obvious injuries...")}
            ${textareaField("publicPersonality", "How should their personality come across?", value("publicPersonality"), "Temperament, habits, virtues, flaws, mannerisms...")}
            ${textareaField("publicVoice", "How do they speak?", value("publicVoice"), "Voice, accent, cadence, repeated phrases, vocabulary...")}
            ${textareaField("publicHistory", "What is publicly known about them?", value("publicHistory"), "Reputation, occupation, titles, history, rumors accepted as fact...")}
            ${textareaField("publicRelationship", "What is their relationship to the party?", value("publicRelationship"), "Ally, employer, rival, stranger, family connection, debt...")}
            ${textareaField("publicGoals", "What do they appear to want?", value("publicGoals"), "Stated goal, visible concern, current request...")}
            ${textareaField("publicStatus", "Where are they and what is their status?", value("publicStatus"), "Location, alive/dead/missing, healthy/injured, imprisoned, traveling...")}
            ${textareaField("publicHooks", "What hooks, rumors, or leads involve them?", value("publicHooks"), "Quests, clues, unresolved promises, rumors, future meetings...")}
            ${textareaField("publicNotes", "Anything else players may know?", value("publicNotes"), "Extra public notes, nicknames, relationships, possessions...")}
          </div>
        </div>
      </details>

      <details>
        <summary><i class="fas fa-user-secret"></i> GM-Only Questions</summary>
        <div class="sbs-aj-panel">
          <div class="sbs-aj-help" style="margin-bottom:0.6rem">These answers are placed on a GM-only page, even when the rest of the journal is shared.</div>
          <div class="sbs-aj-grid wide">
            ${textareaField("gmTrueMotivation", "What do they truly want?", value("gmTrueMotivation"), "Real objective, fear, need, obsession, conflicting priorities...")}
            ${textareaField("gmSecrets", "What secrets are they hiding?", value("gmSecrets"), "True identity, betrayal, hidden knowledge, curse, concealed crime...")}
            ${textareaField("gmRelationships", "What hidden relationships or factions matter?", value("gmRelationships"), "Secret allies, enemies, patrons, blackmail, loyalties...")}
            ${textareaField("gmPlans", "What future story beats involve them?", value("gmPlans"), "Planned reveal, escalation, return appearance, possible death, branching outcomes...")}
            ${textareaField("gmRoleplay", "What should the DM remember while roleplaying them?", value("gmRoleplay"), "Triggers, tells, lies, emotional limits, comedy beats, lines they will not cross...")}
            ${textareaField("gmTactics", "How do they act in danger or combat?", value("gmTactics"), "Opening move, preferred targets, retreat conditions, allies, terrain use...")}
            ${textareaField("gmLoot", "What rewards, loot, or consequences are tied to them?", value("gmLoot"), "Carried items, promised reward, information, legal or faction consequences...")}
            ${textareaField("gmNotes", "Additional GM notes", value("gmNotes"), "Anything that does not fit elsewhere.", true)}
          </div>
        </div>
      </details>

      <details>
        <summary><i class="fas fa-circle-plus"></i> Custom Questions</summary>
        <div class="sbs-aj-panel">
          <div class="sbs-aj-help" style="margin-bottom:0.6rem">Add any number of your own questions. Each answer can be public or GM-only.</div>
          <div class="sbs-aj-custom-list" data-next-index="${saved?.customQuestions?.length ?? 0}">
            ${(saved?.customQuestions ?? []).map((question, index) => customQuestionHTML(index, question)).join("")}
          </div>
          <div class="sbs-aj-button-row">
            <button type="button" data-action="add-question"><i class="fas fa-plus"></i> Add Custom Question</button>
          </div>
        </div>
      </details>
    </div>
  </form>`;
}

async function buildPages(actor, data, journalOwnership) {
  const publicOwnership = data.visibility === "gm" ? privateOwnership() : journalOwnership;
  const mechanicsOwnership = data.visibility !== "gm" && data.shareMechanics ? journalOwnership : privateOwnership();
  const biographyOwnership = data.visibility !== "gm" && data.shareBiography ? journalOwnership : privateOwnership();
  const image = getActorImage(actor, data.imageSource);
  const pages = [];

  const overview = await buildOverviewPage(actor, data, image);
  pages.push(makePage("Overview", "overview", overview, publicOwnership, 0));

  if (data.includeBiography) {
    const biography = await buildBiographyPage(actor, data, image);
    if (biography || data.includeEmptySections) {
      pages.push(makePage("Biography", "biography", biography || emptyMessage("No biography information was found."), biographyOwnership, 10));
    }
  }

  if (data.includeCoreStats || data.includeAbilities || data.includeSkills) {
    const mechanics = await buildMechanicsPage(actor, data);
    if (mechanics || data.includeEmptySections) {
      pages.push(makePage("Mechanics", "mechanics", mechanics || emptyMessage("No mechanical information was found."), mechanicsOwnership, 20));
    }
  }

  if (data.includeClasses || data.includeFeatures) {
    const features = await buildFeaturesPage(actor, data);
    if (features || data.includeEmptySections) {
      pages.push(makePage("Abilities & Features", "features", features || emptyMessage("No classes or features were found."), mechanicsOwnership, 30));
    }
  }

  if (data.includeSpells || data.includeInventory || data.includeEffects) {
    const equipment = await buildSpellsEquipmentPage(actor, data);
    if (equipment || data.includeEmptySections) {
      pages.push(makePage("Spells & Equipment", "equipment", equipment || emptyMessage("No spells, equipment, or active effects were found."), mechanicsOwnership, 40));
    }
  }

  const gmNotes = buildGMNotesPage(data);
  if (gmNotes || data.includeEmptySections) {
    pages.push(makePage("GM Notes", "gm-notes", gmNotes || emptyMessage("No GM-only notes were entered."), privateOwnership(), 50));
  }

  return pages;
}

async function buildOverviewPage(actor, data, image) {
  const facts = getIdentityFacts(actor);
  const publicAnswers = [
    ["First Impression", data.publicFirstImpression],
    ["Personality & Mannerisms", data.publicPersonality],
    ["Voice & Speech", data.publicVoice],
    ["Publicly Known", data.publicHistory],
    ["Relationship to the Party", data.publicRelationship],
    ["Apparent Goals", data.publicGoals],
    ["Current Location & Status", data.publicStatus],
    ["Hooks, Rumors & Leads", data.publicHooks],
    ["Additional Public Notes", data.publicNotes]
  ];
  const customPublic = data.customQuestions.filter(q => q.visibility === "public" && q.answer?.trim());
  const actorLink = data.includeActorLink ? `<p class="sbs-aj-kicker">@UUID[${escapeAttr(actor.uuid)}]{Open ${escapeHTML(actor.name)}'s Actor Sheet}</p>` : "";
  const heroImage = image ? `<img src="${escapeAttr(image)}" alt="${escapeAttr(actor.name)}">` : "";
  const hero = `
    <div class="sbs-aj-hero">
      ${heroImage}
      <div>
        <h1>${escapeHTML(actor.name)}</h1>
        ${actorLink}
        ${factsHTML(facts)}
      </div>
    </div>`;
  const publicBiography = data.includeBiography ? getPublicBiography(actor) : "";
  const publicBiographyHTML = publicBiography ? sectionHTML("Public Biography", publicBiography) : "";
  const answers = answersHTML(publicAnswers, customPublic);

  return journalWrap(hero + publicBiographyHTML + (answers || (!publicBiographyHTML ? emptyMessage("No additional public-facing notes were entered.") : "")));
}

async function buildBiographyPage(actor, data, image) {
  const sections = getBiographySections(actor);
  const rendered = [];
  for (const [title, html] of sections) {
    if (!html?.trim()) continue;
    // Store the original rich text so Foundry can enrich links and enforce
    // secret-block visibility for the user who eventually views the page.
    rendered.push(sectionHTML(title, html));
  }

  if (!rendered.length) return "";
  const imageHTML = image ? `<p><img src="${escapeAttr(image)}" alt="${escapeAttr(actor.name)}" style="max-width:280px;max-height:360px;object-fit:contain"></p>` : "";
  return journalWrap(imageHTML + rendered.join(""));
}

async function buildMechanicsPage(actor, data) {
  const chunks = [];
  if (data.includeCoreStats) chunks.push(buildCoreStats(actor));
  if (data.includeAbilities) chunks.push(buildAbilityTable(actor));
  if (data.includeSkills) chunks.push(buildSkillTable(actor));
  return journalWrap(chunks.filter(Boolean).join(""));
}

async function buildFeaturesPage(actor, data) {
  const chunks = [];
  const items = actor.items?.contents ?? Array.from(actor.items ?? []);

  if (data.includeClasses) {
    const classes = items.filter(item => ["class", "subclass", "race", "background"].includes(item.type));
    if (classes.length || data.includeEmptySections) {
      chunks.push(sectionHTML("Classes, Subclasses & Origins", await itemCardsHTML(classes, data, actor)));
    }
  }

  if (data.includeFeatures) {
    const excluded = new Set(["class", "subclass", "race", "background", "spell", "weapon", "equipment", "consumable", "tool", "loot", "backpack", "container"]);
    const features = items.filter(item => !excluded.has(item.type) && includeItem(item, data));
    const weaponsWithActivities = items.filter(item => item.type === "weapon" && hasActivities(item) && includeItem(item, data));
    const allFeatures = [...features, ...weaponsWithActivities];
    if (allFeatures.length || data.includeEmptySections) {
      chunks.push(sectionHTML("Abilities, Features, Actions & Attacks", await itemCardsHTML(allFeatures, data, actor)));
    }
  }

  return journalWrap(chunks.filter(Boolean).join(""));
}

async function buildSpellsEquipmentPage(actor, data) {
  const chunks = [];
  const items = actor.items?.contents ?? Array.from(actor.items ?? []);

  if (data.includeSpells) {
    const spells = items.filter(item => item.type === "spell" && includeItem(item, data));
    if (spells.length || data.includeEmptySections) {
      chunks.push(sectionHTML("Spells", await groupedSpellsHTML(spells, data, actor)));
    }
  }

  if (data.includeInventory) {
    const inventoryTypes = new Set(["weapon", "equipment", "consumable", "tool", "loot", "backpack", "container"]);
    const inventory = items.filter(item => inventoryTypes.has(item.type) && includeItem(item, data));
    if (inventory.length || data.includeEmptySections) {
      chunks.push(sectionHTML("Inventory & Equipment", await groupedInventoryHTML(inventory, data, actor)));
    }
  }

  if (data.includeEffects) {
    const effects = actor.effects?.contents ?? Array.from(actor.effects ?? []);
    if (effects.length || data.includeEmptySections) {
      chunks.push(sectionHTML("Active Effects & Conditions", effectsHTML(effects)));
    }
  }

  return journalWrap(chunks.filter(Boolean).join(""));
}

function buildGMNotesPage(data) {
  const gmAnswers = [
    ["True Motivation", data.gmTrueMotivation],
    ["Secrets", data.gmSecrets],
    ["Hidden Relationships & Factions", data.gmRelationships],
    ["Future Story Beats", data.gmPlans],
    ["Roleplaying Reminders", data.gmRoleplay],
    ["Danger & Combat Tactics", data.gmTactics],
    ["Rewards, Loot & Consequences", data.gmLoot],
    ["Additional GM Notes", data.gmNotes]
  ];
  const customGM = data.customQuestions.filter(q => q.visibility === "gm" && q.answer?.trim());
  const answers = answersHTML(gmAnswers, customGM);
  return answers ? journalWrap(answers) : "";
}

function buildCoreStats(actor) {
  const system = actor.system ?? {};
  const attr = system.attributes ?? {};
  const details = system.details ?? {};
  const traits = system.traits ?? {};
  const movement = attr.movement ?? {};
  const hp = attr.hp ?? {};
  const facts = [
    ["Armor Class", attr.ac?.value],
    ["Hit Points", formatHP(hp)],
    ["Initiative", signed(attr.init?.total ?? attr.init?.mod)],
    ["Speed", formatMovement(movement)],
    ["Proficiency Bonus", signed(attr.prof)],
    ["Challenge Rating", details.cr],
    ["Experience", details.xp?.value ?? details.xp],
    ["Passive Perception", getPassivePerception(actor)],
    ["Senses", formatSenses(attr.senses ?? traits.senses)],
    ["Languages", formatTrait(traits.languages)],
    ["Damage Vulnerabilities", formatTrait(traits.dv)],
    ["Damage Resistances", formatTrait(traits.dr)],
    ["Damage Immunities", formatTrait(traits.di)],
    ["Condition Immunities", formatTrait(traits.ci)]
  ].filter(([, value]) => hasValue(value));

  return sectionHTML("Core Statistics", factsHTML(facts));
}

function buildAbilityTable(actor) {
  const abilities = actor.system?.abilities ?? {};
  const rows = Object.entries(abilities).map(([key, ability]) => {
    const label = localizeConfig(CONFIG.DND5E?.abilities?.[key]) || key.toUpperCase();
    const value = ability.value ?? "—";
    const mod = signed(ability.mod ?? Math.floor((Number(value) - 10) / 2));
    const save = signed(ability.save ?? ability.saveBonus ?? ability.mod);
    const proficient = Number(ability.proficient ?? 0) > 0 ? "Yes" : "No";
    return `<tr><td><strong>${escapeHTML(label)}</strong></td><td>${escapeHTML(value)}</td><td>${escapeHTML(mod)}</td><td>${escapeHTML(save)}</td><td>${proficient}</td></tr>`;
  }).join("");
  if (!rows) return "";
  return sectionHTML("Ability Scores & Saving Throws", `<table class="sbs-aj-table"><thead><tr><th>Ability</th><th>Score</th><th>Modifier</th><th>Save</th><th>Proficient</th></tr></thead><tbody>${rows}</tbody></table>`);
}

function buildSkillTable(actor) {
  const skills = actor.system?.skills ?? {};
  const rows = Object.entries(skills).map(([key, skill]) => {
    const label = localizeConfig(CONFIG.DND5E?.skills?.[key]) || capitalize(key);
    const ability = String(skill.ability ?? "").toUpperCase();
    const total = signed(skill.total ?? skill.mod ?? skill.value);
    const passive = skill.passive ?? (Number(skill.total ?? 0) + 10);
    const proficiency = proficiencyLabel(skill.proficient ?? skill.value);
    return `<tr><td><strong>${escapeHTML(label)}</strong></td><td>${escapeHTML(ability || "—")}</td><td>${escapeHTML(total)}</td><td>${escapeHTML(passive)}</td><td>${escapeHTML(proficiency)}</td></tr>`;
  }).join("");
  if (!rows) return "";
  return sectionHTML("Skills", `<table class="sbs-aj-table"><thead><tr><th>Skill</th><th>Ability</th><th>Total</th><th>Passive</th><th>Training</th></tr></thead><tbody>${rows}</tbody></table>`);
}

async function itemCardsHTML(items, data, actor) {
  const filtered = items.filter(item => includeItem(item, data)).sort(sortItems);
  if (!filtered.length) return emptyMessage("None found.");
  const cards = [];
  for (const item of filtered) {
    cards.push(await itemCardHTML(item, data, actor));
  }
  return `<div class="sbs-aj-card-list">${cards.join("")}</div>`;
}

async function itemCardHTML(item, data, actor) {
  const description = await summarizeItem(item, data.descriptionLength, actor);
  const metadata = itemMetadata(item);
  const activity = activitySummary(item);
  const extra = [metadata, activity].filter(Boolean).join(" • ");
  return `<article class="sbs-aj-card">
    <div class="sbs-aj-card-title">@UUID[${escapeAttr(item.uuid)}]{${escapeHTML(item.name)}}</div>
    ${extra ? `<div class="sbs-aj-card-meta">${escapeHTML(extra)}</div>` : ""}
    <div>${description || '<span class="sbs-aj-empty">No description provided.</span>'}</div>
  </article>`;
}

async function groupedSpellsHTML(spells, data, actor) {
  if (!spells.length) return emptyMessage("No spells found.");
  const groups = new Map();
  for (const spell of spells.sort(sortItems)) {
    const level = Number(spell.system?.level ?? 0);
    const label = level === 0 ? "Cantrips" : `Level ${level}`;
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(spell);
  }

  const sections = [];
  for (const [label, group] of groups) {
    sections.push(`<h3>${escapeHTML(label)}</h3>${await itemCardsHTML(group, data, actor)}`);
  }
  return sections.join("");
}

async function groupedInventoryHTML(items, data, actor) {
  if (!items.length) return emptyMessage("No inventory found.");
  const labels = {
    weapon: "Weapons",
    equipment: "Armor & Equipment",
    consumable: "Consumables",
    tool: "Tools",
    backpack: "Containers",
    container: "Containers",
    loot: "Loot & Miscellaneous"
  };
  const groups = new Map();
  for (const item of items.sort(sortItems)) {
    const label = labels[item.type] ?? capitalize(item.type);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(item);
  }
  const sections = [];
  for (const [label, group] of groups) sections.push(`<h3>${escapeHTML(label)}</h3>${await itemCardsHTML(group, data, actor)}`);
  return sections.join("");
}

function effectsHTML(effects) {
  if (!effects.length) return emptyMessage("No active effects found.");
  const rows = effects
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(effect => {
      const state = effect.disabled ? "Disabled" : effect.isSuppressed ? "Suppressed" : "Active";
      const duration = effect.duration?.label ?? effect.duration?.remaining ?? "—";
      return `<tr><td><strong>${escapeHTML(effect.name)}</strong></td><td>${escapeHTML(state)}</td><td>${escapeHTML(duration)}</td></tr>`;
    }).join("");
  return `<table class="sbs-aj-table"><thead><tr><th>Effect</th><th>Status</th><th>Duration</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function makePage(name, key, content, ownership, sort) {
  return {
    name,
    type: "text",
    sort,
    title: { show: true, level: 1 },
    text: { content, format: PAGE_FORMAT() },
    ownership,
    flags: { [MODULE_ID]: { [GENERATED_PAGE_FLAG]: true, key } }
  };
}

function getIdentityFacts(actor) {
  const system = actor.system ?? {};
  const details = system.details ?? {};
  const traits = system.traits ?? {};
  const classItems = (actor.items?.contents ?? []).filter(i => i.type === "class");
  const classSummary = classItems.map(i => `${i.name} ${i.system?.levels ?? ""}`.trim()).join(" / ");
  const type = formatCreatureType(details.type) || details.race || localizeConfig(CONFIG.DND5E?.actorTypes?.[actor.type]) || capitalize(actor.type);
  const level = details.level ?? actor.system?.attributes?.level;
  const facts = [
    ["Actor Type", capitalize(actor.type)],
    ["Race / Creature Type", type],
    ["Class", classSummary],
    ["Level", level],
    ["Alignment", details.alignment],
    ["Background", details.background?.name ?? details.background],
    ["Size", localizeConfig(CONFIG.DND5E?.actorSizes?.[traits.size]) || traits.size],
    ["Source", details.source?.book ?? details.source]
  ];
  return facts.filter(([, value]) => hasValue(value));
}


function getPublicBiography(actor) {
  const biography = actor.system?.details?.biography ?? actor.system?.biography ?? {};
  return typeof biography === "object" ? (biography.public ?? "") : "";
}

function getBiographySections(actor) {
  const system = actor.system ?? {};
  const details = system.details ?? {};
  const traits = system.traits ?? {};
  const biography = details.biography ?? system.biography ?? {};
  const sections = [
    ["Biography", typeof biography === "string" ? biography : biography.value],
    ["Public Biography", biography.public],
    ["Appearance", details.appearance ?? traits.appearance],
    ["Personality Traits", traits.personality ?? details.trait],
    ["Ideals", traits.ideals ?? details.ideal],
    ["Bonds", traits.bonds ?? details.bond],
    ["Flaws", traits.flaws ?? details.flaw],
    ["Description", system.description?.value]
  ];

  const seen = new Set();
  return sections.filter(([, content]) => {
    if (!content || !stripHTML(String(content)).trim()) return false;
    const normalized = stripHTML(String(content)).trim();
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function answersHTML(standardAnswers, customAnswers = []) {
  const answers = [];
  for (const [question, answer] of standardAnswers) {
    if (!answer?.trim()) continue;
    answers.push(answerBlock(question, answer));
  }
  for (const custom of customAnswers) {
    if (!custom.question?.trim() || !custom.answer?.trim()) continue;
    answers.push(answerBlock(custom.question, custom.answer));
  }
  return answers.join("");
}

function answerBlock(question, answer) {
  return `<section class="sbs-aj-answer"><h3>${escapeHTML(question)}</h3><div>${formatPlainText(answer)}</div></section>`;
}

function factsHTML(facts) {
  if (!facts.length) return "";
  return `<div class="sbs-aj-facts">${facts.map(([label, value]) => `<div class="sbs-aj-fact"><strong>${escapeHTML(label)}</strong><span>${escapeHTML(formatValue(value))}</span></div>`).join("")}</div>`;
}

function sectionHTML(title, content) {
  if (!content) return "";
  return `<section><h2>${escapeHTML(title)}</h2>${content}</section>`;
}

function journalWrap(content) {
  return `<div class="sbs-aj-journal">${content}</div>`;
}

function emptyMessage(message) {
  return `<p class="sbs-aj-empty">${escapeHTML(message)}</p>`;
}

async function summarizeItem(item, mode, actor) {
  const html = item.system?.description?.value ?? item.system?.description?.chat ?? "";
  if (!html) return "";
  if (mode === "full") return html;

  const text = stripHTML(html).replace(/\s+/g, " ").trim();
  const limit = mode === "brief" ? 180 : 420;
  const summary = truncateAtSentence(text, limit);
  return escapeHTML(summary);
}

function activitySummary(item) {
  const activities = collectionValues(item.system?.activities);
  if (!activities.length) return "";
  const names = activities.map(activity => activity.name || capitalize(activity.type || "activity")).filter(Boolean);
  return names.length ? `Activities: ${names.join(", ")}` : "";
}

function itemMetadata(item) {
  const system = item.system ?? {};
  const parts = [capitalize(item.type)];
  if (item.type === "class" && hasValue(system.levels)) parts.push(`Level${Number(system.levels) === 1 ? "" : "s"} ${system.levels}`);
  if (item.type === "spell") {
    const level = Number(system.level ?? 0);
    parts.push(level === 0 ? "Cantrip" : `Level ${level}`);
    if (system.school) parts.push(localizeConfig(CONFIG.DND5E?.spellSchools?.[system.school]) || system.school);
  }
  if (system.quantity > 1) parts.push(`Qty ${system.quantity}`);
  if (system.equipped) parts.push("Equipped");
  if (system.attuned) parts.push("Attuned");
  if (system.identified === false) parts.push("Unidentified");
  return parts.filter(Boolean).join(" • ");
}

function includeItem(item, data) {
  if (data.excludeUnidentified && item.system?.identified === false) return false;
  return true;
}

function hasActivities(item) {
  return collectionValues(item.system?.activities).length > 0;
}

function buildJournalOwnership(data, actor) {
  const levels = OWNERSHIP();
  const ownership = { default: levels.NONE, [game.user.id]: levels.OWNER };
  if (data.visibility === "all") ownership.default = levels.OBSERVER;

  if (data.visibility === "owners") {
    for (const user of game.users.filter(u => !u.isGM)) {
      if (actor.testUserPermission(user, levels.OWNER)) ownership[user.id] = levels.OBSERVER;
    }
  }

  if (data.visibility === "custom") {
    for (const userId of data.customUsers) ownership[userId] = levels.OBSERVER;
  }

  return ownership;
}

function privateOwnership() {
  return { default: OWNERSHIP().NONE, [game.user.id]: OWNERSHIP().OWNER };
}

async function resolveJournalFolder(folderId) {
  if (!folderId) return null;
  if (folderId !== "__actor_profiles__") return folderId;
  let folder = game.folders.find(f => f.type === "JournalEntry" && f.name === "Actor Profiles");
  folder ??= await Folder.create({ name: "Actor Profiles", type: "JournalEntry" });
  return folder.id;
}

function findLinkedJournal(actor) {
  if (!actor) return null;
  const flaggedUuid = actor.getFlag?.(MODULE_ID, JOURNAL_UUID_FLAG);
  if (flaggedUuid) {
    const id = flaggedUuid.split(".").at(-1);
    const found = game.journal.get(id);
    if (found) return found;
  }
  return game.journal.find(journal => journal.getFlag(MODULE_ID, ACTOR_UUID_FLAG) === actor.uuid) ?? null;
}

function getSavedForm(journal) {
  return journal?.getFlag(MODULE_ID, FORM_FLAG) ?? null;
}

function getSelectedActor() {
  const controlled = canvas?.tokens?.controlled?.filter(token => token.actor) ?? [];
  if (controlled.length > 1) ui.notifications.info(`Using ${controlled[0].name}; only one Actor can become one journal at a time.`);
  return controlled[0]?.actor ?? null;
}

async function actorFromDrop(event) {
  const data = TextEditor.getDragEventData(event);
  let document = null;
  if (data.uuid) document = await fromUuid(data.uuid);
  else if (data.type === "Actor" && data.id) document = game.actors.get(data.id);
  else if (data.type === "Token" && data.id) document = canvas?.scene?.tokens?.get(data.id);

  if (document?.documentName === "Actor") return document;
  if (document?.documentName === "Token") return document.actor;
  return null;
}

function collectFormData(form) {
  const fd = new FormData(form);
  const booleanNames = [
    "openWhenDone", "linkToActor", "updateExisting", "shareBiography", "shareMechanics",
    "includeBiography", "includeCoreStats", "includeAbilities", "includeSkills", "includeClasses",
    "includeFeatures", "includeSpells", "includeInventory", "includeEffects", "includeActorLink",
    "includeEmptySections", "excludeUnidentified"
  ];

  const data = Object.fromEntries(fd.entries());
  for (const name of booleanNames) data[name] = form.elements[name]?.checked ?? false;
  data.customUsers = fd.getAll("customUsers");
  data.customQuestions = Array.from(form.querySelectorAll(".sbs-aj-custom-question")).map(row => ({
    question: row.querySelector("[data-field='question']")?.value?.trim() ?? "",
    answer: row.querySelector("[data-field='answer']")?.value?.trim() ?? "",
    visibility: row.querySelector("[data-field='visibility']")?.value ?? "gm"
  })).filter(entry => entry.question || entry.answer);
  delete data.worldActor;
  delete data.customUsers;
  data.customUsers = fd.getAll("customUsers");
  return data;
}

function withDefaults(data, actor) {
  return {
    actorUuid: actor.uuid,
    journalTitle: actor.name,
    folderId: "",
    visibility: "gm",
    customUsers: [],
    imageSource: "portrait",
    shareBiography: false,
    shareMechanics: false,
    updateExisting: Boolean(findLinkedJournal(actor)),
    linkToActor: true,
    openWhenDone: true,
    includeBiography: true,
    includeCoreStats: true,
    includeAbilities: true,
    includeSkills: true,
    includeClasses: true,
    includeFeatures: true,
    includeSpells: true,
    includeInventory: true,
    includeEffects: true,
    includeActorLink: true,
    excludeUnidentified: true,
    includeEmptySections: false,
    descriptionLength: "medium",
    customQuestions: [],
    ...data
  };
}

function getActorImage(actor, source) {
  if (source === "none") return "";
  if (source === "token") return actor.prototypeToken?.texture?.src || actor.img || "";
  return actor.img || actor.prototypeToken?.texture?.src || "";
}

function formatCreatureType(type) {
  if (!type) return "";
  if (typeof type === "string") return type;
  const base = localizeConfig(CONFIG.DND5E?.creatureTypes?.[type.value]) || type.custom || type.value || "";
  const subtype = type.subtype ? ` (${type.subtype})` : "";
  const swarm = type.swarm ? ` Swarm of ${type.swarm}` : "";
  return `${base}${subtype}${swarm}`.trim();
}

function formatHP(hp) {
  if (!hp) return "";
  const current = hp.value;
  const max = hp.max;
  const temp = Number(hp.temp ?? 0);
  if (!hasValue(current) && !hasValue(max)) return "";
  return `${hasValue(current) ? current : "—"} / ${hasValue(max) ? max : "—"}${temp ? ` (+${temp} temporary)` : ""}`;
}

function formatMovement(movement) {
  if (!movement) return "";
  const units = movement.units || "ft";
  const labels = {
    walk: "Walk", fly: "Fly", swim: "Swim", climb: "Climb", burrow: "Burrow"
  };
  const parts = [];
  for (const [key, label] of Object.entries(labels)) {
    const value = movement[key];
    if (hasValue(value) && Number(value) !== 0) parts.push(`${label} ${value} ${units}.`);
  }
  if (movement.hover) parts.push("Hover");
  return parts.join(", ");
}

function formatSenses(senses) {
  if (!senses) return "";
  if (typeof senses === "string") return senses;
  const ranges = senses.ranges ?? senses;
  const parts = [];
  for (const [key, value] of Object.entries(ranges)) {
    if (["units", "special"].includes(key) || !hasValue(value) || Number(value) === 0) continue;
    const label = localizeConfig(CONFIG.DND5E?.senses?.[key]) || capitalize(key);
    parts.push(`${label} ${value} ${senses.units || "ft"}.`);
  }
  if (senses.special) parts.push(senses.special);
  return parts.join(", ");
}

function formatTrait(trait) {
  if (!trait) return "";
  if (typeof trait === "string") return trait;
  const values = Array.isArray(trait.value) ? trait.value : trait.value instanceof Set ? Array.from(trait.value) : trait.value ? [trait.value] : [];
  const labels = values.map(value => localizeConfig(CONFIG.DND5E?.languages?.[value]) || localizeConfig(CONFIG.DND5E?.damageTypes?.[value]) || localizeConfig(CONFIG.DND5E?.conditionTypes?.[value]) || value);
  if (trait.custom) labels.push(trait.custom);
  return labels.filter(Boolean).join(", ");
}

function getPassivePerception(actor) {
  return actor.system?.skills?.prc?.passive ?? actor.system?.skills?.perception?.passive ?? "";
}

function formatValue(value) {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object" && value !== null) return value.label ?? value.name ?? JSON.stringify(value);
  return String(value ?? "");
}

function signed(value) {
  if (!hasValue(value)) return "—";
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  return number >= 0 ? `+${number}` : String(number);
}

function proficiencyLabel(value) {
  const number = Number(value ?? 0);
  if (number >= 2) return "Expertise";
  if (number >= 1) return "Proficient";
  if (number > 0) return "Half Proficiency";
  return "Untrained";
}

function collectionValues(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (Array.isArray(value.contents)) return value.contents;
  if (typeof value.values === "function") return Array.from(value.values());
  if (typeof value === "object") return Object.values(value);
  return [];
}

function sortItems(a, b) {
  const levelA = Number(a.system?.level ?? a.system?.levels ?? 0);
  const levelB = Number(b.system?.level ?? b.system?.levels ?? 0);
  return levelA - levelB || a.name.localeCompare(b.name);
}

function localizeConfig(config) {
  if (!config) return "";
  const label = typeof config === "string" ? config : config.label ?? config.name ?? "";
  return label ? game.i18n.localize(label) : "";
}

function truncateAtSentence(text, limit) {
  if (text.length <= limit) return text;
  const slice = text.slice(0, limit + 1);
  const sentence = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("! "), slice.lastIndexOf("? "));
  const boundary = sentence > limit * 0.55 ? sentence + 1 : slice.lastIndexOf(" ");
  return `${slice.slice(0, Math.max(boundary, limit * 0.65)).trim()}…`;
}

function stripHTML(html) {
  const div = document.createElement("div");
  div.innerHTML = String(html ?? "");
  return div.textContent ?? div.innerText ?? "";
}

function formatPlainText(text) {
  return escapeHTML(text).replace(/\r?\n/g, "<br>");
}

function hasValue(value) {
  return value !== undefined && value !== null && value !== "";
}

function capitalize(value) {
  const text = String(value ?? "");
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHTML(value);
}

function option(value, label, selected) {
  return `<option value="${escapeAttr(value)}" ${value === selected ? "selected" : ""}>${escapeHTML(label)}</option>`;
}

function checkbox(name, label, isChecked, help = "", disabled = false) {
  return `<label class="sbs-aj-check ${disabled ? "disabled" : ""}">
    <input type="checkbox" name="${escapeAttr(name)}" ${isChecked ? "checked" : ""} ${disabled ? "disabled" : ""}>
    <span>${escapeHTML(label)}${help ? `<span class="sbs-aj-help" style="display:block">${escapeHTML(help)}</span>` : ""}</span>
  </label>`;
}

function textareaField(name, label, value, placeholder, tall = false) {
  return `<div class="sbs-aj-field">
    <label>${escapeHTML(label)}</label>
    <textarea name="${escapeAttr(name)}" class="${tall ? "tall" : ""}" placeholder="${escapeAttr(placeholder)}">${value}</textarea>
  </div>`;
}

function customQuestionHTML(index, data = {}) {
  const visibility = data.visibility ?? "gm";
  return `<div class="sbs-aj-custom-question" data-index="${index}">
    <input type="text" data-field="question" value="${escapeAttr(data.question ?? "")}" placeholder="Question or heading">
    <textarea data-field="answer" placeholder="Answer or notes">${escapeHTML(data.answer ?? "")}</textarea>
    <select data-field="visibility">
      ${option("gm", "GM-only", visibility)}
      ${option("public", "Player-visible", visibility)}
    </select>
    <button type="button" class="sbs-aj-custom-remove" data-action="remove-question" title="Remove question"><i class="fas fa-trash"></i></button>
  </div>`;
}
