---
name: create-ui-kit
description: Build an organised UI Kit in Figma from existing mockups — audit, architecture, build, QA, documentation — with three human checkpoints. `/create-ui-kit <figma link>` starts, `/create-ui-kit` resumes, `/create-ui-kit <corrections>` applies review feedback.
disable-model-invocation: true
argument-hint: "[figma link | corrections | status]"
---

# Create UI Kit

Turn approved Figma mockups into an editable UI Kit in the same file: Foundations (Variables, Text Styles), components with variants, states and breakpoints, patterns, test compositions, and developer documentation. **Fidelity, not redesign**: every component is an *exact copy* of the mockups; anything the mockups do not show is a PROPOSAL the user approves at a gate.

The user steers through three **gates**; everything between gates is autonomous.

| Gate | After | The user |
|---|---|---|
| **G1 Brief** | preflight (minutes) | confirms sources, target page, scope |
| **G2 Plan** | audit + design, before any library write | replies `ок` (accept all ★) or overrides by number |
| **G3 Acceptance** | build + QA | reviews in Figma; sends corrections or `принято` |

## Start of every run

1. Load `figma-use` (mandatory before any `use_figma`). Before the first write of the session also load `figma-generate-library` (Foundations, components) and read [reference/figma-gotchas.md](reference/figma-gotchas.md); add `figma-generate-design` before building sheets, patterns and test compositions. Pass the loaded skill names in `skillNames` of writing calls.
2. Read `ui-kit/ledger.json` in the working directory. It is the single source of truth for state; route by it:
   - no ledger → Phase 0 with the link from the arguments (ask for a link if there is none);
   - `phase` set → resume that phase. At a gate the arguments are the user's answer: at G1 record the brief and start Audit; at G2 record the decisions (`ок` = every ★) and start Build; at G3 they are corrections (Phase 5). `status` → print progress from the ledger in ≤ 10 lines and stop.
3. `create_session` for the fileKey; pass `sessionId` on every file tool call.
4. Resuming with writes ahead: run [qa.js](scripts/qa.js) scoped to what the next step touches and compare `fingerprints` with the ledger. A difference means the user edited Figma: adopt the Figma state, record it in the ledger, never revert it.

## Guardrails

- Node ids come from the user's link, audit output or the ledger — never guessed, never picked by a similar name; the fileKey is the one from the link.
- Source pages are read-only: read by node id; never create, clone, move or edit nodes there. Protected pages (backups) are never read at all.
- Write only to the target page, plus file-wide Variables and Styles approved at G2. Every writing script starts with the guard from [reference/build-recipes.md](reference/build-recipes.md) and returns before its first mutation when the guard fails.
- Fonts are never substituted. A font that fails to load blocks text work until the user uploads it to their Figma account.
- Deletion is limited to nodes the agent created (recorded in the ledger) and nodes a G3 correction names; check that a component has no instances before deleting it.
- Publishing the library, Code Connect, new files, plan or account changes happen only when the user asks.

## Workspace

`ui-kit/` in the working directory: `ledger.json` (from [templates/ledger.json](templates/ledger.json)), `audit/summary.md`, `plan.md`, `qa.md`, `handoff.md`. Write down what later phases need (values, source ids, decisions), not raw tool output. Update the ledger after every verified step so any session can resume. Phases: `G1 → audit → design → G2 → build → qa → G3 → done`.

## Phases

### 0 · Preflight → G1
1. Parse fileKey and node id from the link. Check the Figma MCP connection (`whoami`; on failure see Connection in [reference/figma-gotchas.md](reference/figma-gotchas.md) and stop). `get_libraries` for the file: enabled libraries become a G1 question (reuse or build locally). Inventory the file with [audit.js](scripts/audit.js) `mode: 'inventory'` over the pages the link points to (list all pages, read only plausible source pages).
2. Classify frames into breakpoints by width, group the same screen across D/T/M, spot backups and explorations, and note existing local components, Variables and Styles.
3. Fonts: run `audit.js` `mode: 'tokens', categories: []` on one frame per breakpoint — it returns only `fonts` — then one call that `await figma.loadFontAsync()`s each of them and returns the failures (loading fonts mutates nothing).
4. Ledger: `phase: "G1"`, file, pages, frames. Send the **G1 message** (template below) and stop.

Done when every top-level frame of the candidate source pages is classified as source, excluded or unknown, and the G1 message lists the unknown ones as questions.

### 1 · Audit (autonomous)
If G1 chose a new target page, create it first (`figma.createPage()`, named as agreed) and store its id. Then follow [reference/audit-method.md](reference/audit-method.md). Done when:
- `tokens` has run over every approved source frame, all pages fetched (no `meta.truncated` left);
- every component candidate has a source example per breakpoint, or is marked absent at that breakpoint;
- every font used in the sources loads in `use_figma` (fonts that fail become a G2 blocker);
- `ui-kit/audit/summary.md` exists (≤ 150 lines).

### 2 · Design (autonomous) → G2
Follow [reference/architecture.md](reference/architecture.md). Write `plan.md`: Foundations, component inventory (properties, variants, states, breakpoints, source links), patterns, page structure, decisions with ★ recommendations. For decisions that are visual (new states, normalised colors), build one small board in a `_review · Decisions` Section on the target page and record it in `ledger.temp`. Send the **G2 message** and stop.

Done when every component in the inventory traces to source node ids, and every value not taken 1:1 from the sources appears as a numbered decision.

### 3 · Build (autonomous)
Follow [reference/build-recipes.md](reference/build-recipes.md), in this order: font fidelity check → Foundations → components by dependency (icons → atoms → molecules → composites), each built **with all its approved states and breakpoints at once** → patterns and test compositions → documentation ([reference/documentation.md](reference/documentation.md)) → delete `ledger.temp`.

Per component: `spec` of each source example → build in one call → verify with `qa.js` scoped to the set with `expectSizes` from the sources → screenshot of the set → ledger `status: "verified"`, fingerprint stored. A failure of the same step twice → `status: "blocked"` with the reason; continue with independent items.

### 4 · QA (autonomous) → G3
Follow [reference/qa-checklist.md](reference/qa-checklist.md). Fix P0/P1 that the approved plan already decides; anything needing a new decision goes into the G3 message with a recommendation. Write `qa.md` and `handoff.md`, then send the **G3 message** and stop.

Done when `qa.js` over the whole page reports P0 = P1 = 0 apart from exceptions recorded in the ledger, every test composition has passed, and every chapter has been screenshot-reviewed.

### 5 · Corrections (loop at G3)
1. Split the reply into numbered items. Ask back only for items you cannot act on, all in one message.
2. Apply the items in batches per component, re-verify each touched set, refresh the matrices, descriptions and `handoff.md` they affect, then rerun page-wide `qa.js`.
3. Reply with the G3 message again, listing only what changed. Repeat until the user accepts.
4. On acceptance: `phase: "done"`, final `handoff.md`, a summary in ≤ 10 lines. Publishing stays manual (steps in `handoff.md`).

## Talking to the user

Speak the user's language. The templates below are in Russian; localise them for other users. Between gates send one line per phase boundary at most. Logs, code and raw data stay in tool calls and files. Links use `https://www.figma.com/design/<fileKey>/?node-id=<id with ":" → "-">`.

**G1 message**
```
UI Kit · старт — проверьте, всё ли верно
Источник: <N> экранов × <breakpoints with widths> — <link per page>
Не трогаю: <backup/exploration pages>
Шрифты: <ok | missing → what the user must do>
Строю на: ★ новой странице «UI Kit» в этом файле | <alternative>
Перед сборкой: сохраните версию файла (File → Save to version history) — точка возврата
Вопросы (только неясное): 1) … ★рекомендация
Ответ: «ок» — или номера с поправками.
```

**G2 message** (≤ 40 lines; details live in plan.md)
```
UI Kit · план — оцените до сборки
Состав: <n> компонентов, <n> Variables, <n> Text Styles, <chapters>
1. Foundations — <palette/type summary> → <board link>
2. Компоненты — one line each: Name — variants/states — D/T/M — <source link>
3. Решения (★ — рекомендую):
   3.1 <decision> ★A … / B … → <link>
Ответ: «ок» принимает все ★; или «3.1 B, 2: без Hotspot».
```

**G3 message**
```
UI Kit · приёмка — <Index link>
Что посмотреть: 1) <chapter> — <what to check> → <link> …
QA: P0 0 · P1 0 · <n> принятых ограничений (handoff.md §…)
Нужно решение (если есть): … ★
Перед правками: сохраните версию файла (File → Save to version history).
Ответ: «принято» или список правок свободным текстом.
```

## Recovery

- A `use_figma` call that throws is rolled back as a whole; a script that *returns* after partial mutation keeps it. Validate before mutating; let errors propagate after the first mutation.
- On error obey `safeToRetryWithoutCanvasRead`; when it is false, read the touched nodes first. Retry once after fixing the cause.
- Restore points are Figma versions saved by the user: the G1 and G3 messages ask for one (File → Save to version history) because `use_figma` has no version API. Undo of the agent's own work goes through the ledger: every created id is recorded, so a bad step is removed by id.
- Context is finite: after a phase, work from the ledger, `summary.md` and `plan.md` rather than from earlier tool results.
