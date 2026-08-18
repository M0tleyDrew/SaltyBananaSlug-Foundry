import { createLore, createQuestion } from "./storage.js";

const OPTION_LINE = /^([A-Z0-9]+)(\*)?\s*:\s*(.*)$/i;
const Q_LINE = /^Q(?:UESTION)?\s*:\s*(.*)$/i;
const ANSWER_LINE = /^(?:ANSWER|CORRECT)\s*:\s*(.*)$/i;
const EXPLANATION_LINE = /^(?:EX|EXPLANATION)\s*:\s*(.*)$/i;
const SET_LINE = /^SET\s*:\s*(.*)$/i;
const DESCRIPTION_LINE = /^DESCRIPTION\s*:\s*(.*)$/i;
const LORE_LINE = /^LORE\s*:\s*(.*)$/i;
const LORE_TEXT_LINE = /^LORE_TEXT\s*:\s*(.*)$/i;
const END_LORE_LINE = /^END_LORE\s*$/i;

function splitPipe(value) {
  return value.split("|").map((part) => part.trim());
}

export function parseLoreText(source) {
  const text = String(source || "").replace(/\r\n?/g, "\n");
  const lines = text.split("\n");
  const parsed = { setName: "", description: "", questions: [], lore: [], warnings: [] };
  let current = null;
  let loreBlock = null;

  const commitQuestion = () => {
    if (!current) return;
    const prompt = current.prompt.trim();
    const options = current.options.filter((o) => o.text.trim());
    if (!prompt && options.length === 0) {
      current = null;
      return;
    }
    if (!prompt) parsed.warnings.push(`Skipped a question with no prompt near line ${current.line}.`);
    else if (options.length < 2) parsed.warnings.push(`Skipped “${prompt}” because it has fewer than two answers.`);
    else {
      let correctIndex = options.findIndex((o) => o.starred);
      if (correctIndex < 0 && current.answer) {
        const wanted = current.answer.trim().toUpperCase();
        correctIndex = options.findIndex((o) => o.label.toUpperCase() === wanted);
        if (correctIndex < 0) correctIndex = options.findIndex((o) => o.text.trim().toUpperCase() === wanted);
      }
      if (correctIndex < 0) {
        parsed.warnings.push(`“${prompt}” had no marked correct answer, so the first option was used.`);
        correctIndex = 0;
      }
      parsed.questions.push(createQuestion({
        prompt,
        options: options.map((o) => o.text),
        correctIndex,
        explanation: current.explanation.join("\n").trim()
      }));
    }
    current = null;
  };

  const commitLoreBlock = () => {
    if (!loreBlock) return;
    parsed.lore.push(createLore({
      title: loreBlock.title,
      type: "text",
      content: loreBlock.lines.join("\n").trim()
    }));
    loreBlock = null;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    const line = raw.trim();

    if (loreBlock) {
      if (END_LORE_LINE.test(line)) commitLoreBlock();
      else loreBlock.lines.push(raw);
      continue;
    }

    const loreTextMatch = line.match(LORE_TEXT_LINE);
    if (loreTextMatch) {
      commitQuestion();
      loreBlock = { title: loreTextMatch[1].trim() || "Untitled Lore", lines: [] };
      continue;
    }

    if (!line || line === "---") {
      if (line === "---") commitQuestion();
      continue;
    }
    if (line.startsWith("#") || line.startsWith("//")) continue;

    const setMatch = line.match(SET_LINE);
    if (setMatch && !current) {
      parsed.setName = setMatch[1].trim();
      continue;
    }
    const descriptionMatch = line.match(DESCRIPTION_LINE);
    if (descriptionMatch && !current) {
      parsed.description = descriptionMatch[1].trim();
      continue;
    }
    const loreMatch = line.match(LORE_LINE);
    if (loreMatch && !current) {
      const [title, rawType = "text", ...rest] = splitPipe(loreMatch[1]);
      const type = rawType.toLowerCase();
      const payload = rest.join(" | ");
      if (!["journal", "url", "file", "text"].includes(type)) {
        parsed.warnings.push(`Unknown lore type “${rawType}” on line ${index + 1}; imported as a URL/file link.`);
      }
      parsed.lore.push(createLore({
        title: title || "Untitled Lore",
        type: ["journal", "url", "file", "text"].includes(type) ? type : "url",
        content: type === "text" ? payload : "",
        reference: type === "text" ? "" : payload
      }));
      continue;
    }

    const qMatch = line.match(Q_LINE);
    if (qMatch) {
      commitQuestion();
      current = { prompt: qMatch[1], options: [], answer: "", explanation: [], line: index + 1, inExplanation: false };
      continue;
    }

    if (!current) {
      parsed.warnings.push(`Ignored unrecognized text on line ${index + 1}: ${line.slice(0, 80)}`);
      continue;
    }

    const answerMatch = line.match(ANSWER_LINE);
    if (answerMatch) {
      current.answer = answerMatch[1];
      current.inExplanation = false;
      continue;
    }
    const explanationMatch = line.match(EXPLANATION_LINE);
    if (explanationMatch) {
      current.explanation.push(explanationMatch[1]);
      current.inExplanation = true;
      continue;
    }
    const optionMatch = line.match(OPTION_LINE);
    if (optionMatch && !ANSWER_LINE.test(line) && !EXPLANATION_LINE.test(line)) {
      current.options.push({ label: optionMatch[1], starred: Boolean(optionMatch[2]), text: optionMatch[3] });
      current.inExplanation = false;
      continue;
    }
    if (current.inExplanation) current.explanation.push(raw.trim());
    else current.prompt += `\n${raw.trim()}`;
  }

  commitLoreBlock();
  commitQuestion();
  return parsed;
}

function optionLabel(index) {
  let value = index + 1;
  let result = "";
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

export function exportSetText(set) {
  const lines = [`SET: ${set.name}`, `DESCRIPTION: ${set.description || ""}`, ""];
  for (const lore of set.lore || []) {
    if (lore.type === "text") {
      lines.push(`LORE_TEXT: ${lore.title}`, lore.content || "", "END_LORE", "");
    } else {
      lines.push(`LORE: ${lore.title} | ${lore.type} | ${lore.reference || ""}`, "");
    }
  }
  for (const question of set.questions || []) {
    lines.push(`Q: ${question.prompt}`);
    question.options.forEach((option, index) => {
      const star = option.id === question.correctOptionId ? "*" : "";
      lines.push(`${optionLabel(index)}${star}: ${option.text}`);
    });
    if (question.explanation) lines.push(`EX: ${question.explanation.replace(/\n/g, "\n")}`);
    lines.push("---", "");
  }
  return lines.join("\n").trimEnd() + "\n";
}
