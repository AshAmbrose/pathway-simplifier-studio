/**
 * Arrows in step 5, shared by both ways of laying out (tidy.ts and adapt.ts):
 *  - an arrow that would pass behind a shape it doesn't join bows around it (BioPathway Studio's rule, from
 *    cellLayout.ts, applied to the shapes themselves); two-way pairs bow to opposite sides;
 *  - arrow text is placed clear of shapes, lines and other text (BioPathway Studio's edgeLabelLayout.ts).
 * Positions are boxes in whatever units the caller works in; `unit` scales the bow sizes to them
 * (1 = a protein 40 high).
 */
import { edgeGeometry } from '../render/edgeGeometry.ts';
import type { Extraction } from '../types/extraction.ts';
import type { LEdge, LNode } from './cellLayout.ts';
import { layoutEdgeLabels } from './edgeLabelLayout.ts';

export interface Box { x: number; y: number; width: number; height: number }
type Arrow = Extraction['arrows'][number];

/** A point on a cubic curve at t (0–1). */
export function bezier(g: { p1: { x: number; y: number }; cp1: { x: number; y: number }; cp2: { x: number; y: number }; p2: { x: number; y: number } }, t: number) {
  const u = 1 - t;
  return {
    x: u * u * u * g.p1.x + 3 * u * u * t * g.cp1.x + 3 * u * t * t * g.cp2.x + t * t * t * g.p2.x,
    y: u * u * u * g.p1.y + 3 * u * u * t * g.cp1.y + 3 * u * t * t * g.cp2.y + t * t * t * g.p2.y,
  };
}

type P = { x: number; y: number };
const orient = (p: P, q: P, r: P) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
/** Do segments a–b and c–d cross? */
const cross = (a: P, b: P, c: P, d: P) => orient(a, b, c) * orient(a, b, d) < 0 && orient(c, d, a) * orient(c, d, b) < 0;

/** The box of a shape, or of a cluster around its shapes. */
export function endBoxes(x: Extraction, box: Map<string, Box>) {
  const groupBox = (id: string): Box | null => {
    const g = x.groups.find((v) => v.id === id);
    const bs = (g?.members ?? []).map((m) => box.get(m)).filter((b): b is Box => !!b);
    if (!bs.length) return null;
    const pad = Math.min(4, ...bs.map((b) => b.height * 0.15));
    const x0 = Math.min(...bs.map((b) => b.x)) - pad, y0 = Math.min(...bs.map((b) => b.y)) - pad;
    return { x: x0, y: y0, width: Math.max(...bs.map((b) => b.x + b.width)) + pad - x0, height: Math.max(...bs.map((b) => b.y + b.height)) + pad - y0 };
  };
  return { groupBox, endBox: (id: string) => box.get(id) ?? groupBox(id) };
}

/** Arrows drawn between two shapes or clusters (not ending in open space). */
export const drawnArrows = (x: Extraction, box: Map<string, Box>) => {
  const { endBox } = endBoxes(x, box);
  return x.arrows.filter((a) => !a.ends?.from && !a.ends?.to && endBox(a.from) && endBox(a.to));
};

/** Bows: per arrow, how far it bows (0 = straight), and the arrows still behind a shape however they bow. */
export function bendArrows(x: Extraction, box: Map<string, Box>, unit: number, together?: (id: string) => string[]): { bend: Map<string, number>; behind: string[] } {
  const { endBox } = endBoxes(x, box);
  // An arrow may run over the shapes at its ends, and over shapes drawn together with them (TAK1 on TAB2/3).
  const inside = (id: string) => { const own = [id, ...(x.groups.find((g) => g.id === id)?.members ?? [])]; return new Set([...own, ...own.flatMap((m) => together?.(m) ?? [])]); };
  const shapes = [...box].filter(([id]) => x.elements.some((e) => e.id === id && e.kind !== 'heading'));
  const passesBehind = (a: Arrow, bend: number) => {
    const g = edgeGeometry(endBox(a.from)!, endBox(a.to)!, false, bend);
    const skip = new Set([...inside(a.from), ...inside(a.to)]);
    return shapes.some(([id, b]) => {
      if (skip.has(id)) return false;
      const m = Math.min(4, Math.min(b.width, b.height) * 0.2);
      for (let i = 1; i < 30; i++) { const p = bezier(g, i / 30); if (p.x > b.x + m && p.x < b.x + b.width - m && p.y > b.y + m && p.y < b.y + b.height - m) return true; }
      return false;
    });
  };
  const CURVES = [70, -70, 120, -120, 180, -180, 250, -250, 330, -330].map((c) => c * unit);
  const bend = new Map<string, number>(), behind: string[] = [];
  const drawn = drawnArrows(x, box).filter((a) => a.from !== a.to);
  // A bow is only worth it if the bowed line crosses no more of the other arrows than the straight one does.
  const line = (a: Arrow, b: number) => { const g = edgeGeometry(endBox(a.from)!, endBox(a.to)!, false, b); return Array.from({ length: 17 }, (_, i) => bezier(g, i / 16)); };
  const ends = (a: Arrow) => new Set([...inside(a.from), ...inside(a.to)]);
  const crossings = (a: Arrow, b: number) => {
    const mine = line(a, b), skip = ends(a);
    return drawn.filter((o) => o !== a && ![...ends(o)].some((id) => skip.has(id))).filter((o) => {
      const theirs = line(o, bend.get(o.id) ?? 0);
      return mine.slice(1).some((p, i) => theirs.slice(1).some((q, j) => cross(mine[i], p, theirs[j], q)));
    }).length;
  };
  for (const a of drawn) {
    if (!passesBehind(a, 0)) { bend.set(a.id, 0); continue; }
    const straight = crossings(a, 0);
    // A short arrow bowed hard turns into a loop: no bow deeper than about half the arrow's length.
    const s1 = endBox(a.from)!, s2 = endBox(a.to)!;
    const length = Math.hypot(s2.x + s2.width / 2 - s1.x - s1.width / 2, s2.y + s2.height / 2 - s1.y - s1.height / 2);
    const c = CURVES.filter((v) => Math.abs(v) * 1.5 <= 0.6 * length).find((v) => !passesBehind(a, v) && crossings(a, v) <= straight);
    bend.set(a.id, c ?? 0);
    if (c === undefined) behind.push(a.id);
  }
  // Two-way pairs would draw on top of each other: each bows to its own side.
  for (const a of drawn) {
    const back = drawn.find((b) => b !== a && b.from === a.to && b.to === a.from);
    if (back && !bend.get(a.id) && !bend.get(back.id)) { bend.set(a.id, 40 * unit); bend.set(back.id, 40 * unit); }
  }
  return { bend, behind };
}

/**
 * Where arrow text goes, clear of shapes, other lines and other text. `fontScale` sizes the text as it will be
 * drawn (1 = about 11 units). With `onlyClashing`, text already clear where the figure put it (the middle of
 * its arrow) stays there; only the rest is moved. Returns the centre of each placed text, and any that clash.
 */
export function placeArrowText(x: Extraction, box: Map<string, Box>, bend: Map<string, number>, fontScale: number, onlyClashing: boolean) {
  const { groupBox, endBox } = endBoxes(x, box);
  const shapes = [...box].filter(([id]) => x.elements.some((e) => e.id === id && e.kind !== 'heading'));
  const withText = drawnArrows(x, box).filter((a) => a.text && a.from !== a.to);
  const size = (t: string) => ({ w: Math.max(38, t.length * 6.2 + 16) * fontScale, h: 19 * fontScale });
  const rectAt = (c: { x: number; y: number }, t: string) => { const s = size(t); return { x1: c.x - s.w / 2, y1: c.y - s.h / 2, x2: c.x + s.w / 2, y2: c.y + s.h / 2 }; };
  const hitsShape = (r: ReturnType<typeof rectAt>) => shapes.some(([, b]) => r.x1 < b.x + b.width && b.x < r.x2 && r.y1 < b.y + b.height && b.y < r.y2);
  const mid = (a: Arrow) => { const g = edgeGeometry(endBox(a.from)!, endBox(a.to)!, false, bend.get(a.id) ?? 0); return bezier(g, 0.5); };

  const keep = onlyClashing ? withText.filter((a) => !hitsShape(rectAt(mid(a), a.text!))) : [];
  const move = withText.filter((a) => !keep.includes(a));
  const lnodes: LNode[] = [...shapes.map(([id, b]) => ({ id, label: null, ...b })),
    ...x.groups.filter((g) => move.some((a) => a.from === g.id || a.to === g.id)).map((g) => ({ id: g.id, label: g.label, ...(groupBox(g.id) ?? { x: 0, y: 0, width: 0, height: 0 }) }))];
  const ledges: LEdge[] = move.map((a) => ({ id: a.id, sourceNodeId: a.from, targetNodeId: a.to, curvature: bend.get(a.id) ?? 0, label: a.text }));
  const placed = layoutEdgeLabels(ledges, lnodes, 'below', fontScale);
  const at = new Map<string, { x: number; y: number }>();
  for (const a of keep) at.set(a.id, mid(a));
  for (const [id, b] of placed) at.set(id, { x: b.x, y: b.y });
  const rects = [...at].map(([id, c]) => ({ id, ...rectAt(c, withText.find((a) => a.id === id)!.text!) }));
  const clashes = rects.filter((r) => hitsShape(r) || rects.some((o) => o !== r && r.x1 < o.x2 && o.x1 < r.x2 && r.y1 < o.y2 && o.y1 < r.y2)).map((r) => r.id);
  return { at, clashes };
}
