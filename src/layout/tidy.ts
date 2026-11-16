/**
 * Step 5, "Tidy the original" (the default): keeps the authors' arrangement and scale, and only cleans it up.
 * A published figure is usually laid out with care; redrawing it from scratch (adapt.ts) throws that away.
 *
 * Shapes that travel together (a cluster, shapes drawn touching) move as one unit. Each rule can be switched off:
 *  - align:    units nearly in one column or row are put exactly in line (small moves only);
 *  - overlaps: a unit covering another (a collapsed cluster from step 4 over a shape left out of it) is moved clear;
 *  - gaps:     empty space wider than two shapes (left where step 2 took out a route) shrinks to that;
 *  - crop:     the picture shrinks to what is left;
 *  - bows:     an arrow passing behind a shape bows around it;
 *  - labels:   arrow text sitting on a shape is moved to a clear spot nearby; text that is clear stays put.
 * Compartments and panels move with the space around them, and grow if a shape would stick out.
 * Works in the original image's pixels; the result keeps that scale, cropped (its canvas).
 */
import type { Tracing } from '../simplify/routes.ts';
import type { Extraction } from '../types/extraction.ts';
import { bendArrows, placeArrowText, type Box } from './arrows.ts';
import type { LayoutNotes, LayoutOptions, LayoutValue } from './value.ts';

export const TIDY_RULES = [
  { key: 'align', name: 'Line up', why: 'Shapes nearly in one row or column are put exactly in line.' },
  { key: 'overlaps', name: 'No overlaps', why: 'A shape covering another (a collapsed cluster, say) is moved clear.' },
  { key: 'gaps', name: 'Close gaps', why: 'Empty space left where parts were taken out shrinks to a normal gap.' },
  { key: 'crop', name: 'Crop to what is left', why: 'The picture shrinks to the shapes that remain.' },
  { key: 'bows', name: 'Arrows around shapes', why: 'An arrow passing behind a shape bows around it.' },
  { key: 'labels', name: 'Arrow text clear', why: 'Text sitting on a shape moves to a clear spot nearby.' },
] as const;

const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 1; };
const union = (bs: Box[]): Box => {
  const x0 = Math.min(...bs.map((b) => b.x)), y0 = Math.min(...bs.map((b) => b.y));
  return { x: x0, y: y0, width: Math.max(...bs.map((b) => b.x + b.width)) - x0, height: Math.max(...bs.map((b) => b.y + b.height)) - y0 };
};

/**
 * A squeeze along one axis: every empty stretch between occupied spans that is longer than `keep` becomes
 * `keep` long. Returns the map (monotone, so nothing changes order) as a function of a coordinate.
 */
function squeeze(spans: [number, number][], keep: number): (v: number) => number {
  const sorted = [...spans].sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const s of sorted) { const last = merged[merged.length - 1]; if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1]); else merged.push([...s]); }
  const gaps = merged.slice(1).map((s, i) => [merged[i][1], s[0]] as [number, number]).filter(([a, b]) => b - a > keep);
  return (v) => {
    let out = v;
    for (const [a, b] of gaps) {
      if (v >= b) out -= b - a - keep;
      else if (v > a) out -= (v - a) * (1 - keep / (b - a));
    }
    return out;
  };
}

export function tidyFigure(x: Extraction, W: number, H: number, t: Tracing, opts: LayoutOptions): LayoutValue {
  const on = (k: string) => !opts.off.includes(k);
  const px = (b: number[]): Box => ({ x: (b[0] / 100) * W, y: (b[1] / 100) * H, width: (b[2] / 100) * W, height: (b[3] / 100) * H });
  const box = new Map<string, Box>(x.elements.map((e) => [e.id, px(e.box)]));
  const shapes = x.elements.filter((e) => e.kind !== 'heading' && e.outline !== 'text only');
  const mw = median(shapes.map((e) => box.get(e.id)!.width)), mh = median(shapes.map((e) => box.get(e.id)!.height));
  const notes: LayoutNotes = { beside: [], emptyRegions: [], behind: [], textClashes: [] };

  // Units: what travels together; a heading is its own.
  const units = new Map<string, string[]>();
  for (const e of x.elements) { const k = e.kind === 'heading' ? e.id : t.unitOf.get(e.id)?.[0] ?? e.id; units.set(k, [...(units.get(k) ?? []), e.id]); }
  const ub = (k: string) => union(units.get(k)!.map((id) => box.get(id)!));
  const shift = (k: string, dx: number, dy: number) => { for (const id of units.get(k)!) { const b = box.get(id)!; box.set(id, { ...b, x: b.x + dx, y: b.y + dy }); } };
  const keys = [...units.keys()];
  const isHeading = (k: string) => x.elements.find((e) => e.id === k)?.kind === 'heading';

  // Line up: centres within a third of a shape of each other share one column (or row), unless they sit side by
  // side (or one above the other), which would make them collide.
  if (on('align')) for (const axis of ['x', 'y'] as const) {
    const tol = 0.35 * (axis === 'x' ? mw : mh);
    const c = (k: string) => { const b = ub(k); return axis === 'x' ? b.x + b.width / 2 : b.y + b.height / 2; };
    const across = (a: Box, b: Box) => (axis === 'x' ? Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) : Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
    const sorted = keys.filter((k) => !isHeading(k)).sort((a, b) => c(a) - c(b));
    const runs: string[][] = [];
    for (const k of sorted) { const run = runs[runs.length - 1]; if (run && c(k) - c(run[0]) <= tol && run.every((o) => across(ub(o), ub(k)) <= 0)) run.push(k); else runs.push([k]); }
    for (const run of runs) {
      if (run.length < 2) continue;
      const mean = run.reduce((s, k) => s + c(k), 0) / run.length;
      for (const k of run) shift(k, axis === 'x' ? mean - c(k) : 0, axis === 'y' ? mean - c(k) : 0);
    }
  }

  // No overlaps: where a shape covers a shape of another unit, the smaller unit moves the shortest way clear.
  if (on('overlaps')) for (let pass = 0; pass < 8; pass++) {
    let moved = false;
    for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
      let worst: { a: Box; b: Box } | null = null, most = 0;
      for (const ia of units.get(keys[i])!) for (const ib of units.get(keys[j])!) {
        const a = box.get(ia)!, b = box.get(ib)!;
        const ox = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x), oy = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
        const share = ox > 0 && oy > 0 ? (ox * oy) / Math.min(a.width * a.height, b.width * b.height) : 0;
        if (share > 0.15 && share > most) { most = share; worst = { a, b }; }
      }
      if (!worst) continue;
      const iSmall = ub(keys[i]).width * ub(keys[i]).height <= ub(keys[j]).width * ub(keys[j]).height;
      const small = iSmall ? keys[i] : keys[j], sb = iSmall ? worst.a : worst.b, bb = iSmall ? worst.b : worst.a;
      const gap = 0.3 * mh;
      const dx = sb.x + sb.width / 2 < bb.x + bb.width / 2 ? -(sb.x + sb.width - bb.x + gap) : bb.x + bb.width - sb.x + gap;
      const dy = sb.y + sb.height / 2 < bb.y + bb.height / 2 ? -(sb.y + sb.height - bb.y + gap) : bb.y + bb.height - sb.y + gap;
      if (Math.abs(dx) <= Math.abs(dy)) shift(small, dx, 0); else shift(small, 0, dy);
      moved = true;
    }
    if (!moved) break;
  }

  // Close gaps: one squeeze per axis, applied to shapes (by unit), compartments, panels and open arrow ends alike.
  const all = keys.map(ub);
  const fx = on('gaps') ? squeeze(all.map((b) => [b.x, b.x + b.width]), 2 * mw) : (v: number) => v;
  const fy = on('gaps') ? squeeze(all.map((b) => [b.y, b.y + b.height]), 2 * mh) : (v: number) => v;
  for (const k of keys) { const b = ub(k); shift(k, fx(b.x) - b.x, fy(b.y) - b.y); }
  const mapBox = (b: Box): Box => { const x0 = fx(b.x), y0 = fy(b.y); return { x: x0, y: y0, width: fx(b.x + b.width) - x0, height: fy(b.y + b.height) - y0 }; };
  let regionBoxes = x.regions.map((r) => ({ r, b: mapBox(px(r.box)) }));
  let panelBoxes = x.panels.map((p) => ({ p, b: mapBox(px(p.box)) }));

  // Compartments grow to hold a shape that a move left outside them (its middle is outside). A shape drawn across
  // the edge, like a receptor through the membrane, has its middle inside and is left as drawn.
  for (const e of x.elements) {
    const rb = regionBoxes.find((v) => v.r.id === e.region);
    if (!rb) continue;
    const b = box.get(e.id)!, pad = 0.15 * mh;
    const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    if (cx >= rb.b.x && cx <= rb.b.x + rb.b.width && cy >= rb.b.y && cy <= rb.b.y + rb.b.height) continue;
    rb.b = union([rb.b, { x: b.x - pad, y: b.y - pad, width: b.width + 2 * pad, height: b.height + 2 * pad }]);
  }

  // Crop: the box around every shape, with a margin; compartments and panels are cut to it.
  const shapesBox = union([...box.values()]);
  const margin = 0.6 * mh;
  const frame: Box = on('crop')
    ? { x: shapesBox.x - margin, y: shapesBox.y - margin, width: shapesBox.width + 2 * margin, height: shapesBox.height + 2 * margin }
    : union([{ x: 0, y: 0, width: fx(W), height: fy(H) }, shapesBox]);
  const clip = (b: Box): Box | null => {
    const x0 = Math.max(b.x, frame.x), y0 = Math.max(b.y, frame.y), x1 = Math.min(b.x + b.width, frame.x + frame.width), y1 = Math.min(b.y + b.height, frame.y + frame.height);
    return x1 - x0 > 1 && y1 - y0 > 1 ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : null;
  };
  const keptRegions = regionBoxes.map((v) => ({ ...v, b: clip(v.b) })).filter((v): v is { r: typeof v.r; b: Box } => !!v.b);
  for (const v of regionBoxes) if (!keptRegions.some((k) => k.r.id === v.r.id)) notes.emptyRegions.push(v.r.label ?? v.r.kind.replace('_', ' '));
  regionBoxes = keptRegions;
  panelBoxes = panelBoxes.map((v) => ({ ...v, b: clip(v.b) })).filter((v): v is { p: typeof v.p; b: Box } => !!v.b);

  // Arrows: bows around shapes, then text clear of them, at the size it will be drawn.
  const cw = Math.round(frame.width), ch = Math.round(frame.height);
  const bows = on('bows') ? bendArrows(x, box, mh / 40, (id) => t.unitOf.get(id) ?? []) : { bend: new Map<string, number>(), behind: [] };
  notes.behind.push(...bows.behind);
  const text = on('labels') ? placeArrowText(x, box, bows.bend, Math.min(Math.max(cw / 90, 8), 14) / 11, true) : { at: new Map(), clashes: [] };
  notes.textClashes.push(...text.clashes);

  // --- in percent of the new canvas ---
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  const pct = (b: Box) => [((b.x - frame.x) / cw) * 100, ((b.y - frame.y) / ch) * 100, (b.width / cw) * 100, (b.height / ch) * 100].map(r3);
  const point = (p: { x: number; y: number }) => [((p.x - frame.x) / cw) * 100, ((p.y - frame.y) / ch) * 100].map(r3);
  const boxes: Record<string, number[]> = {};
  for (const [id, b] of box) boxes[id] = pct(b);
  const region: Record<string, string | null> = {};
  for (const e of x.elements) region[e.id] = e.region && regionBoxes.some((v) => v.r.id === e.region) ? e.region : null;
  const arrows: LayoutValue['arrows'] = {};
  for (const a of x.arrows) {
    const at = text.at.get(a.id);
    const entry: LayoutValue['arrows'][string] = { bend: r3(((bows.bend.get(a.id) ?? 0) / cw) * 100), textAt: at ? point(at) : null };
    if (a.ends?.from || a.ends?.to) {
      const end = (p: number[] | null | undefined) => (p ? point({ x: fx((p[0] / 100) * W), y: fy((p[1] / 100) * H) }) : null);
      entry.ends = { from: end(a.ends.from), to: end(a.ends.to) };
    }
    arrows[a.id] = entry;
  }
  return {
    opts, canvas: [cw, ch], boxes, region,
    regions: regionBoxes.map(({ r, b }) => ({ ...r, box: pct(b) })),
    panels: panelBoxes.map(({ p, b }) => ({ ...p, box: pct(b) })),
    arrows, notes,
  };
}
