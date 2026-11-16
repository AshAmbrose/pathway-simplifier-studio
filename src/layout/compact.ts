/**
 * Step 5, "Compact" (the default): the middle ground between tidying the figure as drawn (tidy.ts) and redrawing
 * it from scratch (adapt.ts). The original's arrangement is kept, meaning what sits left of, above or beside what,
 * but the spacing is rebuilt:
 *  - the shapes' rows and columns are read from the original (centres close together share a row or column) and
 *    laid out again with even gaps, so empty space disappears;
 *  - shapes that travel together (a cluster, shapes drawn touching) stay together, keeping their rows as drawn;
 *  - wide shapes (headings, DNA strands, very wide boxes) are placed where they were relative to the columns.
 * Rules that can be switched off:
 *  - hub:      when several routes lead into one shape (NEMO in Guo), it goes in the middle, its routes are spread
 *              evenly either side, and what follows it runs straight down below it;
 *  - sizes:    shapes of one kind share one size;
 *  - fit:      a shape widens to fit its name;
 *  - boxes:    each compartment and panel fits what is in it (the nucleus shrinks to its contents); empty ones go,
 *              and are listed;
 *  - stretch:  a DNA strand spans just the shapes its arrows join;
 *  - bows, labels: as in tidy.ts (arrows around shapes; arrow text clear).
 * Works in layout units (shapes.ts); the result has its own canvas, shrunk to fit beside the original.
 */
import type { Tracing } from '../simplify/routes.ts';
import type { Element, Extraction } from '../types/extraction.ts';
import { bendArrows, placeArrowText, type Box } from './arrows.ts';
import { arrangeRows, FONT, median, sizeOf, UNIT_H } from './shapes.ts';
import type { LayoutNotes, LayoutOptions, LayoutValue } from './value.ts';

export const COMPACT_RULES = [
  { key: 'hub', name: 'Hub in the middle', why: 'When several routes lead into one shape, it goes in the middle, its routes spread evenly either side, and what follows it runs straight down.' },
  { key: 'sizes', name: 'One size per kind', why: 'Proteins, receptors, genes and outcomes each share one size.' },
  { key: 'fit', name: 'Names fit their shapes', why: 'A shape widens to fit its name, so text stays readable.' },
  { key: 'boxes', name: 'Compartments fit what is in them', why: 'Each compartment and panel shrinks or grows to hold its shapes; empty ones are left out and listed.' },
  { key: 'stretch', name: 'DNA spans what it joins', why: 'A DNA strand stretches just across the shapes its arrows join.' },
  { key: 'bows', name: 'Arrows around shapes', why: 'An arrow passing behind a shape bows around it, if that adds no crossings.' },
  { key: 'labels', name: 'Arrow text clear', why: 'Text sitting on a shape moves to a clear spot nearby.' },
] as const;

const GAP_X = 28, GAP_Y = 30, COMPARTMENT_GAP = 26, PAD = 14;
const MEMBRANE = 'plasma_membrane';
/** Compartments drawn as bands across the figure (or across their panel). */
const BANDS = new Set(['extracellular', 'plasma_membrane', 'cytoplasm', 'nucleus']);

const union = (bs: Box[]): Box => {
  const x0 = Math.min(...bs.map((b) => b.x)), y0 = Math.min(...bs.map((b) => b.y));
  return { x: x0, y: y0, width: Math.max(...bs.map((b) => b.x + b.width)) - x0, height: Math.max(...bs.map((b) => b.y + b.height)) - y0 };
};
const grow = (b: Box, p: number): Box => ({ x: b.x - p, y: b.y - p, width: b.width + 2 * p, height: b.height + 2 * p });

/** A piecewise-linear map through (from → to) pairs, extended beyond them at `slope`. */
function through(pairs: [number, number][], slope: number) {
  const ps = [...pairs].sort((a, b) => a[0] - b[0]).filter((p, i, all) => i === 0 || p[0] > all[i - 1][0] + 1e-6);
  return (v: number) => {
    if (!ps.length) return v * slope;
    if (v <= ps[0][0]) return ps[0][1] - (ps[0][0] - v) * slope;
    const last = ps[ps.length - 1];
    if (v >= last[0]) return last[1] + (v - last[0]) * slope;
    const i = ps.findIndex((p) => p[0] >= v);
    const [a, b] = [ps[i - 1], ps[i]];
    return a[1] + ((v - a[0]) / (b[0] - a[0])) * (b[1] - a[1]);
  };
}

export function compactFigure(x: Extraction, W: number, H: number, t: Tracing, opts: LayoutOptions): LayoutValue {
  const on = (k: string) => !opts.off.includes(k);
  const byId = new Map(x.elements.map((e) => [e.id, e]));
  const px = (b: number[]): Box => ({ x: (b[0] / 100) * W, y: (b[1] / 100) * H, width: (b[2] / 100) * W, height: (b[3] / 100) * H });
  const drawn = (id: string) => { const b = px(byId.get(id)!.box); return { x: b.x, y: b.y, w: b.width, h: b.height }; };
  const plain = x.elements.filter((e) => e.kind !== 'heading' && e.outline !== 'text only');
  const s = UNIT_H / Math.max(1, median(plain.map((e) => px(e.box).height)));
  const notes: LayoutNotes = { beside: [], emptyRegions: [], behind: [], textClashes: [] };

  // Sizes, in layout units. Headings are set on one line.
  const size = new Map<string, { w: number; h: number }>();
  for (const e of x.elements) {
    if (e.kind === 'heading') size.set(e.id, { w: Math.max(60, (e.label ?? '').length * 0.6 * FONT + 24), h: 36 });
    else size.set(e.id, sizeOf(e, drawn(e.id), s, { sizes: on('sizes'), fit: on('fit'), sublabels: opts.sublabels }));
  }

  // Units: shapes that travel together, keeping their rows as drawn.
  const unitIds = new Map<string, string[]>();
  for (const e of x.elements) { const k = e.kind === 'heading' ? e.id : t.unitOf.get(e.id)?.[0] ?? e.id; unitIds.set(k, [...(unitIds.get(k) ?? []), e.id]); }
  interface Unit { key: string; ids: string[]; w: number; h: number; offset: Map<string, { dx: number; dy: number }>; o: Box; x: number; y: number; wide: boolean; row: number; col: number }
  const units: Unit[] = [...unitIds].map(([key, ids]) => {
    const r = arrangeRows(ids, drawn, (id) => size.get(id)!);
    return { key, ids, w: r.width, h: r.height, offset: r.offset, o: union(ids.map((id) => px(byId.get(id)!.box))), x: 0, y: 0, wide: false, row: -1, col: -1 };
  });
  const unitOf = new Map(units.flatMap((u) => u.ids.map((id) => [id, u] as const)));
  const cx = (b: Box) => b.x + b.width / 2, cy = (b: Box) => b.y + b.height / 2;
  const mw = median(units.map((u) => u.w));
  for (const u of units) u.wide = u.ids.some((id) => ['heading', 'dna'].includes(byId.get(id)!.kind)) || u.w > 2.2 * mw;

  // Rows from the original: shapes whose heights overlap by at least 40% (of the smaller) share a row, so a
  // slightly staggered drawing doesn't become a staircase of rows.
  const overlapShare = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0)) / Math.max(1e-6, Math.min(a1 - a0, b1 - b0));
  const rows: Unit[][] = [];
  for (const u of [...units].sort((a, b) => cy(a.o) - cy(b.o))) {
    const row = rows[rows.length - 1], a = row?.[0].o;
    if (a && overlapShare(a.y, a.y + a.height, u.o.y, u.o.y + u.o.height) >= 0.4) row.push(u); else rows.push([u]);
  }
  rows.forEach((r, i) => r.forEach((u) => (u.row = i)));

  // The compartment of each shape, from the figure (the one it is drawn in).
  const regionOf = (e: Element) => x.regions.find((r) => r.id === e.region)
    ?? x.regions.filter((r) => { const b = px(r.box), c = px(e.box); return cx(c) >= b.x && cx(c) <= b.x + b.width && cy(c) >= b.y && cy(c) <= b.y + b.height; })
      .sort((a, b) => a.box[2] * a.box[3] - b.box[2] * b.box[3])[0] ?? null;
  /** The compartment most of a row's shapes are in. */
  const rowPlace = rows.map((r) => {
    const ks = r.flatMap((u) => u.ids.map((id) => regionOf(byId.get(id)!)?.kind ?? ''));
    return [...ks].sort((p, q) => ks.filter((v) => v === q).length - ks.filter((v) => v === p).length)[0];
  });
  // Row heights from their tallest shapes, even gaps between, and a little more where the compartment changes.
  const rowH = rows.map((r) => Math.max(...r.map((u) => u.h)));
  const rowY: number[] = [];
  rowH.reduce((at, h, i) => { const y = at + (i > 0 && rowPlace[i] !== rowPlace[i - 1] ? COMPARTMENT_GAP : 0); rowY[i] = y; return y + h + GAP_Y; }, 0);
  for (const u of units) u.y = rowY[u.row] + (rowH[u.row] - u.h) / 2;

  // Arrows between units, for the hub and for stretching DNA.
  const unitAt = (id: string) => unitOf.get(id) ?? unitOf.get(x.groups.find((g) => g.id === id)?.members[0] ?? '');
  const links = x.arrows.filter((a) => !a.ends?.from && !a.ends?.to).map((a) => ({ a, f: unitAt(a.from), t: unitAt(a.to) })).filter((l) => l.f && l.t && l.f !== l.t) as { a: Extraction['arrows'][number]; f: Unit; t: Unit }[];
  const regulator = new Set(t.regulators.flatMap((r) => r.members));
  const forward = links.filter((l) => l.a.head !== 'bar' && l.a.meaning !== 'inhibits' && !l.f.ids.some((id) => regulator.has(id)));

  // The hub (rule "hub"): the first shape, going down, that (nearly) all routes lead into: NEMO in Guo, not TAK1
  // (only some routes pass through it) or IκB below it. Placed after the columns, below.
  const order: Unit[][] = [units];
  const spine: Unit[] = [];
  let fan: Unit[] = [];
  const feeders = (u: Unit) => [...new Set(forward.filter((l) => l.t === u).map((l) => l.f))];
  const upstreamOf = (u: Unit) => {
    const seen = new Set<Unit>(), queue = [u];
    while (queue.length) for (const f of feeders(queue.shift()!)) if (!seen.has(f)) { seen.add(f); queue.push(f); }
    return seen;
  };
  const routesInto = (u: Unit) => [...upstreamOf(u)].filter((v) => !feeders(v).length).length;
  const hubs = on('hub') ? units.filter((u) => !u.wide && feeders(u).length >= 2) : [];
  const most = Math.max(0, ...hubs.map(routesInto));
  const hub = hubs.filter((u) => routesInto(u) >= Math.max(2, 0.8 * most)).sort((a, b) => a.row - b.row || cx(a.o) - cx(b.o))[0];
  if (hub) {
    spine.push(hub);
    for (let cur = hub; ;) {
      const next = [...new Set(forward.filter((l) => l.f === cur).map((l) => l.t))].filter((v) => !spine.includes(v) && v.row > cur.row && !v.ids.some((id) => byId.get(id)!.kind === 'heading'));
      if (next.length !== 1) { fan = next; break; }
      spine.push(next[0]); cur = next[0];
    }
  }

  // Columns inside each group, from the original: shapes whose widths overlap by at least 40% share a column (never
  // two of one row). Wide shapes (headings, DNA) take none. The hub and what follows it share one column.
  const tolX = (a: Box, b: Box) => overlapShare(a.x, a.x + a.width, b.x, b.x + b.width) >= 0.4;
  let at = 0;
  for (const group of order) {
    const cols: Unit[][] = [];
    const inGroup = group.filter((u) => !u.wide);
    for (const u of [...inGroup].sort((a, b) => cx(a.o) - cx(b.o))) {
      const col = cols[cols.length - 1];
      if (col && tolX(col[0].o, u.o) && !col.some((v) => v.row === u.row)) col.push(u); else cols.push([u]);
    }
    for (const c of cols) {
      const w = Math.max(...c.map((u) => u.w));
      for (const u of c) u.x = at + (w - u.w) / 2;
      at += w + GAP_X;
    }
    at += GAP_X;
  }
  // The hub goes to the middle of the routes that lead into it, with what follows it straight down below; where
  // that line splits (Guo's two outcomes), the shapes it leads to spread evenly below its end. Left-to-right order
  // is kept, so no new crossings; the grid already spaces the routes evenly.
  if (hub) {
    const ups = [...upstreamOf(hub)].filter((u) => !u.wide);
    const mid = (Math.min(...ups.map((u) => u.x)) + Math.max(...ups.map((u) => u.x + u.w))) / 2;
    for (const u of spine) u.x = mid - u.w / 2;
    if (fan.length >= 2) {
      const total = fan.reduce((sum, u) => sum + u.w, 0) + (fan.length - 1) * 2 * GAP_X;
      let fx = mid - total / 2;
      for (const u of [...fan].sort((a, b) => cx(a.o) - cx(b.o))) { u.x = fx; fx += u.w + 2 * GAP_X; }
    }
  }

  // Wide shapes: a heading over the shapes of its part, a DNA strand under the shapes it joins (or where it was).
  const placedCentre = (us: Unit[]) => { const xs = us.filter((u) => !u.wide); return xs.length ? (Math.min(...xs.map((u) => u.x)) + Math.max(...xs.map((u) => u.x + u.w))) / 2 : null; };
  for (const u of units.filter((v) => v.wide && !spine.includes(v) && !fan.includes(v))) {
    const e = byId.get(u.ids[0])!;
    const mates = e.kind === 'heading'
      ? units.filter((v) => !v.wide && v.ids.some((id) => t.partOf.get(id) === `heading:${e.id}` || (e.panel && byId.get(id)!.panel === e.panel)))
      : links.filter((l) => l.f === u || l.t === u).map((l) => (l.f === u ? l.t : l.f));
    const c = placedCentre(mates.length ? mates : units);
    u.x = (c ?? 0) - u.w / 2;
  }
  // Where the original's positions land, for compartment edges and open arrow ends when compartments don't refit.
  const mapX = through(units.filter((u) => !u.wide).map((u) => [cx(u.o), u.x + u.w / 2]), s);
  const mapY = through(rows.map((r, i) => [median(r.map((u) => cy(u.o))), rowY[i] + rowH[i] / 2]), s);

  // DNA spans the shapes its arrows join (rule "stretch").
  if (on('stretch')) for (const u of units) {
    if (u.ids.length !== 1 || byId.get(u.ids[0])!.kind !== 'dna') continue;
    const partners = links.filter((l) => l.f === u || l.t === u).map((l) => (l.f === u ? l.t : l.f));
    if (partners.length < 2) continue;
    const l = Math.min(...partners.map((p) => p.x)), r = Math.max(...partners.map((p) => p.x + p.w));
    if (r - l <= u.w) continue;
    u.x = l; u.w = r - l;
    size.set(u.ids[0], { w: u.w, h: size.get(u.ids[0])!.h });
  }

  // No overlaps: in each row, a shape overlapping the one on its left moves right (and the rest of the row with it).
  for (let pass = 0; pass < 6; pass++) {
    let moved = false;
    const sorted = [...units].sort((a, b) => a.x - b.x);
    for (let i = 0; i < sorted.length; i++) for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i], b = sorted[j];
      const ox = a.x + a.w + GAP_X / 2 - b.x, oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      // The hub's line stays put: the shape beside it moves instead.
      if (ox > 0 && oy > 0) { if ((spine.includes(b) || fan.includes(b)) && !spine.includes(a) && !fan.includes(a)) a.x -= ox; else b.x += ox; moved = true; }
    }
    if (!moved) break;
  }

  // Every shape's box.
  const box = new Map<string, Box>();
  for (const u of units) for (const id of u.ids) {
    const o = u.offset.get(id)!, z = size.get(id)!;
    box.set(id, u.ids.length === 1 ? { x: u.x, y: u.y, width: u.w, height: z.h } : { x: u.x + o.dx, y: u.y + o.dy, width: z.w, height: z.h });
  }
  const content = union([...box.values()]);

  // Compartments and panels (rule "boxes"): each fits its shapes; a band spans its panel (or the whole figure);
  // the membrane stays a thin band through its receptors. Without the rule, their edges move with the grid.
  const mapped = (b: Box): Box => { const x0 = mapX(b.x), y0 = mapY(b.y); return { x: x0, y: y0, width: mapX(b.x + b.width) - x0, height: mapY(b.y + b.height) - y0 }; };
  const panelOf = (id: string) => byId.get(id)!.panel;
  const regionBoxes = new Map<string, Box>();
  for (const r of x.regions) {
    const mine = x.elements.filter((e) => e.kind !== 'heading' && regionOf(e)?.id === r.id).map((e) => box.get(e.id)!);
    if (!on('boxes')) { regionBoxes.set(r.id, mapped(px(r.box))); continue; }
    if (!mine.length) continue;
    let b = grow(union(mine), PAD);
    if (BANDS.has(r.kind)) {
      const panel = x.elements.find((e) => regionOf(e)?.id === r.id && e.panel)?.panel;
      const scope = panel ? union(x.elements.filter((e) => panelOf(e.id) === panel).map((e) => box.get(e.id)!)) : content;
      b = { ...b, x: scope.x - PAD, width: scope.width + 2 * PAD };
    }
    if (r.kind === MEMBRANE) { const h = Math.max(16, px(r.box).height * s), mid = median(mine.map((m) => cy(m))); b = { ...b, y: mid - h / 2, height: h }; }
    regionBoxes.set(r.id, b);
  }
  // A compartment drawn inside another (the nucleus in the cytoplasm, an endosome) stays inside it.
  const inside = (a: Box, b: Box) => cx(b) >= a.x && cx(b) <= a.x + a.width && cy(b) >= a.y && cy(b) <= a.y + a.height;
  const byArea = [...x.regions].sort((a, b) => a.box[2] * a.box[3] - b.box[2] * b.box[3]);
  for (const small of byArea) for (const big of byArea) {
    if (small === big || big.box[2] * big.box[3] <= small.box[2] * small.box[3] || !inside(px(big.box), px(small.box))) continue;
    const sb = regionBoxes.get(small.id), bb = regionBoxes.get(big.id);
    if (sb && bb && big.kind !== MEMBRANE) regionBoxes.set(big.id, union([bb, grow(sb, PAD)]));
  }
  for (const r of x.regions) if (!regionBoxes.has(r.id)) notes.emptyRegions.push(r.label ?? r.kind.replace('_', ' '));
  const panelBoxes = new Map<string, Box>();
  for (const p of x.panels) {
    const mine = x.elements.filter((e) => e.panel === p.id).map((e) => box.get(e.id)!);
    if (on('boxes')) { if (mine.length) panelBoxes.set(p.id, grow(union(mine), PAD * 1.5)); }
    else panelBoxes.set(p.id, mapped(px(p.box)));
  }

  // Arrows: bows around shapes, then text clear of them.
  const all = [...box.values(), ...regionBoxes.values(), ...panelBoxes.values()];
  const frame = grow(union(all), 24);
  const cw = Math.round(frame.width), ch = Math.round(frame.height);
  const bows = on('bows') ? bendArrows(x, box, 1) : { bend: new Map<string, number>(), behind: [] };
  notes.behind.push(...bows.behind);
  const text = on('labels') ? placeArrowText(x, box, bows.bend, Math.min(Math.max(cw / 90, 8), 14) / 11, true) : { at: new Map(), clashes: [] };
  notes.textClashes.push(...text.clashes);

  // --- in percent of the canvas ---
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  const pct = (b: Box) => [((b.x - frame.x) / cw) * 100, ((b.y - frame.y) / ch) * 100, (b.width / cw) * 100, (b.height / ch) * 100].map(r3);
  const point = (p: { x: number; y: number }) => [((p.x - frame.x) / cw) * 100, ((p.y - frame.y) / ch) * 100].map(r3);
  const boxes: Record<string, number[]> = {};
  for (const [id, b] of box) boxes[id] = pct(b);
  const region: Record<string, string | null> = {};
  for (const e of x.elements) region[e.id] = e.region && regionBoxes.has(e.region) ? e.region : null;
  const arrows: LayoutValue['arrows'] = {};
  for (const a of x.arrows) {
    const at = text.at.get(a.id);
    const entry: LayoutValue['arrows'][string] = { bend: r3(((bows.bend.get(a.id) ?? 0) / cw) * 100), textAt: at ? point(at) : null };
    if (a.ends?.from || a.ends?.to) {
      const end = (p: number[] | null | undefined) => (p ? point({ x: mapX((p[0] / 100) * W), y: mapY((p[1] / 100) * H) }) : null);
      entry.ends = { from: end(a.ends.from), to: end(a.ends.to) };
    }
    arrows[a.id] = entry;
  }
  const regionsOut = x.regions.filter((r) => regionBoxes.has(r.id)).map((r) => ({ ...r, box: pct(regionBoxes.get(r.id)!) }))
    .sort((a, b) => b.box[2] * b.box[3] - a.box[2] * a.box[3]);
  return {
    opts, canvas: [cw, ch], boxes, region, regions: regionsOut,
    panels: x.panels.filter((p) => panelBoxes.has(p.id)).map((p) => ({ ...p, box: pct(panelBoxes.get(p.id)!) })),
    arrows, notes,
  };
}
