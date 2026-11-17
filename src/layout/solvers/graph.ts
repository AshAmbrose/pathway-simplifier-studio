/**
 * Step 5, general-purpose layout solvers (prototype): what ELK and fCoSE are given, and how their answer becomes
 * the app's stored layout (value.ts). Both solvers get the same input, so the comparison is fair:
 *  - units: shapes that travel together (a cluster, shapes drawn touching), each a fixed-size block with its rows
 *    as drawn (shapes.ts), at one size per kind, with names that fit;
 *  - each unit's compartment and panel, from the figure;
 *  - the arrows between units;
 *  - the original positions, as starting points and for left-to-right order.
 * The output step is shared too: compartment bands spanning their panel, headings over their part, arrows bowed
 * around shapes and their text placed clear (arrows.ts), and everything in percent of a canvas.
 */
import type { Tracing } from '../../simplify/routes.ts';
import type { Element, Extraction, Region } from '../../types/extraction.ts';
import { bendArrows, placeArrowText, type Box } from '../arrows.ts';
import { arrangeRows, FONT, median, sizeOf, UNIT_H } from '../shapes.ts';
import type { LayoutNotes, LayoutOptions, LayoutValue } from '../value.ts';

export interface LUnit {
  key: string;
  ids: string[];
  /** Size in layout units, and each member's place inside it. */
  w: number; h: number;
  offset: Map<string, { dx: number; dy: number }>;
  /** Each member's own size. */
  sizes: Map<string, { w: number; h: number }>;
  /** Where the unit was drawn, in layout units (the original scaled so a protein is 40 high). */
  orig: Box;
  /** The compartment it sits in (a region id), or null. */
  region: string | null;
  /** The panel it is drawn in, or null. */
  panel: string | null;
}
export interface LEdgeIn { id: string; from: string; to: string; bar: boolean }
export interface LGraph {
  units: LUnit[];
  edges: LEdgeIn[];
  /** Regions holding at least one unit, with their parent region (an endosome in the cytoplasm), if any. */
  regions: { r: Region; parent: string | null; panel: string | null; rank: number }[];
  /** Panels holding units (side-by-side parts like Wnt OFF | ON). */
  panels: string[];
  heads: Element[];
  s: number;
}

/** Top to bottom in a cell. */
export const RANK: Record<Region['kind'], number> = { extracellular: 0, plasma_membrane: 1, cytoplasm: 2, endosome: 2, mitochondrion: 2, ER: 2, other: 2, nucleus: 3 };
const BANDS = new Set(['extracellular', 'plasma_membrane', 'cytoplasm', 'nucleus']);
const cx = (b: Box) => b.x + b.width / 2, cy = (b: Box) => b.y + b.height / 2;
const union = (bs: Box[]): Box => {
  const x0 = Math.min(...bs.map((b) => b.x)), y0 = Math.min(...bs.map((b) => b.y));
  return { x: x0, y: y0, width: Math.max(...bs.map((b) => b.x + b.width)) - x0, height: Math.max(...bs.map((b) => b.y + b.height)) - y0 };
};
const grow = (b: Box, p: number): Box => ({ x: b.x - p, y: b.y - p, width: b.width + 2 * p, height: b.height + 2 * p });
const mostCommon = <T,>(v: T[]): T | undefined => [...v].sort((a, b) => v.filter((x) => x === b).length - v.filter((x) => x === a).length)[0];

export function buildGraph(x: Extraction, W: number, H: number, t: Tracing, opts: LayoutOptions): LGraph {
  const byId = new Map(x.elements.map((e) => [e.id, e]));
  const px = (b: number[]): Box => ({ x: (b[0] / 100) * W, y: (b[1] / 100) * H, width: (b[2] / 100) * W, height: (b[3] / 100) * H });
  const plain = x.elements.filter((e) => e.kind !== 'heading' && e.outline !== 'text only');
  const s = UNIT_H / Math.max(1, median(plain.map((e) => px(e.box).height)));
  const scaled = (b: Box): Box => ({ x: b.x * s, y: b.y * s, width: b.width * s, height: b.height * s });
  const regionOf = (e: Element) => x.regions.find((r) => r.id === e.region)
    ?? x.regions.filter((r) => { const b = px(r.box), c = px(e.box); return cx(c) >= b.x && cx(c) <= b.x + b.width && cy(c) >= b.y && cy(c) <= b.y + b.height; })
      .sort((a, b) => a.box[2] * a.box[3] - b.box[2] * b.box[3])[0] ?? null;

  const size = new Map(x.elements.filter((e) => e.kind !== 'heading').map((e) => {
    const b = px(e.box);
    return [e.id, sizeOf(e, { w: b.width, h: b.height }, s, { sizes: true, fit: true, sublabels: opts.sublabels })];
  }));
  const groups = new Map<string, string[]>();
  for (const e of x.elements) if (e.kind !== 'heading') { const k = t.unitOf.get(e.id)?.[0] ?? e.id; groups.set(k, [...(groups.get(k) ?? []), e.id]); }
  const units: LUnit[] = [...groups].map(([key, ids]) => {
    const r = arrangeRows(ids, (id) => { const b = px(byId.get(id)!.box); return { x: b.x, y: b.y, w: b.width, h: b.height }; }, (id) => size.get(id)!);
    const regs = ids.map((id) => regionOf(byId.get(id)!)).filter((v): v is Region => !!v);
    // A unit across the membrane (a ligand on its receptor, a protein docked under it) belongs to the membrane.
    const region = regs.find((v) => v.kind === 'plasma_membrane') ?? mostCommon(regs) ?? null;
    return {
      key, ids, w: r.width, h: r.height, offset: r.offset, sizes: new Map(ids.map((id) => [id, size.get(id)!])), orig: scaled(union(ids.map((id) => px(byId.get(id)!.box)))),
      region: region?.id ?? null, panel: mostCommon(ids.map((id) => byId.get(id)!.panel).filter((p): p is string => !!p)) ?? null,
    };
  });
  const unitAt = new Map(units.flatMap((u) => u.ids.map((id) => [id, u.key] as const)));
  const endUnit = (id: string) => unitAt.get(id) ?? unitAt.get(x.groups.find((g) => g.id === id)?.members[0] ?? '');
  const edges: LEdgeIn[] = [];
  for (const a of x.arrows) {
    if (a.ends?.from || a.ends?.to) continue;
    const f = endUnit(a.from), to = endUnit(a.to);
    if (f && to && f !== to) edges.push({ id: a.id, from: f, to, bar: a.head === 'bar' || a.meaning === 'inhibits' });
  }
  const used = new Set(units.map((u) => u.region).filter(Boolean));
  const inside = (big: Region, small: Region) => { const b = px(big.box), c = px(small.box); return big !== small && b.width * b.height > c.width * c.height && cx(c) >= b.x && cx(c) <= b.x + b.width && cy(c) >= b.y && cy(c) <= b.y + b.height; };
  // Only organelles nest (an endosome in the cytoplasm); the bands of a cell sit one under another.
  const regions = x.regions.filter((r) => used.has(r.id)).map((r) => {
    const parent = BANDS.has(r.kind) ? null : x.regions.filter((v) => used.has(v.id) && v.kind === 'cytoplasm' && inside(v, r))[0]?.id ?? null;
    const panel = mostCommon(units.filter((u) => u.region === r.id).map((u) => u.panel).filter((p): p is string => !!p)) ?? null;
    return { r, parent, panel, rank: RANK[r.kind] };
  });
  // Panels matter only when there are two or more side by side; a figure's single frame is no panel.
  const panels = [...new Set(units.map((u) => u.panel).filter((p): p is string => !!p))];
  if (panels.length < 2) { for (const u of units) u.panel = null; for (const v of regions) v.panel = null; }
  return { units, edges, regions, panels: panels.length > 1 ? panels : [], heads: x.elements.filter((e) => e.kind === 'heading'), s };
}

/**
 * The solver's answer as the app's stored layout: unit positions (top-left, layout units) and compartment and
 * panel boxes. Bands stretch across their panel (or the whole figure); headings go over their part.
 */
export function toValue(x: Extraction, g: LGraph, t: Tracing, opts: LayoutOptions, at: Map<string, { x: number; y: number }>,
  regionBox: Map<string, Box>, panelBox: Map<string, Box>): LayoutValue {
  const notes: LayoutNotes = { beside: [], emptyRegions: [], behind: [], textClashes: [] };
  const box = new Map<string, Box>();
  for (const u of g.units) {
    const p = at.get(u.key)!;
    for (const id of u.ids) {
      const o = u.offset.get(id)!, z = u.sizes.get(id)!;
      box.set(id, { x: p.x + o.dx, y: p.y + o.dy, width: z.w, height: z.h });
    }
  }
  const content = union([...box.values()]);
  // Bands span their panel (or the whole figure), so the cell reads as layers.
  for (const { r, panel } of g.regions) {
    const b = regionBox.get(r.id);
    if (!b || !BANDS.has(r.kind)) continue;
    const scope = panel && panelBox.get(panel) ? panelBox.get(panel)! : content;
    regionBox.set(r.id, { ...b, x: Math.min(b.x, scope.x - 12), width: Math.max(b.x + b.width, scope.x + scope.width + 12) - Math.min(b.x, scope.x - 12) });
  }
  for (const r of x.regions) if (!regionBox.has(r.id)) notes.emptyRegions.push(r.label ?? r.kind.replace('_', ' '));
  // Headings over the shapes of their part.
  const top = Math.min(content.y, ...[...regionBox.values()].map((b) => b.y));
  for (const h of g.heads) {
    const mates = g.units.filter((u) => u.ids.some((id) => t.partOf.get(id) === `heading:${h.id}` || (h.panel && u.panel === h.panel)));
    const area = mates.length ? union(mates.flatMap((u) => u.ids.map((id) => box.get(id)!))) : content;
    const w = Math.max(60, (h.label ?? '').length * 0.6 * FONT + 24);
    const pb = h.panel ? panelBox.get(h.panel) : undefined;
    box.set(h.id, { x: cx(area) - w / 2, y: (pb ? pb.y : top) - 48, width: w, height: 36 });
  }
  const all = [...box.values(), ...regionBox.values(), ...panelBox.values()];
  const frame = grow(union(all), 24);
  const cw = Math.round(frame.width), ch = Math.round(frame.height);
  const bows = bendArrows(x, box, 1, (id) => t.unitOf.get(id) ?? []);
  notes.behind.push(...bows.behind);
  const text = placeArrowText(x, box, bows.bend, Math.min(Math.max(cw / 90, 8), 14) / 11, true);
  notes.textClashes.push(...text.clashes);
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  const pct = (b: Box) => [((b.x - frame.x) / cw) * 100, ((b.y - frame.y) / ch) * 100, (b.width / cw) * 100, (b.height / ch) * 100].map(r3);
  const point = (p: { x: number; y: number }) => [((p.x - frame.x) / cw) * 100, ((p.y - frame.y) / ch) * 100].map(r3);
  const boxes: Record<string, number[]> = {};
  for (const [id, b] of box) boxes[id] = pct(b);
  const region: Record<string, string | null> = {};
  for (const e of x.elements) region[e.id] = e.region && regionBox.has(e.region) ? e.region : null;
  const arrows: LayoutValue['arrows'] = {};
  for (const a of x.arrows) {
    const tp = text.at.get(a.id);
    arrows[a.id] = { bend: r3(((bows.bend.get(a.id) ?? 0) / cw) * 100), textAt: tp ? point(tp) : null };
  }
  return {
    opts, canvas: [cw, ch], boxes, region,
    regions: x.regions.filter((r) => regionBox.has(r.id)).map((r) => ({ ...r, box: pct(regionBox.get(r.id)!) })).sort((a, b) => b.box[2] * b.box[3] - a.box[2] * a.box[3]),
    panels: x.panels.filter((p) => panelBox.has(p.id)).map((p) => ({ ...p, box: pct(panelBox.get(p.id)!) })),
    arrows, notes,
  };
}

