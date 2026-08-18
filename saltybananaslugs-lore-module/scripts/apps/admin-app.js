import {
  MODULE_ID,
  MODULE_TITLE,
  createLore,
  createQuestion,
  createSet,
  emptyContent,
  emptyScores,
  findSet,
  getAttempts,
  getContent,
  getScores,
  makeBackup,
  mutateContent,
  resetScores,
  setContent,
  setScores,
  summarizeAttempts,
  validateBackup
} from "../storage.js";
import { exportSetText, parseLoreText } from "../parser.js";

const LegacyFormApplication = foundry.appv1.api.FormApplication;
const LegacyDialog = foundry.appv1.api.Dialog;

function escapeHTML(value) {
  return foundry.utils.escapeHTML(String(value ?? ""));
}

function downloadFile(filename, content, mime = "application/json") {
  const blob = new Blob([content], { type: mime });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(href);
}

function confirmDialog({ title, content, yesLabel = "Confirm" }) {
  return new Promise((resolve) => {
    new LegacyDialog({
      title,
      content,
      buttons: {
        yes: { icon: '<i class="fas fa-check"></i>', label: yesLabel, callback: () => resolve(true) },
        no: { icon: '<i class="fas fa-xmark"></i>', label: "Cancel", callback: () => resolve(false) }
      },
      default: "no",
      close: () => resolve(false)
    }).render(true);
  });
}

export class LoreAdminApp extends LegacyFormApplication {
  constructor(options = {}) {
    super({}, options);
    this.selectedSetId = null;
    this.activeTab = "content";
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "sbs-lore-admin",
      title: `${MODULE_TITLE} — GM Manager`,
      template: `modules/${MODULE_ID}/templates/admin-app.hbs`,
      width: 1040,
      height: 780,
      resizable: true,
      classes: ["sbs-lore", "sbs-lore-admin"]
    });
  }

  async getData() {
    const content = getContent();
    if (!this.selectedSetId && content.sets.length) this.selectedSetId = content.sets[0].id;
    if (this.selectedSetId && !findSet(content, this.selectedSetId)) this.selectedSetId = content.sets[0]?.id || null;
    const selected = findSet(content, this.selectedSetId);
    const scores = getScores();

    const sets = content.sets.map((set) => ({
      ...set,
      selected: set.id === this.selectedSetId,
      statusLabel: set.published ? "Published" : "GM Only",
      statusIcon: set.published ? "fa-eye" : "fa-eye-slash",
      questionCount: set.questions.length,
      loreCount: set.lore.length
    }));

    const users = game.users.map((user) => {
      const allAttempts = [];
      const setRows = content.sets.map((set) => {
        const attempts = scores.users[user.id]?.sets?.[set.id]?.attempts || [];
        allAttempts.push(...attempts);
        return { setId: set.id, setName: set.name, ...summarizeAttempts(attempts) };
      }).filter((row) => row.attempts > 0);
      return {
        id: user.id,
        name: user.name,
        active: user.active,
        isGM: user.isGM,
        ...summarizeAttempts(allAttempts),
        setRows,
        wrongAttempts: allAttempts.filter((attempt) => !attempt.correct).slice().reverse().map((attempt) => ({
          ...attempt,
          answeredAtLabel: new Date(attempt.answeredAt).toLocaleString()
        }))
      };
    }).filter((user) => user.attempts > 0 || !user.isGM);

    return {
      activeTab: this.activeTab,
      tabContent: this.activeTab === "content",
      tabStats: this.activeTab === "stats",
      hasSets: sets.length > 0,
      sets,
      selected: selected ? {
        ...selected,
        questionCount: selected.questions.length,
        loreCount: selected.lore.length,
        questions: selected.questions.map((question, index) => ({
          ...question,
          number: index + 1,
          correctText: question.options.find((option) => option.id === question.correctOptionId)?.text || "Missing correct answer"
        })),
        lore: selected.lore.map((entry) => ({
          ...entry,
          typeLabel: { text: "Text", journal: "Journal", url: "Web Link", file: "File Link" }[entry.type] || entry.type,
          preview: entry.type === "text" ? entry.content.slice(0, 180) : entry.reference
        }))
      } : null,
      users
    };
  }

  async _updateObject(_event, _formData) {
    // This application is action-driven; settings are saved by its dialogs and controls.
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.on("click", "[data-action]", (event) => this.#routeAction(event.currentTarget.dataset.action, event.currentTarget.dataset));
  }

  async #routeAction(action, data) {
    const routes = {
      tab: () => { this.activeTab = data.tab; this.render(true); },
      "select-set": () => { this.selectedSetId = data.setId; this.activeTab = "content"; this.render(true); },
      "add-set": () => this.#editSet(),
      "edit-set": () => this.#editSet(this.selectedSetId),
      "delete-set": () => this.#deleteSet(this.selectedSetId),
      "toggle-published": () => this.#togglePublished(this.selectedSetId),
      "add-question": () => this.#editQuestion(),
      "edit-question": () => this.#editQuestion(data.questionId),
      "delete-question": () => this.#deleteQuestion(data.questionId),
      "add-lore": () => this.#editLore(),
      "edit-lore": () => this.#editLore(data.loreId),
      "delete-lore": () => this.#deleteLore(data.loreId),
      "bulk-import": () => this.#bulkImport(),
      "export-set": () => this.#exportSet(),
      "export-backup": () => this.#exportBackup(),
      "import-backup": () => this.#importBackup(),
      "reset-scores": () => this.#resetAllScores(),
      "reset-user": () => this.#resetUser(data.userId),
      "full-reset": () => this.#fullReset()
    };
    try {
      await routes[action]?.();
    } catch (error) {
      console.error(`${MODULE_TITLE} | GM action failed`, action, error);
      ui.notifications.error(error.message || "The lore manager encountered an error.");
    }
  }

  #editSet(setId = null) {
    const existing = setId ? findSet(getContent(), setId) : null;
    const content = `
      <form class="sbs-lore-dialog-form">
        <div class="form-group stacked"><label>Set Name</label><input name="name" type="text" value="${escapeHTML(existing?.name || "")}" required></div>
        <div class="form-group stacked"><label>Description</label><textarea name="description" rows="4">${escapeHTML(existing?.description || "")}</textarea></div>
        <div class="form-group"><label>Published to Players</label><input name="published" type="checkbox" ${existing?.published !== false ? "checked" : ""}></div>
      </form>`;
    new LegacyDialog({
      title: existing ? "Edit Lore Set" : "Create Lore Set",
      content,
      buttons: {
        save: {
          icon: '<i class="fas fa-save"></i>', label: "Save",
          callback: async (html) => {
            const form = html[0].querySelector("form");
            const name = form.elements.name.value.trim();
            if (!name) return ui.notifications.warn("A lore set needs a name.");
            await mutateContent((data) => {
              if (existing) {
                const set = findSet(data, setId);
                set.name = name;
                set.description = form.elements.description.value.trim();
                set.published = form.elements.published.checked;
                set.updatedAt = new Date().toISOString();
              } else {
                const set = createSet({ name, description: form.elements.description.value, published: form.elements.published.checked });
                data.sets.push(set);
                this.selectedSetId = set.id;
              }
            });
            this.render(true);
          }
        },
        cancel: { label: "Cancel" }
      },
      default: "save"
    }).render(true);
  }

  #editQuestion(questionId = null) {
    const set = findSet(getContent(), this.selectedSetId);
    if (!set) return ui.notifications.warn("Create or select a lore set first.");
    const existing = questionId ? set.questions.find((question) => question.id === questionId) : null;
    const initialOptions = existing?.options?.length ? existing.options : [{ id: "", text: "" }, { id: "", text: "" }];
    const optionRows = initialOptions.map((option, index) => `
      <div class="sbs-option-edit-row">
        <input type="radio" name="correct" value="${index}" ${option.id === existing?.correctOptionId || (!existing && index === 0) ? "checked" : ""} title="Correct answer">
        <input type="text" name="option" value="${escapeHTML(option.text)}" placeholder="Answer option" required>
        <button type="button" class="icon sbs-remove-option" title="Remove option"><i class="fas fa-trash"></i></button>
      </div>`).join("");
    const content = `
      <form class="sbs-lore-dialog-form sbs-question-dialog">
        <div class="form-group stacked"><label>Question</label><textarea name="prompt" rows="4" required>${escapeHTML(existing?.prompt || "")}</textarea></div>
        <label>Answers <small>(select the correct one)</small></label>
        <div class="sbs-option-edit-list">${optionRows}</div>
        <button type="button" class="sbs-add-option"><i class="fas fa-plus"></i> Add Answer Option</button>
        <div class="form-group stacked"><label>Explanation / Additional Lore</label><textarea name="explanation" rows="4" placeholder="Shown after an incorrect answer; also shown after a correct answer when present.">${escapeHTML(existing?.explanation || "")}</textarea></div>
      </form>`;

    new LegacyDialog({
      title: existing ? "Edit Question" : "Add Question",
      content,
      render: (html) => {
        const list = html.find(".sbs-option-edit-list");
        const renumber = () => {
          list.find(".sbs-option-edit-row").each((index, row) => row.querySelector("input[type='radio']").value = index);
        };
        html.on("click", ".sbs-add-option", () => {
          const index = list.children().length;
          list.append(`<div class="sbs-option-edit-row"><input type="radio" name="correct" value="${index}" title="Correct answer"><input type="text" name="option" placeholder="Answer option" required><button type="button" class="icon sbs-remove-option" title="Remove option"><i class="fas fa-trash"></i></button></div>`);
        });
        html.on("click", ".sbs-remove-option", (event) => {
          if (list.children().length <= 2) return ui.notifications.warn("A multiple-choice question needs at least two answers.");
          event.currentTarget.closest(".sbs-option-edit-row").remove();
          renumber();
        });
      },
      buttons: {
        save: {
          icon: '<i class="fas fa-save"></i>', label: "Save",
          callback: async (html) => {
            const form = html[0].querySelector("form");
            const prompt = form.elements.prompt.value.trim();
            const optionInputs = [...form.querySelectorAll("input[name='option']")];
            const options = optionInputs.map((input) => input.value.trim()).filter(Boolean);
            const checked = form.querySelector("input[name='correct']:checked");
            if (!prompt || options.length < 2 || !checked) return ui.notifications.warn("Enter a question, at least two answers, and select the correct answer.");
            const originalIndex = Number(checked.value);
            const chosenInput = optionInputs[originalIndex];
            const correctText = chosenInput?.value.trim();
            const correctIndex = Math.max(0, options.indexOf(correctText));
            const replacement = createQuestion({ prompt, options, correctIndex, explanation: form.elements.explanation.value });
            await mutateContent((data) => {
              const targetSet = findSet(data, this.selectedSetId);
              if (existing) {
                replacement.id = existing.id;
                replacement.createdAt = existing.createdAt;
                const index = targetSet.questions.findIndex((question) => question.id === questionId);
                targetSet.questions.splice(index, 1, replacement);
              } else targetSet.questions.push(replacement);
              targetSet.updatedAt = new Date().toISOString();
            });
            this.render(true);
          }
        },
        cancel: { label: "Cancel" }
      },
      default: "save"
    }, { width: 680 }).render(true);
  }

  #editLore(loreId = null) {
    const set = findSet(getContent(), this.selectedSetId);
    if (!set) return ui.notifications.warn("Create or select a lore set first.");
    const existing = loreId ? set.lore.find((entry) => entry.id === loreId) : null;
    const content = `
      <form class="sbs-lore-dialog-form sbs-lore-entry-dialog">
        <div class="form-group stacked"><label>Title</label><input name="title" type="text" value="${escapeHTML(existing?.title || "")}" required></div>
        <div class="form-group stacked"><label>Entry Type</label>
          <select name="type">
            <option value="text" ${existing?.type === "text" || !existing ? "selected" : ""}>Stored Text</option>
            <option value="journal" ${existing?.type === "journal" ? "selected" : ""}>Journal UUID</option>
            <option value="url" ${existing?.type === "url" ? "selected" : ""}>Web Link</option>
            <option value="file" ${existing?.type === "file" ? "selected" : ""}>Foundry File Link</option>
          </select>
        </div>
        <div class="sbs-lore-type-field" data-type="text">
          <div class="form-group stacked"><label>Lore Text</label><textarea name="content" rows="10">${escapeHTML(existing?.content || "")}</textarea></div>
          <div class="form-group stacked"><label>Or Load a Local Text File</label><input name="localFile" type="file" accept=".txt,.md,.markdown,.html,.htm"></div>
        </div>
        <div class="sbs-lore-type-field" data-type="journal">
          <div class="form-group stacked"><label>Journal Entry or Page UUID</label><input name="journalReference" type="text" value="${existing?.type === "journal" ? escapeHTML(existing.reference) : ""}" placeholder="JournalEntry.xxxxx or JournalEntry.xxxxx.JournalEntryPage.xxxxx"></div>
        </div>
        <div class="sbs-lore-type-field" data-type="url">
          <div class="form-group stacked"><label>Web URL</label><input name="urlReference" type="url" value="${existing?.type === "url" ? escapeHTML(existing.reference) : ""}" placeholder="https://..."></div>
        </div>
        <div class="sbs-lore-type-field" data-type="file">
          <div class="form-group stacked"><label>Foundry Data File Path or URL</label><input name="fileReference" type="text" value="${existing?.type === "file" ? escapeHTML(existing.reference) : ""}" placeholder="worlds/my-world/lore/chapter-one.pdf"></div>
          <p class="notes">Use a path already available through Foundry's Data directory. Clicking the lore entry opens it in a new browser tab.</p>
        </div>
      </form>`;

    new LegacyDialog({
      title: existing ? "Edit Lore Entry" : "Add Lore Entry",
      content,
      render: (html) => {
        const updateFields = () => {
          const type = html.find("select[name='type']").val();
          html.find(".sbs-lore-type-field").hide().filter(`[data-type='${type}']`).show();
        };
        html.on("change", "select[name='type']", updateFields);
        updateFields();
      },
      buttons: {
        save: {
          icon: '<i class="fas fa-save"></i>', label: "Save",
          callback: async (html) => {
            const form = html[0].querySelector("form");
            const title = form.elements.title.value.trim();
            const type = form.elements.type.value;
            let contentValue = form.elements.content.value;
            let reference = "";
            let filename = existing?.filename || "";
            const localFile = form.elements.localFile.files?.[0];
            if (type === "text" && localFile) {
              contentValue = await localFile.text();
              filename = localFile.name;
              if (!title) form.elements.title.value = localFile.name.replace(/\.[^.]+$/, "");
            }
            if (type === "journal") reference = form.elements.journalReference.value.trim();
            if (type === "url") reference = form.elements.urlReference.value.trim();
            if (type === "file") reference = form.elements.fileReference.value.trim();
            const finalTitle = form.elements.title.value.trim();
            if (!finalTitle) return ui.notifications.warn("The lore entry needs a title.");
            if (type !== "text" && !reference) return ui.notifications.warn("Enter the Journal UUID, URL, or file path.");
            const replacement = createLore({ title: finalTitle, type, content: contentValue, reference, filename });
            await mutateContent((data) => {
              const targetSet = findSet(data, this.selectedSetId);
              if (existing) {
                replacement.id = existing.id;
                replacement.createdAt = existing.createdAt;
                const index = targetSet.lore.findIndex((entry) => entry.id === loreId);
                targetSet.lore.splice(index, 1, replacement);
              } else targetSet.lore.push(replacement);
              targetSet.updatedAt = new Date().toISOString();
            });
            this.render(true);
          }
        },
        cancel: { label: "Cancel" }
      },
      default: "save"
    }, { width: 700 }).render(true);
  }

  #bulkImport() {
    const set = findSet(getContent(), this.selectedSetId);
    if (!set) return ui.notifications.warn("Create or select a lore set first.");
    const content = `
      <form class="sbs-lore-dialog-form">
        <p>Paste the bulk format below or load a <code>.txt</code>/<code>.md</code> file. Imported entries are appended to <strong>${escapeHTML(set.name)}</strong>.</p>
        <textarea name="source" rows="18" placeholder="Q: Who founded Welch?&#10;A: A perfectly normal accountant&#10;B*: The ancient slug oracle&#10;C: Three kobolds in a coat&#10;EX: The slug oracle is mentioned in Chapter Two.&#10;---"></textarea>
        <div class="form-group stacked"><label>Load Import File</label><input name="file" type="file" accept=".txt,.md,.markdown"></div>
        <details><summary>Importer format reminder</summary><pre>SET: Optional Set Name
DESCRIPTION: Optional description

LORE: Journal Name | journal | JournalEntry.UUID
LORE: Website | url | https://example.com
LORE: Handout | file | worlds/my-world/lore.pdf
LORE_TEXT: Stored Lore Title
Any number of lines...
END_LORE

Q: Question text
A: Wrong option
B*: Correct option
C: Another option
ANSWER: B        # alternative to the star
EX: Explanation shown after answering
---</pre></details>
      </form>`;
    new LegacyDialog({
      title: "Bulk Import Questions and Lore",
      content,
      render: (html) => html.on("change", "input[name='file']", async (event) => {
        const file = event.currentTarget.files?.[0];
        if (file) html.find("textarea[name='source']").val(await file.text());
      }),
      buttons: {
        import: {
          icon: '<i class="fas fa-file-import"></i>', label: "Import",
          callback: async (html) => {
            const source = html.find("textarea[name='source']").val();
            const parsed = parseLoreText(source);
            if (!parsed.questions.length && !parsed.lore.length) return ui.notifications.warn("No questions or lore entries were found in that text.");
            await mutateContent((data) => {
              const targetSet = findSet(data, this.selectedSetId);
              targetSet.questions.push(...parsed.questions);
              targetSet.lore.push(...parsed.lore);
              if (parsed.description && !targetSet.description) targetSet.description = parsed.description;
              targetSet.updatedAt = new Date().toISOString();
            });
            const warning = parsed.warnings.length ? ` ${parsed.warnings.length} warning(s) were written to the console.` : "";
            if (parsed.warnings.length) console.warn(`${MODULE_TITLE} | Import warnings`, parsed.warnings);
            ui.notifications.info(`Imported ${parsed.questions.length} question(s) and ${parsed.lore.length} lore entry/entries.${warning}`);
            this.render(true);
          }
        },
        cancel: { label: "Cancel" }
      },
      default: "import"
    }, { width: 760 }).render(true);
  }

  async #deleteSet(setId) {
    const set = findSet(getContent(), setId);
    if (!set) return;
    const confirmed = await confirmDialog({ title: "Delete Lore Set", content: `<p>Delete <strong>${escapeHTML(set.name)}</strong> and all of its questions and lore?</p><p>Existing score history is retained until scores are reset.</p>`, yesLabel: "Delete Set" });
    if (!confirmed) return;
    await mutateContent((data) => data.sets = data.sets.filter((entry) => entry.id !== setId));
    this.selectedSetId = null;
    this.render(true);
  }

  async #deleteQuestion(questionId) {
    const set = findSet(getContent(), this.selectedSetId);
    const question = set?.questions.find((entry) => entry.id === questionId);
    if (!question) return;
    const confirmed = await confirmDialog({ title: "Delete Question", content: `<p>Delete “${escapeHTML(question.prompt)}”?</p>`, yesLabel: "Delete Question" });
    if (!confirmed) return;
    await mutateContent((data) => {
      const targetSet = findSet(data, this.selectedSetId);
      targetSet.questions = targetSet.questions.filter((entry) => entry.id !== questionId);
      targetSet.updatedAt = new Date().toISOString();
    });
    this.render(true);
  }

  async #deleteLore(loreId) {
    const set = findSet(getContent(), this.selectedSetId);
    const lore = set?.lore.find((entry) => entry.id === loreId);
    if (!lore) return;
    const confirmed = await confirmDialog({ title: "Delete Lore Entry", content: `<p>Delete <strong>${escapeHTML(lore.title)}</strong>?</p>`, yesLabel: "Delete Lore" });
    if (!confirmed) return;
    await mutateContent((data) => {
      const targetSet = findSet(data, this.selectedSetId);
      targetSet.lore = targetSet.lore.filter((entry) => entry.id !== loreId);
      targetSet.updatedAt = new Date().toISOString();
    });
    this.render(true);
  }

  async #togglePublished(setId) {
    await mutateContent((data) => {
      const set = findSet(data, setId);
      set.published = !set.published;
      set.updatedAt = new Date().toISOString();
    });
    this.render(true);
  }

  #exportSet() {
    const set = findSet(getContent(), this.selectedSetId);
    if (!set) return;
    const safeName = set.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "lore-set";
    downloadFile(`${safeName}.txt`, exportSetText(set), "text/plain;charset=utf-8");
  }

  #exportBackup() {
    const backup = makeBackup({ includeScores: true });
    downloadFile(`saltybananaslug-lore-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(backup, null, 2));
  }

  #importBackup() {
    const picker = document.createElement("input");
    picker.type = "file";
    picker.accept = ".json,application/json";
    picker.addEventListener("change", async () => {
      const file = picker.files?.[0];
      if (!file) return;
      let data;
      try { data = JSON.parse(await file.text()); }
      catch { return ui.notifications.error("That file is not valid JSON."); }
      const backup = validateBackup(data);
      const confirmed = await confirmDialog({
        title: "Restore Lore Backup",
        content: `<p>This will replace every current lore set and all score history with the contents of <strong>${escapeHTML(file.name)}</strong>.</p><p>This is the button where backups become consequences.</p>`,
        yesLabel: "Replace Everything"
      });
      if (!confirmed) return;
      await setContent(backup.content);
      await setScores(backup.scores);
      this.selectedSetId = backup.content.sets[0]?.id || null;
      this.render(true);
      ui.notifications.info("Lore backup restored.");
    });
    picker.click();
  }

  async #resetAllScores() {
    const confirmed = await confirmDialog({ title: "Reset All Scores", content: "<p>Erase every player's quiz attempts and totals?</p>", yesLabel: "Reset Scores" });
    if (!confirmed) return;
    await resetScores();
    this.render(true);
  }

  async #resetUser(userId) {
    const user = game.users.get(userId);
    const confirmed = await confirmDialog({ title: "Reset Player Scores", content: `<p>Erase all lore quiz history for <strong>${escapeHTML(user?.name || "this player")}</strong>?</p>`, yesLabel: "Reset Player" });
    if (!confirmed) return;
    await resetScores({ userId });
    this.render(true);
  }

  async #fullReset() {
    const confirmed = await confirmDialog({
      title: "Completely Reset Lore Module",
      content: "<p><strong>This deletes every lore set, question, lore entry, and player score.</strong></p><p>Export a backup first unless you enjoy explaining catastrophes to Future You.</p>",
      yesLabel: "Delete Everything"
    });
    if (!confirmed) return;
    await setContent(emptyContent());
    await setScores(emptyScores());
    this.selectedSetId = null;
    this.render(true);
  }
}
