// Local tests for audit.js and qa.js (no Figma). Run: node scripts/test/run-tests.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { scene, solid, run } from './mock-figma.mjs';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..');
const AUDIT = readFileSync(join(dir, 'audit.js'), 'utf8');
const QA = readFileSync(join(dir, 'qa.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('FAIL', msg); } };
const bytes = o => Buffer.byteLength(JSON.stringify(o), 'utf8');

// ── 1. static: both scripts are read-only
const MUTATORS = /\.(appendChild|insertChild|remove|clone|resize|resizeWithoutConstraints|setProperties|setBoundVariable\w*|setExplicitVariableModeForCollection|setTextStyleIdAsync|setRangeHyperlink|setPluginData|setSharedPluginData|setCurrentPageAsync|setValueForMode|combineAsVariants|addComponentProperty|editComponentProperty|detachInstance|swapComponent|setVectorNetworkAsync|saveVersionHistoryAsync|setReactionsAsync)\s*\(|figma\.(create\w*|group|union|subtract|flatten|commitUndo|closePlugin|notify)\s*\(|\.(name|fills|strokes|x|y|characters|visible|opacity|cornerRadius|description|layoutMode|leadingTrim|textStyleId|componentPropertyReferences)\s*=(?!=)/;
for (const [name, code] of [['audit.js', AUDIT], ['qa.js', QA]]) {
  const hit = code.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => MUTATORS.test(l.replace(/\/\/.*$/, '')));
  ok(hit.length === 0, `${name} has mutating calls: ${hit.map(h => h[0]).join(',')}`);
  ok(code.length < 30000, `${name} too long for a tool call (${code.length})`);
}

// ── 2. audit scene: Home D/T/M with buttons, a card, an instance; a forbidden backup page
function mockups(manyColors = 0) {
  const s = scene();
  const btn = (w, h, label, x, fill = '#3355AA') => s.node('FRAME', { name: 'Group 13', width: w, height: h, x, cornerRadius: 10, fills: [solid(fill)] },
    [s.node('TEXT', { characters: label, x: 20, y: 14, width: w - 40, height: 13, fills: [solid('#FAFAFA')], fontName: { family: 'Roboto Mono', style: 'SemiBold' }, fontSize: 18 })]);
  const card = x => s.node('FRAME', { name: 'Group 7', width: 400, height: 300, x, y: 200 }, [
    s.node('RECTANGLE', { width: 400, height: 220, fills: [{ type: 'IMAGE', scaleMode: 'FILL', visible: true }] }),
    s.node('TEXT', { characters: 'Карточка проекта', y: 240, width: 300, height: 20, fontSize: 24 })]);
  const lib = s.node('COMPONENT', { name: 'select_menu', width: 200, height: 47 });
  const frame = (name, w) => {
    const kids = [btn(260, 80, 'начать работу', 0), btn(260, 80, 'о нас', 300), btn(360, 80, 'связаться с нами', 600), card(0), card(450)];
    const inst = s.node('INSTANCE', { name: 'select_menu', width: 200, height: 47, y: 600 }); inst.main = lib; inst.componentProperties = { 'Property 1#0:1': { value: 'Default' } };
    kids.push(inst);
    for (let i = 0; i < manyColors; i++) kids.push(s.node('RECTANGLE', { width: 5, height: 5, x: i, y: 900, cornerRadius: i % 7, fills: [solid('#' + (0x100000 + i * 7919).toString(16).slice(-6))] }));
    return s.node('FRAME', { name, width: w, height: 3000, fills: [solid('#FAFAFA')] }, kids);
  };
  const D = frame('Главная_desktop', 1920), T = frame('Главная_tablet', 768), M = frame('Главная_mobile', 390);
  const src = s.page('Mockups', [D, T, M, lib]);
  const backup = s.page('Backup', [s.node('FRAME', { name: 'old', width: 1920 })]);
  const root = { children: [src, backup] };
  s.collection('Variable collection', ['Value']);
  return { s, figma: s.figma(root), D, T, M, src, backup };
}
{
  const { figma, D, T, M, src, backup } = mockups();
  const P = { fileKey: 'FILE', forbiddenPageIds: [backup.id] };
  let r = await run(AUDIT, { ...P, mode: 'inventory', pageIds: [src.id] }, figma);
  const g = r.categories.screenGroups.find(x => x.k === 'главная');
  ok(g && g.Desktop[0] === D.id && g.Tablet[0] === T.id && g.Mobile[0] === M.id, 'inventory groups D/T/M by name ' + JSON.stringify(r.categories.screenGroups));
  ok(r.pages[0].localComponentsTotal === 1 && r.resources.collections.length === 1, 'inventory resources');
  r = await run(AUDIT, { ...P, mode: 'inventory', pageIds: [backup.id] }, figma);
  ok(r.error === 'FORBIDDEN_PAGE', 'inventory refuses forbidden page');
  r = await run(AUDIT, { ...P, mode: 'tokens', rootIds: [backup.children[0].id] }, figma);
  ok(r.error === 'FORBIDDEN_OR_DETACHED_ROOT', 'tokens refuses root on forbidden page');
  r = await run(AUDIT, { ...P, fileKey: 'OTHER', mode: 'tokens', rootIds: [D.id] }, figma);
  ok(r.error === 'FILEKEY_MISMATCH', 'fileKey guard');

  r = await run(AUDIT, { ...P, mode: 'tokens', rootIds: [D.id, T.id, M.id] }, figma);
  const c = r.categories.colors.find(x => x.k === 'fill #3355aa');
  ok(c && c.n === 9 && c.bp === 'DesktopTabletMobile', 'tokens: brand fill counted across breakpoints ' + JSON.stringify(c));
  ok(r.categories.typography.some(x => x.k.startsWith('Roboto Mono SemiBold 18/140% ls0% ORIGINAL CAP_HEIGHT')), 'tokens: typography key');
  ok(r.fonts.some(([f]) => f === 'Roboto Mono SemiBold') && r.fonts.some(([f]) => f === 'Inter Regular'), 'tokens: fonts list');
  ok(r.categories.radii.some(x => x.k === '10'), 'tokens: radius');
  ok(r.stats.images === 6, 'tokens: images counted');

  r = await run(AUDIT, { ...P, mode: 'components', rootIds: [D.id, T.id, M.id] }, figma);
  const b = r.categories.clusters.find(x => x.wh[0] === 260);
  ok(b && b.n === 6 && b.role.startsWith('button') && b.sp && b.sp.pad[0] === 14, 'components: button cluster with padding ' + JSON.stringify(b));
  ok(r.categories.clusters.some(x => x.role === 'card' && x.n === 6), 'components: card cluster');
  ok(r.categories.families.some(f => f.widths[0] === 260 && f.widths[1] === 360 && f.n === 9), 'components: families output ' + JSON.stringify(r.categories.families));
  ok(r.categories.existing.some(x => x.k === 'instance select_menu' && x.n === 3), 'components: existing instance');

  r = await run(AUDIT, { ...P, mode: 'spec', rootIds: [D.children[0].id] }, figma);
  const t = r.trees[0].c[0];
  ok(r.trees[0].r === 10 && r.trees[0].fill[0] === '#3355aa' && t.font === 'Roboto Mono SemiBold 18/140% ls0% ORIGINAL' && t.trim === 'CAP_HEIGHT' && t.xywh[0] === 20, 'spec: node details ' + JSON.stringify(r.trees[0]));
}
{
  const { figma, D, backup } = mockups(3000);
  const r = await run(AUDIT, { fileKey: 'FILE', forbiddenPageIds: [backup.id], mode: 'tokens', rootIds: [D.id], maxBytes: 8000 }, figma);
  ok(!r.error && r.meta.bytes <= 8000 && r.meta.truncated && r.meta.truncated.colors.nextCursor > 0, 'tokens: paging keeps output under budget ' + JSON.stringify(r.meta || r));
  const r2 = await run(AUDIT, { fileKey: 'FILE', mode: 'tokens', rootIds: [D.id], maxBytes: 8000, categories: ['colors'], cursor: r.meta.truncated.colors.nextCursor }, figma);
  ok(!r2.error && Object.keys(r2.categories).length === 1 && r2.categories.colors.length > 0, 'tokens: cursor fetches next page of one category');
}

// ── 3. QA scene: one clean set, one set with seeded defects, sheet with links, layout problems
function kit({ defects }) {
  const s = scene();
  const size = s.collection('Size', ['Desktop', 'Tablet', 'Mobile']);
  const color = s.collection('Color', ['Default']);
  const brand = s.variable('brand/primary', color, ['FRAME_FILL', 'SHAPE_FILL']);
  const ink = s.variable('text/inverse', color, ['TEXT_FILL']);
  const radius = s.variable('radius/button', size, ['CORNER_RADIUS']);
  const st = s.textStyle('Button/Label/Desktop'), stM = s.textStyle('Button/Label/Mobile');
  if (defects) s.textStyle('Body/Old', { leadingTrim: 'NONE' });
  const bound = (h, v) => solid(h, { boundVariables: { color: { type: 'VARIABLE_ALIAS', id: v.id } } });
  const variant = (name, opts = {}) => {
    const label = s.node('TEXT', { name: 'label', characters: 'Кнопка', x: 20, y: 30, width: 120, height: 13, textStyleId: opts.noStyle ? '' : st.id,
      leadingTrim: opts.trim || 'CAP_HEIGHT', fills: [bound('#FAFAFA', ink)], descender: 4 });
    if (!opts.unbound) label.componentPropertyReferences = { characters: 'Label#1:0' };
    const kids = [label];
    if (opts.junk) kids.push(s.node('FRAME', { name: 'Frame 12', width: 4, height: 4 }));
    const v = s.node('COMPONENT', { name, width: 260, height: 80, fills: [opts.literal ? solid('#123456') : bound('#3355AA', brand)], clipsContent: !!opts.clip,
      boundVariables: { topLeftRadius: { type: 'VARIABLE_ALIAS', id: radius.id } } }, kids);
    v.explicitVariableModes = opts.mode !== undefined ? { [size.id]: size.modes[opts.mode].modeId } : {};
    if (opts.clip) label.y = 70; // descender leaves the clipping frame
    return v;
  };
  const set = (name, vs, desc = 'Кнопка действия') => { const n = s.node('COMPONENT_SET', { name, description: desc, width: 600, height: 300, x: 3100 }, vs);
    n.componentPropertyDefinitions = { 'Label#1:0': { type: 'TEXT' }, State: { type: 'VARIANT', variantOptions: ['Default', 'Hover'] }, Breakpoint: { type: 'VARIANT', variantOptions: ['Desktop', 'Mobile'] } }; return n; };
  const good = set('Tag', [variant('State=Default, Breakpoint=Desktop', { mode: 0 }), variant('State=Default, Breakpoint=Mobile', { mode: 2 })]);
  good.children[1].children[0].textStyleId = stM.id;
  const sets = [good];
  const pen = variant('State=Filled, Breakpoint=Desktop', { mode: 0, unbound: true }); pen.children[0].componentPropertyReferences = { characters: 'Pen value#2:0' };
  good.appendChild = null; good.children.push(pen); pen.parent = good;
  good.componentPropertyDefinitions['Pen value#2:0'] = { type: 'TEXT' };
  if (defects) sets.push(set('Button', [
    variant('State=Default, Breakpoint=Desktop', { mode: 0 }),
    variant('State=Hover, Breakpoint=Desktop', { mode: 0, unbound: true, literal: true }),
    variant('State=Default, Breakpoint=Mobile', { mode: 0, noStyle: true, trim: 'NONE', junk: true, clip: true }),
  ], ''));
  const inst = s.node('INSTANCE', { name: 'Tag', width: 260, height: 80 }); inst.main = good.children[0]; inst.children = [];
  const link = s.node('TEXT', { name: 'link', characters: 'Мастер →', textStyleId: st.id, links: [good.id, ...(defects ? ['999:999'] : [])] });
  const sheet = s.node('FRAME', { name: 'Sheet', width: 2800, height: 900, x: 100, y: 100 }, [inst, link]);
  const secKids = [sheet, ...sets];
  if (defects) { const lost = s.node('INSTANCE', { name: 'Lost', x: 200, y: 200, width: 50, height: 50 }); lost.children = []; secKids.push(lost); }
  const sec = s.node('SECTION', { name: '02 · Buttons', width: 4000, height: 2000 }, secKids);
  const pageKids = [sec];
  if (defects) pageKids.push(s.node('FRAME', { name: 'stray', x: 9000 }));
  const page = s.page('UI Kit', pageKids);
  return { figma: s.figma({ children: [page] }), page, good };
}
{
  const { figma, page, good } = kit({ defects: false });
  const r = await run(QA, { fileKey: 'FILE', pageId: page.id, expectVariants: { [good.id]: 3 }, expectSizes: { [good.id]: { 'State=Default, Breakpoint=Desktop': [260, 80] } } }, figma);
  ok(!r.error && r.summary.P0 === 0 && r.summary.P1 === 0, 'qa: clean kit has no P0/P1 ' + JSON.stringify(r.issues));
  ok(r.summary.masters === 1 && r.summary.variants === 3 && r.summary.links === 1 && r.fingerprints.length === 1, 'qa: summary counts ' + JSON.stringify(r.summary));
}
{
  const { figma, page, good } = kit({ defects: true });
  const r = await run(QA, { fileKey: 'FILE', pageId: page.id, expectVariants: { [good.id]: 4 } }, figma);
  const codes = new Set(r.issues.map(e => e.code));
  for (const c of ['PROP_UNBOUND', 'BROKEN_INSTANCE', 'LITERAL_COLOR', 'NO_TEXT_STYLE', 'TRIM', 'STYLE_TRIM', 'MODE_MISMATCH', 'TEXT_CLIPPED', 'BROKEN_LINK', 'OVERLAP', 'OUTSIDE_SECTION', 'VARIANT_COUNT', 'DEFAULT_NAME', 'NO_DESCRIPTION'])
    ok(codes.has(c), 'qa detects ' + c);
  const pu = r.issues.find(e => e.code === 'PROP_UNBOUND');
  ok(pu && pu.n === 1 && String(pu.ex[0][1]).includes('State=Hover'), 'qa: PROP_UNBOUND points at the Hover variant only');
  ok(bytes(r) <= 15000, 'qa: output under budget');
  const r2 = await run(QA, { fileKey: 'WRONG', pageId: page.id }, figma);
  ok(r2.error === 'FILEKEY_MISMATCH', 'qa: fileKey guard');
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
