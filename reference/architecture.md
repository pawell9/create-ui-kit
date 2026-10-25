# Architecture — from audit to plan.md

Principle: the kit reproduces the mockups. Design decides *structure* (what is a token, a component, a variant, a pattern); values come from the audit. Every deviation from a source value is a numbered G2 decision.

## Foundations

**Color collection** — one mode unless the mockups have themes. Semantic names by role, no `color/` prefix: `brand/primary`, `accent/default`, `accent/border`, `surface/base|muted|selected`, `text/primary|inverse|muted`, `feedback/error`. A primitives layer only when the palette exceeds ~15 values or themes exist. Aliases where a role equals another (`text/inverse → surface/base`). A component-specific variable (`button/primary/pressed`) only when a state color has no role elsewhere. Scopes per use (see figma-gotchas). Code syntax WEB `var(--brand-primary)`.

**Size collection** — modes = breakpoints (`Desktop`, `Tablet`, `Mobile`). Holds `radius/*`, `size/*` (control heights, plaque widths), `space/*`. Create a variable when the value differs between breakpoints **or** is shared by ≥ 2 components; a one-off constant stays a literal in its component.

**Text Styles** — one style per *role* and breakpoint: `Button/Label/Desktop`, `Heading/H2/Mobile`, `Card/Title/Tablet`. Two roles with identical parameters still get two styles (sharing a style across unrelated roles was flagged in QA every time). Trim as in the sources. All fonts loaded and width-checked first.

**Effect Styles** — for shadows and blurs found in the sources.

**Icons** — `Icon/<Name>` local components, exact vectors, fill bound to a color variable, intrinsic size.

## Components

**Naming.** English, `Category/Name` (`Button/Primary`, `Form/Input`, `Card/Project`). Layer names describe roles (`label`, `icon`, `plaque`); default names (`Frame 12`) are QA findings. Product text stays in the product language.

**Property schema** (one convention for the whole kit):
| Property | Type | Use |
|---|---|---|
| `Style`, `Size`, `Type`, `Layout` | variant | form of the component |
| `State` | variant | mutually exclusive: Default, Hover, Pressed, Filled, Error, ErrorFilled, Selected, Disabled, Loading, Open |
| `Breakpoint` | variant | Desktop / Tablet / Mobile — whenever geometry **or** text style differs; each variant pins its Size mode |
| `Focused` | boolean | focus ring overlay, combinable with any State |
| `Label`, `Title`, `Placeholder`, `Error`… | text | every user-editable text |
| `Show …` | boolean | optional parts |
| `Icon` | instance swap | where swapping is meaningful |

**Sizing.** Hug for buttons, tags, chips (with `minWidth` when the source shows a minimum); Fill for items in grids and form columns; Fixed only where the mockup is fixed by design — a G2 decision when unclear. Dimensions per breakpoint equal the source, tolerance 0.5 px.

**Composition.** Build order by dependency; nested parts are instances of their masters; nested instances users will edit are exposed. Auto layout everywhere; absolute only for overlays and decoration. A block becomes a component when it repeats in ≥ 2 places or has its own states (forms, filter bars); screens and page sections are patterns.

**Existing components** in the client file are kept and listed; the kit may provide a replacement only as a G2 decision.

## States policy (one G2 decision group)
1. **FACT states** — whatever the mockups show: build them.
2. **Recommended minimum** (★ by default, user can drop items):
   - Hover — Desktop variants only, for clickable components; derived from existing colors (darker/lighter role, solid instead of dashed outline, etc.).
   - Focus — one indicator for the whole kit, drawn outside the component as absolute ring layers bound to the `Focused` boolean. ★ double ring: inner 2 px light surface + outer 2 px brand. Text fields use an inner 2 px ring instead.
   - Fields — Default, Filled, Error (empty required), ErrorFilled (invalid value), plus `Focused`; the message sits under the field in auto layout.
   - Checkbox/consent — Unchecked, Checked, Error. Selectable items — Selected (+ Hover on Desktop).
   - Submit buttons — Loading (spinner in place of the icon, same width) and Disabled, only where the site has a real waiting/blocked scenario.
3. Behaviour that is a rule rather than a look (drag-over, z-index of a focused tab, keyboard handling) goes into descriptions and handoff, without a variant.
4. New colors (error, pressed) become variables; text contrast ≥ 4.5:1, UI contrast ≥ 3:1 against the background they sit on. Error text on dark backgrounds gets its own variable.

## Responsive
- Component level: `Breakpoint` variants + pinned Size modes.
- Layout level (grids 4→2→1, horizontal-scroll rows, sticky navigation, overlay lists): patterns and test compositions plus handoff rules, never variants.
- A breakpoint missing in the mockups stays missing; it is listed as a limitation, not invented.

## Page structure (target page)
Sections left to right: `00 · Index`, `01 · Foundations`, one chapter per component category (`02 · Buttons & Icons`, `03 · Forms`, …), `NN · Patterns`, `NN · Test Compositions`, `_doc · Service`. Layout inside chapters: [documentation.md](documentation.md).

## plan.md skeleton
```
# UI Kit plan · <file> · <date>        status: awaiting G2 | approved <date>
## Scope        sources, breakpoints, target page, out of scope
## Foundations  table: variable · value(s) · scopes · source evidence
                table: text style · font tuple · role · source id
## Components   table: name · properties · variants × states × breakpoints · sources D/T/M · notes
## Patterns & test compositions   name · components · what it proves
## Chapters     section → components
## Decisions    D1… : question · options · ★ · evidence links · status
## Limitations  known gaps of the mockups
```

## Decision board (G2)
Only for decisions that need eyes: color merges, new state colors, focus ring options, Hover look. One Section `_review · Decisions` on the target page, one row per decision: label `D<n> · question`, options A/B/C drawn on plain frames using the source colors and the real component silhouette size, ★ on the recommendation. No components, no styles. Record the Section id in `ledger.temp`; it is deleted after Build.
