import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import vm from "node:vm";

const quizFile = "questions-data.js";
const notebookDir = "data-work/notebooklm-quizzes";
const reportFile = "data-work/weak-question-enrichment-report.md";
const letters = ["A", "B", "C", "D"];
const useNotebookTierB = process.env.USE_NOTEBOOK_TIER_B === "1";

const source = readFileSync(quizFile, "utf8");
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(source, sandbox);

const modes = sandbox.window.WEB_MARKETING_SPECIAL_QUIZZES;
const questions = sandbox.window.WEB_MARKETING_QUIZ_BANK;
const notebookQuestions = loadNotebookQuestions();
const existingTexts = new Set(questions.map(q => normalize(q.text)));
const usedNotebook = new Set();

const changes = [];
const nextQuestions = questions.map(question => {
  if (!isTemplatedWeakQuestion(question) || question.rationales) return question;

  const match = findNotebookMatch(question);
  if (match) {
    usedNotebook.add(normalize(match.question));
    changes.push({
      id: question.id,
      section: question.section,
      type: "notebook-replacement",
      before: question.text,
      after: match.question
    });
    return {
      ...toQuestionFromNotebook(match, question.id, question),
      source: `${question.source} + NotebookLM Web Marketing / ${match.artifactTitle} / ${match.artifactId.slice(0, 8)}`
    };
  }

  const rewritten = rewriteQuestion(question);
  changes.push({
    id: question.id,
    section: question.section,
    type: "rewrite-and-rationales",
    before: question.text,
    after: rewritten.text
  });
  return rewritten;
});

writeFileSync(quizFile, renderQuestionsFile(modes, nextQuestions));
writeFileSync(reportFile, renderReport(changes, nextQuestions));

console.log(`Enhanced ${changes.length} weak questions.`);
console.log(`${changes.filter(change => change.type === "notebook-replacement").length} replaced with NotebookLM matches.`);
console.log(`${changes.filter(change => change.type === "rewrite-and-rationales").length} rewritten in place with hints and rationales.`);

function loadNotebookQuestions() {
  const items = [];
  for (const file of readdirSync(notebookDir).filter(file => file.endsWith(".json")).sort()) {
    if (file === "artifacts.json") continue;
    const artifact = JSON.parse(readFileSync(`${notebookDir}/${file}`, "utf8"));
    for (const question of artifact.questions || []) {
      const options = question.answerOptions || [];
      const correct = options.find(option => option.isCorrect);
      const distractors = options.filter(option => !option.isCorrect);
      if (!correct || distractors.length !== 3) continue;
      const mapped = classifyQuestion(question.question, correct.text, options.map(option => option.text));
      if (!mapped) continue;
      const item = {
        artifactId: file.replace(/\.json$/, ""),
        artifactTitle: artifact.title || "NotebookLM Quiz",
        question: cleanText(question.question),
        options: [
          { text: cleanText(correct.text), rationale: cleanText(correct.rationale || "") },
          ...distractors.map(option => ({
            text: cleanText(option.text),
            rationale: cleanText(option.rationale || "")
          }))
        ],
        hint: cleanText(question.hint || ""),
        section: mapped.section,
        tags: mapped.tags,
        quality: 0
      };
      item.quality = scoreNotebook(item);
      items.push(item);
    }
  }
  const byText = new Map();
  for (const item of items) {
    const key = normalize(item.question);
    const current = byText.get(key);
    if (!current || item.quality > current.quality) byText.set(key, item);
  }
  return [...byText.values()].sort((a, b) => b.quality - a.quality);
}

function findNotebookMatch(question) {
  if (!useNotebookTierB) return null;
  const conceptTokens = extractConceptTokens(question.text);
  if (!conceptTokens.length) return null;
  const candidates = notebookQuestions
    .filter(item => item.section === question.section)
    .filter(item => item.quality >= 6)
    .filter(item => !existingTexts.has(normalize(item.question)))
    .filter(item => !usedNotebook.has(normalize(item.question)))
    .map(item => ({
      item,
      conceptScore: conceptOverlap(conceptTokens, `${item.question} ${item.options[0].text}`),
      similarity: similarity(`${question.text} ${question.options.A}`, `${item.question} ${item.options[0].text}`)
    }))
    .filter(match => match.conceptScore === 1)
    .filter(match => match.similarity >= 0.34)
    .sort((a, b) =>
      b.conceptScore - a.conceptScore ||
      b.similarity - a.similarity ||
      b.item.quality - a.item.quality
    );
  return candidates[0]?.item || null;
}

function rewriteQuestion(question) {
  const concept = extractConceptLabel(question.text);
  const text = rewriteStem(question.text, concept);
  return {
    ...question,
    text,
    hint: buildHint(concept, question.options.A),
    rationales: buildRationales(concept, question.options)
  };
}

function rewriteStem(text, concept) {
  const readable = concept || "questo concetto";
  if (/Quale opzione descrive un esempio corretto/i.test(text)) {
    return `Quale situazione applica correttamente il concetto di ${readable}?`;
  }
  if (/Perch[eé] il concetto/i.test(text)) {
    return `Perché il concetto di ${readable} conta nella progettazione di una strategia di web marketing?`;
  }
  if (/Qual [èe] il ruolo del concetto/i.test(text) || /descrive meglio il ruolo del concetto/i.test(text)) {
    return `In una strategia digitale, quale funzione svolge il concetto di ${readable}?`;
  }
  if (/Nel contesto del web marketing/i.test(text)) {
    return `Nel web marketing, quale situazione descrive meglio il concetto di ${readable}?`;
  }
  return `Nel web marketing, quale definizione operativa descrive meglio il concetto di ${readable}?`;
}

function buildHint(concept, correctAnswer) {
  const readable = concept ? `il concetto di ${concept}` : "il concetto richiesto";
  return `Cerca l'opzione che collega ${readable} a: ${shorten(correctAnswer, 20)}.`;
}

function buildRationales(concept, options) {
  const readable = concept ? `il concetto di ${concept}` : "il concetto richiesto";
  const readableAfterDa = concept ? `dal concetto di ${concept}` : "dal concetto richiesto";
  const readableSpecific = concept ? `del concetto di ${concept}` : "del concetto richiesto";
  return {
    A: `È corretta: mette ${readable} in relazione con "${options.A}".`,
    B: `Non è la scelta migliore: "${options.B}" descrive un concetto diverso ${readableAfterDa}.`,
    C: `Non è la scelta migliore: "${options.C}" sposta l'attenzione su un aspetto diverso ${readableAfterDa}.`,
    D: `Non è la scelta migliore: "${options.D}" non identifica il ruolo specifico ${readableSpecific} in questa domanda.`
  };
}

function toQuestionFromNotebook(candidate, id, replacedQuestion) {
  return {
    id,
    section: replacedQuestion.section,
    answer: "A",
    tags: replacedQuestion.tags,
    source: replacedQuestion.source,
    text: candidate.question,
    options: {
      A: candidate.options[0].text,
      B: candidate.options[1].text,
      C: candidate.options[2].text,
      D: candidate.options[3].text
    },
    hint: candidate.hint,
    rationales: {
      A: candidate.options[0].rationale,
      B: candidate.options[1].rationale,
      C: candidate.options[2].rationale,
      D: candidate.options[3].rationale
    }
  };
}

function isTemplatedWeakQuestion(question) {
  return [
    /Quale affermazione descrive meglio/i,
    /Perch[eé] il concetto/i,
    /Qual [èe] il ruolo del concetto/i,
    /Quale opzione descrive un esempio corretto/i
  ].some(pattern => pattern.test(question.text));
}

function scoreNotebook(item) {
  const optionTexts = item.options.map(option => option.text);
  let score = 0;
  if (item.hint && tokenize(item.hint).length >= 6) score += 1;
  if (item.options.every(option => option.rationale && tokenize(option.rationale).length >= 6)) score += 2;
  if (tokenize(item.question).length >= 7 && tokenize(item.question).length <= 30) score += 1;
  if (optionTexts.every(text => tokenize(text).length >= 4 && tokenize(text).length <= 30)) score += 1;
  if (hasScenarioSignal(item.question)) score += 1;
  if (hasAbsurdDistractor(item)) score -= 4;
  if (hasWeakOptionShape(optionTexts)) score -= 2;
  return score;
}

function classifyQuestion(question, correct, allOptions) {
  const questionText = normalize(question);
  const text = normalize(`${question} ${correct} ${allOptions.join(" ")}`);
  const stemHas = patterns => patterns.some(pattern => pattern.test(questionText));
  const has = patterns => patterns.some(pattern => pattern.test(text));

  if (stemHas([/netflix/, /spotify/, /itunes/, /blockbuster/, /amazon/, /e commerce/, /marketplace/, /revenue model/, /business model/, /long tail/, /sharing economy/, /piattaforma digitale/, /device digitale/, /freemium/, /subscription/])) {
    return section("Business model ed e-commerce", ["business", "digitale"]);
  }
  if (stemHas([/journey/, /touchpoint/, /\bzmot\b/, /\bfmot\b/, /consumer decision/, /buyer persona/, /\bpersonas?\b/, /customer experience/, /percorso d acquisto/, /active evaluation/, /valutazione attiva/, /loyalty loop/, /tailored messaging/, /mckinsey/, /omni channel/, /omnichannel/, /pain points/, /customer journey/, /aspettative/, /expectations/])) {
    return section("Customer journey", ["journey"]);
  }
  if (stemHas([/ricerc[ah] di mercato/, /questionario/, /survey/, /sondagg/, /campion/, /likert/, /\bcawi\b/, /intervist/, /focus group/, /\bnps\b/, /dato primario/, /dati primari/, /dato secondario/, /dati secondari/, /indagine/, /bias del questionario/])) {
    return section("Ricerche di mercato online", ["ricerca"]);
  }
  if (stemHas([/advertising/, /google ads/, /\bseo\b/, /\bsem\b/, /search intent/, /serp/, /keyword/, /email marketing/, /content marketing/, /funnel/, /analytics/, /\bkpi\b/, /conversion/, /campagna/, /retargeting/, /remarketing/, /programmatic/, /display/, /ai overview/, /\baio\b/, /\bgeo\b/, /\bppc\b/, /google trends/, /mobile friendly/, /posizionamento su google/, /landing page/, /\bcpc\b/, /\bcpm\b/, /\broas\b/, /\broi\b/, /lead generation/, /intento commerciale/])) {
    return section("Granato, search e operational", ["digitale", "operational"]);
  }
  if (stemHas([/lego/, /brand/, /marketing 4 0/, /marketing 5 0/, /customer empowerment/, /co creation/, /brand activism/, /\bcsr\b/, /cause marketing/, /acting as friends/, /brand image/, /brand engagement/, /brand advocacy/, /codes del marketing/])) {
    return section("Marketing 4.0 e brand", ["fondamenti", "digitale"]);
  }
  if (stemHas([/segmentaz/, /\bstp\b/, /\btargeting\b/, /posizionamento del brand/, /posizionamento di marca/, /\bcluster\b/])) {
    return section("STP e segmentazione", ["fondamenti"]);
  }
  if (stemHas([/digitale/, /digital transformation/, /trasformazione digitale/, /tecnolog/, /\biot\b/, /intelligenza artificiale/, /big data/, /ecosistema/, /device/, /mobile/, /\bapp\b/, /internet/, /web 2 0/, /prosumer/, /digital native/, /innovazione/, /invenzione/, /dialogo paritario/, /tempo medio sulla pagina/])) {
    return section("Ecosistema digitale", ["digitale"]);
  }
  if (has([/marketing mix/, /\b4p\b/, /swot/, /pianificaz/, /strategia/, /operativ/, /analisi interna/, /analisi esterna/])) {
    return section("Processo di marketing", ["fondamenti"]);
  }
  if (has([/marketing management/, /bisogno/, /desiderio/, /domanda/, /valore/, /scambio/, /offerta/, /mercato/])) {
    return section("Fondamenti di marketing", ["fondamenti"]);
  }
  return null;
}

function section(sectionName, tags) {
  return { section: sectionName, tags };
}

function extractConceptLabel(text) {
  const normalized = text
    .replace(/^Nel contesto del web marketing,\s*/i, "")
    .replace(/^Quale affermazione descrive meglio il ruolo del concetto di\s*/i, "")
    .replace(/^Quale affermazione descrive meglio il concetto di\s*/i, "")
    .replace(/^Qual è il ruolo del concetto di\s*/i, "")
    .replace(/^Perché il concetto di\s*/i, "")
    .replace(/^Quale opzione descrive un esempio corretto del concetto di\s*/i, "")
    .replace(/\s+è rilevante(?:\s+nel web marketing)?\??$/i, "")
    .replace(/\s+nel web marketing\??$/i, "")
    .replace(/\?$/i, "")
    .trim();
  return normalized || "questo concetto";
}

function extractConceptTokens(text) {
  return tokenize(extractConceptLabel(text)).filter(token =>
    token.length > 3 && !new Set([
      "marketing", "digitale", "digital", "web", "concetto", "ruolo", "rilevante",
      "affermazione", "opzione", "esempio", "corretto", "strategia", "strategico",
      "operativo", "cliente", "consumatore", "brand"
    ]).has(token)
  );
}

function conceptOverlap(conceptTokens, value) {
  const candidateTokens = new Set(tokenize(value));
  const hits = conceptTokens.filter(token => candidateTokens.has(token)).length;
  return hits / conceptTokens.length;
}

function renderQuestionsFile(nextModes, nextQuestions) {
  return [
    "// Banco quiz per Web Marketing e Comunicazione Digitale.",
    "// Generato da build-questions.mjs e arricchito con domande curate da NotebookLM.",
    "(() => {",
    `  window.WEB_MARKETING_SPECIAL_QUIZZES = ${JSON.stringify(nextModes, null, 2)};`,
    "",
    `  window.WEB_MARKETING_QUIZ_BANK = ${JSON.stringify(nextQuestions, null, 2)};`,
    "})();",
    ""
  ].join("\n");
}

function renderReport(changes, nextQuestions) {
  const byType = countBy(changes, change => change.type);
  const bySection = countBy(changes, change => change.section);
  const lines = [
    "# Weak Question Enrichment Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    `- Questions in bank: ${nextQuestions.length}`,
    `- Weak questions enhanced: ${changes.length}`,
    `- NotebookLM replacements: ${byType["notebook-replacement"] || 0}`,
    `- In-place rewrites with generated hints/rationales: ${byType["rewrite-and-rationales"] || 0}`,
    `- Tier B NotebookLM replacement mode: ${useNotebookTierB ? "enabled" : "disabled; retained only super-safe NotebookLM replacements from the previous pass"}`,
    `- Questions with explanations after pass: ${nextQuestions.filter(q => q.hint && q.rationales).length}`,
    "",
    "## Enhanced By Section",
    ...Object.entries(bySection).map(([sectionName, count]) => `- ${sectionName}: ${count}`),
    "",
    "## Changes",
    ...changes.map(change => `- Q${change.id} [${change.type}] ${change.before} -> ${change.after}`)
  ];
  return `${lines.join("\n")}\n`;
}

function countBy(items, keyFn) {
  return items.reduce((acc, item) => {
    const key = keyFn(item);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function similarity(a, b) {
  const left = new Set(tokenize(a).filter(token => token.length > 3));
  const right = new Set(tokenize(b).filter(token => token.length > 3));
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection++;
  return intersection / Math.max(left.size, right.size);
}

function hasScenarioSignal(text) {
  return /\b(caso|scenario|azienda|impresa|brand|utente|cliente|consumatore|startup|piattaforma|campagna|percorso|spotify|netflix|amazon|google|apple|blockbuster)\b/i.test(text);
}

function hasAbsurdDistractor(item) {
  const text = normalize(JSON.stringify(item));
  return /coordinate gps|stipend|mappa fisica|negozi fisici|velocita con cui|tastiera|cancellare tutte|colore del logo|orario di apertura/.test(text);
}

function hasWeakOptionShape(optionTexts) {
  const normalized = optionTexts.map(normalize);
  if (new Set(normalized).size !== normalized.length) return true;
  if (optionTexts.some(text => text.length < 18)) return true;
  if (optionTexts.some(text => /^(solo|mai|sempre|nessun|tutti)\b/i.test(text.trim()))) return true;
  const lengths = optionTexts.map(text => text.length);
  return Math.max(...lengths) / Math.max(1, Math.min(...lengths)) > 4.2;
}

function shorten(value, maxWords) {
  const words = String(value).split(/\s+/).filter(Boolean);
  return words.length <= maxWords ? value : `${words.slice(0, maxWords).join(" ")}...`;
}

function cleanText(value) {
  return String(value)
    .replace(/\\\$/g, "$")
    .replace(/\$/g, "")
    .replace(/\s+/g, " ")
    .trim();
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
    "secondo", "materiale", "fornito", "prof", "granato", "viene", "sono", "essere",
    "questa", "questo", "contesto", "quando", "parla", "scelta", "meglio"
  ]);
  return normalize(value)
    .split(" ")
    .filter(token => token && !stopwords.has(token));
}
