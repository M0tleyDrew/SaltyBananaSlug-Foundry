export const MODULE_ID = "saltybananaslugs-lore-module";
export const MODULE_TITLE = "SaltyBananaSlug's Lore Module";
export const SCHEMA_VERSION = 1;

const clone = (value) => foundry.utils.deepClone(value);
const randomID = () => foundry.utils.randomID(16);

export function emptyContent() {
  return { schemaVersion: SCHEMA_VERSION, sets: [] };
}

export function emptyScores() {
  return { schemaVersion: SCHEMA_VERSION, users: {} };
}

export function normalizeContent(raw) {
  const data = raw && typeof raw === "object" ? clone(raw) : emptyContent();
  data.schemaVersion = Number(data.schemaVersion) || SCHEMA_VERSION;
  data.sets = Array.isArray(data.sets) ? data.sets : [];

  for (const set of data.sets) {
    set.id ||= randomID();
    set.name ||= "Untitled Lore Set";
    set.description ||= "";
    set.published = set.published !== false;
    set.createdAt ||= new Date().toISOString();
    set.updatedAt ||= set.createdAt;
    set.questions = Array.isArray(set.questions) ? set.questions : [];
    set.lore = Array.isArray(set.lore) ? set.lore : [];

    for (const question of set.questions) {
      question.id ||= randomID();
      question.prompt ||= "Untitled question";
      question.explanation ||= "";
      question.options = Array.isArray(question.options) ? question.options : [];
      question.options = question.options.map((option) => ({
        id: option.id || randomID(),
        text: String(option.text ?? option.label ?? "")
      }));
      if (!question.correctOptionId && question.options.length) question.correctOptionId = question.options[0].id;
      question.createdAt ||= new Date().toISOString();
    }

    for (const lore of set.lore) {
      lore.id ||= randomID();
      lore.title ||= "Untitled Lore";
      lore.type ||= "text";
      lore.content ||= "";
      lore.reference ||= "";
      lore.filename ||= "";
      lore.createdAt ||= new Date().toISOString();
    }
  }
  return data;
}

export function normalizeScores(raw) {
  const scores = raw && typeof raw === "object" ? clone(raw) : emptyScores();
  scores.schemaVersion = Number(scores.schemaVersion) || SCHEMA_VERSION;
  scores.users = scores.users && typeof scores.users === "object" ? scores.users : {};
  for (const userData of Object.values(scores.users)) {
    userData.sets = userData.sets && typeof userData.sets === "object" ? userData.sets : {};
    for (const setData of Object.values(userData.sets)) {
      setData.attempts = Array.isArray(setData.attempts) ? setData.attempts : [];
    }
  }
  return scores;
}

export function getContent() {
  return normalizeContent(game.settings.get(MODULE_ID, "content"));
}

export function getScores() {
  return normalizeScores(game.settings.get(MODULE_ID, "scores"));
}

export async function setContent(content) {
  requireGM();
  return game.settings.set(MODULE_ID, "content", normalizeContent(content));
}

export async function setScores(scores) {
  requireGM();
  return game.settings.set(MODULE_ID, "scores", normalizeScores(scores));
}

export async function mutateContent(mutator) {
  const content = getContent();
  const result = await mutator(content);
  await setContent(content);
  return result;
}

export async function mutateScores(mutator) {
  const scores = getScores();
  const result = await mutator(scores);
  await setScores(scores);
  return result;
}

export function requireGM() {
  if (!game.user?.isGM) throw new Error(`${MODULE_TITLE}: This action requires a GM.`);
}

export function findSet(content, setId) {
  return content.sets.find((set) => set.id === setId) ?? null;
}

export function findQuestion(content, setId, questionId) {
  return findSet(content, setId)?.questions.find((question) => question.id === questionId) ?? null;
}

export function createSet({ name, description = "", published = true } = {}) {
  const now = new Date().toISOString();
  return {
    id: randomID(),
    name: String(name || "Untitled Lore Set").trim(),
    description: String(description || "").trim(),
    published: Boolean(published),
    questions: [],
    lore: [],
    createdAt: now,
    updatedAt: now
  };
}

export function createQuestion({ prompt, options, correctIndex = 0, explanation = "" }) {
  const normalizedOptions = (options || []).map((text) => ({ id: randomID(), text: String(text).trim() })).filter((o) => o.text);
  return {
    id: randomID(),
    prompt: String(prompt || "").trim(),
    options: normalizedOptions,
    correctOptionId: normalizedOptions[correctIndex]?.id ?? normalizedOptions[0]?.id ?? "",
    explanation: String(explanation || "").trim(),
    createdAt: new Date().toISOString()
  };
}

export function createLore({ title, type = "text", content = "", reference = "", filename = "" }) {
  return {
    id: randomID(),
    title: String(title || "Untitled Lore").trim(),
    type,
    content: String(content || ""),
    reference: String(reference || "").trim(),
    filename: String(filename || "").trim(),
    createdAt: new Date().toISOString()
  };
}

export function getAttempts(userId, setId = null, questionId = null) {
  const scores = getScores();
  const user = scores.users[userId];
  if (!user) return [];
  const sets = setId ? [[setId, user.sets[setId]]] : Object.entries(user.sets);
  const attempts = [];
  for (const [sid, setData] of sets) {
    if (!setData) continue;
    for (const attempt of setData.attempts || []) {
      if (questionId && attempt.questionId !== questionId) continue;
      attempts.push({ ...attempt, setId: sid });
    }
  }
  return attempts;
}

export function summarizeAttempts(attempts) {
  const correct = attempts.filter((a) => a.correct).length;
  const incorrect = attempts.length - correct;
  return {
    attempts: attempts.length,
    correct,
    incorrect,
    percent: attempts.length ? Math.round((correct / attempts.length) * 100) : 0
  };
}

export async function recordAttempt({ userId, setId, question, selectedOption }) {
  requireGM();
  const correctOption = question.options.find((option) => option.id === question.correctOptionId);
  const correct = selectedOption?.id === question.correctOptionId;
  const attempt = {
    id: randomID(),
    questionId: question.id,
    questionPrompt: question.prompt,
    selectedOptionId: selectedOption?.id || "",
    selectedText: selectedOption?.text || "",
    correctOptionId: correctOption?.id || "",
    correctText: correctOption?.text || "",
    correct,
    explanation: question.explanation || "",
    answeredAt: new Date().toISOString()
  };

  await mutateScores((scores) => {
    scores.users[userId] ||= { sets: {} };
    scores.users[userId].sets[setId] ||= { attempts: [] };
    scores.users[userId].sets[setId].attempts.push(attempt);
  });
  return attempt;
}

export async function resetScores({ userId = null, setId = null } = {}) {
  requireGM();
  await mutateScores((scores) => {
    if (!userId && !setId) {
      scores.users = {};
      return;
    }
    if (userId) {
      if (!scores.users[userId]) return;
      if (setId) delete scores.users[userId].sets[setId];
      else delete scores.users[userId];
      return;
    }
    for (const userData of Object.values(scores.users)) delete userData.sets[setId];
  });
}

export function makeBackup({ includeScores = true } = {}) {
  return {
    module: MODULE_ID,
    version: game.modules.get(MODULE_ID)?.version || "1.0.0",
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    content: getContent(),
    scores: includeScores ? getScores() : emptyScores()
  };
}

export function validateBackup(data) {
  if (!data || typeof data !== "object") throw new Error("The selected file is not a valid backup object.");
  if (!data.content || !Array.isArray(data.content.sets)) throw new Error("The backup does not contain a lore set collection.");
  return {
    content: normalizeContent(data.content),
    scores: normalizeScores(data.scores || emptyScores())
  };
}
