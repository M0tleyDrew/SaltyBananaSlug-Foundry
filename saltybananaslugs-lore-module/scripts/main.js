import { LoreAdminApp } from "./apps/admin-app.js";
import { LorePlayerApp } from "./apps/lore-app.js";
import {
  MODULE_ID,
  MODULE_TITLE,
  emptyContent,
  emptyScores,
  findQuestion,
  findSet,
  getAttempts,
  getContent,
  recordAttempt
} from "./storage.js";
import { parseLoreText } from "./parser.js";

const SOCKET = `module.${MODULE_ID}`;
const pendingAnswers = new Map();
let playerApp = null;
let adminApp = null;

function registerSettings() {
  game.settings.register(MODULE_ID, "content", {
    scope: "world", config: false, type: Object, default: emptyContent()
  });
  game.settings.register(MODULE_ID, "scores", {
    scope: "world", config: false, type: Object, default: emptyScores()
  });
  game.settings.register(MODULE_ID, "hideLauncher", {
    name: "SBSLORE.Settings.HideLauncher.Name",
    hint: "SBSLORE.Settings.HideLauncher.Hint",
    scope: "client", config: true, type: Boolean, default: false,
    onChange: renderLauncher
  });
  game.settings.register(MODULE_ID, "buttonLocation", {
    name: "SBSLORE.Settings.ButtonLocation.Name",
    hint: "SBSLORE.Settings.ButtonLocation.Hint",
    scope: "client", config: true, type: String, default: "bottom-right",
    choices: {
      "top-left": "SBSLORE.Location.TopLeft",
      "top-center": "SBSLORE.Location.TopCenter",
      "top-right": "SBSLORE.Location.TopRight",
      "middle-left": "SBSLORE.Location.MiddleLeft",
      "middle-right": "SBSLORE.Location.MiddleRight",
      "bottom-left": "SBSLORE.Location.BottomLeft",
      "bottom-center": "SBSLORE.Location.BottomCenter",
      "bottom-right": "SBSLORE.Location.BottomRight"
    },
    onChange: renderLauncher
  });
  game.settings.register(MODULE_ID, "allowRetakes", {
    name: "SBSLORE.Settings.AllowRetakes.Name",
    hint: "SBSLORE.Settings.AllowRetakes.Hint",
    scope: "world", config: true, type: Boolean, default: false
  });
  game.settings.register(MODULE_ID, "shuffleOptions", {
    name: "SBSLORE.Settings.ShuffleOptions.Name",
    hint: "SBSLORE.Settings.ShuffleOptions.Hint",
    scope: "world", config: true, type: Boolean, default: true
  });
  game.settings.register(MODULE_ID, "questionOrder", {
    name: "SBSLORE.Settings.QuestionOrder.Name",
    hint: "SBSLORE.Settings.QuestionOrder.Hint",
    scope: "world", config: true, type: String, default: "random",
    choices: { random: "SBSLORE.Order.Random", sequential: "SBSLORE.Order.Sequential" }
  });
  game.settings.register(MODULE_ID, "playerLoreAccess", {
    name: "SBSLORE.Settings.PlayerLoreAccess.Name",
    hint: "SBSLORE.Settings.PlayerLoreAccess.Hint",
    scope: "world", config: true, type: Boolean, default: true
  });
  game.settings.register(MODULE_ID, "showProgress", {
    name: "SBSLORE.Settings.ShowProgress.Name",
    hint: "SBSLORE.Settings.ShowProgress.Hint",
    scope: "world", config: true, type: Boolean, default: true
  });

  // Register the settings submenu last. Foundry requires this class to extend FormApplication.
  game.settings.registerMenu(MODULE_ID, "manager", {
    name: "SBSLORE.Settings.Manager.Name",
    label: "SBSLORE.Settings.Manager.Label",
    hint: "SBSLORE.Settings.Manager.Hint",
    icon: "fas fa-book-open",
    type: LoreAdminApp,
    restricted: true
  });
}

function primaryActiveGM() {
  return game.users.filter((user) => user.active && user.isGM).sort((a, b) => a.id.localeCompare(b.id))[0] || null;
}

function isPrimaryGM() {
  return game.user.isGM && primaryActiveGM()?.id === game.user.id;
}

async function scoreAnswer({ userId, setId, questionId, optionId }) {
  const content = getContent();
  const set = findSet(content, setId);
  const question = findQuestion(content, setId, questionId);
  if (!set || !question) throw new Error("That question no longer exists.");
  if (!set.published && !game.users.get(userId)?.isGM) throw new Error("That lore set is not published to players.");
  const selectedOption = question.options.find((option) => option.id === optionId);
  if (!selectedOption) throw new Error("That answer option no longer exists.");
  const prior = getAttempts(userId, setId, questionId);
  if (prior.length && !game.settings.get(MODULE_ID, "allowRetakes")) throw new Error("You have already answered that question.");
  const attempt = await recordAttempt({ userId, setId, question, selectedOption });
  return {
    ok: true,
    correct: attempt.correct,
    heading: attempt.correct ? "Correct!" : "Not Quite",
    message: attempt.correct ? "The lore spirits accept your tribute." : `The correct answer is: ${attempt.correctText}`,
    selectedText: attempt.selectedText,
    correctText: attempt.correctText,
    explanation: attempt.explanation
  };
}

async function processAnswerRequest(message) {
  if (!isPrimaryGM()) return;
  const { requestId, userId, setId, questionId, optionId } = message;
  try {
    const result = await scoreAnswer({ userId, setId, questionId, optionId });
    game.socket.emit(SOCKET, { type: "answerResult", requestId, userId, result });
  } catch (error) {
    game.socket.emit(SOCKET, { type: "answerResult", requestId, userId, result: { ok: false, error: error.message } });
  }
}

function handleSocket(message) {
  if (!message || typeof message !== "object") return;
  if (message.type === "answerRequest") return processAnswerRequest(message);
  if (message.type === "answerResult" && message.userId === game.user.id) {
    const pending = pendingAnswers.get(message.requestId);
    if (!pending) return;
    clearTimeout(pending.timeout);
    pendingAnswers.delete(message.requestId);
    if (message.result?.ok) pending.resolve(message.result);
    else pending.reject(new Error(message.result?.error || "The GM could not record the answer."));
  }
}

function submitAnswer({ setId, questionId, optionId }) {
  if (!setId || !questionId || !optionId) return Promise.reject(new Error("The answer request is incomplete."));
  const gm = primaryActiveGM();
  if (!gm) return Promise.reject(new Error("An active GM is required to score lore questions."));
  if (isPrimaryGM()) return scoreAnswer({ userId: game.user.id, setId, questionId, optionId });
  const requestId = foundry.utils.randomID(20);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingAnswers.delete(requestId);
      reject(new Error("The active GM did not answer the scoring request."));
    }, 15000);
    pendingAnswers.set(requestId, { resolve, reject, timeout });
    game.socket.emit(SOCKET, {
      type: "answerRequest",
      requestId,
      userId: game.user.id,
      setId,
      questionId,
      optionId
    });
  });
}

function launch({ setId = null, gm = false } = {}) {
  if (gm) return openManager();
  if (!playerApp) playerApp = new LorePlayerApp({ setId });
  if (setId) {
    playerApp.selectedSetId = setId;
    playerApp.currentQuestionId = null;
    playerApp.result = null;
  }
  playerApp.render(true);
  return playerApp;
}

function openManager() {
  if (!game.user.isGM) return ui.notifications.warn("Only a GM can open the Lore Manager.");
  if (!adminApp) adminApp = new LoreAdminApp();
  adminApp.render(true);
  return adminApp;
}

function renderLauncher() {
  document.getElementById("sbs-lore-launcher")?.remove();
  if (!game.ready || game.settings.get(MODULE_ID, "hideLauncher")) return;
  const location = game.settings.get(MODULE_ID, "buttonLocation");
  const button = document.createElement("button");
  button.id = "sbs-lore-launcher";
  button.className = `sbs-lore-launcher sbs-lore-launcher--${location}`;
  button.type = "button";
  button.title = game.user.isGM
    ? `${MODULE_TITLE}\nLeft-click: Open Lore Bot\nRight-click or Shift-click: GM Manager`
    : MODULE_TITLE;
  button.innerHTML = `<img src="modules/${MODULE_ID}/assets/banana-slug.svg" alt=""><span>Lore</span>`;
  button.addEventListener("click", (event) => {
    if (game.user.isGM && event.shiftKey) openManager();
    else launch();
  });
  button.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    if (game.user.isGM) openManager();
  });
  document.body.append(button);
}

function exposeAPI() {
  game.saltyBananaSlugLore = {
    launch,
    openManager,
    submitAnswer,
    parseLoreText,
    getContent,
    version: game.modules.get(MODULE_ID)?.version || "1.0.2"
  };
}

Hooks.once("init", () => {
  console.log(`${MODULE_TITLE} | Initializing`);
  exposeAPI();
  try {
    registerSettings();
  } catch (error) {
    console.error(`${MODULE_TITLE} | Settings registration failed`, error);
  }
});

Hooks.once("ready", () => {
  exposeAPI();
  game.socket.on(SOCKET, handleSocket);
  renderLauncher();
  console.log(`${MODULE_TITLE} | Ready. Macro: game.saltyBananaSlugLore.launch();`);
});

Hooks.on("updateSetting", (setting) => {
  if (!String(setting?.key || "").startsWith(`${MODULE_ID}.`)) return;
  if (playerApp?.rendered) playerApp.render(false);
  if (adminApp?.rendered) adminApp.render(false);
});

Hooks.on("renderSettingsConfig", () => renderLauncher());
