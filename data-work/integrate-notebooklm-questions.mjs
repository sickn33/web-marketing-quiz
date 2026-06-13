import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import vm from "node:vm";

const letters = ["A", "B", "C", "D"];
const quizFile = "questions-data.js";
const notebookDir = "data-work/notebooklm-quizzes";
const reportFile = "data-work/notebooklm-integration-report.md";

const source = readFileSync(process.env.BASE_QUESTIONS_FILE || quizFile, "utf8");
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(source, sandbox);

const modes = sandbox.window.WEB_MARKETING_SPECIAL_QUIZZES;
const originalQuestions = sandbox.window.WEB_MARKETING_QUIZ_BANK;

const normalizedExisting = new Set(originalQuestions.map(q => normalize(q.text)));
const weakQuestions = originalQuestions.filter(isWeakQuestion);
const notebookQuestions = loadNotebookQuestions();
const curated = dedupeByQuestion(notebookQuestions)
  .map(item => ({ ...item, quality: scoreCandidate(item) }))
  .filter(item => item.quality >= 7)
  .filter(item => !normalizedExisting.has(normalize(item.question)))
  .filter(item => bestExistingSimilarity(item) < 0.76)
  .sort((a, b) => b.quality - a.quality || a.question.localeCompare(b.question, "it"));

const usedNotebookKeys = new Set();
const replacements = selectReplacements(curated);
const additions = selectAdditions(curated, replacements);
const nextQuestions = originalQuestions.map(question => {
  const replacement = replacements.find(item => item.replaceId === question.id);
  return replacement ? toQuizQuestion(replacement, question.id, question) : question;
});

let nextId = Math.max(...nextQuestions.map(q => q.id)) + 1;
for (const addition of additions) {
  nextQuestions.push(toQuizQuestion(addition, nextId++));
}

writeFileSync(quizFile, renderQuestionsFile(modes, nextQuestions));
writeFileSync(reportFile, renderReport(replacements, additions, curated));

console.log(`Integrated ${replacements.length} replacements and ${additions.length} additions.`);
console.log(`Question bank now contains ${nextQuestions.length} questions.`);

function loadNotebookQuestions() {
  const files = readdirSync(notebookDir)
    .filter(file => file.endsWith(".json"))
    .sort();
  const questions = [];
  for (const file of files) {
    if (file === "artifacts.json") continue;
    const artifact = JSON.parse(readFileSync(`${notebookDir}/${file}`, "utf8"));
    for (const [index, question] of (artifact.questions || []).entries()) {
      const options = question.answerOptions || [];
      const correct = options.find(option => option.isCorrect);
      const distractors = options.filter(option => !option.isCorrect);
      if (!correct || distractors.length !== 3) continue;
      const mapped = classifyQuestion(question.question, correct.text, options.map(option => option.text));
      if (!mapped) continue;
      questions.push({
        artifactId: file.replace(/\.json$/, ""),
        artifactTitle: artifact.title || "NotebookLM Quiz",
        index,
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
        sourceTopic: mapped.sourceTopic
      });
    }
  }
  return questions;
}

function dedupeByQuestion(items) {
  const byQuestion = new Map();
  for (const item of items) {
    const key = normalize(item.question);
    const current = byQuestion.get(key);
    if (!current || scoreCandidate(item) > scoreCandidate(current)) byQuestion.set(key, item);
  }
  return [...byQuestion.values()];
}

function scoreCandidate(item) {
  const question = item.question;
  const optionTexts = item.options.map(option => option.text);
  const wordCount = tokenize(question).length;
  const optionWordCounts = optionTexts.map(text => tokenize(text).length);
  const minOptionWords = Math.min(...optionWordCounts);
  const maxOptionWords = Math.max(...optionWordCounts);
  const allRationales = item.options.every(option => option.rationale && tokenize(option.rationale).length >= 6);
  let score = 0;
  if (item.hint && tokenize(item.hint).length >= 6) score += 1;
  if (allRationales) score += 2;
  if (wordCount >= 8 && wordCount <= 28) score += 1;
  if (minOptionWords >= 5 && maxOptionWords <= 28) score += 1;
  if (hasScenarioSignal(question)) score += 2;
  if (hasConceptSignal(question, optionTexts.join(" "))) score += 1;
  if (isDefinitionQuestion(question)) score -= 1;
  if (hasAbsurdDistractor(item)) score -= 4;
  if (hasWeakOptionShape(optionTexts)) score -= 2;
  if (item.section === "Granato, search e operational") score += 1;
  if (item.section === "Customer journey") score += 1;
  if (item.section === "Ricerche di mercato online") score += 1;
  return score;
}

function selectReplacements(candidates) {
  const picks = [];
  const usedWeakIds = new Set();
  const perSectionLimit = new Map([
    ["Fondamenti di marketing", 4],
    ["Processo di marketing", 3],
    ["STP e segmentazione", 3],
    ["Marketing 4.0 e brand", 8],
    ["Ecosistema digitale", 8],
    ["Ricerche di mercato online", 6],
    ["Customer journey", 8],
    ["Business model ed e-commerce", 8],
    ["Granato, search e operational", 12]
  ]);
  const perSectionUsed = new Map();

  for (const candidate of candidates) {
    if (usedNotebookKeys.has(candidateKey(candidate))) continue;
    if (candidate.quality < 8) continue;
    const possible = weakQuestions
      .filter(question => !usedWeakIds.has(question.id))
      .filter(question => question.section === candidate.section)
      .filter(question => sharesWeakConcept(question, candidate))
      .map(question => ({
        question,
        similarity: similarity(
          `${question.text} ${question.options.A}`,
          `${candidate.question} ${candidate.options[0].text}`
        )
      }))
      .filter(item => item.similarity >= 0.22)
      .sort((a, b) => b.similarity - a.similarity);
    const best = possible[0];
    if (!best) continue;
    const sectionUsed = perSectionUsed.get(candidate.section) || 0;
    if (sectionUsed >= (perSectionLimit.get(candidate.section) || 4)) continue;

    picks.push({
      ...candidate,
      replaceId: best.question.id,
      replacedText: best.question.text,
      replacedSource: best.question.source,
      matchScore: best.similarity
    });
    usedNotebookKeys.add(candidateKey(candidate));
    usedWeakIds.add(best.question.id);
    perSectionUsed.set(candidate.section, sectionUsed + 1);
    if (picks.length >= 30) break;
  }
  return picks.sort((a, b) => a.replaceId - b.replaceId);
}

function selectAdditions(candidates, replacements) {
  const quotas = new Map([
    ["Fondamenti di marketing", 4],
    ["Processo di marketing", 4],
    ["STP e segmentazione", 5],
    ["Marketing 4.0 e brand", 12],
    ["Ecosistema digitale", 12],
    ["Ricerche di mercato online", 15],
    ["Customer journey", 18],
    ["Business model ed e-commerce", 18],
    ["Granato, search e operational", 24]
  ]);
  for (const replacement of replacements) usedNotebookKeys.add(candidateKey(replacement));
  const selected = [];
  const perSection = new Map();
  const usedConcepts = new Set(replacements.map(conceptKey));
  for (const candidate of candidates) {
    if (usedNotebookKeys.has(candidateKey(candidate))) continue;
    if (candidate.quality < 8) continue;
    const concept = conceptKey(candidate);
    if (usedConcepts.has(concept)) continue;
    const current = perSection.get(candidate.section) || 0;
    const quota = quotas.get(candidate.section) || 10;
    if (current >= quota) continue;
    if (selected.some(item => item.section === candidate.section && similarity(item.question, candidate.question) >= 0.42)) continue;
    selected.push(candidate);
    usedNotebookKeys.add(candidateKey(candidate));
    usedConcepts.add(concept);
    perSection.set(candidate.section, current + 1);
  }
  return selected.sort((a, b) => sectionOrder(a.section) - sectionOrder(b.section) || b.quality - a.quality);
}

function toQuizQuestion(candidate, id, replacedQuestion = null) {
  const baseSource = `NotebookLM Web Marketing / ${candidate.artifactTitle} / ${candidate.artifactId.slice(0, 8)}`;
  const source = replacedQuestion
    ? `${replacedQuestion.source} + ${baseSource}`
    : `${baseSource} / ${candidate.sourceTopic}`;
  return {
    id,
    section: candidate.section,
    answer: "A",
    tags: candidate.tags,
    source,
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

function classifyQuestion(question, correct, allOptions) {
  const questionText = normalize(question);
  const text = normalize(`${question} ${correct} ${allOptions.join(" ")}`);
  const has = patterns => patterns.some(pattern => pattern.test(text));
  const stemHas = patterns => patterns.some(pattern => pattern.test(questionText));

  if (stemHas([/netflix/, /spotify/, /itunes/, /blockbuster/, /amazon/, /e commerce/, /marketplace/, /revenue model/, /business model/, /long tail/, /sharing economy/, /piattaforma digitale/, /device digitale/, /freemium/, /subscription/])) {
    return section("Business model ed e-commerce", ["business", "digitale"], "Business Model Digitali");
  }
  if (stemHas([/journey/, /touchpoint/, /\bzmot\b/, /\bfmot\b/, /consumer decision/, /buyer persona/, /\bpersonas?\b/, /customer experience/, /percorso d acquisto/, /active evaluation/, /valutazione attiva/, /loyalty loop/, /tailored messaging/, /mckinsey/, /omni channel/, /omnichannel/, /pain points/, /customer journey/])) {
    return section("Customer journey", ["journey"], "Customer Journey");
  }
  if (stemHas([/ricerc[ah] di mercato/, /questionario/, /survey/, /sondagg/, /campion/, /likert/, /\bcawi\b/, /intervist/, /focus group/, /\bnps\b/, /dato primario/, /dati primari/, /dato secondario/, /dati secondari/, /indagine/, /bias del questionario/])) {
    return section("Ricerche di mercato online", ["ricerca"], "Ricerche di mercato");
  }
  if (stemHas([/advertising/, /google ads/, /\bseo\b/, /\bsem\b/, /search intent/, /serp/, /keyword/, /email marketing/, /content marketing/, /funnel/, /analytics/, /\bkpi\b/, /conversion/, /campagna/, /retargeting/, /remarketing/, /programmatic/, /display/, /ai overview/, /\baio\b/, /\bgeo\b/, /\bppc\b/, /google trends/, /mobile friendly/, /posizionamento su google/, /landing page/, /\bcpc\b/, /\bcpm\b/, /\broas\b/, /\broi\b/, /lead generation/, /intento commerciale/])) {
    return section("Granato, search e operational", ["digitale", "operational"], "Operational digital marketing");
  }
  if (stemHas([/lego/, /brand/, /marketing 4 0/, /marketing 5 0/, /customer empowerment/, /co creation/, /brand activism/, /\bcsr\b/, /cause marketing/, /acting as friends/, /brand image/, /brand engagement/, /brand advocacy/, /codes del marketing/])) {
    return section("Marketing 4.0 e brand", ["fondamenti", "digitale"], "Marketing 4.0");
  }
  if (stemHas([/segmentaz/, /\bstp\b/, /\btargeting\b/, /posizionamento del brand/, /posizionamento di marca/, /\bcluster\b/])) {
    return section("STP e segmentazione", ["fondamenti"], "Segmentazione");
  }
  if (stemHas([/aspettative/, /expectations/])) {
    return section("Customer journey", ["journey"], "Customer Journey");
  }
  if (stemHas([/digitale/, /digital transformation/, /trasformazione digitale/, /tecnolog/, /\biot\b/, /intelligenza artificiale/, /big data/, /ecosistema/, /device/, /mobile/, /\bapp\b/, /internet/, /web 2 0/, /prosumer/, /digital native/, /innovazione/, /invenzione/, /dialogo paritario/, /tempo medio sulla pagina/])) {
    return section("Ecosistema digitale", ["digitale"], "Ecosistema digitale");
  }

  if (has([/advertising/, /google ads/, /\bseo\b/, /\bsem\b/, /search intent/, /serp/, /keyword/, /email marketing/, /content marketing/, /funnel/, /analytics/, /\bkpi\b/, /conversion/, /retargeting/, /remarketing/, /programmatic/, /display/, /ai overview/, /\baio\b/, /\bgeo\b/, /\bppc\b/, /google trends/, /mobile friendly/, /posizionamento su google/, /landing page/, /\bcpc\b/, /\bcpm\b/, /\broas\b/, /\broi\b/, /lead generation/])) {
    return section("Granato, search e operational", ["digitale", "operational"], "Operational digital marketing");
  }
  if (has([/ricerc[ah] di mercato/, /questionario/, /survey/, /campion/, /likert/, /\bcawi\b/, /intervist/, /focus group/, /\bnps\b/, /dato primario/, /dati primari/, /dato secondario/, /dati secondari/, /indagine/, /bias del questionario/])) {
    return section("Ricerche di mercato online", ["ricerca"], "Ricerche di mercato");
  }
  if (has([/segmentaz/, /\bstp\b/, /\btargeting\b/, /posizionamento del brand/, /posizionamento di marca/, /\bcluster\b/])) {
    return section("STP e segmentazione", ["fondamenti"], "Segmentazione");
  }
  if (has([/e-?commerce/, /marketplace/, /revenue model/, /business model/, /long tail/, /sharing economy/, /piattaform/, /freemium/, /subscription/, /netflix/, /spotify/, /itunes/, /blockbuster/, /amazon/])) {
    return section("Business model ed e-commerce", ["business", "digitale"], "Business Model Digitali");
  }
  if (has([/digitale/, /digital transformation/, /trasformazione digitale/, /tecnolog/, /iot/, /intelligenza artificiale/, /big data/, /ecosistema/, /device/, /mobile/, /app/, /internet/, /web 2\.0/, /prosumer/, /digital native/, /innovazione/, /invenzione/])) {
    return section("Ecosistema digitale", ["digitale"], "Ecosistema digitale");
  }
  if (has([/marketing 4\.0/, /marketing 3\.0/, /marketing 2\.0/, /brand/, /engagement/, /co-creation/, /fiducia/, /customer empowerment/, /social media marketing/, /loyalty/, /advocacy/])) {
    return section("Marketing 4.0 e brand", ["fondamenti", "digitale"], "Marketing 4.0");
  }
  if (has([/marketing mix/, /\b4p\b/, /swot/, /pianificaz/, /strategia/, /operativ/, /analisi interna/, /analisi esterna/])) {
    return section("Processo di marketing", ["fondamenti"], "Processo di marketing");
  }
  if (has([/marketing management/, /bisogno/, /desiderio/, /domanda/, /valore/, /scambio/, /offerta/, /mercato/])) {
    return section("Fondamenti di marketing", ["fondamenti"], "Evoluzione del marketing");
  }
  return null;
}

function section(sectionName, tags, sourceTopic) {
  return { section: sectionName, tags, sourceTopic };
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

function renderReport(replacements, additions, allCurated) {
  const lines = [
    "# NotebookLM Integration Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    `- Candidate NotebookLM questions after dedupe and quality filters: ${allCurated.length}`,
    `- Replaced existing weak questions: ${replacements.length}`,
    `- Added new curated questions: ${additions.length}`,
    `- Final expected bank size: ${originalQuestions.length + additions.length}`,
    "",
    "## Replacements",
    ...replacements.map(item => `- Q${item.replaceId}: ${item.replacedText} -> ${item.question}`),
    "",
    "## Additions By Section",
    ...Object.entries(countBy(additions, item => item.section)).map(([sectionName, count]) => `- ${sectionName}: ${count}`),
    "",
    "## Added Questions",
    ...additions.map(item => `- ${item.section}: ${item.question}`)
  ];
  return `${lines.join("\n")}\n`;
}

function isWeakQuestion(question) {
  return /^(Quale affermazione descrive meglio|Perch[eé] il concetto|Qual [èe] il ruolo del concetto|Cosa si intende per|Quale opzione descrive un esempio corretto)/i.test(question.text);
}

function sharesWeakConcept(question, candidate) {
  const concept = weakConcept(question.text);
  if (!concept.length) return similarity(question.text, candidate.question) >= 0.32;
  const candidateTokens = new Set(tokenize(`${candidate.question} ${candidate.options[0].text}`));
  return concept.some(token => candidateTokens.has(token));
}

function weakConcept(text) {
  const normalized = normalize(text);
  const patterns = [
    /concetto di (.+?)(?: nel|$)/,
    /ruolo del concetto di (.+?)(?: nel|$)/,
    /si intende per (.+?)(?:\?|$)/,
    /esempio corretto del concetto di (.+?)(?:\?|$)/
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match) return tokenize(match[1]).filter(isSpecificConceptToken);
  }
  return tokenize(normalized).filter(isSpecificConceptToken);
}

function isSpecificConceptToken(token) {
  return token.length > 3 && !new Set([
    "marketing", "digitale", "digital", "web", "concetto", "ruolo", "rilevante", "affermazione",
    "opzione", "esempio", "corretto", "strategico", "operativo", "cliente", "consumatore", "brand"
  ]).has(token);
}

function conceptKey(candidate) {
  const text = normalize(`${candidate.question} ${candidate.options[0].text}`);
  const concepts = [
    "zmot", "brand activism", "brand engagement", "brand advocacy", "spotify", "netflix", "amazon",
    "blockbuster", "itunes", "ai overview", "search intent", "retargeting", "google trends", "mobile friendly",
    "content marketing", "customer journey", "loyalty loop", "touchpoint", "buyer personas", "pain points",
    "digital analytics", "email marketing", "dynamic pricing", "piattaforma device", "business model",
    "swot", "prosumer", "omnichannel", "cpc cpm", "disconfirmation paradigm"
  ];
  for (const concept of concepts) {
    const normalizedConcept = normalize(concept);
    if (text.includes(normalizedConcept)) return `${candidate.section}:${normalizedConcept}`;
  }
  return `${candidate.section}:${tokenize(candidate.question).slice(0, 5).join("-")}`;
}

function bestExistingSimilarity(candidate) {
  let best = 0;
  for (const question of originalQuestions) {
    best = Math.max(best, similarity(question.text, candidate.question));
    if (best >= 0.76) return best;
  }
  return best;
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

function hasConceptSignal(question, options) {
  return /\b(marketing|digitale|brand|journey|zmot|seo|search|advertising|segmentazione|posizionamento|e-commerce|business model|revenue|questionario|ricerca|touchpoint|funnel|kpi|conversione|innovazione)\b/i.test(`${question} ${options}`);
}

function isDefinitionQuestion(text) {
  return /^(qual [eè] la definizione|cosa si intende|che cosa si intende|qual [eè] il significato)/i.test(text);
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

function sectionOrder(sectionName) {
  return [
    "Fondamenti di marketing",
    "Processo di marketing",
    "STP e segmentazione",
    "Marketing 4.0 e brand",
    "Ecosistema digitale",
    "Ricerche di mercato online",
    "Customer journey",
    "Business model ed e-commerce",
    "Granato, search e operational"
  ].indexOf(sectionName);
}

function candidateKey(candidate) {
  return normalize(candidate.question);
}

function countBy(items, keyFn) {
  return items.reduce((acc, item) => {
    const key = keyFn(item);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
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
    "come", "cosa", "quale", "quali", "degli", "delle", "della", "nella", "nelle", "secondo",
    "materiale", "fornito", "prof", "granato", "viene", "sono", "essere", "questa", "questo"
  ]);
  return normalize(value)
    .split(" ")
    .filter(token => token && !stopwords.has(token));
}
