# Build recipes

Generic Plugin API mechanics live in `figma-use` and `figma-generate-library` (`references/component-creation.md`, `token-creation.md`). This file holds the skeleton every writing script uses and the patterns specific to building a kit from mockups.

## Script skeleton (every writing call)
```js
const P = { fileKey: '<key>', pageId: '<target page>', fonts: [{ family: 'Inter', style: 'Regular' }], existingId: null };
// ── guard: nothing above this line mutates
if (figma.fileKey && figma.fileKey !== P.fileKey) return { error: 'FILEKEY_MISMATCH' };
const page = await figma.getNodeByIdAsync(P.pageId);
if (!page || page.type !== 'PAGE') return { error: 'TARGET_PAGE_MISSING' };
const fontErr = await Promise.all(P.fonts.map(f => figma.loadFontAsync(f))).then(() => null, e => String(e && e.message || e));
if (fontErr) return { error: 'FONT_LOAD_FAILED', detail: fontErr };
if (P.existingId && await figma.getNodeByIdAsync(P.existingId)) return { error: 'ALREADY_EXISTS', id: P.existingId }; // idempotency via ledger id
await figma.setCurrentPageAsync(page);
// ── mutations: from here on, errors propagate (throw) so the whole call rolls back
const created = [];
/* … */
return { ok: true, created };
```
- One call = one coherent unit (a collection, a component set with all its variants, a sheet). Split at different components or file-wide resources so a failure stays local.
- Return ids plus the evidence the ledger needs (variant names, sizes); verify geometry in the next read-only call, and look at the result (`get_screenshot`) before marking it verified — a successful script proves nothing visual. The user sees this evidence at the gates, not after every write.
- Position new top-level nodes inside their Section, never at (0,0) of the page.

## Foundations
```js
const col = figma.variables.createVariableCollection('Size');
const D = col.modes[0].modeId; col.renameMode(D, 'Desktop');
const T = col.addMode('Tablet'), M = col.addMode('Mobile');
const v = figma.variables.createVariable('radius/card', col, 'FLOAT');
v.setValueForMode(D, 15); v.setValueForMode(T, 10); v.setValueForMode(M, 8);
v.scopes = ['CORNER_RADIUS']; v.setVariableCodeSyntax('WEB', 'var(--radius-card)');
// color: value {r,g,b,a} in 0..1; alias: { type: 'VARIABLE_ALIAS', id: other.id }
const s = figma.createTextStyle();
s.name = 'Button/Label/Desktop';                 // name first: a failure leaves no anonymous style
s.fontName = { family: 'Inter', style: 'Bold' }; s.fontSize = 18;
s.lineHeight = { unit: 'PERCENT', value: 140 }; s.letterSpacing = { unit: 'PERCENT', value: 0 };
s.textCase = 'UPPER'; s.leadingTrim = 'CAP_HEIGHT';  // trim belongs to the style
```
Verify: counts, values per mode, scopes, aliases, every style's parameters. Store all ids in the ledger (`S:<key>,` with the comma).

## One component set, all variants in one call
```js
const bind = (node, field, v) => node.setBoundVariable(field, v);
const bindRadius = (node, v) => ['topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius'].forEach(f => node.setBoundVariable(f, v));
const paint = (v) => figma.variables.setBoundVariableForPaint({ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }, 'color', v);

const variants = [];
for (const bp of BPS) for (const state of STATES) {          // only combinations approved in plan.md
  const c = figma.createComponent();
  c.name = `State=${state}, Breakpoint=${bp.name}`;
  c.layoutMode = 'HORIZONTAL'; /* padding, gap, sizing from spec of the source example */
  c.setExplicitVariableModeForCollection(sizeCol, bp.modeId);
  const label = figma.createText(); c.appendChild(label);
  await label.setTextStyleIdAsync(bp.labelStyleId);         // style from ledger; never set leadingTrim here
  label.characters = SOURCE_TEXT; label.name = 'label';
  label.fills = [paint(textVar)];
  /* … build from spec … */
  variants.push(c);
}
const set = figma.combineAsVariants(variants, section);
set.name = 'Button/Primary';
set.description = '<purpose, when to use, rules — product language>';
const labelKey = set.addComponentProperty('Label', 'TEXT', SOURCE_TEXT);
for (const v of set.children) v.findOne(n => n.name === 'label').componentPropertyReferences = { characters: labelKey };
// lay variants out in a readable grid inside the set (rows = Breakpoint, columns = State), then resize the set
return { setId: set.id, variants: set.children.map(v => [v.id, v.name]) };
```
- Build states together with the component. Adding states later means cloning variants, which drops property references.
- If you must clone: `const nv = base.clone(); set.appendChild(nv);` then re-apply every `componentPropertyReferences` by layer name and verify with `qa.js`.

## Focus ring (boolean overlay)
```js
const focusedKey = set.addComponentProperty('Focused', 'BOOLEAN', false);
for (const v of set.children) {
  v.clipsContent = false;
  const ring = figma.createFrame(); v.appendChild(ring);
  ring.name = 'focus-ring'; ring.layoutPositioning = 'ABSOLUTE';
  ring.x = -4; ring.y = -4; ring.resize(v.width + 8, v.height + 8);
  ring.constraints = { horizontal: 'STRETCH', vertical: 'STRETCH' };
  ring.fills = []; ring.strokes = [paint(brandVar)]; ring.strokeWeight = 2; ring.strokeAlign = 'INSIDE';
  ring.cornerRadius = RADIUS + 4;
  ring.componentPropertyReferences = { visible: focusedKey };
  // inner light ring: a second frame at -2 / +4 with the surface color, same visibility reference
}
```
Nested components inside a focusable parent stay `Focused=false`; the parent owns focus.

## Exact copy from the source
1. `audit.js` `mode: 'spec'` on the source example of each breakpoint (depth 4–6).
2. Rebuild in auto layout with the measured paddings and gaps (FACT); text boxes with cap-height trim are measured from the cap height, no manual offsets.
3. Vectors: copy `vectorNetwork` and stroke properties from the source node (`await vec.setVectorNetworkAsync(src.vectorNetwork)`), on the target page.
4. Verify: `qa.js` with `expectSizes` = source sizes per variant, plus one screenshot of the set next to a screenshot of the source example.

## Font fidelity check (Build step 0)
For each font family: create a temp text in a `_tmp` frame on the target page with the properties of one source text (`spec` gives them), read its width in the **next** call, compare with the source width, then delete the temp frame. Difference > 2 % → stop text work and ask the user to upload their font version.

## Temporary nodes
Anything created for review or testing is named `_tmp …` or `_review …` and its id goes to `ledger.temp` in the same step. `qa.js` reports leftovers.

## Behaviour test (per component family, two calls)
1. Create instances in a `_tmp` frame: long text, every State × Breakpoint × Focused combination that matters, nested overrides.
2. Next call: read sizes and texts — text overrides survive State/Breakpoint switches, state switches do not change size unless planned, Hug grows, nothing clips — then delete the `_tmp` frame.
