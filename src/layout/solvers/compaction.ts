/**
 * Step 5, "Squeeze": order-kept compaction. The authors' arrangement already reads well (the originals score as
 * well as any solver on crossings), so this keeps it and squeezes out the wasted space, the way chip layouts are
 * compacted. It is a set of linear rules handed to a constraint solver (kiwi.js, BSD-3-Clause, the Cassowary method):
 *
 *  must hold (required):
 *   - every pair of neighbours in one compartment keeps the side they were on in the original (left of, or above),
 *     with a gap, so nothing overlaps and no new crossing can come from reordering;
 *   - each shape sits inside its compartment (room at the top for the compartment's name);
 *   - compartments keep a cell's order down the page; side-by-side panels keep theirs across it;
 *   - every shape is its standard size (shapes.ts), so space left by hidden routes closes up;
 *  should hold (medium): shapes level in the original stay level, and shapes stacked in a column (an arrow
 *   running straight down) stay in a column; the other order between neighbours is kept;
 *  as small as possible (medium): the canvas's width plus height;
 *  if there is room (weak): each shape stays where it was, scaled down evenly (one scale across, one down).
 */
import * as kiwi from 'kiwi.js';
import type { Tracing } from '../../simplify/routes.ts';
import type { Extraction } from '../../types/extraction.ts';
import type { Box } from '../arrows.ts';
import type { LayoutOptions, LayoutValue } from '../value.ts';
import { buildGraph, toValue } from './graph.ts';

const { Solver, Variable, Expression: E, Constraint, Operator, Strength } = kiwi;
type V = kiwi.Variable;
/** Gaps between neighbours, in layout units (a protein is 40 high). Arrows need a longer gap to be seen. */
const GAP = { x: 22, y: 22, arrowX: 40, arrowY: 44, panel: 70 };
const PAD = { top: 28, side: 12, bottom: 12 };
const ALIGN = { level: 10, column: 14 };

/** Something with a box the solver moves: a unit (fixed size) or a compartment or panel (sized by its contents). */
interface Item { id: string; l: V; t: V; r: V; b: V; orig: Box }

export function compactionLayout(x: Extraction, W: number, H: number, t: Tracing, opts: LayoutOptions): LayoutValue {
  const g = buildGraph(x, W, H, t, opts);
  const s = new Solver();
  const add = (e: kiwi.Expression | V, op: kiwi.Operator, rhs: kiwi.Expression | V | number, st = Strength.required) => s.addConstraint(new Constraint(e, op, rhs, st));
  const le = (a: kiwi.Expression | V, b: kiwi.Expression | V | number, st?: number) => add(a, Operator.Le, b, st);
  const eq = (a: kiwi.Expression | V, b: kiwi.Expression | V | number, st?: number) => add(a, Operator.Eq, b, st);
  const plus = (v: V, n: number) => new E(v, n);
  const mid = (a: V, b: V) => new E([0.5, a], [0.5, b]);
  const item = (id: string, orig: Box): Item => ({ id, l: new Variable(`${id}.l`), t: new Variable(`${id}.t`), r: new Variable(`${id}.r`), b: new Variable(`${id}.b`), orig });
  const union = (bs: Box[]): Box => {
    const x0 = Math.min(...bs.map((b) => b.x)), y0 = Math.min(...bs.map((b) => b.y));
    return { x: x0, y: y0, width: Math.max(...bs.map((b) => b.x + b.width)) - x0, height: Math.max(...bs.map((b) => b.y + b.height)) - y0 };
  };

  // Units: fixed size.
  const unit = new Map(g.units.map((u) => { const it = item(`u:${u.key}`, u.orig); eq(it.r, plus(it.l, u.w)); eq(it.b, plus(it.t, u.h)); return [u.key, it]; }));
  // Units drawn in no compartment join the band they sit level with in the original (Guo's "Growth factor, UV").
  const regionOf = new Map(g.units.map((u) => {
    if (u.region) return [u.key, u.region];
    const near = g.units.filter((v) => v.region && v.panel === u.panel).sort((a, b) => Math.abs(a.orig.y - u.orig.y) - Math.abs(b.orig.y - u.orig.y))[0];
    return [u.key, near?.region ?? null];
  }));
  // Compartments: boxes around their units and organelles.
  const region = new Map<string, Item>();
  const regionOrig = (rid: string): Box => union([
    ...g.units.filter((u) => regionOf.get(u.key) === rid).map((u) => u.orig),
    ...g.regions.filter((v) => v.parent === rid).map((v) => regionOrig(v.r.id)),
  ]);
  for (const v of g.regions) region.set(v.r.id, item(`r:${v.r.id}`, regionOrig(v.r.id)));
  const inside = (outer: Item, inner: Item, pad = PAD) => {
    le(plus(outer.l, pad.side), inner.l); le(plus(inner.r, pad.side), outer.r);
    le(plus(outer.t, pad.top), inner.t); le(plus(inner.b, pad.bottom), outer.b);
  };

  // Siblings: what sits directly in one container. Neighbours among them keep their side, with a gap.
  const linked = new Set(g.edges.flatMap((e) => [`${e.from}|${e.to}`, `${e.to}|${e.from}`]));
  const keepApart = (sib: Item[]) => {
    for (let i = 0; i < sib.length; i++) for (let j = i + 1; j < sib.length; j++) {
      const a = sib[i], b = sib[j], A = a.orig, B = b.orig;
      const gx = Math.max(B.x - (A.x + A.width), A.x - (B.x + B.width));
      const gy = Math.max(B.y - (A.y + A.height), A.y - (B.y + B.height));
      const arrow = linked.has(`${a.id.slice(2)}|${b.id.slice(2)}`);
      const acx = A.x + A.width / 2, bcx = B.x + B.width / 2, acy = A.y + A.height / 2, bcy = B.y + B.height / 2;
      // The axis they are already apart on (if they overlapped in the original, the one they overlap least on).
      if (gx >= gy) {
        const [L, R] = acx <= bcx ? [a, b] : [b, a];
        le(plus(L.r, arrow ? GAP.arrowX : GAP.x), R.l);
        if (Math.abs(acy - bcy) <= ALIGN.level) eq(mid(a.t, a.b), mid(b.t, b.b), Strength.medium);
        else { const [T, D] = acy < bcy ? [a, b] : [b, a]; le(mid(T.t, T.b), mid(D.t, D.b), Strength.medium); }
      } else {
        const [T, D] = acy <= bcy ? [a, b] : [b, a];
        le(plus(T.b, arrow ? GAP.arrowY : GAP.y), D.t);
        if (Math.abs(acx - bcx) <= ALIGN.column) eq(mid(a.l, a.r), mid(b.l, b.r), Strength.medium);
        else { const [L, R] = acx < bcx ? [a, b] : [b, a]; le(mid(L.l, L.r), mid(R.l, R.r), Strength.medium); }
      }
    }
  };
  for (const v of g.regions) {
    const me = region.get(v.r.id)!;
    const kids = [...g.units.filter((u) => regionOf.get(u.key) === v.r.id).map((u) => unit.get(u.key)!), ...g.regions.filter((c) => c.parent === v.r.id).map((c) => region.get(c.r.id)!)];
    for (const k of kids) inside(me, k);
    keepApart(kids);
  }
  // Arrows between compartments (a receptor to its adaptor): straight down if they were drawn so, else keep their side.
  for (const e of g.edges) {
    const a = unit.get(e.from)!, b = unit.get(e.to)!;
    if (regionOf.get(e.from) === regionOf.get(e.to)) continue;
    const dx = (b.orig.x + b.orig.width / 2) - (a.orig.x + a.orig.width / 2);
    if (Math.abs(dx) <= ALIGN.column) eq(mid(a.l, a.r), mid(b.l, b.r), Strength.medium);
    else if (dx > 0) le(mid(a.l, a.r), mid(b.l, b.r), Strength.medium);
    else le(mid(b.l, b.r), mid(a.l, a.r), Strength.medium);
  }

  // Panels side by side (Wnt OFF | ON), each holding its bands; bands of a cell stacked in its order.
  const W_ = new Variable('W'), H_ = new Variable('H');
  const panel = new Map(g.panels.map((p) => [p, item(`p:${p}`, union(g.units.filter((u) => u.panel === p).map((u) => u.orig)))]));
  const groups = g.panels.length ? g.panels : [null];
  const tops: Item[] = [];
  for (const p of groups) {
    const bands = g.regions.filter((v) => !v.parent && (v.panel ?? null) === p).sort((a, b) => a.rank - b.rank || region.get(a.r.id)!.orig.y - region.get(b.r.id)!.orig.y);
    const loose = g.units.filter((u) => !regionOf.get(u.key) && (u.panel ?? null) === p).map((u) => unit.get(u.key)!);
    const level = [...bands.map((v) => region.get(v.r.id)!), ...loose];
    for (let i = 0; i + 1 < bands.length; i++) {
      const a = region.get(bands[i].r.id)!, b = region.get(bands[i + 1].r.id)!;
      if (bands[i].rank === bands[i + 1].rank) keepApart([a, b]);
      else le(a.b, b.t);
    }
    keepApart(loose.length ? level : []);
    const pi = p ? panel.get(p)! : null;
    if (pi) for (const k of level) inside(pi, k, { top: 16, side: 16, bottom: 16 });
    tops.push(...(pi ? [pi] : level));
  }
  for (let i = 0; i + 1 < g.panels.length; i++) {
    const a = panel.get(g.panels[i])!, b = panel.get(g.panels[i + 1])!;
    le(plus(a.r, GAP.panel), b.l); eq(a.t, b.t, Strength.strong);
  }
  for (const k of tops) { add(k.l, Operator.Ge, 0); add(k.t, Operator.Ge, 0); le(k.r, W_); le(k.b, H_); }

  // As small as possible; where there is slack, stay where the original put things, scaled evenly.
  eq(new E(W_, H_), 0, Strength.medium);
  const kx = new Variable('kx'), ky = new Variable('ky');
  add(kx, Operator.Ge, 0.2); add(ky, Operator.Ge, 0.2);
  const x0 = Math.min(...g.units.map((u) => u.orig.x)), y0 = Math.min(...g.units.map((u) => u.orig.y));
  for (const it of unit.values()) {
    eq(new E(it.l, [-(it.orig.x - x0), kx]), 0, Strength.weak);
    eq(new E(it.t, [-(it.orig.y - y0), ky]), 0, Strength.weak);
  }
  s.updateVariables();

  const at = new Map([...unit].map(([k, it]) => [k, { x: it.l.value(), y: it.t.value() }]));
  const box = (it: Item): Box => ({ x: it.l.value(), y: it.t.value(), width: it.r.value() - it.l.value(), height: it.b.value() - it.t.value() });
  const regionBox = new Map([...region].map(([k, it]) => [k, box(it)]));
  const panelBox = new Map([...panel].map(([k, it]) => [k, box(it)]));
  return toValue(x, g, t, opts, at, regionBox, panelBox);
}
