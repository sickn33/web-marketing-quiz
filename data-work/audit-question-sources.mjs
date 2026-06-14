import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

const repoDir = path.resolve(import.meta.dirname, "..");
const workspaceDir = path.resolve(repoDir, "..");
const questionsPath = path.join(repoDir, "questions-data.js");
const sourceText = readFileSync(questionsPath, "utf8");
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(sourceText, sandbox);

const questions = sandbox.window.WEB_MARKETING_QUIZ_BANK || [];
const outDir = path.join(repoDir, "data-work", "source-audit");
mkdirSync(outDir, { recursive: true });

const sourceAlias = new Map([
  ["04_Slides_Corso.md", ["gems-knowledge-base/04_Slides_Corso.md", "converted-md/slide parte 1/slide 0-8 web marketing.md"]],
  ["05_Dispense_Approfondimenti.md", ["gems-knowledge-base/05_Dispense_Approfondimenti.md"]],
  ["07_Appunti_Corso.md", ["gems-knowledge-base/07_Appunti_Corso.md", "appunti.md", "converted-md/appunti.md", "converted-md/appunti-web-marketing/Web Marketing.md"]],
  ["converted-md/appunti-web-marketing/Web Marketing.md", ["converted-md/appunti-web-marketing/Web Marketing.md"]],
  ["converted-md/appunti.md", ["converted-md/appunti.md", "appunti.md"]],
  ["converted-md/lezione-9-content-marketing", ["converted-md/lezione-9-content-marketing/09 26 lezione LUMSA - Gabriele 2026.md"]],
  ["converted-md/slide parte 2/01 Granato", ["converted-md/slide parte 2/01 26 lezione LUMSA - Granato 2026.md", "slide parte 2/01 26 lezione LUMSA - Granato 2026.md"]],
  ["converted-md/slide parte 2/02 Granato", ["converted-md/slide parte 2/02 26 lezione LUMSA - Granato 2026.md", "slide parte 2/02 26 lezione LUMSA - Granato 2026.md"]],
  ["converted-md/slide parte 2/03 Granato", ["converted-md/slide parte 2/03 25 lezione LUMSA  - Granato 2026.md", "slide parte 2/03 25 lezione LUMSA - Granato 2026.md"]],
  ["converted-md/slide parte 2/04 Gabriele", ["converted-md/slide parte 2/04 25 lezione LUMSA  - Gabriele 2026.md", "pdf_extractions/04 25 lezione LUMSA  - Gabriele 2026.md"]],
  ["converted-md/slide parte 2/05 Granato", ["converted-md/slide parte 2/05 26 lezione LUMSA  - Granato 2026.md", "pdf_extractions/05 26 lezione LUMSA  - Granato 2026.md"]],
  ["converted-md/slide parte 2/07 Gabriele", ["converted-md/slide parte 2/07 26 lezione LUMSA - Gabriele 2026.md"]],
  ["converted-md/slide parte 2/08 Gabriele", ["converted-md/slide parte 2/08 26 lezione LUMSA - Gabriele 2026.md", "converted-md/lezioni-08-09-refresh/08 26 lezione LUMSA - Gabriele 2026 (1).cleaned.md"]],
]);

const sectionAlias = [
  {
    sourcePrefix: "04_Slides_Corso.md",
    section: "Evoluzione del marketing",
    files: ["converted-md/slide parte 1/1) Evoluzione del marketing.md"]
  },
  {
    sourcePrefix: "04_Slides_Corso.md",
    section: "Segmentazione",
    files: ["converted-md/slide parte 1/6bis) integrative_segmentazione.md", "converted-md/slide parte 1/1) Evoluzione del marketing.md"]
  },
  {
    sourcePrefix: "04_Slides_Corso.md",
    section: "Orientamento al digitale",
    files: ["converted-md/slide parte 1/2) orientamento al digitale.md"]
  },
  {
    sourcePrefix: "04_Slides_Corso.md",
    section: "Caratteristiche tecnologie digitali",
    files: ["converted-md/slide parte 1/3) caratteristiche delle tecnologie digitali.md"]
  },
  {
    sourcePrefix: "04_Slides_Corso.md",
    section: "Ricerche di mercato",
    files: ["converted-md/slide parte 1/4) ricerche di mercato.md", "converted-md/dispense/Marketing research.md"]
  },
  {
    sourcePrefix: "04_Slides_Corso.md",
    section: "Customer Journey",
    files: ["converted-md/slide parte 1/5) Customer Journey.md", "converted-md/dispense/Using Customer Journey Maps to Improve Customer Experience.md"]
  },
  {
    sourcePrefix: "04_Slides_Corso.md",
    section: "Buyer personas",
    files: ["converted-md/slide parte 1/6) buyer personas.md", "converted-md/slide parte 1/5) Customer Journey.md"]
  },
  {
    sourcePrefix: "04_Slides_Corso.md",
    section: "Business Model Digitali",
    files: ["converted-md/slide parte 1/7) Business Model Digitali.md"]
  },
  {
    sourcePrefix: "04_Slides_Corso.md",
    section: "E-commerce",
    files: ["converted-md/slide parte 1/8) E-commerce.md"]
  },
  {
    sourcePrefix: "04_Slides_Corso.md",
    section: "Long Tail",
    files: ["converted-md/slide parte 1/3) caratteristiche delle tecnologie digitali.md"]
  },
  {
    sourcePrefix: "05_Dispense_Approfondimenti.md",
    section: "Marketing 4.0",
    files: ["converted-md/dispense/Marketing 4_0_Kotler.md"]
  },
  {
    sourcePrefix: "05_Dispense_Approfondimenti.md",
    section: "McKinsey",
    files: ["converted-md/dispense/Il modello Mckinsey.md"]
  },
  {
    sourcePrefix: "05_Dispense_Approfondimenti.md",
    section: "Sharing economy continuum",
    files: ["converted-md/dispense/Sharing economy continuum.md"]
  },
];

const notebookSourceCandidates = [
  "gems-knowledge-base/04_Slides_Corso.md",
  "gems-knowledge-base/05_Dispense_Approfondimenti.md",
  "gems-knowledge-base/07_Appunti_Corso.md",
  "converted-md/appunti-web-marketing/Web Marketing.md",
  "converted-md/slide parte 2/01 26 lezione LUMSA - Granato 2026.md",
  "converted-md/slide parte 2/02 26 lezione LUMSA - Granato 2026.md",
  "converted-md/slide parte 2/03 25 lezione LUMSA  - Granato 2026.md",
  "converted-md/slide parte 2/04 25 lezione LUMSA  - Gabriele 2026.md",
  "converted-md/slide parte 2/05 26 lezione LUMSA  - Granato 2026.md",
  "converted-md/slide parte 2/07 26 lezione LUMSA - Gabriele 2026.md",
  "converted-md/slide parte 2/08 26 lezione LUMSA - Gabriele 2026.md",
  "converted-md/lezione-9-content-marketing/09 26 lezione LUMSA - Gabriele 2026.md",
];

const loadedFiles = new Map();
const results = questions.map(question => auditQuestion(question));
const weak = results.filter(item => item.status !== "supported");

const summary = [
  "# Source Audit",
  "",
  `- Questions: ${questions.length}`,
  `- Supported: ${results.filter(item => item.status === "supported").length}`,
  `- Needs review: ${weak.length}`,
  `- Missing source files: ${results.filter(item => item.status === "missing-source").length}`,
  "",
  "## Needs Review",
  "",
  ...weak.map(item => formatFinding(item)),
  "",
  "## All Questions",
  "",
  ...results.map(item => formatFinding(item))
];

writeFileSync(path.join(outDir, "source-audit-report.md"), `${summary.join("\n")}\n`);
writeFileSync(path.join(outDir, "source-audit-results.json"), `${JSON.stringify(results, null, 2)}\n`);

const byStatus = results.reduce((acc, item) => {
  acc[item.status] = (acc[item.status] || 0) + 1;
  return acc;
}, {});

console.log(JSON.stringify({ questions: questions.length, ...byStatus }, null, 2));

function auditQuestion(question) {
  const candidates = resolveCandidates(question);
  if (!candidates.length) {
    return { id: question.id, status: "missing-source", source: question.source, candidates: [], evidence: [] };
  }

  const queryTerms = buildTerms(question);
  const evidence = [];
  for (const candidate of candidates) {
    const file = loadFile(candidate);
    if (!file) continue;
    evidence.push(...scoreFile(question, queryTerms, file).slice(0, 3));
  }

  evidence.sort((a, b) => b.score - a.score);
  const top = evidence.slice(0, 5);
  const status = top[0]?.score >= 4 ? "supported" : "needs-review";

  return {
    id: question.id,
    section: question.section,
    text: question.text,
    answer: question.answer,
    correct: question.options[question.answer],
    source: question.source,
    candidates,
    status,
    evidence: top
  };
}

function resolveCandidates(question) {
  const source = question.source || "";
  const pieces = source.split("+").map(item => item.trim());
  const candidates = new Set();

  for (const piece of pieces) {
    for (const item of sectionAlias) {
      if (piece.startsWith(item.sourcePrefix) && piece.includes(` / ${item.section}`)) {
        item.files.forEach(file => candidates.add(file));
      }
    }
    for (const [alias, files] of sourceAlias) {
      if (piece.startsWith(alias)) {
        files.forEach(file => candidates.add(file));
      }
    }
    if (piece.startsWith("NotebookLM")) {
      notebookSourceCandidates.forEach(file => candidates.add(file));
    }
  }

  return [...candidates].filter(file => existsSync(path.join(workspaceDir, file)));
}

function loadFile(relativePath) {
  if (loadedFiles.has(relativePath)) return loadedFiles.get(relativePath);
  const absolutePath = path.join(workspaceDir, relativePath);
  if (!existsSync(absolutePath)) return null;
  const lines = readFileSync(absolutePath, "utf8").split(/\r?\n/);
  const file = { relativePath, lines, normalizedLines: lines.map(line => normalize(line)) };
  loadedFiles.set(relativePath, file);
  return file;
}

function buildTerms(question) {
  const text = `${question.text} ${question.options[question.answer]} ${question.section}`;
  const raw = normalize(text).split(/\s+/).filter(Boolean);
  const stop = new Set([
    "cosa", "come", "quale", "quali", "questo", "questa", "questi", "queste", "concetto", "esempio",
    "situazione", "descrive", "meglio", "rappresenta", "applica", "correttamente", "intende", "web",
    "marketing", "digitale", "digitali", "nel", "nella", "della", "delle", "degli", "agli", "alla",
    "allo", "con", "per", "che", "una", "uno", "gli", "dei", "del", "dal", "dai", "sono", "essere",
    "utente", "clienti", "cliente", "brand"
  ]);
  const terms = [...new Set(raw.filter(term => term.length > 3 && !stop.has(term)))];
  return terms.slice(0, 20);
}

function scoreFile(question, terms, file) {
  const windowSize = 6;
  const chunks = [];
  for (let index = 0; index < file.lines.length; index += 1) {
    const start = Math.max(0, index - Math.floor(windowSize / 2));
    const end = Math.min(file.lines.length, start + windowSize);
    const normalizedChunk = file.normalizedLines.slice(start, end).join(" ");
    const termHits = terms.filter(term => normalizedChunk.includes(term));
    if (!termHits.length) continue;
    const answerTerms = normalize(question.options[question.answer]).split(/\s+/).filter(term => term.length > 4);
    const answerHits = [...new Set(answerTerms.filter(term => normalizedChunk.includes(term)))];
    const score = termHits.length + Math.min(answerHits.length, 4);
    chunks.push({
      file: file.relativePath,
      startLine: start + 1,
      endLine: end,
      score,
      matchedTerms: termHits.slice(0, 12),
      snippet: file.lines.slice(start, end).map((line, offset) => `${start + offset + 1}: ${line}`).join("\n")
    });
  }
  return chunks.sort((a, b) => b.score - a.score);
}

function formatFinding(item) {
  const evidence = item.evidence[0];
  const location = evidence ? `${evidence.file}:${evidence.startLine}-${evidence.endLine}` : "no evidence";
  const matches = evidence ? evidence.matchedTerms.join(", ") : "";
  return [
    `### Q${String(item.id).padStart(3, "0")} - ${item.status}`,
    `- Section: ${item.section || ""}`,
    `- Question: ${item.text || ""}`,
    `- Correct: ${item.correct || ""}`,
    `- Source: ${item.source || ""}`,
    `- Best evidence: ${location}`,
    matches ? `- Matched terms: ${matches}` : "",
    evidence ? "```text\n" + evidence.snippet + "\n```" : ""
  ].filter(Boolean).join("\n");
}

function normalize(value) {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
