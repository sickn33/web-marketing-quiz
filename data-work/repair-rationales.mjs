import { readFileSync, writeFileSync } from "node:fs";
import vm from "node:vm";

const quizFile = "questions-data.js";
const buildFile = "build-questions.mjs";
const reportFile = "data-work/rationale-repair-report.md";
const letters = ["A", "B", "C", "D"];
const fieldLabels = {
  definition: "la definizione",
  role: "la funzione nel web marketing",
  example: "un esempio applicato",
  trap: "il chiarimento dell'errore comune"
};

const { modes, questions } = loadQuiz();
const concepts = loadConcepts();
const optionIndex = buildOptionIndex(concepts);
const conceptByTerm = new Map(concepts.map(concept => [normalize(concept.term), concept]));

const changes = [];
const nextQuestions = questions.map(question => repairQuestion(question));

writeFileSync(quizFile, renderQuestionsFile(modes, nextQuestions));
writeFileSync(reportFile, renderReport(questions, nextQuestions, changes));

console.log(`Repaired rationales on ${changes.length} question(s).`);
console.log(`Questions with four usable rationales: ${nextQuestions.filter(hasFourUsableRationales).length}/${nextQuestions.length}`);

function repairQuestion(question) {
  const concept = findQuestionConcept(question);
  const kind = findQuestionKind(question, concept);
  const rationales = {};
  let changed = false;
  const regenerateMappedQuestion = shouldRegenerateMappedQuestion(question, concept);

  for (const letter of letters) {
    const current = question.rationales?.[letter] || "";
    if (!regenerateMappedQuestion && isUsableRationale(current, question.options?.[letter])) {
      rationales[letter] = current;
      continue;
    }
    rationales[letter] = buildRationale(question, letter, concept, kind);
    changed = true;
  }

  if (changed) {
    changes.push({
      id: question.id,
      section: question.section,
      concept: concept?.term || "not-mapped",
      kind,
      repaired: letters.filter(letter => question.rationales?.[letter] !== rationales[letter])
    });
  }

  return { ...question, rationales };
}

function buildRationale(question, letter, concept, kind) {
  const option = question.options[letter];
  const optionMatch = optionIndex.get(normalize(option));
  const asked = concept || optionMatch?.concept || inferConceptFromText(question.text);
  const askedTerm = asked?.term || extractReadableTopic(question);
  const askedField = kind || optionMatch?.field || "definition";

  if (letter === question.answer) {
    return buildCorrectRationale(question, asked, askedField, askedTerm);
  }

  return buildWrongRationale(question, optionMatch, asked, askedField, askedTerm, letter);
}

function buildCorrectRationale(question, concept, kind, askedTerm) {
  if (!concept) {
    return `È corretta perché risponde al nucleo della domanda su ${askedTerm}, mentre le altre alternative spostano il focus su concetti o fasi diverse.`;
  }
  if (kind === "definition") {
    return `${capitalize(concept.term)} è il concetto richiesto: nel corso ${lowerFirst(concept.role)}. La trappola è confonderlo con aspetti vicini ma più specifici o operativi.`;
  }
  if (kind === "role") {
    return `È corretta perché interpreta ${concept.term} a partire dalla sua definizione nel corso: ${lowerFirst(concept.definition)}. Le altre alternative richiamano concetti o applicazioni diverse.`;
  }
  if (kind === "example") {
    return `È corretta perché il caso resta coerente con ${concept.term}: ${lowerFirst(concept.definition)}. Non descrive solo una metrica o un canale scollegato dal concetto.`;
  }
  if (kind === "trap") {
    return `È corretta perché delimita ${concept.term} rispetto a concetti vicini: la fonte lo lega a ${lowerFirst(concept.definition)}, non alla semplificazione proposta dai distrattori.`;
  }
  return `È corretta perché mantiene il focus su ${concept.term} e sulla relazione tra definizione, funzione e applicazione nel corso.`;
}

function buildWrongRationale(question, optionMatch, concept, kind, askedTerm, letter) {
  if (optionMatch?.concept) {
    const other = optionMatch.concept;
    if (!concept || normalize(other.term) !== normalize(concept.term)) {
      return `Non è corretta perché descrive ${fieldLabels[optionMatch.field] || "un aspetto"} di ${other.term}, mentre la domanda richiede ${askedTerm}.`;
    }
    return `Non è corretta perché richiama ${fieldLabels[optionMatch.field] || "un aspetto"} di ${other.term}, ma qui serve ${fieldLabels[kind] || "il livello richiesto dalla domanda"}.`;
  }

  if (concept) {
    return `Non è corretta perché sposta la risposta fuori dal perimetro di ${concept.term}: non chiarisce ${fieldLabels[kind] || "l'aspetto richiesto"} secondo la fonte del corso.`;
  }

  return `Non è corretta perché non risponde al criterio centrale della domanda; l'alternativa corretta resta più aderente alla fonte e al contesto indicato.`;
}

function findQuestionConcept(question) {
  const fromAnswer = optionIndex.get(normalize(question.options?.[question.answer]))?.concept;
  if (fromAnswer) return fromAnswer;
  const fromText = inferConceptFromText(question.text);
  if (fromText) return fromText;
  return null;
}

function findQuestionKind(question, concept) {
  const answer = normalize(question.options?.[question.answer]);
  const match = optionIndex.get(answer);
  if (match && (!concept || normalize(match.concept.term) === normalize(concept.term))) return match.field;
  if (/cosa si intende|definizione operativa|descrive meglio il concetto|frase sintetizza|affermazione .*corretta sul concetto/i.test(question.text)) return "definition";
  if (/ruolo|funzione|rilevante|conta nella progettazione/i.test(question.text)) return "role";
  if (/esempio|situazione|caso|applica/i.test(question.text)) return "example";
  if (/errore pi[uù] comune|evita l'errore/i.test(question.text)) return "trap";
  return "definition";
}

function shouldRegenerateMappedQuestion(question, concept) {
  if (!concept) return false;
  if (String(question.source || "").includes("NotebookLM")) return false;
  return letters.every(letter => optionIndex.has(normalize(question.options?.[letter])));
}

function inferConceptFromText(text) {
  const normalized = normalize(text)
    .replace(/^cosa si intende per /, "")
    .replace(/^quale affermazione descrive meglio il ruolo del concetto di /, "")
    .replace(/^quale affermazione descrive meglio il concetto di /, "")
    .replace(/^qual e il ruolo del concetto di /, "")
    .replace(/^perche il concetto di /, "")
    .replace(/^quale frase spiega meglio il concetto di /, "")
    .replace(/^quale frase sintetizza meglio la funzione del concetto di /, "")
    .replace(/^nel contesto del web marketing quale affermazione descrive meglio il concetto di /, "")
    .replace(/^nel web marketing quale situazione descrive meglio il concetto di /, "")
    .replace(/^in una strategia digitale quale funzione svolge il concetto di /, "")
    .replace(/^quale situazione applica correttamente il concetto di /, "")
    .replace(/^quale opzione descrive un esempio corretto del concetto di /, "")
    .replace(/^quale dei seguenti esempi rappresenta meglio il concetto di /, "")
    .replace(/^quale affermazione evita l errore piu comune su /, "")
    .replace(/\bnel web marketing$/, "")
    .replace(/\be rilevante nel web marketing$/, "")
    .replace(/\bconta nella progettazione di una strategia di web marketing$/, "")
    .trim();
  return conceptByTerm.get(normalized) || findConceptByTokenOverlap(normalized);
}

function findConceptByTokenOverlap(value) {
  const tokens = new Set(tokenize(value));
  if (!tokens.size) return null;
  let best = null;
  for (const concept of concepts) {
    const conceptTokens = tokenize(concept.term);
    const hits = conceptTokens.filter(token => tokens.has(token)).length;
    if (!hits) continue;
    const score = hits / conceptTokens.length;
    if (!best || score > best.score) best = { concept, score };
  }
  return best?.score >= 0.67 ? best.concept : null;
}

function buildOptionIndex(items) {
  const index = new Map();
  for (const concept of items) {
    for (const field of ["definition", "role", "example", "trap"]) {
      const key = normalize(concept[field]);
      if (!index.has(key)) index.set(key, { concept, field });
    }
  }
  for (const concept of items) {
    for (const distractor of concept.distractors || []) {
      const key = normalize(expandShortDistractor(distractor));
      if (!index.has(key)) index.set(key, { concept, field: "definition" });
    }
  }
  return index;
}

function loadQuiz() {
  const source = readFileSync(quizFile, "utf8");
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  return {
    modes: sandbox.window.WEB_MARKETING_SPECIAL_QUIZZES,
    questions: sandbox.window.WEB_MARKETING_QUIZ_BANK
  };
}

function loadConcepts() {
  const source = readFileSync(buildFile, "utf8");
  const start = source.indexOf("const concepts = [");
  const end = source.indexOf("\n\nfunction c(", start);
  if (start === -1 || end === -1) throw new Error("Could not locate concepts array in build-questions.mjs");
  const arrayCode = source.slice(start, end);
  return vm.runInNewContext(`(() => {
    function c(section, term, definition, role, example, trap, distractors, tags, source) {
      return { section, term, definition, role, example, trap, distractors, tags, source };
    }
    ${arrayCode}
    return concepts;
  })()`);
}

function hasFourUsableRationales(question) {
  return letters.every(letter => isUsableRationale(question.rationales?.[letter], question.options?.[letter]));
}

function isUsableRationale(rationale, option) {
  return !isTautologicalRationale(rationale, option);
}

function isTautologicalRationale(rationale, option) {
  const normalized = normalize(rationale);
  const normalizedOption = normalize(option);
  if (!normalized || !normalizedOption) return true;
  if (normalized.length < 35) return true;
  if (/^(supported by the source evidence|this option does not match the source evidence|correct answer|wrong answer)$/.test(normalized)) return true;
  if (/mette il concetto\b.*\bin relazione con/.test(normalized)) return true;
  const stripped = normalized
    .replace(/^(perche|perche la risposta corretta e|la risposta corretta e|risposta corretta|corretto perche|non e corretto perche|questa opzione e corretta perche|questa opzione non e corretta perche)\s+/, "")
    .trim();
  if (stripped === normalizedOption) return true;
  if (normalizedOption.length > 25 && normalized.includes(normalizedOption)) return true;
  return normalized.includes(normalizedOption) && stripped.split(" ").length <= normalizedOption.split(" ").length + 4;
}

function renderQuestionsFile(nextModes, nextQuestions) {
  return [
    "// Banco quiz per Web Marketing e Comunicazione Digitale.",
    "// Generato da build-questions.mjs, arricchito con domande curate da NotebookLM e razionali revisionati.",
    "(() => {",
    `  window.WEB_MARKETING_SPECIAL_QUIZZES = ${JSON.stringify(nextModes, null, 2)};`,
    "",
    `  window.WEB_MARKETING_QUIZ_BANK = ${JSON.stringify(nextQuestions, null, 2)};`,
    "})();",
    ""
  ].join("\n");
}

function renderReport(before, after, changesToReport) {
  const beforeStats = rationaleStats(before);
  const afterStats = rationaleStats(after);
  const bySection = countBy(changesToReport, change => change.section);
  return [
    "# Rationale Repair Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Summary",
    `- Questions: ${after.length}`,
    `- Questions touched: ${changesToReport.length}`,
    `- Usable option rationales before: ${beforeStats.usableOptions}/${beforeStats.totalOptions}`,
    `- Usable option rationales after: ${afterStats.usableOptions}/${afterStats.totalOptions}`,
    `- Questions with four usable rationales before: ${beforeStats.allFour}/${before.length}`,
    `- Questions with four usable rationales after: ${afterStats.allFour}/${after.length}`,
    `- Correct-answer rationales before: ${beforeStats.correctUsable}/${before.length}`,
    `- Correct-answer rationales after: ${afterStats.correctUsable}/${after.length}`,
    "",
    "## Changes By Section",
    ...Object.entries(bySection).map(([section, count]) => `- ${section}: ${count}`),
    "",
    "## Touched Questions",
    ...changesToReport.map(change =>
      `- Q${String(change.id).padStart(3, "0")} | ${change.section} | ${change.concept} | repaired ${change.repaired.join(", ")}`
    )
  ].join("\n") + "\n";
}

function rationaleStats(items) {
  let totalOptions = 0;
  let usableOptions = 0;
  let allFour = 0;
  let correctUsable = 0;
  for (const question of items) {
    let all = true;
    for (const letter of letters) {
      totalOptions++;
      const usable = isUsableRationale(question.rationales?.[letter], question.options?.[letter]);
      if (usable) usableOptions++;
      else all = false;
      if (letter === question.answer && usable) correctUsable++;
    }
    if (all) allFour++;
  }
  return { totalOptions, usableOptions, allFour, correctUsable };
}

function extractReadableTopic(question) {
  const inferred = inferConceptFromText(question.text);
  return inferred?.term || "il concetto richiesto";
}

function expandShortDistractor(value) {
  const expansions = {
    AIDA: "il modello AIDA applicato alle fasi persuasive della comunicazione",
    B2B: "il commercio elettronico tra due organizzazioni",
    B2C: "il commercio elettronico tra impresa e consumatore finale",
    C2B: "una relazione in cui il consumatore propone valore o condizioni all'impresa",
    C2C: "il commercio elettronico tra consumatori privati",
    CPC: "il costo pagato per ogni click su un annuncio",
    CPM: "il costo sostenuto per mille impression pubblicitarie",
    CTA: "un invito all'azione inserito in una pagina o comunicazione",
    FMOT: "il momento in cui il consumatore incontra l'offerta nel punto d'acquisto",
    GEO: "l'ottimizzazione dei contenuti per i motori generativi",
    Help: "un contenuto pratico pensato per rispondere a bisogni informativi specifici",
    Hero: "un contenuto ad alto impatto pensato per grande visibilità",
    Hub: "un contenuto regolare pensato per mantenere la relazione nel tempo",
    PESO: "la classificazione dei canali in Paid, Earned, Shared e Owned",
    ROAS: "il ritorno sulla spesa pubblicitaria rispetto ai ricavi attribuiti",
    SEO: "l'ottimizzazione organica per migliorare visibilità nei motori di ricerca",
    SEA: "la pubblicità a pagamento nelle pagine dei risultati dei motori di ricerca",
    SMOT: "l'esperienza d'uso del prodotto dopo l'acquisto",
    SWOT: "l'analisi di punti di forza, debolezza, opportunità e minacce",
    ZMOT: "la ricerca online di informazioni prima del contatto diretto con l'offerta"
  };
  return expansions[value] || value;
}

function countBy(items, keyFn) {
  return items.reduce((acc, item) => {
    const key = keyFn(item);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalize(value) {
  return cleanText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function tokenize(value) {
  const stopwords = new Set([
    "come", "cosa", "quale", "quali", "degli", "delle", "della", "nella", "nelle",
    "secondo", "questa", "questo", "contesto", "quando", "scelta", "meglio",
    "concetto", "ruolo", "funzione", "marketing", "digitale", "digital", "web"
  ]);
  return normalize(value).split(" ").filter(token => token && !stopwords.has(token));
}

function capitalize(value) {
  const text = cleanText(value);
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

function lowerFirst(value) {
  const text = cleanText(value);
  if (/^[A-Z]{2,}\b/.test(text) || /^[A-Z][a-z]+ [A-Z]/.test(text)) return text;
  return text ? text[0].toLowerCase() + text.slice(1) : text;
}
