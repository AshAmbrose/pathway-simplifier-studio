/**
 * Step 5 (Layout): lays the figure out again with BioPathway Studio's cell layout (cellLayout.ts), and turns the
 * result into new positions for the figure (the set_layout change, see value.ts).
 *
 * Where things go comes only from the figure itself:
 *  - a shape's compartment is the one the figure draws it in (the one the model read, else the one its box sits in);
 *    a shape with none is placed beside its most-connected partner, and listed;
 *  - compartments keep the figure's own names; ones it doesn't name stay unnamed.
 *
 * On top of BioPathway Studio's rules, these can each be switched off in the step (RULES):
 *  - blocks:  a cluster, and shapes drawn touching (a ligand on its receptor, a protein on DNA), move as one block,
 *             keeping their rows as drawn;
 *  - order:   the left-to-right order starts from the original's, so the result is recognisably the same figure;
 *  - panels:  the figure's parts (panels, or areas under headings) become side-by-side columns under their headings;
 *  - spines:  the routes traced in step 2 are preferred for the straight main line;
 *  - fit:     a shape widens to fit its name, so text never has to shrink below a readable size;
 *  - sizes:   shapes of one kind share one height (and one width, unless a name needs more);
 *  - grid:    shapes snap to an even grid;
 *  - labels:  arrow text is placed clear of shapes, lines and other text.
 * One reading direction (top to bottom, only feedback pointing up) is BioPathway Studio's own and always applies.
 *
 * The layout is worked out in its own units (a protein is 40 high) and keeps them: the laid-out picture has its
 * own size (the canvas), so names are drawn at a readable size against their shapes. The screen shrinks it to
 * fit beside the original.
 */
import type { Tracing } from '../simplify/routes.ts';
import type { Element, Extraction, Region } from '../types/extraction.ts';
import { edgeGeometry } from '../render/edgeGeometry.ts';
import { layoutCell, neighbourMap, placeByPartner, BAND_NAME, type CompartmentType, type LEdge, type LNode } from './cellLayout.ts';
import { layoutEdgeLabels } from './edgeLabelLayout.ts';
import type { LayoutNotes, LayoutOptions, LayoutValue } from './value.ts';

export const RULES = [
  { key: 'blocks', name: 'Keep clusters and touching shapes together', why: 'A cluster, or a ligand on its receptor, moves as one block, its rows kept as drawn.' },
  { key: 'order', name: 'Start from the original order', why: 'Left to right, shapes start in the order the figure draws them.' },
  { key: 'panels', name: 'Panels side by side', why: "The figure's parts become columns under their headings; parts are never mixed." },
  { key: 'spines', name: 'Your routes as the main lines', why: 'The routes traced in step ② are preferred for the straight top-to-bottom lines.' },
  { key: 'fit', name: 'Names fit their shapes', why: 'A shape widens to fit its name, so text stays readable.' },
  { key: 'sizes', name: 'One size per kind', why: 'Proteins, receptors, genes and outcomes each share one height.' },
  { key: 'grid', name: 'Even grid', why: 'Shapes snap to one grid, with even gaps.' },
  { key: 'labels', name: 'Arrow text clear of lines', why: 'Text on arrows is moved off shapes, other lines and other text.' },
] as const;
export type RuleKey = (typeof RULES)[number]['key'];

/** The compartment kinds this app reads, as the layout's compartments. "other" takes the Golgi slot, which the figures never use. */
const TO_CELL: Record<Region['kind'], CompartmentType> = {
  extracellular: 'extracellular', plasma_membrane: 'plasma_membrane', cytoplasm: 'cytoplasm', nucleus: 'nucleus',
  endosome: 'endosome', mitochondrion: 'mitochondria', ER: 'endoplasmic_reticulum', other: 'golgi',
};
const FROM_CELL = Object.fromEntries(Object.entries(TO_CELL).map(([k, v]) => [v, k])) as Record<CompartmentType, Region['kind']>;

/** Layout units: the height a protein gets, and the font a name is set at (about what the renderer uses at that height). */
const UNIT_H = 40;
const FONT = 16;
const GRID = 12;
/** Share of BioPathway Studio's gaps used here: published figures are dense, and the result must fit the original's frame. */
const SPACING = 0.45;
/** Gap between shapes inside one block (they are drawn touching, or nearly). */
const BLOCK_GAP = 4;

/** One height per kind (rule "sizes"), and the narrowest a shape of that kind may be. */
function kindSize(e: Element): { w: number; h: number } {
  if (e.outline === 'text only') return { w: 60, h: 28 };
  switch (e.kind) {
    case 'receptor': return e.outline === 'other' ? { w: 48, h: 90 } : { w: 72, h: 40 };
    case 'dna': return { w: 160, h: 28 };
    case 'gene': return { w: 80, h: 36 };
    case 'process': case 'phenotype': return { w: 120, h: 44 };
    case 'small molecule': case 'ligand': return e.outline === 'circle' || e.outline === 'oval' ? { w: 44, h: 36 } : { w: 56, h: 32 };
    case 'symbol': return { w: 28, h: 28 };
    case 'complex': return { w: 90, h: 48 };
    default: return { w: 72, h: UNIT_H };
  }
}

/** The width a name needs at a readable size, on at most two lines (rule "fit"). */
function nameWidth(label: string | null): { w: number; lines: number } {
  if (!label) return { w: 0, lines: 1 };
  const longest = Math.max(...label.split(/\s+/).map((v) => v.length));
  const lines = label.length > 16 && label.includes(' ') ? 2 : 1;
  const w = Math.max(longest * 0.62 * FONT, (label.length * 0.58 * FONT) / lines);
  return { w: Math.min(260, w) + 14, lines };
}

const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 1; };

/**
 * Lays out `x` (the figure just before step 5) and returns the new positions, in percent of a W × H picture.
 * `t` is the route tracing of the same figure (for units, regulators, routes and parts).
 */
export function layoutFigure(x: Extraction, W: number, H: number, t: Tracing, opts: LayoutOptions): LayoutValue {
  // W and H (the original picture's size) only turn the figure's percent boxes into its own proportions.
  const on = (k: RuleKey) => !opts.off.includes(k);
  const els = x.elements.filter((e) => e.kind !== 'heading');
  const heads = x.elements.filter((e) => e.kind === 'heading');
  const byId = new Map(x.elements.map((e) => [e.id, e]));
  const px = (e: Element) => ({ x: (e.box[0] / 100) * W, y: (e.box[1] / 100) * H, w: (e.box[2] / 100) * W, h: (e.box[3] / 100) * H });
  // The figure's scale against layout units: its typical shape height becomes a protein's height.
  const s = UNIT_H / Math.max(1, median(els.filter((e) => e.outline !== 'text only').map((e) => px(e).h)));

  // --- each shape's compartment, from the figure only ---
  const regionOf = (e: Element): Region | null => {
    const r = x.regions.find((v) => v.id === e.region);
    if (r) return r;
    const [cx, cy] = [e.box[0] + e.box[2] / 2, e.box[1] + e.box[3] / 2];
    return x.regions.filter((v) => cx >= v.box[0] && cx <= v.box[0] + v.box[2] && cy >= v.box[1] && cy <= v.box[1] + v.box[3])
      .sort((a, b) => a.box[2] * a.box[3] - b.box[2] * b.box[3])[0] ?? null;
  };
  const cellOf = new Map<string, CompartmentType | null>(els.map((e) => { const r = regionOf(e); return [e.id, r ? TO_CELL[r.kind] : null]; }));

  // --- each shape's size, in layout units ---
  const sizeOf = (e: Element) => {
    const p = px(e);
    let { w, h } = on('sizes') ? kindSize(e) : { w: p.w * s, h: p.h * s };
    const glyph = e.kind === 'receptor' && e.outline === 'other' && h > w * 0.6;
    if (on('fit') && e.label) {
      const need = nameWidth(e.label);
      if (glyph) { w = Math.max(w, Math.min(80, need.w / 2)); h = Math.max(h, w * 1.8); }
      else { w = Math.max(w, need.w); if (need.lines > 1) h = Math.max(h, 2 * FONT * 1.15 + 10); }
    }
    if (opts.sublabels && e.sublabel) { h += 16; if (on('fit')) w = Math.max(w, Math.min(260, e.sublabel.length * 0.36 * FONT + 14)); }
    return { w: Math.round(w), h: Math.round(h) };
  };
  const size = new Map(els.map((e) => [e.id, sizeOf(e)]));

  // --- blocks: shapes that travel together (rule "blocks"), split by compartment; a ligand or a docked protein
  //     joins its receptor's block at the membrane ---
  const membraneSide = new Set<CompartmentType | null>(['extracellular', 'plasma_membrane', 'cytoplasm', null]);
  const blockKey = new Map<string, string>();
  const units = new Map<string, string[]>();
  for (const e of els) { const u = on('blocks') ? t.unitOf.get(e.id)?.[0] ?? e.id : e.id; units.set(u, [...(units.get(u) ?? []), e.id]); }
  for (const [u, ids] of units) {
    const atMembrane = ids.some((id) => cellOf.get(id) === 'plasma_membrane');
    const side = (id: string) => (atMembrane && membraneSide.has(cellOf.get(id)!) ? 'plasma_membrane' : cellOf.get(id));
    const sides = ids.map(side).filter((v): v is CompartmentType => !!v);
    const common = sides.sort((a, b) => sides.filter((v) => v === b).length - sides.filter((v) => v === a).length)[0] ?? null;
    for (const id of ids) blockKey.set(id, `blk:${u}|${side(id) ?? common ?? 'none'}`);
  }
  const blocks = new Map<string, string[]>();
  for (const e of els) { const k = blockKey.get(e.id)!; blocks.set(k, [...(blocks.get(k) ?? []), e.id]); }

  // Inside a block, shapes keep their rows as drawn: rows by height in the original, each row left to right, touching.
  const offset = new Map<string, { dx: number; dy: number }>();
  const nodes: LNode[] = [];
  const blockCell = new Map<string, CompartmentType | null>();
  for (const [k, ids] of blocks) {
    const sorted = [...ids].sort((a, b) => px(byId.get(a)!).y + px(byId.get(a)!).h / 2 - (px(byId.get(b)!).y + px(byId.get(b)!).h / 2));
    const tol = 0.5 * median(ids.map((id) => px(byId.get(id)!).h));
    const rows: string[][] = [];
    for (const id of sorted) {
      const cy = px(byId.get(id)!).y + px(byId.get(id)!).h / 2;
      const row = rows[rows.length - 1];
      const rowCy = row && px(byId.get(row[0])!).y + px(byId.get(row[0])!).h / 2;
      if (row && Math.abs(cy - rowCy!) <= tol) row.push(id); else rows.push([id]);
    }
    const rowW = rows.map((r) => r.reduce((sum, id) => sum + size.get(id)!.w, 0) + (r.length - 1) * BLOCK_GAP);
    const width = Math.max(...rowW);
    let y = 0;
    rows.forEach((r, i) => {
      r.sort((a, b) => px(byId.get(a)!).x - px(byId.get(b)!).x);
      const rowH = Math.max(...r.map((id) => size.get(id)!.h));
      let xx = (width - rowW[i]) / 2;
      for (const id of r) { offset.set(id, { dx: xx, dy: y + (rowH - size.get(id)!.h) / 2 }); xx += size.get(id)!.w + BLOCK_GAP; }
      y += rowH + BLOCK_GAP;
    });
    nodes.push({ id: k, label: ids.map((id) => byId.get(id)!.label ?? '').join(' + '), x: 0, y: 0, width, height: y - BLOCK_GAP });
    const side = k.slice(k.lastIndexOf('|') + 1);
    blockCell.set(k, side === 'none' ? null : (side as CompartmentType));
  }
  const blockOf = (id: string): string | null => {
    if (blockKey.has(id)) return blockKey.get(id)!;
    const g = x.groups.find((v) => v.id === id);
    const m = g?.members.find((v) => blockKey.has(v));
    return m ? blockKey.get(m)! : null;
  };

  // --- arrows between blocks ---
  const arrowOf = new Map(x.arrows.map((a) => [a.id, a]));
  const edges: LEdge[] = [];
  for (const a of x.arrows) {
    if (a.ends?.from || a.ends?.to) continue;
    const f = blockOf(a.from), to = blockOf(a.to);
    if (f && to && f !== to) edges.push({ id: a.id, sourceNodeId: f, targetNodeId: to, curvature: 0, label: a.text });
  }

  // --- roles, from the step 2 tracing and the drawing ---
  const onRoute = new Set(t.groups.flatMap((g) => g.routes.flatMap((r) => r.members)));
  const regulator = new Set(t.regulators.flatMap((r) => r.members));
  const membersOf = (k: string) => blocks.get(k) ?? [];
  const isOutput = (k: string) => {
    const ms = membersOf(k).map((id) => byId.get(id)!);
    if (ms.every((m) => m.kind === 'phenotype')) return true;
    // A process drawn inside a compartment (β-catenin degradation in the cytoplasm) stays there.
    return ms.every((m) => m.kind === 'process' && !cellOf.get(m.id)) && !edges.some((e) => e.sourceNodeId === k);
  };
  const isRegulator = (k: string) => membersOf(k).some((id) => regulator.has(id)) && !membersOf(k).some((id) => onRoute.has(id));

  // Parts become columns (rule "panels"): each named by its part's label, made unique.
  const partList = on('panels') && t.parts.length > 1 ? t.parts : [];
  const titles = partList.map((p, i) => (partList.findIndex((q) => q.label === p.label) < i ? `${p.label} (${i + 1})` : p.label));
  // A block's part: as step 2 groups it (a route with its start, a regulator with the routes it acts on), else the
  // part it is drawn in. Grouping by drawing alone would put a regulator under whichever heading it sits nearest.
  const groupPart = new Map<string, string>();
  for (const g of t.groups) {
    for (const r of g.regulators) for (const m of r.members) if (!groupPart.has(m)) groupPart.set(m, g.key);
    for (const r of g.routes) for (const m of r.members) if (!r.shared.includes(m)) groupPart.set(m, g.key);
  }
  const moduleOf = new Map<string, string>();
  for (const k of blocks.keys()) {
    const part = membersOf(k).map((id) => groupPart.get(id)).find(Boolean) ?? t.partOf.get(membersOf(k)[0]);
    const i = partList.findIndex((p) => p.key === part);
    if (i >= 0) moduleOf.set(k, titles[i]);
  }

  // Compartments: shapes with none sit beside their most-connected partner.
  const cellNodeIds = nodes.map((n) => n.id).filter((k) => !isOutput(k));
  const compartmentOf = new Map<string, CompartmentType | null>(cellNodeIds.map((k) => [k, blockCell.get(k) ?? null]));
  const partnerOf = placeByPartner(cellNodeIds, neighbourMap(cellNodeIds, edges), compartmentOf);
  const notes: LayoutNotes = { beside: [], emptyRegions: [], behind: [], textClashes: [] };
  for (const k of cellNodeIds) if (!blockCell.get(k)) for (const id of membersOf(k)) notes.beside.push({ id, partner: partnerOf.has(k) ? membersOf(partnerOf.get(k)!)[0] : null });

  const bandName: Partial<Record<CompartmentType, string>> = {};
  for (const r of x.regions) if (r.label && !bandName[TO_CELL[r.kind]]) bandName[TO_CELL[r.kind]] = r.label;
  const original = (k: string) => Math.min(...membersOf(k).map((id) => px(byId.get(id)!).x));
  const index = new Map(nodes.map((n, i) => [n.id, i]));
  const result = layoutCell({
    nodes, edges,
    compartmentOf: compartmentOf as Map<string, CompartmentType>,
    isOutput, isRegulator,
    modules: partList.length ? titles : null,
    moduleOf,
    orderHint: (k) => (on('order') ? original(k) : index.get(k)!),
    formsComplex: (e) => ['joins', 'binds', 'recruited'].includes(arrowOf.get(e.id)?.meaning ?? ''),
    isExpression: (e) => arrowOf.get(e.id)?.meaning === 'transcribes',
    mainPath: on('spines') ? (k) => membersOf(k).some((id) => onRoute.has(id)) : undefined,
    bandName,
    spacing: SPACING,
  });
  const nodeAt = new Map(nodes.map((n) => [n.id, n]));

  // Tidy-up after BioPathway Studio's layout, which can leave a crowded column spilling into the next (three
  // regulators beside one target), or squeeze a shape between two on a straight line: columns are pushed apart,
  // then any shapes still overlapping in a row are nudged apart. The cell widens to match.
  const cellRight0 = Math.max(...result.compartments.map((c) => c.x + c.width));
  const columns = Math.max(0, ...result.columnOf.values()) + 1;
  const COL_GAP = 40;
  const shiftOf = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  const move = (n: LNode, dx: number) => { n.x += dx; shiftOf.set(n.id, shiftOf.get(n.id)! + dx); };
  for (let c = 1; c < columns; c++) {
    const left = nodes.filter((n) => (result.columnOf.get(n.id) ?? -1) < c && result.columnOf.has(n.id));
    const here = nodes.filter((n) => (result.columnOf.get(n.id) ?? -1) >= c);
    if (!left.length || !here.length) continue;
    const need = Math.max(...left.map((n) => n.x + n.width)) + COL_GAP - Math.min(...nodes.filter((n) => result.columnOf.get(n.id) === c).map((n) => n.x));
    if (need > 0) for (const n of here) move(n, need);
  }
  for (let pass = 0; pass < 6; pass++) {
    let moved = false;
    const sorted = [...nodes].sort((a, b) => a.x - b.x);
    for (let i = 0; i < sorted.length; i++)
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i], b = sorted[j];
        // 16 apart at least, so snapping to the grid afterwards can't make them touch.
        const overlapX = a.x + a.width + 16 - b.x, overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
        if (overlapX > 0 && overlapY > 0) { move(b, overlapX); moved = true; }
      }
    if (!moved) break;
  }
  // Organelle boxes follow their shapes; compartments spanning the cell widen to its new right edge.
  const cellRight = Math.max(cellRight0, ...nodes.filter((n) => !isOutput(n.id)).map((n) => n.x + n.width + 40));
  for (const c of result.compartments) {
    const inside = nodes.filter((n) => n.compartmentId === c.id);
    const spans = ['extracellular', 'plasma_membrane', 'cytoplasm', 'nucleus'].includes(c.type);
    if (spans) c.width += cellRight - cellRight0;
    else if (inside.length) c.x += Math.min(...inside.map((n) => shiftOf.get(n.id)!));
  }
  for (const p of result.panels.filter((v) => v.kind === 'module')) {
    const g = Number(p.id.replace('panel-module-', ''));
    const mine = nodes.filter((n) => result.columnOf.get(n.id) === g);
    if (!mine.length) continue;
    const x1 = Math.min(...mine.map((n) => n.x)) - 16, x2 = Math.max(...mine.map((n) => n.x + n.width)) + 16;
    p.x = x1; p.width = x2 - x1;
  }

  // Even grid (rule "grid"): centres snap, so shapes on one straight line stay on it.
  if (on('grid')) for (const n of nodes) n.x = Math.round((n.x + n.width / 2) / GRID) * GRID - n.width / 2;

  // --- every shape's box, in layout units ---
  const box = new Map<string, { x: number; y: number; width: number; height: number }>();
  for (const e of els) { const b = nodeAt.get(blockKey.get(e.id)!)!, o = offset.get(e.id)!, z = size.get(e.id)!; box.set(e.id, { x: b.x + o.dx, y: b.y + o.dy, width: z.w, height: z.h }); }

  // The membrane band is BioPathway Studio's own: drawn here only if the figure draws a membrane.
  const hasKind = (k: Region['kind']) => x.regions.some((r) => r.kind === k);
  const compartments = result.compartments.filter((c) => c.type !== 'plasma_membrane' || hasKind('plasma_membrane') || nodes.some((n) => compartmentOf.get(n.id) === 'plasma_membrane'));

  // Headings go over their column; any without one sit in a row above the cell, in the figure's order.
  const modulePanels = result.panels.filter((p) => p.kind === 'module');
  const top = Math.min(...compartments.map((c) => c.y), ...modulePanels.map((p) => p.y), ...[...box.values()].map((b) => b.y));
  // A heading is set on one line, at a readable size.
  const headW = (h: Element) => Math.max(60, (h.label ?? '').length * 0.6 * FONT + 24), HEAD_H = 36;
  const headingRow: Element[] = [];
  const overPanel = new Map<string, Element[]>();
  for (const h of [...heads].sort((a, b) => a.box[0] - b.box[0])) {
    // A heading names its own part (figures split by headings), or sits in a panel that is one.
    const i = partList.findIndex((p) => p.key === `heading:${h.id}` || p.key === `panel:${h.panel}`);
    const panel = i >= 0 ? modulePanels.find((p) => p.title === titles[i]) : undefined;
    if (panel) overPanel.set(panel.id, [...(overPanel.get(panel.id) ?? []), h]); else headingRow.push(h);
  }
  // Over its column, centred, in the space BioPathway Studio leaves for column titles.
  for (const [id, hs] of overPanel) {
    const panel = modulePanels.find((p) => p.id === id)!;
    const total = hs.reduce((sum, h) => sum + headW(h), 0) + (hs.length - 1) * 12;
    let at = panel.x + panel.width / 2 - total / 2;
    for (const h of hs) { box.set(h.id, { x: at, y: panel.y, width: headW(h), height: HEAD_H }); at += headW(h) + 12; }
  }
  let hx = Math.min(...[...box.values()].map((b) => b.x), ...compartments.map((c) => c.x));
  for (const h of headingRow) { box.set(h.id, { x: hx, y: top - HEAD_H - 12, width: headW(h), height: HEAD_H }); hx += headW(h) + 16; }

  // --- arrows between shapes: bow around what they would pass behind (BioPathway Studio's rule, applied to
  //     the shapes themselves rather than their blocks) ---
  const groupBox = (id: string) => {
    const g = x.groups.find((v) => v.id === id);
    const bs = (g?.members ?? []).map((m) => box.get(m)).filter((b): b is NonNullable<typeof b> => !!b);
    if (!bs.length) return null;
    const x0 = Math.min(...bs.map((b) => b.x)) - 4, y0 = Math.min(...bs.map((b) => b.y)) - 4;
    return { x: x0, y: y0, width: Math.max(...bs.map((b) => b.x + b.width)) + 4 - x0, height: Math.max(...bs.map((b) => b.y + b.height)) + 4 - y0 };
  };
  const endBox = (id: string) => box.get(id) ?? groupBox(id);
  const inside = (id: string) => new Set([id, ...(x.groups.find((g) => g.id === id)?.members ?? [])]);
  const shapes = els.map((e) => ({ id: e.id, b: box.get(e.id)! }));
  const passesBehind = (a: Extraction['arrows'][number], bend: number) => {
    const s1 = endBox(a.from), s2 = endBox(a.to);
    if (!s1 || !s2 || a.from === a.to) return [];
    const g = edgeGeometry(s1, s2, false, bend);
    const skip = new Set([...inside(a.from), ...inside(a.to)]);
    const hit: string[] = [];
    for (const { id, b } of shapes) {
      if (skip.has(id)) continue;
      for (let i = 1; i < 30; i++) {
        const p = bezier(g, i / 30);
        if (p.x > b.x + 4 && p.x < b.x + b.width - 4 && p.y > b.y + 4 && p.y < b.y + b.height - 4) { hit.push(id); break; }
      }
    }
    return hit;
  };
  const CURVES = [70, -70, 120, -120, 180, -180, 250, -250, 330, -330];
  const bendOf = new Map<string, number>();
  const drawn = x.arrows.filter((a) => !a.ends?.from && !a.ends?.to && endBox(a.from) && endBox(a.to));
  for (const a of drawn) {
    if (!passesBehind(a, 0).length) { bendOf.set(a.id, 0); continue; }
    const c = CURVES.find((v) => !passesBehind(a, v).length);
    bendOf.set(a.id, c ?? 0);
    if (c === undefined) notes.behind.push(a.id);
  }
  // Two-way pairs would draw on top of each other: each bows to its own side.
  for (const a of drawn) {
    const back = drawn.find((b) => b !== a && b.from === a.to && b.to === a.from);
    if (back && !bendOf.get(a.id) && !bendOf.get(back.id)) { bendOf.set(a.id, 40); bendOf.set(back.id, 40); }
  }

  // --- the canvas: everything drawn, with a margin; positions become percent of it ---
  const all = [...box.values(), ...compartments, ...modulePanels];
  const minX = Math.min(...all.map((b) => b.x)) - 24, minY = Math.min(...all.map((b) => b.y)) - 24;
  const cw = Math.round(Math.max(...all.map((b) => b.x + b.width)) + 24 - minX), ch = Math.round(Math.max(...all.map((b) => b.y + b.height)) + 24 - minY);
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  const pct = (b: { x: number; y: number; width: number; height: number }) => [((b.x - minX) / cw) * 100, ((b.y - minY) / ch) * 100, (b.width / cw) * 100, (b.height / ch) * 100].map(r3);
  const point = (p: { x: number; y: number }) => [((p.x - minX) / cw) * 100, ((p.y - minY) / ch) * 100].map(r3);

  // --- arrow text (rule "labels"): clear of shapes, lines and other text, at the size it will be drawn ---
  const textAt = new Map<string, number[]>();
  if (on('labels')) {
    const lnodes: LNode[] = [...shapes.map(({ id, b }) => ({ id, label: byId.get(id)!.label, ...b })),
      ...x.groups.map((g) => ({ id: g.id, label: g.label, ...(groupBox(g.id) ?? { x: 0, y: 0, width: 0, height: 0 }) }))];
    const ledges: LEdge[] = drawn.filter((a) => a.text).map((a) => ({ id: a.id, sourceNodeId: a.from, targetNodeId: a.to, curvature: bendOf.get(a.id) ?? 0, label: a.text }));
    // The renderer draws arrow text at the canvas width / 90 (8 to 14); labelSize assumes 11.
    const scale = Math.min(Math.max(cw / 90, 8), 14) / 11;
    // Clusters are only outlines: text may sit inside one, just not on its shapes.
    const placed = layoutEdgeLabels(ledges, lnodes.filter((n) => byId.has(n.id) || ledges.some((e) => e.sourceNodeId === n.id || e.targetNodeId === n.id)), 'below', scale);
    const rects = [...placed].map(([id, b]) => ({ id, x1: b.x - b.width / 2, y1: b.y - b.height / 2, x2: b.x + b.width / 2, y2: b.y + b.height / 2 }));
    for (const r of rects) {
      textAt.set(r.id, point({ x: (r.x1 + r.x2) / 2, y: (r.y1 + r.y2) / 2 }));
      const clash = shapes.some(({ b }) => r.x1 < b.x + b.width && b.x < r.x2 && r.y1 < b.y + b.height && b.y < r.y2)
        || rects.some((o) => o !== r && r.x1 < o.x2 && o.x1 < r.x2 && r.y1 < o.y2 && o.y1 < r.y2);
      if (clash) notes.textClashes.push(r.id);
    }
  }

  // --- back into the figure's terms ---
  const boxes: Record<string, number[]> = {};
  for (const [id, b] of box) boxes[id] = pct(b);
  const regions: Extraction['regions'] = [];
  const regionIdOf = new Map<string, string>();
  const usedIds = new Set<string>();
  for (const c of [...compartments].sort((a, b) => b.width * b.height - a.width * a.height)) {
    const kind = FROM_CELL[c.type];
    const like = x.regions.filter((r) => r.kind === kind);
    const id = like.find((r) => !usedIds.has(r.id))?.id ?? `lay-${c.id}`;
    usedIds.add(id);
    regionIdOf.set(c.id, id);
    regions.push({ id, kind, label: like.find((r) => r.label)?.label ?? null, boundary: like[0]?.boundary ?? null, box: pct(c) });
  }
  const firstOfKind = (kind: Region['kind']) => regions.find((r) => r.kind === kind)?.id ?? null;
  const region: Record<string, string | null> = {};
  for (const e of els) {
    const n = nodeAt.get(blockKey.get(e.id)!)!;
    const own = cellOf.get(e.id) ?? compartmentOf.get(n.id) ?? null;
    const blockRegion = n.compartmentId ? regionIdOf.get(n.compartmentId) ?? null : null;
    region[e.id] = isOutput(n.id) ? null : own && own !== compartmentOf.get(n.id) ? firstOfKind(FROM_CELL[own]) ?? blockRegion : blockRegion;
  }
  for (const h of heads) region[h.id] = null;
  for (const r of x.regions) if (!regions.some((v) => v.kind === r.kind)) notes.emptyRegions.push(r.label ?? BAND_NAME[TO_CELL[r.kind]]);
  notes.emptyRegions = [...new Set(notes.emptyRegions)];

  const panels: Extraction['panels'] = modulePanels.map((p, i) => {
    const part = partList[titles.indexOf(p.title)];
    const id = part?.key.startsWith('panel:') ? part.key.slice(6) : `lay-panel-${i}`;
    return { id, label: p.title, box: pct(p) };
  });

  const arrows: LayoutValue['arrows'] = {};
  for (const a of x.arrows) {
    const entry: LayoutValue['arrows'][string] = { bend: r3(((bendOf.get(a.id) ?? 0) / cw) * 100), textAt: textAt.get(a.id) ?? null };
    // An end in open space has no place in the new drawing: it goes just beyond the other end, in the reading direction.
    if (a.ends?.from || a.ends?.to) {
      const other = endBox(a.ends.from ? a.to : a.from);
      const at = other ? { x: other.x + other.width / 2, y: a.ends.from ? other.y - 60 : other.y + other.height + 60 } : null;
      entry.ends = { from: a.ends.from && at ? point(at) : a.ends.from ?? null, to: a.ends.to && at ? point(at) : a.ends.to ?? null };
    }
    arrows[a.id] = entry;
  }
  return { opts, canvas: [cw, ch], boxes, region, regions, panels, arrows, notes };
}

/** A point on a cubic curve at t (0–1). */
export function bezier(g: { p1: { x: number; y: number }; cp1: { x: number; y: number }; cp2: { x: number; y: number }; p2: { x: number; y: number } }, t: number) {
  const u = 1 - t;
  return {
    x: u * u * u * g.p1.x + 3 * u * u * t * g.cp1.x + 3 * u * t * t * g.cp2.x + t * t * t * g.p2.x,
    y: u * u * u * g.p1.y + 3 * u * u * t * g.cp1.y + 3 * u * t * t * g.cp2.y + t * t * t * g.p2.y,
  };
}
