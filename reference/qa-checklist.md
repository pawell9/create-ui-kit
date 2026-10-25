# QA — gates before G3

QA proves three things: the kit is structurally sound, it matches the mockups, and it reads correctly. Exceptions are fine when they are recorded: put documented literals in `literalAllow`, documented node exceptions in `allowNodeIds`, both mirrored in `ledger.exceptions` with the reason.

## 1. Structural scan — scripts/qa.js
Read-only; whole page (`scopeIds: []`) or listed Sections/sets. Pass `expectVariants` and `expectSizes` from the ledger. Codes:

| Sev | Code | Meaning → usual fix |
|---|---|---|
| P0 | `BROKEN_INSTANCE` | instance without main component → re-point or rebuild from master |
| P0 | `MISSING_FONT` | font not available → user uploads font |
| P0 | `PROP_UNBOUND` | a variant has a same-named layer not bound to the property (typical after clone) → set `componentPropertyReferences` |
| P0 | `DUP_MASTER` | two masters with one name → keep the ledger one, migrate instances, delete the other |
| P1 | `NO_TEXT_STYLE`, `TRIM`, `STYLE_TRIM` | product text without style / wrong trim → apply style (never set trim on the node) |
| P1 | `LITERAL_COLOR` | unbound color in a master → bind to variable or record as exception |
| P1 | `MODE_MISMATCH`, `MODE_UNPINNED` | Breakpoint variant shows another breakpoint's sizes → pin the mode |
| P1 | `TEXT_CLIPPED` | rendered glyphs outside a clipping parent → `clipsContent = false` or size fix |
| P1 | `SIZE_MISMATCH`, `VARIANT_COUNT` | differs from source / ledger → rebuild per spec, or update ledger after a user edit |
| P1 | `BROKEN_LINK`, `OVERLAP`, `OUT_OF_BOUNDS`, `OUTSIDE_SECTION` | documentation layout → relink, move, resize Section |
| P2 | `SCOPE`, `DEFAULT_NAME`, `NON_ASCII_NAME`, `NO_DESCRIPTION`, `FOREIGN_MASTER`, `LEFTOVER`, `DOC_NO_STYLE`, `MIXED_STYLE` | hygiene → fix when cheap, else list in handoff |

`unusedVariables` lists variables bound nowhere: delete what the plan does not reserve; reserved ones go to handoff. `fingerprints` go to the ledger for drift checks on resume.

## 2. Fidelity
- Every variant size equals its source (`expectSizes`), D/T/M.
- One screenshot per component set beside its source examples: proportions, colors, text position, icon centring.
- Font width check passed (build step 0).

## 3. Behaviour (temporary instances, see build-recipes)
- Text overrides survive every State, Breakpoint and Focused switch.
- State switches keep the size unless the plan says otherwise.
- Hug grows with long text; Fill stretches in rows; containers with messages grow (Hug + minHeight).
- Nested exposed instances are editable without Detach.
- Focus ring is visible and not clipped by the parent.

## 4. Visual review (agent, by screenshot)
Every sheet, specimen and test composition at a readable scale. Look for: invisible elements (same color as scene), clipped or truncated text that is not intended, overlaps, empty matrix cells without "—", wrong scene background, labels that contradict the instance, leftovers of review boards.

## 5. Test compositions
Every composition listed in plan.md exists, is built from instances only (`qa.js` scope on its Section: no raw shapes besides backgrounds, no broken instances), and its stated proof holds.

## Gate to G3
P0 = P1 = 0 except recorded exceptions · fidelity and behaviour checks passed · every chapter reviewed by screenshot · `ledger.temp` empty · `qa.md` written (counts, exceptions, limitations) · `handoff.md` complete.
