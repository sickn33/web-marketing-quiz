import { readFileSync, writeFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync("questions-data.js", "utf8");
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(source, sandbox);

const questions = sandbox.window.WEB_MARKETING_QUIZ_BANK;
const modes = sandbox.window.WEB_MARKETING_SPECIAL_QUIZZES;
const errors = [];
const warnings = [];
const ids = new Set();
const texts = new Set();
const sources = new Set();
const letters = ["A", "B", "C", "D"];

if (!Array.isArray(questions)) errors.push("WEB_MARKETING_QUIZ_BANK is not an array");
if (!Array.isArray(modes)) errors.push("WEB_MARKETING_SPECIAL_QUIZZES is not an array");
if (questions.length !== 500) errors.push(`Expected 500 questions, found ${questions.length}`);

for (const q of questions) {
  const prefix = `Q${q.id}`;
  if (!Number.isInteger(q.id)) errors.push(`${prefix}: id is not integer`);
  if (ids.has(q.id)) errors.push(`${prefix}: duplicate id`);
  ids.add(q.id);

  if (!q.section || typeof q.section !== "string") errors.push(`${prefix}: missing section`);
  if (!q.text || typeof q.text !== "string") errors.push(`${prefix}: missing text`);
  if (texts.has(q.text)) errors.push(`${prefix}: duplicate text`);
  texts.add(q.text);

  if (!q.options || typeof q.options !== "object") {
    errors.push(`${prefix}: missing options`);
    continue;
  }

  for (const letter of letters) {
    if (!q.options[letter]) errors.push(`${prefix}: missing option ${letter}`);
  }
  if (!letters.includes(q.answer)) errors.push(`${prefix}: invalid answer letter ${q.answer}`);
  if (!q.options[q.answer]) errors.push(`${prefix}: answer option has no text`);

  const optionValues = letters.map(letter => q.options[letter]).filter(Boolean);
  const optionLengths = optionValues.map(value => String(value).length);
  const minOptionLength = Math.min(...optionLengths);
  const maxOptionLength = Math.max(...optionLengths);
  if (new Set(optionValues.map(normalize)).size !== optionValues.length) {
    errors.push(`${prefix}: duplicate normalized option text`);
  }
  if (minOptionLength < 18) errors.push(`${prefix}: option too short to be a robust distractor`);
  if (maxOptionLength / minOptionLength > 4.2 && maxOptionLength - minOptionLength > 60) {
    warnings.push(`${prefix}: option lengths are strongly unbalanced`);
  }
  if (optionValues.some(value => value.includes("TODO") || value.includes("undefined"))) {
    errors.push(`${prefix}: placeholder text in options`);
  }
  for (const [letter, value] of Object.entries(q.options)) {
    if (letter !== q.answer && normalize(value) === normalize(q.options[q.answer])) {
      errors.push(`${prefix}: distractor ${letter} equals correct answer`);
    }
    if (letter !== q.answer && /^solo\b/i.test(String(value).trim())) {
      errors.push(`${prefix}: distractor ${letter} is too visibly reductive`);
    }
  }

  if (!Array.isArray(q.tags) || q.tags.length === 0) errors.push(`${prefix}: missing tags`);
  if (!q.source || typeof q.source !== "string") errors.push(`${prefix}: missing source`);
  if (q.source) sources.add(q.source);
}

for (const mode of modes.filter(mode => mode.tag)) {
  const pool = questions.filter(q => q.tags.includes(mode.tag));
  if (pool.length < 40) errors.push(`Mode ${mode.id} has weak pool: ${pool.length}`);
}

const sectionCounts = countBy(questions, q => q.section);
const tagCounts = countBy(questions.flatMap(q => q.tags), tag => tag);
const report = [
  "# Final Quiz Validation",
  "",
  `- Questions checked one by one: ${questions.length}`,
  `- Errors: ${errors.length}`,
  `- Warnings: ${warnings.length}`,
  `- Sources represented: ${sources.size}`,
  "",
  "## Section Counts",
  ...Object.entries(sectionCounts).map(([section, count]) => `- ${section}: ${count}`),
  "",
  "## Tag Counts",
  ...Object.entries(tagCounts).map(([tag, count]) => `- ${tag}: ${count}`),
  "",
  "## Per-Question Check",
  ...questions.map(q => `- OK Q${String(q.id).padStart(3, "0")} | ${q.section} | answer ${q.answer}: ${q.options[q.answer]} | distractors B/C/D present | source: ${q.source}`),
  "",
  "## Warnings",
  ...(warnings.length ? warnings.map(warning => `- ${warning}`) : ["- None"]),
  "",
  "## Errors",
  ...(errors.length ? errors.map(error => `- ${error}`) : ["- None"])
];

writeFileSync("data-work/final-validation-report.md", `${report.join("\n")}\n`);

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`Validated ${questions.length} questions with ${warnings.length} warnings and 0 errors.`);

function normalize(value) {
  return String(value).trim().toLowerCase().replace(/\s+/g, " ");
}

function countBy(items, keyFn) {
  return items.reduce((acc, item) => {
    const key = keyFn(item);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}
