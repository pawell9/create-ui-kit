# Audit method — reading mockups into facts

Goal: everything Design needs, measured once, written to `ui-kit/audit/summary.md`. Every statement carries a mark:
- **FACT** — read from Figma, with node id ("text `12:345`: Inter Bold 18/140 %").
- **INFERENCE** — interpretation, with confidence ("24 px is the title→description gap, medium").
- **PROPOSAL** — what to build; only in `plan.md`.

## Tool: scripts/audit.js
Read-only; pass the whole file as `code`, change only `PARAMS` (fileKey, mode, ids, `forbiddenPageIds` = protected pages). Modes:

| mode | input | gives |
|---|---|---|
| `inventory` | `pageIds` | frames with size, breakpoint guess, D/T/M groups by name, local components, Variables, Styles |
| `tokens` | `rootIds` (frames) | colors by use (fill/stroke/text), vector colors apart, typography tuples with sample text, fonts, radii, strokes and dashes, effects, auto-layout paddings/gaps — counts, breakpoints, example ids |
| `components` | `rootIds` | existing components/instances; repeated-structure `clusters` (same size + structure) with role hint, padding and gaps; `families` (same structure and height, varying width = Hug items) |
| `spec` | node ids | compact tree of a node: relative geometry, paints with bound variables, strokes/dashes, radii, auto layout, text props and style, vectors, instance props |

When a result carries `meta.truncated`, fetch the rest with `categories: [name], cursor: nextCursor`. `OUTPUT_TOO_LARGE` → fewer roots or lower `depth`.

## Order
1. **tokens** per breakpoint: all frames of one breakpoint in one call (split if it times out or overflows). Many frames (> 8 per breakpoint) → dispatch one subagent per breakpoint; each runs the calls, writes its part of `summary.md`, and returns ≤ 15 lines. Subagents receive fileKey, sessionId, root ids, forbidden page ids and the path of `audit.js`.
2. **components** per breakpoint on the same roots.
3. **Confirm candidates visually**: one `get_screenshot` (`maxDimension` 600) per candidate cluster or family, using its first example id. Drop decoration, keep UI.
4. **Link breakpoints**: the same component across D/T/M shares text content, order on the screen, or role. Record per component: `{Desktop: id, Tablet: id, Mobile: id}` or `absent`.
5. **spec** happens later, during Build, per component — not here.

## What to extract

**Colors.** UI colors come from `colors`; `vectorColors` are icons and illustrations (icon colors still matter). Keep alpha as found (`#3355aa33` = 20 %). Name candidates by role: brand, accent, surface, text, border, feedback. Colors used only inside photos or illustrations are not tokens.

**Typography.** One tuple = family, style, size, line height, letter spacing, case, trim. Map tuples to roles (button label, heading H1, body, caption) per breakpoint. Record the trim mode: if texts use `CAP_HEIGHT`, the Text Styles must carry it.

**Spacing.**
- Auto-layout paddings and gaps are FACT.
- Mockups without auto layout: distances between bounding boxes are FACT as measurements; reading them as padding or gap is INFERENCE. Reliable: content inside its surface (`sp.pad` of a cluster), gaps between repeated siblings. Weak: neighbours in a random group (`Group 1234…` groups are often accidental).
- Values are kept to 0.01 px. Rounding and merging are proposals for G2, never silent edits.

**Components.** A candidate becomes a component when it repeats (cluster n ≥ 2 or a family) or is a known control type (button, input, checkbox, radio, tab, tag, accordion, card, nav, select, stepper). Whole screens and page sections are patterns, not components. Existing local components in the source file are kept, never duplicated.

**States.** Evidence for states: frames named hover/active/error/«наведение»/«ошибка», duplicated screens that differ in one element, existing component variants, cursor icons in mockups. A state counts as FACT only with such evidence.

**Neighbour values.** Sizes within ±1 px, same family sizes within 1 px (14.29 vs 14), colors differing by ≤ 6/255 per channel: list them together with counts and ids. They become one G2 decision per group, ★ = the most frequent value unless the difference carries meaning (e.g. separate breakpoints).

**Breakpoints.** Frame width ≠ content container width ≠ CSS breakpoint. Record frame widths as FACT; container width comes from the left/right edges of content (INFERENCE).

## summary.md skeleton
```
# Audit summary · <file> · <date>
Coverage: <n> frames (D <n> / T <n> / M <n>), <nodes> nodes, excluded: …
Fonts: <family style> ok|missing
## Colors (UI)        hex · role (INFERENCE) · uses · bp · example id
## Typography         tuple · role · bp · example id
## Radii / strokes / effects
## Spacing             FACT values with ids; INFERENCE roles
## Components          name · role · D/T/M source ids · states found · notes
## Neighbour values    groups for G2
## Open questions      only what blocks Design
```
