// create-ui-kit · audit.js — READ-ONLY analysis of source mockups for use_figma.
// Pass the whole file as `code`; edit only PARAMS. Contains no mutating calls (checked by test/run-tests.mjs).
// Modes:
//   inventory  — pages → top-level frames (size, breakpoint guess, D/T/M grouping) + file resources
//   tokens     — colors, typography, fonts, radii, strokes, effects, auto-layout spacing across rootIds
//   components — existing components/instances + repeated-structure clusters with role hints and spacing
//   spec       — compact node tree of each rootId (what a builder needs to make an exact copy)
const PARAMS = {
  fileKey: '',
  mode: 'inventory',
  pageIds: [],            // inventory only
  rootIds: [],            // tokens | components | spec
  forbiddenPageIds: [],   // backups etc.: never read
  breakpoints: [{ name: 'Desktop', min: 1200 }, { name: 'Tablet', min: 600 }, { name: 'Mobile', min: 0 }],
  includeHidden: false,
  depth: 5,               // spec
  maxNodes: 60000,
  categories: null,       // e.g. ['colors'] to page one category
  cursor: 0,
  maxBytes: 15000,
  listPages: true,        // inventory: include names of all pages
};

// ── utils
const r2 = v => (typeof v === 'number' ? Math.round(v * 100) / 100 : v);
const MIX = v => (v === figma.mixed ? 'MIXED' : v);
const h2 = x => Math.round(x * 255).toString(16).padStart(2, '0');
const hex = (c, a) => '#' + h2(c.r) + h2(c.g) + h2(c.b) + (a !== undefined && a < 1 ? h2(a) : '');
const bytes = s => { let n = 0; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); n += c < 0x80 ? 1 : c < 0x800 ? 2 : (c >= 0xD800 && c < 0xDC00) ? (i++, 4) : 3; } return n; };
const bpOf = w => { for (const b of PARAMS.breakpoints) if (w >= b.min) return b.name; return '?'; };
const pageOf = n => { let p = n; while (p && p.type !== 'PAGE') p = p.parent; return p; };
const short = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s);
const varCache = new Map(), styleCache = new Map();
async function varName(id) {
  if (!id) return null;
  if (!varCache.has(id)) { let v = null; try { v = await figma.variables.getVariableByIdAsync(id); } catch (e) {} varCache.set(id, v ? v.name : '?' + id); }
  return varCache.get(id);
}
async function styleName(id) {
  if (!id || id === figma.mixed) return id === figma.mixed ? 'MIXED' : null;
  if (!styleCache.has(id)) { let s = null; try { s = await figma.getStyleByIdAsync(id); } catch (e) {} styleCache.set(id, s ? s.name : '?'); }
  return styleCache.get(id);
}
function lh(v) { if (!v || v === figma.mixed) return 'MIXED'; return v.unit === 'AUTO' ? 'auto' : r2(v.value) + (v.unit === 'PERCENT' ? '%' : ''); }
function ls(v) { if (!v || v === figma.mixed) return 'MIXED'; return r2(v.value) + (v.unit === 'PERCENT' ? '%' : ''); }
const visiblePaints = ps => (ps && ps !== figma.mixed ? ps.filter(p => p.visible !== false) : []);
const hasSurface = n => visiblePaints(n.fills).length > 0 || visiblePaints(n.strokes).length > 0;

// ── aggregator: key → {count, bps, ex}
function agg() {
  const m = new Map();
  return {
    add(key, bp, id, extra) {
      let e = m.get(key);
      if (!e) { e = { k: key, n: 0, bp: new Set(), ex: [] }; if (extra) Object.assign(e, extra); m.set(key, e); }
      e.n++; e.bp.add(bp); if (e.ex.length < 2) e.ex.push(id);
    },
    out() { return [...m.values()].sort((a, b) => b.n - a.n || (a.k < b.k ? -1 : 1)).map(e => Object.assign({}, e, { bp: [...e.bp].join('') })); },
  };
}

// ── guard (read-only script: guard protects against reading the wrong file / forbidden pages)
if (!PARAMS.fileKey) return { error: 'PARAMS_FILEKEY_REQUIRED' };
if (typeof figma.fileKey === 'string' && figma.fileKey !== PARAMS.fileKey) return { error: 'FILEKEY_MISMATCH', got: figma.fileKey };
const MODES = ['inventory', 'tokens', 'components', 'spec'];
if (!MODES.includes(PARAMS.mode)) return { error: 'UNKNOWN_MODE', modes: MODES };

async function roots() {
  const out = [];
  for (const id of PARAMS.rootIds) {
    const n = await figma.getNodeByIdAsync(id);
    if (!n) return { error: 'ROOT_NOT_FOUND', id };
    const p = pageOf(n);
    if (!p || PARAMS.forbiddenPageIds.includes(p.id)) return { error: 'FORBIDDEN_OR_DETACHED_ROOT', id };
    out.push(n);
  }
  return out;
}

// iterative walk inside one root; cb(node, depth, hiddenAncestor)
function walk(root, cb) {
  const st = [[root, 0]]; let count = 0;
  while (st.length) {
    const [n, d] = st.pop();
    if (!PARAMS.includeHidden && n.visible === false) continue;
    if (++count > PARAMS.maxNodes) return { truncated: true, count };
    const stop = cb(n, d);
    if (stop !== 'skip' && 'children' in n && n.children) for (let i = n.children.length - 1; i >= 0; i--) st.push([n.children[i], d + 1]);
  }
  return { truncated: false, count };
}

// ── paging / size control
function finish(res) {
  res.meta = Object.assign(res.meta || {}, { mode: PARAMS.mode, readOnly: true });
  const cats = res.categories || {};
  if (PARAMS.categories) for (const k of Object.keys(cats)) if (!PARAMS.categories.includes(k)) delete cats[k];
  if (PARAMS.cursor) for (const k of Object.keys(cats)) cats[k] = cats[k].slice(PARAMS.cursor);
  const truncated = {};
  let s = JSON.stringify(res);
  for (const k of Object.keys(cats)) if (bytes(s) > PARAMS.maxBytes) { for (const e of cats[k]) if (e.ex && e.ex.length > 1) e.ex.length = 1; s = JSON.stringify(res); }
  while (bytes(s) > PARAMS.maxBytes) {
    let big = null; for (const k of Object.keys(cats)) if (!big || cats[k].length > cats[big].length) big = k;
    if (!big || cats[big].length <= 1) break;
    const drop = Math.max(1, Math.ceil(cats[big].length * 0.15));
    truncated[big] = (truncated[big] || 0) + drop;
    cats[big].length -= drop;
    res.meta.truncated = Object.fromEntries(Object.entries(truncated).map(([k, v]) => [k, { shown: cats[k].length, rest: v, nextCursor: (PARAMS.cursor || 0) + cats[k].length }]));
    s = JSON.stringify(res);
  }
  res.meta.bytes = bytes(s);
  if (res.meta.bytes > PARAMS.maxBytes) return { error: 'OUTPUT_TOO_LARGE', bytes: res.meta.bytes, hint: 'fewer rootIds, categories:[one], or lower depth' };
  return res;
}

// ── inventory
if (PARAMS.mode === 'inventory') {
  const pages = [], groups = new Map();
  const BP_WORDS = /(desktop|tablet|mobile|laptop|phone|десктоп|планшет|мобил\S*|\b\d{3,4}\b)/gi;
  for (const pid of PARAMS.pageIds) {
    if (PARAMS.forbiddenPageIds.includes(pid)) return { error: 'FORBIDDEN_PAGE', pid };
    const page = await figma.getNodeByIdAsync(pid);
    if (!page || page.type !== 'PAGE') return { error: 'PAGE_NOT_FOUND', pid };
    await page.loadAsync();
    const frames = [];
    for (const n of page.children) {
      const w = r2(n.width), h = r2(n.height);
      const f = { id: n.id, name: short(n.name, 60), t: n.type[0] + n.type.slice(1, 3).toLowerCase(), wh: [w, h] };
      if (n.visible === false) f.hidden = true;
      if (['FRAME', 'COMPONENT', 'COMPONENT_SET', 'SECTION'].includes(n.type)) {
        f.bp = bpOf(w);
        if ('children' in n) f.kids = n.children.length;
        const key = n.name.toLowerCase().replace(BP_WORDS, '').replace(/[\s_\-–—.()]+/g, ' ').trim();
        if (n.type === 'FRAME') { if (!groups.has(key)) groups.set(key, {}); const g = groups.get(key); (g[f.bp] = g[f.bp] || []).push(n.id); }
      }
      frames.push(f);
    }
    const comps = page.findAllWithCriteria({ types: ['COMPONENT_SET', 'COMPONENT'] }).filter(c => !(c.type === 'COMPONENT' && c.parent && c.parent.type === 'COMPONENT_SET'));
    pages.push({ id: page.id, name: page.name, frames, localComponents: comps.slice(0, 40).map(c => [c.id, short(c.name, 40)]), localComponentsTotal: comps.length });
  }
  const cols = await figma.variables.getLocalVariableCollectionsAsync();
  const tStyles = await figma.getLocalTextStylesAsync();
  const pStyles = await figma.getLocalPaintStylesAsync();
  const eStyles = await figma.getLocalEffectStylesAsync();
  const res = {
    fileKey: figma.fileKey || PARAMS.fileKey,
    allPages: PARAMS.listPages ? figma.root.children.map(p => [p.id, p.name]) : undefined,
    pages,
    categories: { screenGroups: [...groups.entries()].map(([k, v]) => ({ k: short(k, 50), ...v })) },
    resources: {
      collections: cols.map(c => ({ id: c.id, name: c.name, modes: c.modes.map(m => m.name), vars: c.variableIds.length })),
      textStyles: tStyles.length, textStyleNames: tStyles.slice(0, 30).map(s => s.name),
      paintStyles: pStyles.length, effectStyles: eStyles.length,
    },
  };
  return finish(res);
}

const R = await roots();
if (R.error) return R;

// ── tokens
if (PARAMS.mode === 'tokens') {
  const colors = agg(), vecColors = agg(), type = agg(), radii = agg(), strokes = agg(), effects = agg(), spacing = agg(), fonts = new Map();
  const stats = { nodes: 0, texts: 0, styledTexts: 0, images: 0, gradients: 0, boundColors: 0, truncated: false };
  for (const root of R) {
    const bp = bpOf(root.width);
    const segQueue = [];
    const w = walk(root, n => {
      stats.nodes++;
      const isVec = ['VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'POLYGON'].includes(n.type);
      const kindF = n.type === 'TEXT' ? 'text' : isVec ? 'vecFill' : 'fill';
      for (const p of visiblePaints(n.fills)) {
        if (p.type === 'SOLID') { if (p.boundVariables && p.boundVariables.color) stats.boundColors++; (isVec ? vecColors : colors).add(kindF + ' ' + hex(p.color, r2(p.opacity)), bp, n.id); }
        else if (p.type === 'IMAGE') stats.images++;
        else if (p.type.startsWith('GRADIENT')) { stats.gradients++; (isVec ? vecColors : colors).add(kindF + ' ' + p.type.slice(9).toLowerCase() + ' ' + p.gradientStops.map(s => hex(s.color, r2(s.color.a))).join('>'), bp, n.id); }
      }
      const sp = visiblePaints(n.strokes);
      for (const p of sp) if (p.type === 'SOLID') (isVec ? vecColors : colors).add((isVec ? 'vecStroke ' : 'stroke ') + hex(p.color, r2(p.opacity)), bp, n.id);
      if (sp.length && !isVec) strokes.add(`${MIX(n.strokeWeight)}px ${n.strokeAlign}${n.dashPattern && n.dashPattern.length ? ' dash[' + n.dashPattern.join(',') + ']' : ''}`, bp, n.id);
      if ('cornerRadius' in n && hasSurface(n) && n.type !== 'TEXT' && !isVec) {
        const r = n.cornerRadius === figma.mixed ? [n.topLeftRadius, n.topRightRadius, n.bottomRightRadius, n.bottomLeftRadius].map(r2).join('/') : r2(n.cornerRadius);
        if (r !== 0) radii.add(String(r), bp, n.id);
      }
      if (n.effects && n.effects.length) for (const e of n.effects) if (e.visible !== false)
        effects.add(e.type + (e.radius ? ' r' + r2(e.radius) : '') + (e.offset ? ` ${r2(e.offset.x)},${r2(e.offset.y)}` : '') + (e.spread ? ' s' + r2(e.spread) : '') + (e.color ? ' ' + hex(e.color, r2(e.color.a)) : ''), bp, n.id);
      if (n.layoutMode && n.layoutMode !== 'NONE')
        spacing.add(`${n.layoutMode[0]} pad ${[n.paddingTop, n.paddingRight, n.paddingBottom, n.paddingLeft].map(r2).join('/')} gap ${r2(n.itemSpacing)}`, bp, n.id);
      if (n.type === 'TEXT') {
        stats.texts++;
        if (n.textStyleId && n.textStyleId !== figma.mixed) stats.styledTexts++;
        segQueue.push(n);
      }
    });
    if (w.truncated) stats.truncated = true;
    for (const n of segQueue) {
      const segs = n.getStyledTextSegments(['fontName', 'fontSize', 'lineHeight', 'letterSpacing', 'textCase']);
      const trim = MIX(n.leadingTrim) || 'NONE';
      for (const s of segs) {
        const f = s.fontName.family + ' ' + s.fontName.style;
        fonts.set(f, (fonts.get(f) || 0) + 1);
        type.add(`${f} ${r2(s.fontSize)}/${lh(s.lineHeight)} ls${ls(s.letterSpacing)} ${s.textCase} ${trim}`, bp, n.id, { s: short(s.characters.replace(/\s+/g, ' '), 24) });
      }
    }
  }
  return finish({
    stats, fonts: [...fonts.entries()].sort((a, b) => b[1] - a[1]),
    // vectorColors = icons and illustrations: usually not UI tokens; check icon colors there
    categories: { colors: colors.out(), typography: type.out(), radii: radii.out(), strokes: strokes.out(), effects: effects.out(), autoLayout: spacing.out(), vectorColors: vecColors.out() },
  });
}

// ── components
if (PARAMS.mode === 'components') {
  const existing = agg(), clusters = new Map(), families = new Map();
  let instChecked = 0;
  const sigOf = n => {
    const kids = 'children' in n ? n.children.filter(k => k.visible !== false) : [];
    const sub = kids.map(k => k.type[0] + ('children' in k ? k.children.length : '')).join('');
    return `${n.type[0]}${Math.round(n.width)}x${Math.round(n.height)}:${sub}`;
  };
  const info = n => {
    let texts = 0, vectors = 0, images = 0, desc = 0, first = null, firstFill = null;
    walk(n, k => {
      desc++;
      if (k.type === 'TEXT') { texts++; if (!first) first = k; }
      if (['VECTOR', 'BOOLEAN_OPERATION'].includes(k.type)) vectors++;
      for (const p of visiblePaints(k.fills)) if (p.type === 'IMAGE') images++;
    });
    if (first) { const p = visiblePaints(first.fills)[0]; if (p && p.type === 'SOLID') firstFill = hex(p.color); }
    return { texts, vectors, images, desc, first, firstFill };
  };
  const role = (n, i) => {
    const back = 'children' in n ? n.children.find(k => ['RECTANGLE', 'VECTOR', 'ELLIPSE'].includes(k.type) && hasSurface(k) && Math.abs(k.width - n.width) < 2) : null;
    const surf = hasSurface(n) || !!back;
    const txt = i.first ? i.first.characters.trim() : '';
    if (!i.texts && i.vectors && n.width <= 64 && n.height <= 64) return 'icon';
    const round = Math.abs(n.width - n.height) < 2 && ((back && back.type === 'ELLIPSE') || (n.cornerRadius !== figma.mixed && n.cornerRadius >= n.width / 2 - 1));
    if (surf && round && n.width <= 120) return 'round-button|badge';
    if (i.images && i.texts && n.width >= 120) return 'card';
    if (surf && i.texts === 1 && txt.length <= 32 && n.height >= 20 && n.height <= 110) return n.width > 220 && n.height >= 40 ? 'button|input' : 'button|tag';
    if (i.texts >= 4 && n.height <= 120 && n.width > n.height * 4) return 'nav|tabs';
    if (i.texts >= 1 && i.texts <= 3 && n.width < 40 * (txt.length + 2) && i.vectors && n.height <= 60) return 'control';
    return surf ? 'block' : 'group';
  };
  // padding of content inside a container and gaps between visible children (by bounding boxes) — FACT geometry, role is INFERENCE
  const spacing = n => {
    if (!('children' in n)) return null;
    const box = n.absoluteBoundingBox; if (!box) return null;
    const kids = n.children.filter(k => k.visible !== false && k.absoluteBoundingBox && !(Math.abs(k.width - n.width) < 1 && Math.abs(k.height - n.height) < 1));
    if (!kids.length) return null;
    const b = kids.map(k => k.absoluteBoundingBox);
    const L = Math.min(...b.map(x => x.x)), T = Math.min(...b.map(x => x.y));
    const Rr = Math.max(...b.map(x => x.x + x.width)), B = Math.max(...b.map(x => x.y + x.height));
    const pad = [T - box.y, box.x + box.width - Rr, box.y + box.height - B, L - box.x].map(r2);
    const horiz = (Rr - L) > (B - T);
    const s = b.slice().sort((p, q) => horiz ? p.x - q.x : p.y - q.y);
    const gaps = []; for (let i = 1; i < s.length; i++) gaps.push(r2(horiz ? s[i].x - (s[i - 1].x + s[i - 1].width) : s[i].y - (s[i - 1].y + s[i - 1].height)));
    return { pad, axis: n.layoutMode && n.layoutMode !== 'NONE' ? n.layoutMode[0] + '(AL)' : horiz ? 'h' : 'v', gaps: gaps.slice(0, 6) };
  };
  const candidates = [];
  for (const root of R) {
    const bp = bpOf(root.width);
    walk(root, (n, d) => {
      if (n === root) return;
      if (n.type === 'INSTANCE') { candidates.push({ n, bp, inst: true }); return 'skip'; }
      if (n.type === 'COMPONENT' || n.type === 'COMPONENT_SET') existing.add('local ' + short(n.name, 40), bp, n.id);
      if (['FRAME', 'GROUP', 'COMPONENT'].includes(n.type) && n.width <= 1000 && n.height <= 800 && 'children' in n && n.children.length) candidates.push({ n, bp });
    });
  }
  for (const c of candidates) {
    if (c.inst) {
      if (instChecked++ < 800) { const m = await c.n.getMainComponentAsync(); const nm = m ? (m.parent && m.parent.type === 'COMPONENT_SET' ? m.parent.name : m.name) : '?'; existing.add('instance ' + short(nm, 40) + (m && m.remote ? ' (remote)' : ''), c.bp, c.n.id); }
      continue;
    }
    const sig = sigOf(c.n);
    let e = clusters.get(sig);
    if (!e) { const i = info(c.n); if (i.desc > 60) continue; e = { k: sig, n: 0, bp: new Set(), ex: [], wh: [r2(c.n.width), r2(c.n.height)], role: role(c.n, i), text: i.first ? short(i.first.characters.replace(/\s+/g, ' '), 30) : '', tc: i.firstFill, kids: i.desc, sp: spacing(c.n) }; if (c.n.cornerRadius && c.n.cornerRadius !== figma.mixed) e.r = r2(c.n.cornerRadius); clusters.set(sig, e); }
    e.n++; e.bp.add(c.bp); if (e.ex.length < 3) e.ex.push(c.n.id);
    // family = same structure and height, any width (Hug buttons, tags, chips)
    const fk = sig.replace(/^(\w)\d+x(\d+)/, '$1h$2') + '|' + e.role;
    let f = families.get(fk);
    if (!f) { f = { k: fk, n: 0, sizes: new Set(), bp: new Set(), ex: [], text: e.text }; families.set(fk, f); }
    f.n++; f.sizes.add(Math.round(c.n.width)); f.bp.add(c.bp); if (f.ex.length < 3) f.ex.push(c.n.id);
  }
  const fam = [...families.values()].filter(f => f.sizes.size > 1).map(f => ({ k: f.k, n: f.n, widths: [Math.min(...f.sizes), Math.max(...f.sizes)], variants: f.sizes.size, bp: [...f.bp].join(''), ex: f.ex, text: f.text })).sort((a, b) => b.n - a.n);
  const list = [...clusters.values()].filter(e => e.n >= 2 || e.role !== 'group').map(e => Object.assign(e, { bp: [...e.bp].join('') }))
    .sort((a, b) => (b.n >= 2) - (a.n >= 2) || b.n - a.n || b.bp.length - a.bp.length);
  return finish({ meta: { candidates: candidates.length, instancesResolved: Math.min(instChecked, 800) }, categories: { existing: existing.out(), families: fam, clusters: list } });
}

// ── spec
if (PARAMS.mode === 'spec') {
  let budget = 400;
  const paints = async ps => {
    if (ps === figma.mixed) return 'MIXED';
    const o = [];
    for (const p of visiblePaints(ps)) {
      let s = p.type === 'SOLID' ? hex(p.color) : p.type === 'IMAGE' ? 'IMAGE:' + p.scaleMode : p.type.slice(9).toLowerCase() + '(' + p.gradientStops.map(g => hex(g.color, r2(g.color.a)) + '@' + r2(g.position)).join(' ') + ')';
      if (p.opacity !== undefined && p.opacity < 1) s += ' op' + r2(p.opacity);
      if (p.blendMode && p.blendMode !== 'NORMAL') s += ' ' + p.blendMode;
      if (p.boundVariables && p.boundVariables.color) s += ' →' + await varName(p.boundVariables.color.id);
      o.push(s);
    }
    return o.length ? o : undefined;
  };
  async function node(n, d, ox, oy) {
    if (budget-- <= 0) return { id: n.id, cut: 'budget' };
    const b = n.absoluteBoundingBox || { x: ox, y: oy, width: n.width, height: n.height };
    const o = { id: n.id, n: short(n.name, 40), t: n.type, xywh: [r2(b.x - ox), r2(b.y - oy), r2(n.width), r2(n.height)] };
    if (n.visible === false) o.hidden = true;
    if (n.rotation) o.rot = r2(n.rotation);
    if (n.opacity !== undefined && n.opacity < 1) o.op = r2(n.opacity);
    if ('fills' in n) { const f = await paints(n.fills); if (f) o.fill = f; }
    if ('strokes' in n && visiblePaints(n.strokes).length) {
      o.stroke = await paints(n.strokes);
      o.sw = MIX(n.strokeWeight) === 'MIXED' ? [n.strokeTopWeight, n.strokeRightWeight, n.strokeBottomWeight, n.strokeLeftWeight] : r2(n.strokeWeight);
      o.sa = n.strokeAlign; if (n.dashPattern && n.dashPattern.length) o.dash = n.dashPattern.slice();
      if (n.strokeCap && n.strokeCap !== 'NONE') o.cap = MIX(n.strokeCap);
    }
    if ('cornerRadius' in n && n.type !== 'TEXT') { const r = n.cornerRadius === figma.mixed ? [n.topLeftRadius, n.topRightRadius, n.bottomRightRadius, n.bottomLeftRadius] : n.cornerRadius; if (r) o.r = r; }
    if (n.effects && n.effects.length) o.fx = n.effects.filter(e => e.visible !== false).map(e => e.type + (e.radius ? ' r' + r2(e.radius) : '') + (e.offset ? ` ${r2(e.offset.x)},${r2(e.offset.y)}` : '') + (e.color ? ' ' + hex(e.color, r2(e.color.a)) : ''));
    if (n.clipsContent) o.clip = true;
    if (n.layoutMode && n.layoutMode !== 'NONE') {
      o.al = { m: n.layoutMode, pad: [n.paddingTop, n.paddingRight, n.paddingBottom, n.paddingLeft].map(r2), gap: r2(n.itemSpacing), main: n.primaryAxisAlignItems, cross: n.counterAxisAlignItems, size: [n.layoutSizingHorizontal, n.layoutSizingVertical] };
      if (n.layoutWrap === 'WRAP') o.al.wrap = r2(n.counterAxisSpacing);
    }
    if (n.layoutPositioning === 'ABSOLUTE') o.abs = true;
    if (n.minWidth) o.minW = n.minWidth; if (n.maxWidth) o.maxW = n.maxWidth;
    if (n.type === 'TEXT') {
      const segs = n.getStyledTextSegments(['fontName', 'fontSize', 'lineHeight', 'letterSpacing', 'textCase']);
      const s = segs[0];
      o.text = short(n.characters, 80);
      o.font = `${s.fontName.family} ${s.fontName.style} ${r2(s.fontSize)}/${lh(s.lineHeight)} ls${ls(s.letterSpacing)} ${s.textCase}`;
      if (segs.length > 1) o.segs = segs.length;
      o.trim = MIX(n.leadingTrim); o.align = n.textAlignHorizontal; o.resize = n.textAutoResize;
      if (n.textTruncation && n.textTruncation !== 'DISABLED') o.trunc = n.textTruncation;
      const st = await styleName(n.textStyleId); if (st) o.style = st;
      if (n.hasMissingFont) o.missingFont = true;
    }
    if (n.type === 'VECTOR') o.vertices = n.vectorNetwork ? n.vectorNetwork.vertices.length : undefined;
    if (n.type === 'INSTANCE') {
      const m = await n.getMainComponentAsync();
      o.main = m ? (m.parent && m.parent.type === 'COMPONENT_SET' ? m.parent.name + ' / ' + m.name : m.name) : null;
      try { o.props = Object.fromEntries(Object.entries(n.componentProperties).map(([k, v]) => [k.split('#')[0], v.value])); } catch (e) {}
    }
    if (n.type === 'COMPONENT_SET') o.propDefs = Object.fromEntries(Object.entries(n.componentPropertyDefinitions).map(([k, v]) => [k, v.type + (v.variantOptions ? ':' + v.variantOptions.join('|') : '')]));
    if ('children' in n && n.children.length) {
      if (d >= PARAMS.depth || n.type === 'INSTANCE' && d > 0) o.kids = n.children.length;
      else { o.c = []; for (const k of n.children) if (PARAMS.includeHidden || k.visible !== false) o.c.push(await node(k, d + 1, ox, oy)); }
    }
    return o;
  }
  const trees = [];
  for (const root of R) { const b = root.absoluteBoundingBox || { x: 0, y: 0 }; trees.push(await node(root, 0, b.x, b.y)); }
  const res = { meta: { nodesLeft: budget }, trees };
  const s = JSON.stringify(res);
  if (bytes(s) > PARAMS.maxBytes) return { error: 'OUTPUT_TOO_LARGE', bytes: bytes(s), hint: 'lower depth or pass child ids as rootIds' };
  res.meta.bytes = bytes(s); res.meta.mode = 'spec'; res.meta.readOnly = true;
  return res;
}
