// Minimal read-only mock of the Figma Plugin API: just what audit.js and qa.js read.
export const MIXED = Symbol('mixed');
const rgb = h => ({ r: parseInt(h.slice(1, 3), 16) / 255, g: parseInt(h.slice(3, 5), 16) / 255, b: parseInt(h.slice(5, 7), 16) / 255 });
export const solid = (h, extra = {}) => Object.assign({ type: 'SOLID', color: rgb(h), opacity: 1, visible: true }, extra);

export function scene() {
  let seq = 1;
  const all = new Map(), vars = new Map(), styles = new Map(), cols = [];
  const node = (type, props = {}, kids = []) => {
    const n = Object.assign({ id: `1:${seq++}`, type, name: type[0] + type.slice(1).toLowerCase(), visible: true, x: 0, y: 0, width: 100, height: 40,
      rotation: 0, opacity: 1, fills: [], strokes: [], effects: [], strokeWeight: 1, strokeAlign: 'INSIDE', dashPattern: [], cornerRadius: 0, clipsContent: false, layoutMode: 'NONE' }, props);
    n.children = kids; n.parent = null;
    for (const k of kids) k.parent = n;
    Object.defineProperty(n, 'absoluteBoundingBox', { get() { let x = n.x, y = n.y, p = n.parent; while (p && p.type !== 'PAGE') { x += p.x; y += p.y; p = p.parent; } return { x, y, width: n.width, height: n.height }; } });
    if (type === 'TEXT') {
      Object.assign(n, { characters: props.characters || 'Text', fontName: { family: 'Inter', style: 'Regular' }, fontSize: 16, lineHeight: { unit: 'PERCENT', value: 140 },
        letterSpacing: { unit: 'PERCENT', value: 0 }, textCase: 'ORIGINAL', leadingTrim: 'CAP_HEIGHT', textStyleId: '', hasMissingFont: false, textAutoResize: 'WIDTH_AND_HEIGHT', textAlignHorizontal: 'LEFT' }, props);
      n.links = props.links || [];
      n.getStyledTextSegments = fields => fields.includes('hyperlink')
        ? (n.links.length ? n.links.map(v => ({ characters: n.characters, hyperlink: { type: 'NODE', value: v } })) : [{ characters: n.characters, hyperlink: null }])
        : [{ characters: n.characters, fontName: n.fontName, fontSize: n.fontSize, lineHeight: n.lineHeight, letterSpacing: n.letterSpacing, textCase: n.textCase }];
      Object.defineProperty(n, 'absoluteRenderBounds', { get() { const b = n.absoluteBoundingBox; return { x: b.x, y: b.y, width: b.width, height: b.height + (n.descender || 0) }; } });
    }
    n.findAll = pred => { const out = []; const q = [...n.children]; while (q.length) { const k = q.shift(); if (!pred || pred(k)) out.push(k); q.push(...(k.children || [])); } return out; };
    n.findOne = pred => n.findAll(pred)[0] || null;
    n.findAllWithCriteria = ({ types }) => n.findAll(k => types.includes(k.type));
    n.getMainComponentAsync = async () => (n.main === undefined ? null : n.main);
    all.set(n.id, n);
    return n;
  };
  const page = (name, kids) => { const p = node('PAGE', { name }, kids); p.loadAsync = async () => {}; return p; };
  const collection = (name, modes) => { const c = { id: `VariableCollectionId:${seq++}`, name, modes: modes.map((m, i) => ({ name: m, modeId: `${seq}:${i}` })), variableIds: [] }; cols.push(c); return c; };
  const variable = (name, c, scopes = ['ALL_SCOPES']) => { const v = { id: `VariableID:${seq++}`, name, variableCollectionId: c.id, scopes, valuesByMode: Object.fromEntries(c.modes.map((m, i) => [m.modeId, i + 1])) }; vars.set(v.id, v); c.variableIds.push(v.id); return v; };
  const textStyle = (name, extra = {}) => { const s = Object.assign({ id: `S:${seq++},`, name, leadingTrim: 'CAP_HEIGHT' }, extra); styles.set(s.id, s); return s; };
  const figma = root => ({
    mixed: MIXED, fileKey: 'FILE', root,
    getNodeByIdAsync: async id => all.get(id) || null,
    getStyleByIdAsync: async id => styles.get(id) || null,
    getLocalTextStylesAsync: async () => [...styles.values()],
    getLocalPaintStylesAsync: async () => [], getLocalEffectStylesAsync: async () => [],
    variables: { getVariableByIdAsync: async id => vars.get(id) || null, getLocalVariableCollectionsAsync: async () => cols },
  });
  return { node, page, collection, variable, textStyle, figma, all };
}

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
export async function run(code, params, figma) {
  const m = code.match(/const PARAMS = (\{[\s\S]*?\n\});/);
  if (!m) throw new Error('PARAMS block not found');
  const defaults = new Function(`return ${m[1]}`)();
  const patched = code.replace(m[0], `const PARAMS = ${JSON.stringify(Object.assign(defaults, params))};`);
  return new AsyncFunction('figma', patched)(figma);
}
