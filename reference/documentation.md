# Documentation — the kit as a readable system

Three layers, one meaning each: the **sheet** in Figma (how to read and use a component), the master's **description** (short rules visible in Dev Mode and Assets), **handoff.md** (what a developer needs that Figma cannot show). One master per component, one main display (its sheet); specimens show only what matrices cannot (flows, long content, scroll).

## Page layout
- Sections left to right with 400 px gaps: `00 · Index`, `01 · Foundations`, component chapters, `Patterns`, `Test Compositions`, `_doc · Service`.
- Inside a chapter, three columns: **Sheets** (x 100) | **Masters** (direct children of the Section, never inside an auto-layout sheet, so layout cannot move or stretch them) | **Specimens** (flows, prototypes, edge cases).
- Sheet: width 2800, padding 80, fill `surface/base`, radius `radius/card`; Section fill `surface/muted`. Grid: left info column 440 · gap 80 · right matrices 2120. Rhythm: 100 between sheets, 80 between blocks, 60 between groups, 20 from a group title to its scene.

## Service components (`_doc/*`, unpublished) and styles (`_Doc/*`)
Build them once in `_doc · Service`, then every sheet is instances — one place to restyle the whole documentation.

| Component | Contents | Properties |
|---|---|---|
| `_doc/ChapterHeader` | number, link "← Index", path, title, description, meta line | text: Number, Path, Title, Description, Meta; bool: Show meta |
| `_doc/ComponentInfo` | name, purpose (2–4 lines), Properties table (`_doc/PropRow` × up to 8), Variables line, `_doc/Note`, links to master and specimen | text: Name, Purpose, Variables, Master link, Specimen link; bool: Row 5…8, Show note, Show specimen; nested rows and note exposed |
| `_doc/PropRow` | property name · values · dashed divider | text: Name, Values; bool: Divider |
| `_doc/Note` | "Important" label + text on `surface/muted` | text: Label, Text |
| `_doc/AxisLabel` | matrix column/row label + caption | text: Title, Caption; bool: Show caption; variant Tone=Light\|Dark |

`_Doc/*` text styles: Display (display font, ~120), Title (~60), Number (~30), Heading (text font Bold 30), Subheading (Bold 18), Body (Medium 18/150 %), Label (SemiBold 14), Caption (Medium 14/150 %). Fonts are the project's own display and text fonts. Documentation text is ≥ 14 px and ≥ 4.5:1 against its background; hierarchy comes from weight and size, not pale gray. Need a secondary gray → one variable `doc/text/secondary` with `hiddenFromPublishing = true`.

## Component block on a sheet
- Left: `_doc/ComponentInfo`.
- Right: matrices built from instances of the master. Columns = states, rows = breakpoints (or variants). Every axis labelled with `_doc/AxisLabel` (title + caption: size, style, token). A combination that does not exist shows "—" with the reason in the row caption.
- **Scene** = the background the component lives on in the product: dark scene for components used on dark, light scene with a dashed frame otherwise. Check every scene for invisible elements (light icons on light scene).
- Components without a `Breakpoint` variant are shown per breakpoint inside frames that pin the Size mode, with the T/M text style applied on the instance.
- Open states that overlay neighbours (dropdowns) get room below and `clipsContent = false`.

## Foundations chapter
Color (swatch, name, hex, alias, scopes, where used) · Size and radius (table D/T/M) · Typography (specimen per style, grouped by family/role, with parameters) · Effects, focus ring, dashes and other recurring treatments.

## Index
One row per chapter: number, name, contents, links to the Section and its first sheet. Links in Figma text: `text.setRangeHyperlink(start, end, { type: 'NODE', value: nodeId })`.

## Descriptions (masters)
Product language, 2–6 lines: purpose, when to use, behaviour rules not visible in Figma, known limitations. No internal decision codes, node ids or history.

## Patterns and test compositions
- **Patterns**: multi-step or multi-component behaviour (form sending / submit error / success) as instance compositions with short rules.
- **Test compositions**: real scenarios from the mockups rebuilt only from instances (a form with errors and long values, card grids D/T/M, tab rows wider than the viewport, open overlays, nested components). Each states what it proves. They are part of QA: defects found here are fixed in masters.

## handoff.md (for the developer)
```
# <Product> UI Kit — developer guide
File / page / Index link
1. Structure: chapters table with links
2. Finding masters (Assets names, sheet links)
3. Variants and properties: naming convention, booleans, text props, exposed nested instances
4. Reading states and breakpoints: matrices, Hover = Desktop only, focus ring, Size modes vs Text Styles
5. Static in Figma vs implemented in code (flows, scroll, ordering logic)
6. Interaction rules per component (table): states, triggers, a11y (roles, aria, keyboard)
7. Responsive table: per component/pattern D / T / M
8. Complex components and test compositions (links)
9. Accepted limitations (numbered, each with the reason)
10. Publishing: manual — Assets → Libraries → Publish; what is hidden (`_` prefix, hiddenFromPublishing)
```
