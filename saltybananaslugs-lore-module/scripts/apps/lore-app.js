import { MODULE_ID, MODULE_TITLE, findSet, getAttempts, getContent, getScores, summarizeAttempts } from "../storage.js";

const LegacyApplication = foundry.appv1.api.Application;

function shuffle(values) {
  const array = [...values];
  for (let index = array.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [array[index], array[swap]] = [array[swap], array[index]];
  }
  return array;
}

function escapeHTML(value) {
  return foundry.utils.escapeHTML(String(value ?? ""));
}

export class LorePlayerApp extends LegacyApplication {
  constructor({ setId = null } = {}, options = {}) {
    super(options);
    this.selectedSetId = setId;
    this.activeTab = "quiz";
    this.currentQuestionId = null;
    this.optionOrders = new Map();
    this.sessionAnsweredBySet = new Map();
    this.result = null;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "sbs-lore-player",
      title: MODULE_TITLE,
      template: `modules/${MODULE_ID}/templates/lore-app.hbs`,
      width: 720,
      height: 720,
      resizable: true,
      classes: ["sbs-lore", "sbs-lore-player"]
    });
  }

  get title() {
    const set = findSet(getContent(), this.selectedSetId);
    return set ? `${MODULE_TITLE}: ${set.name}` : MODULE_TITLE;
  }

  getAvailableSets() {
    const content = getContent();
    return content.sets.filter((set) => set.published || game.user.isGM);
  }

  getSessionAnswered(setId) {
    if (!this.sessionAnsweredBySet.has(setId)) this.sessionAnsweredBySet.set(setId, new Set());
    return this.sessionAnsweredBySet.get(setId);
  }

  clearSessionRound(setId = null) {
    if (setId) this.sessionAnsweredBySet.delete(setId);
    else this.sessionAnsweredBySet.clear();
  }

  getQuestion(set) {
    if (!set?.questions.length) return null;

    const allowRetakes = game.settings.get(MODULE_ID, "allowRetakes");
    const attempts = getAttempts(game.user.id, set.id);
    const persistedAnswered = new Set(attempts.map((attempt) => attempt.questionId));
    const sessionAnswered = this.getSessionAnswered(set.id);

    // The GM records player answers in a world setting. That setting can take a moment
    // to reach the answering player's client, so sessionAnswered is the immediate local
    // source of truth. It also prevents "Allow Retakes" + sequential order from selecting
    // question one forever. A completed retake round can be restarted from the completion screen.
    const available = set.questions.filter((question) => {
      if (sessionAnswered.has(question.id)) return false;
      return allowRetakes || !persistedAnswered.has(question.id);
    });
    if (!available.length) return null;

    let question = available.find((entry) => entry.id === this.currentQuestionId) || null;
    if (!question) {
      const order = game.settings.get(MODULE_ID, "questionOrder");
      question = order === "random" ? available[Math.floor(Math.random() * available.length)] : available[0];
      this.currentQuestionId = question.id;
    }
    return question;
  }

  getOptionOrder(question) {
    if (!question) return [];
    if (!this.optionOrders.has(question.id)) {
      const options = question.options.map((option) => ({ id: option.id, text: option.text }));
      this.optionOrders.set(question.id, game.settings.get(MODULE_ID, "shuffleOptions") ? shuffle(options) : options);
    }
    return this.optionOrders.get(question.id);
  }

  async getData() {
    const sets = this.getAvailableSets();
    if (this.selectedSetId && !sets.some((set) => set.id === this.selectedSetId)) this.selectedSetId = null;
    const selected = sets.find((set) => set.id === this.selectedSetId) || null;
    // Keep the answered question stable while its result screen is visible. Advancing
    // happens only when the player clicks Next Question.
    const question = selected && !this.result ? this.getQuestion(selected) : null;
    const attempts = selected ? getAttempts(game.user.id, selected.id) : [];
    const summary = summarizeAttempts(attempts);
    const answeredQuestionIds = new Set(attempts.map((attempt) => attempt.questionId));
    const uniqueAnswered = answeredQuestionIds.size;

    return {
      userIsGM: game.user.isGM,
      chooseSet: !selected,
      sets: sets.map((set) => ({
        ...set,
        questionCount: set.questions.length,
        loreCount: set.lore.length,
        selected: set.id === this.selectedSetId
      })),
      set: selected ? {
        id: selected.id,
        name: selected.name,
        description: selected.description,
        questionCount: selected.questions.length,
        loreCount: selected.lore.length,
        lore: selected.lore.map((entry) => ({ ...entry, icon: this.#loreIcon(entry.type) }))
      } : null,
      activeTab: this.activeTab,
      tabQuiz: this.activeTab === "quiz",
      tabLore: this.activeTab === "lore",
      tabScore: this.activeTab === "score",
      playerLoreAccess: game.settings.get(MODULE_ID, "playerLoreAccess") || game.user.isGM,
      showProgress: game.settings.get(MODULE_ID, "showProgress") || game.user.isGM,
      question: question ? {
        id: question.id,
        prompt: question.prompt,
        options: this.getOptionOrder(question)
      } : null,
      result: this.result,
      complete: Boolean(selected && selected.questions.length && !question && !this.result),
      canRetake: Boolean(selected && !question && !this.result && game.settings.get(MODULE_ID, "allowRetakes")),
      noQuestions: Boolean(selected && !selected.questions.length),
      summary: { ...summary, uniqueAnswered, questionCount: selected?.questions.length || 0 },
      attempts: attempts.slice().reverse().map((attempt) => ({
        ...attempt,
        icon: attempt.correct ? "fa-circle-check" : "fa-circle-xmark",
        resultLabel: attempt.correct ? "Correct" : "Incorrect",
        answeredAtLabel: new Date(attempt.answeredAt).toLocaleString()
      }))
    };
  }

  #loreIcon(type) {
    return {
      text: "fa-scroll",
      journal: "fa-book-open",
      url: "fa-link",
      file: "fa-file-lines"
    }[type] || "fa-scroll";
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.on("click", "[data-action='select-set']", (event) => {
      this.selectedSetId = event.currentTarget.dataset.setId;
      this.currentQuestionId = null;
      this.result = null;
      this.activeTab = "quiz";
      this.render(true);
    });
    html.on("click", "[data-action='change-set']", () => {
      this.selectedSetId = null;
      this.currentQuestionId = null;
      this.result = null;
      this.render(true);
    });
    html.on("click", "[data-action='tab']", (event) => {
      this.activeTab = event.currentTarget.dataset.tab;
      this.render(true);
    });
    html.on("click", "[data-action='next-question']", () => {
      this.currentQuestionId = null;
      this.result = null;
      this.render(true);
    });
    html.on("click", "[data-action='restart-round']", () => {
      this.clearSessionRound(this.selectedSetId);
      this.currentQuestionId = null;
      this.result = null;
      this.render(true);
    });
    html.on("click", "[data-action='submit-answer']", () => this.#submitAnswer(html));
    html.on("click", "[data-action='open-lore']", (event) => this.#openLore(event.currentTarget.dataset.loreId));
    html.on("click", "[data-action='open-manager']", () => game.saltyBananaSlugLore.openManager());
  }

  async #submitAnswer(html) {
    if (this.result) return;
    const selected = html.find("input[name='lore-answer']:checked").val();
    if (!selected) return ui.notifications.warn("Choose an answer first. The lore goblin demands commitment.");
    const button = html.find("[data-action='submit-answer']");
    button.prop("disabled", true);
    try {
      const answeredSetId = this.selectedSetId;
      const answeredQuestionId = this.currentQuestionId;
      const result = await game.saltyBananaSlugLore.submitAnswer({
        setId: answeredSetId,
        questionId: answeredQuestionId,
        optionId: selected
      });

      // Mark the question locally before rendering the result. This guarantees that
      // Next Question advances even if the updated world score setting has not yet
      // propagated from the GM to this player's client.
      this.getSessionAnswered(answeredSetId).add(answeredQuestionId);
      this.currentQuestionId = answeredQuestionId;
      this.result = result;
      this.render(true);
    } catch (error) {
      console.error(`${MODULE_TITLE} | Answer submission failed`, error);
      ui.notifications.error(error.message || "The answer could not be recorded.");
      button.prop("disabled", false);
    }
  }

  async #openLore(loreId) {
    const set = findSet(getContent(), this.selectedSetId);
    const lore = set?.lore.find((entry) => entry.id === loreId);
    if (!lore) return ui.notifications.warn("That lore entry no longer exists.");
    if (lore.type === "text") {
      const body = escapeHTML(lore.content).replace(/\n/g, "<br>");
      return new foundry.appv1.api.Dialog({
        title: lore.title,
        content: `<div class="sbs-lore-text-view">${body || "<em>This lore entry is empty.</em>"}</div>`,
        buttons: { close: { icon: '<i class="fas fa-check"></i>', label: "Close" } }
      }, { width: 640, height: "auto" }).render(true);
    }
    if (lore.type === "journal") {
      const document = await fromUuid(lore.reference);
      if (!document) return ui.notifications.error("The linked Journal UUID could not be found.");
      if (document.documentName === "JournalEntryPage") {
        return document.parent?.sheet.render(true, { pageId: document.id, tempOwnership: true });
      }
      if (document.documentName === "JournalEntry") return document.sheet.render(true, { tempOwnership: true });
      return ui.notifications.error("That UUID does not point to a Journal Entry or Journal Page.");
    }
    if (!lore.reference) return ui.notifications.warn("This lore link has no destination.");
    window.open(lore.reference, "_blank", "noopener,noreferrer");
  }
}
