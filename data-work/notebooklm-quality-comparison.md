# NotebookLM vs Our 500 Questions: Quality Review

Generated: 2026-06-13T08:43:47.502Z

## Verdict

NotebookLM questions are generally better as learning objects: they are more specific, often scenario-based, and every option has a rationale plus a hint. Our 500-question bank is better as a controlled app dataset: it has clean IDs, sections, tags, source pointers, no duplicates, live/local consistency, and balanced coverage. If the goal is exam-style practice inside the current quiz app, our set is more production-ready. If the goal is helping a student understand why an answer is right or wrong, NotebookLM is stronger.

The best next step is not to replace ours wholesale with NotebookLM. It is to use NotebookLM as a rewrite and enrichment source for our weaker templated questions.

## Evidence Snapshot

| Dimension | Our 500 | NotebookLM 39 quizzes |
|---|---:|---:|
| Total questions | 500 | 1,250 |
| Unique normalized questions | 500 | 1,232 |
| Duplicate groups | 0 | 16 |
| Exact/strong overlap with our hosted set | n/a | 8 hosted questions covered |
| Average stem length | 9.8 words | 12.3 words |
| Generic template stems | 154 | 0 |
| Definition-style stems | 178 | 63 |
| Scenario/example stems | 143 | 189 |
| Rationales | 0 | 1,250 |
| Hints | 0 | 1,250 |
| Source/section metadata | yes | artifact-level only |
| App validation | passes | needs curation |

## Rubric Scores

Scores are qualitative, 1 to 10.

| Criterion | Our 500 | NotebookLM | Winner |
|---|---:|---:|---|
| Curriculum coverage | 9 | 7 | Our 500 |
| Source traceability | 8 | 5 | Our 500 |
| Question specificity | 5.5 | 8 | NotebookLM |
| Distractor plausibility | 7 | 6 | Our 500, slightly |
| Explanation/rationale value | 0 | 9 | NotebookLM |
| Difficulty calibration | 6.5 | 7 | NotebookLM, slightly |
| App readiness | 9 | 5 | Our 500 |
| Overall learning quality | 6.5 | 7.5 | NotebookLM |
| Overall production quality | 8 | 6 | Our 500 |

## Where NotebookLM Is Better

NotebookLM is better at asking questions that feel like a teacher wrote them for understanding, not just recognition.

Example, transformation digitale:

NotebookLM asks:

> In un'ottica di Trasformazione Digitale, cosa ha rappresentato Spotify rispetto al modello precedente di iTunes?

This is better than a pure definition because it tests whether the student can distinguish digitization, digitalization, and transformation using a real business-model shift.

NotebookLM also gives rationales for every option. That matters a lot for studying: wrong answers become teachable, not just red buttons.

## Where Our Set Is Better

Our bank is much cleaner as a maintained product dataset:

- Every question has an ID, section, tags, and source pointer.
- The live hosted dataset matches the local dataset exactly: 500/500.
- There are no duplicate normalized questions.
- Coverage is intentional across 9 sections.
- Distractors are often conceptually near the correct answer, which can make the quiz harder and less obvious.

Example, trasformazione digitale:

Our set includes a compact definition question, a relevance question, and an example question. This creates a controlled progression:

1. What it is.
2. Why it matters.
3. Which case best represents it.

That structure is good for a 500-question bank.

## Main Weaknesses In Our Set

The biggest weakness is templating. 154 stems follow generic patterns like:

- Quale affermazione descrive meglio il concetto...
- Perché il concetto ... è rilevante...
- Qual è il ruolo del concetto...

These are serviceable, but they feel repetitive and less exam-like. They also train recognition more than reasoning.

Our set also has no rationales or hints. For a quiz app, that means feedback stops at correct/incorrect. NotebookLM is much more useful for self-study because it explains why.

Finally, the stored correct answer is always A. The app shuffles options in the UI, so students do not see a bias, but the dataset itself is less portable and harder to audit as a standalone bank.

## Main Weaknesses In NotebookLM

NotebookLM often writes better stems, but some distractors are too obviously absurd. Example patterns include answers about GPS coordinates, salaries, physical shop maps, or deleting all past interaction traces. These are useful for novice learning, but too easy for exam simulation.

NotebookLM also lacks our structured curriculum control. It overproduces similar conceptual areas and includes 16 duplicate groups. It is not ready to drop into the app without dedupe, section tagging, source mapping, and difficulty calibration.

## Recommendation

Keep our 500 as the canonical app dataset. Then improve it using NotebookLM as a quality upgrade source:

1. Rewrite the 154 generic stems into more concrete scenario or application questions.
2. Add rationales to every option, borrowing the NotebookLM style but tightening overly silly distractors.
3. Preserve our sections, tags, sources, IDs, and app validation.
4. Use NotebookLM questions as candidates only when they fill gaps or improve a weak existing item.
5. Add a separate review mode that can show rationale/hint after answering.

## Practical Decision

- Better for production quiz app today: our 500.
- Better written for learning and feedback: NotebookLM.
- Best final product: our structured bank, rewritten/enriched with NotebookLM-style rationales and more applied stems.
