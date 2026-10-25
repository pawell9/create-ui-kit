// create-ui-kit · qa.js — READ-ONLY structural QA of the built UI Kit for use_figma.
// Pass the whole file as `code`; edit only PARAMS. Scope = whole target page or listed Sections / Component Sets.
// Returns: summary, per-master fingerprints, issues grouped by code (sev P0/P1/P2, total, up to 4 examples).
const PARAMS = {
  fileKey: '',
  pageId: '',               // target UI Kit page
  scopeIds: [],             // [] = whole page; else Section / Component Set / Frame ids on that page
  expectTrim: 'CAP_HEIGHT', // leadingTrim expected on product texts and Text Styles; null to skip
  literalAllow: [],         // hex colors allowed unbound, e.g. ['#FFFFFF'] (documented literals)
  allowNodeIds: [],         // nodes exempt from literal / absolute checks (documented exceptions)
  expectSizes: {},          // { setId: { 'Breakpoint=Desktop, State=Default': [w, h] } }
  expectVariants: {},       // { setId: count } from the ledger
  docPrefix: '_',           // service components / styles (not published, not product)
  checkLayout: true,        // Sections: nodes outside, overlaps, out-of-bounds
  instanceTexts: true,      // also scan texts inside instances for clipping / missing fonts (specimens, sheets)
  maxBytes: 15000,
};

const r2 = v => Math.round(v * 100) / 100;
const h2 = x => Math.round(x * 255).toString(16).padStart(2, '0');
const hex = c => '#' + h2(c.r) + h2(c.g) + h2(c.b);
const bytes = s => { let n = 0; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); n += c < 0x80 ? 1 : c < 0x800 ? 2 : (c >= 0xD800 && c < 0xDC00) ? (i++, 4) : 3; } return n; };
const SEV = {
  BROKEN_INSTANCE: 'P0', MISSING_FONT: 'P0', PROP_UNBOUND: 'P0', DUP_MASTER: 'P0',
  NO_TEXT_STYLE: 'P1', LITERAL_COLOR: 'P1', TRIM: 'P1', STYLE_TRIM: 'P1', MODE_MISMATCH: 'P1', MODE_UNPINNED: 'P1',
  TEXT_CLIPPED: 'P1', BROKEN_LINK: 'P1', OVERLAP: 'P1', OUTSIDE_SECTION: 'P1', OUT_OF_BOUNDS: 'P1', SIZE_MISMATCH: 'P1', VARIANT_COUNT: 'P1',
  FOREIGN_MASTER: 'P2', SCOPE: 'P2', DEFAULT_NAME: 'P2', NON_ASCII_NAME: 'P2', NO_DESCRIPTION: 'P2', LEFTOVER: 'P2', MIXED_STYLE: 'P2', DOC_NO_STYLE: 'P2',
};
const issues = new Map();
const flag = (code, id, detail) => {
  let e = issues.get(code); if (!e) { e = { code, sev: SEV[code], n: 0, ex: [] }; issues.set(code, e); }
  e.n++; if (e.ex.length < 4) e.ex.push(detail ? [id, detail] : id);
};

// ── guard
if (!PARAMS.fileKey || !PARAMS.pageId) return { error: 'PARAMS_REQUIRED', need: ['fileKey', 'pageId'] };
if (typeof figma.fileKey === 'string' && figma.fileKey !== PARAMS.fileKey) return { error: 'FILEKEY_MISMATCH', got: figma.fileKey };
const page = await figma.getNodeByIdAsync(PARAMS.pageId);
if (!page || page.type !== 'PAGE') return { error: 'PAGE_NOT_FOUND' };
await page.loadAsync();
const scope = [];
if (!PARAMS.scopeIds.length) scope.push(...page.children);
else for (const id of PARAMS.scopeIds) {
  const n = await figma.getNodeByIdAsync(id);
  let p = n; while (p && p.type !== 'PAGE') p = p.parent;
  if (!n || !p || p.id !== page.id) return { error: 'SCOPE_NOT_ON_PAGE', id };
  scope.push(n);
}

const varCache = new Map();
async function getVar(id) {
  if (!varCache.has(id)) { let v = null; try { v = await figma.variables.getVariableByIdAsync(id); } catch (e) {} varCache.set(id, v); }
  return varCache.get(id);
}
const SHAPES = ['RECTANGLE', 'ELLIPSE', 'VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'POLYGON', 'LINE'];
const needScope = (n, kind) => kind === 'stroke' ? 'STROKE_COLOR' : n.type === 'TEXT' ? 'TEXT_FILL' : SHAPES.includes(n.type) ? 'SHAPE_FILL' : 'FRAME_FILL';
const scopeOk = (v, need) => v.scopes.includes('ALL_SCOPES') || v.scopes.includes(need) || (need !== 'STROKE_COLOR' && need !== 'TEXT_FILL' && v.scopes.includes('ALL_FILLS'));
const DEFAULT_NAME = /^(Frame|Group|Rectangle|Ellipse|Vector|Text|Line|Polygon|Star|Union|Subtract|Intersect|Exclude|Component|Instance) ?\d*$/;
const isDoc = name => name.startsWith(PARAMS.docPrefix);

// ── collect
const masters = [], instances = [], texts = [], usedVars = new Map();
const st = scope.map(n => [n, null, false]);
let nodes = 0;
while (st.length) {
  const [n, master, inInst] = st.pop();
  nodes++;
  if (inInst) {
    if (n.visible === false) continue;
    if (n.type === 'TEXT') texts.push([n, null, true]);
    if ('children' in n) for (const k of n.children) st.push([k, master, true]);
    continue;
  }
  let m = master;
  if (n.type === 'COMPONENT_SET' || (n.type === 'COMPONENT' && (!n.parent || n.parent.type !== 'COMPONENT_SET'))) { masters.push(n); m = n; }
  if (n.type === 'INSTANCE') { // internals are checked at their own master
    instances.push([n, m]);
    if (PARAMS.instanceTexts && n.visible !== false) for (const k of n.children) st.push([k, m, true]);
    continue;
  }
  if (/^_(qa|tmp)/i.test(n.name)) flag('LEFTOVER', n.id, n.name);
  if (n.visible !== false && n.type === 'TEXT') texts.push([n, m]);
  if (n.visible !== false && m && !PARAMS.allowNodeIds.includes(n.id)) {
    for (const kind of ['fill', 'stroke']) {
      const ps = kind === 'fill' ? n.fills : n.strokes;
      if (!ps || ps === figma.mixed) continue;
      for (const p of ps) {
        if (p.visible === false || p.type !== 'SOLID') continue;
        const b = p.boundVariables && p.boundVariables.color;
        if (!b) { const h = hex(p.color); if (!PARAMS.literalAllow.includes(h)) flag('LITERAL_COLOR', n.id, h + ' ' + kind); continue; }
        usedVars.set(b.id, (usedVars.get(b.id) || 0) + 1);
        const v = await getVar(b.id);
        if (v && !scopeOk(v, needScope(n, kind))) flag('SCOPE', n.id, v.name + ' needs ' + needScope(n, kind));
      }
    }
    if (n.boundVariables) for (const [k, b] of Object.entries(n.boundVariables)) if (!['fills', 'strokes'].includes(k)) for (const x of [].concat(b)) if (x && x.id) usedVars.set(x.id, (usedVars.get(x.id) || 0) + 1);
    if (m !== n && !SHAPES.includes(n.type) && DEFAULT_NAME.test(n.name)) flag('DEFAULT_NAME', n.id, n.name);
  }
  if ('children' in n) for (const k of n.children) st.push([k, m, false]);
}
for (const id of usedVars.keys()) await getVar(id);
const cols = await figma.variables.getLocalVariableCollectionsAsync();
// own layers of a variant: nested instances are opaque (their layers belong to another master)
const own = (root, pred) => { const out = []; const q = [...root.children]; while (q.length) { const k = q.pop(); if (pred(k)) out.push(k); if (k.type !== 'INSTANCE' && 'children' in k) q.push(...k.children); } return out; };

// ── masters
const names = new Map(), fingerprints = [];
let variants = 0;
for (const m of masters) {
  const doc = isDoc(m.name);
  names.set(m.name, (names.get(m.name) || 0) + 1);
  if (/[^\x20-\x7E]/.test(m.name)) flag('NON_ASCII_NAME', m.id, m.name);
  if (!doc && !(m.description || '').trim()) flag('NO_DESCRIPTION', m.id, m.name);
  const vs = m.type === 'COMPONENT_SET' ? m.children.filter(c => c.type === 'COMPONENT') : [m];
  variants += vs.length;
  if (PARAMS.expectVariants[m.id] !== undefined && PARAMS.expectVariants[m.id] !== vs.length) flag('VARIANT_COUNT', m.id, `${vs.length} ≠ ${PARAMS.expectVariants[m.id]}`);
  const exp = PARAMS.expectSizes[m.id] || {};
  for (const v of vs) if (exp[v.name] && (Math.abs(v.width - exp[v.name][0]) > 0.5 || Math.abs(v.height - exp[v.name][1]) > 0.5)) flag('SIZE_MISMATCH', v.id, `${m.name} ${v.name}: ${r2(v.width)}×${r2(v.height)} ≠ ${exp[v.name].join('×')}`);
  // every TEXT/BOOLEAN/INSTANCE_SWAP property must be referenced in each variant that has a layer of the same name
  if (m.type === 'COMPONENT_SET') {
    const defs = m.componentPropertyDefinitions, refLayers = new Map();
    const refsIn = v => { const out = []; own(v, k => { const r = k.componentPropertyReferences; if (r) for (const [field, key] of Object.entries(r)) out.push([key, k.name, field]); return false; }); return out; };
    const per = vs.map(v => [v, refsIn(v)]);
    for (const [, refs] of per) for (const [key, nm, field] of refs) { if (!refLayers.has(key)) refLayers.set(key, new Map()); refLayers.get(key).set(nm, field); }
    for (const [key, def] of Object.entries(defs)) {
      if (def.type === 'VARIANT') continue;
      const layerNames = refLayers.get(key) || new Map();
      for (const [v, refs] of per) {
        if (refs.some(([k]) => k === key)) continue;
        // a same-named layer whose field is free (a layer bound to another property is not a twin)
        const twin = own(v, k => layerNames.has(k.name) && (def.type !== 'TEXT' || k.type === 'TEXT') && !(k.componentPropertyReferences && k.componentPropertyReferences[layerNames.get(k.name)]))[0];
        if (twin) flag('PROP_UNBOUND', twin.id, `${m.name} [${v.name}] ${key.split('#')[0]}`);
      }
    }
  }
  // Breakpoint variants must pin the mode of the collection that owns a mode with that name
  for (const v of vs) {
    const bp = (v.name.match(/Breakpoint=([^,]+)/) || [])[1];
    if (!bp) continue;
    for (const c of cols) {
      const mode = c.modes.find(x => x.name.toLowerCase() === bp.trim().toLowerCase());
      if (!mode) continue;
      const pinned = v.explicitVariableModes && v.explicitVariableModes[c.id];
      if (pinned && pinned !== mode.modeId) flag('MODE_MISMATCH', v.id, `${m.name} [${v.name}] ${c.name}`);
      // unpinned matters only for variables whose value differs between modes
      const varies = x => { const vv = x && varCache.get(x.id); return vv && vv.variableCollectionId === c.id && new Set(Object.values(vv.valuesByMode).map(JSON.stringify)).size > 1; };
      if (!pinned) { const usesCol = own(v, k => true).concat([v]).find(k => k.boundVariables && Object.values(k.boundVariables).some(b => [].concat(b).some(varies))); if (usesCol) flag('MODE_UNPINNED', v.id, `${m.name} [${v.name}] ${c.name}`); }
    }
  }
  const sig = vs.map(v => `${v.name}:${Math.round(v.width)}x${Math.round(v.height)}`).sort().join('|');
  let hsh = 0; for (let i = 0; i < sig.length; i++) hsh = (Math.imul(hsh, 31) + sig.charCodeAt(i)) | 0;
  fingerprints.push([m.id, m.name, `v${vs.length}-${(hsh >>> 0).toString(36)}`]);
}
for (const [nm, c] of names) if (c > 1) flag('DUP_MASTER', nm, `${c}×`);

// ── texts
let links = 0;
for (const [t, m, inInst] of texts) {
  const product = m && !inInst && !isDoc(m.name);
  if (t.hasMissingFont) flag('MISSING_FONT', t.id, t.characters.slice(0, 20));
  if (inInst) { /* style and trim are checked at the master */ }
  else if (t.textStyleId === figma.mixed) flag('MIXED_STYLE', t.id);
  else if (!t.textStyleId) flag(product ? 'NO_TEXT_STYLE' : 'DOC_NO_STYLE', t.id, t.characters.slice(0, 20));
  if (product && PARAMS.expectTrim && t.leadingTrim !== PARAMS.expectTrim && t.leadingTrim !== figma.mixed) flag('TRIM', t.id, String(t.leadingTrim));
  // clipped: render bounds outside the nearest clipping ancestor
  const rb = t.absoluteRenderBounds;
  if (rb) {
    let p = t.parent;
    while (p && p.type !== 'PAGE' && !(p.clipsContent)) p = p.parent;
    const cb = p && p.type !== 'PAGE' && p.absoluteBoundingBox;
    if (cb && (rb.x < cb.x - 0.5 || rb.y < cb.y - 0.5 || rb.x + rb.width > cb.x + cb.width + 0.5 || rb.y + rb.height > cb.y + cb.height + 0.5)) flag('TEXT_CLIPPED', t.id, `${t.characters.slice(0, 16)} in ${p.name}`);
  }
  const segs = inInst ? [] : t.getStyledTextSegments(['hyperlink']);
  for (const s of segs) if (s.hyperlink && s.hyperlink.type === 'NODE') { links++; if (!(await figma.getNodeByIdAsync(s.hyperlink.value))) flag('BROKEN_LINK', t.id, s.hyperlink.value); }
}

// ── instances
let broken = 0;
for (const [i] of instances) {
  const mc = await i.getMainComponentAsync();
  if (!mc) { broken++; flag('BROKEN_INSTANCE', i.id, i.name); continue; }
  let p = mc; while (p && p.type !== 'PAGE') p = p.parent;
  if (!mc.remote && p && p.id !== page.id) flag('FOREIGN_MASTER', i.id, mc.name + ' @ ' + (p ? p.name : '?'));
}

// ── text styles (file-wide)
const styles = await figma.getLocalTextStylesAsync();
if (PARAMS.expectTrim) for (const s of styles) if (!isDoc(s.name) && s.leadingTrim !== PARAMS.expectTrim) flag('STYLE_TRIM', s.id, s.name);

// ── layout of sections
if (PARAMS.checkLayout && !PARAMS.scopeIds.length) {
  for (const n of page.children) if (n.type !== 'SECTION') flag('OUTSIDE_SECTION', n.id, n.name);
  for (const sec of page.children.filter(n => n.type === 'SECTION')) {
    const kids = sec.children.filter(k => k.visible !== false);
    for (const k of kids) if (k.x < -0.5 || k.y < -0.5 || k.x + k.width > sec.width + 0.5 || k.y + k.height > sec.height + 0.5) flag('OUT_OF_BOUNDS', k.id, `${k.name} in ${sec.name}`);
    for (let a = 0; a < kids.length; a++) for (let b = a + 1; b < kids.length; b++) {
      const A = kids[a], B = kids[b];
      if (A.x < B.x + B.width - 0.5 && B.x < A.x + A.width - 0.5 && A.y < B.y + B.height - 0.5 && B.y < A.y + A.height - 0.5) flag('OVERLAP', A.id, `${A.name} × ${B.name}`);
    }
  }
}

// ── variables summary
const unused = [];
for (const c of cols) for (const id of c.variableIds) if (!usedVars.has(id)) { const v = await getVar(id); if (v) unused.push(c.name + ':' + v.name); }

const list = [...issues.values()].sort((a, b) => a.sev.localeCompare(b.sev) || b.n - a.n);
const bySev = { P0: 0, P1: 0, P2: 0 }; for (const e of list) bySev[e.sev] += e.n;
const res = {
  summary: { nodes, masters: masters.length, docMasters: masters.filter(m => isDoc(m.name)).length, variants, instances: instances.length, brokenInstances: broken, texts: texts.length, links, textStyles: styles.length, collections: cols.map(c => `${c.name}(${c.variableIds.length})`), ...bySev },
  issues: list,
  unusedVariables: unused.slice(0, 20),
  fingerprints,
  meta: { readOnly: true, scope: PARAMS.scopeIds.length ? PARAMS.scopeIds : 'page' },
};
let s = JSON.stringify(res);
while (bytes(s) > PARAMS.maxBytes && res.fingerprints.length) { res.fingerprints = res.fingerprints.slice(0, Math.floor(res.fingerprints.length / 2)); res.meta.fingerprintsTruncated = true; s = JSON.stringify(res); }
while (bytes(s) > PARAMS.maxBytes && res.issues.some(e => e.ex.length > 1)) { for (const e of res.issues) e.ex.length = Math.min(e.ex.length, 1); s = JSON.stringify(res); }
res.meta.bytes = bytes(s);
return res;
