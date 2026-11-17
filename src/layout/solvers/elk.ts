/**
 * Step 5 prototype: the layered (Sugiyama) layout from ELK, the Eclipse Layout Kernel (elkjs, EPL-2.0).
 * The figure becomes a nested graph:
 *  - panels side by side (Wnt OFF | ON), each holding its compartments;
 *  - compartments stacked in a cell's order (outside, membrane, cytoplasm, nucleus) by ELK's partitions; an
 *    organelle sits inside the cytoplasm;
 *  - units (shapes that travel together) as fixed-size boxes inside their compartment.
 * ELK then ranks units so arrows run downward with the least total length, orders each row to cut crossings
 * (starting from the original's left-to-right order: "model order"), and places them so long routes run straight.
 */
import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkExtendedEdge, ElkNode } from 'elkjs/lib/elk-api';
import type { Tracing } from '../../simplify/routes.ts';
import type { Extraction } from '../../types/extraction.ts';
import type { Box } from '../arrows.ts';
import type { LayoutOptions, LayoutValue } from '../value.ts';
import { buildGraph, toValue } from './graph.ts';

const elk = new ELK();

/** `tune` overrides ELK options, for trying settings (scripts/compare-layouts.ts). */
export async function elkLayout(x: Extraction, W: number, H: number, t: Tracing, opts: LayoutOptions, tune: Record<string, string> = {}): Promise<LayoutValue> {
  const g = buildGraph(x, W, H, t, opts);
  const byOrder = <T extends { ox: number; oy: number }>(a: T, b: T) => a.ox - b.ox || a.oy - b.oy;
  const unitNode = (u: (typeof g.units)[number]) => ({ id: `u:${u.key}`, width: u.w, height: u.h, ox: u.orig.x + u.orig.width / 2, oy: u.orig.y });
  // Compartment boxes leave room for their name at the top.
  const compound = { 'elk.padding': '[top=30,left=14,bottom=14,right=14]' };
  // The membrane is a line, not a room (BioPathway Studio's rule): its units sit in one row, in the original's
  // left-to-right order, and ELK sees the whole membrane as one fixed box. Each unit gets a connection point on its
  // top and bottom edge, so arrows still start and end at the right receptor. Arrows between two membrane units
  // (Hu's receptor steps 1 to 3) are left out of ELK's problem: they run along the membrane.
  const PAD = { top: 30, side: 14, bottom: 14 }, GAP = 22;
  const membrane = new Map<string, { w: number; h: number; place: Map<string, { dx: number; dy: number }> }>();
  for (const v of g.regions.filter((r) => r.r.kind === 'plasma_membrane')) {
    const row = g.units.filter((u) => u.region === v.r.id).sort((a, b) => a.orig.x + a.orig.width / 2 - (b.orig.x + b.orig.width / 2));
    const h = Math.max(...row.map((u) => u.h));
    const place = new Map<string, { dx: number; dy: number }>();
    let cx = PAD.side;
    for (const u of row) { place.set(u.key, { dx: cx, dy: PAD.top + (h - u.h) / 2 }); cx += u.w + GAP; }
    membrane.set(v.r.id, { w: cx - GAP + PAD.side, h: PAD.top + h + PAD.bottom, place });
  }
  const membraneOf = new Map<string, string>();
  for (const [rid, m] of membrane) for (const k of m.place.keys()) membraneOf.set(k, rid);
  /** Where an arrow ends in ELK's problem: the unit, or its connection point on the membrane box. */
  const endpoint = (unit: string, side: 'in' | 'out') => (membraneOf.has(unit) ? `pt:${unit}:${side}` : `u:${unit}`);
  const regionNode = (rid: string): ElkNode & { ox: number; oy: number } => {
    const reg = g.regions.find((v) => v.r.id === rid)!;
    const m = membrane.get(rid);
    if (m) {
      const ports = [...m.place].flatMap(([k, p]) => {
        const u = g.units.find((v) => v.key === k)!;
        return [{ id: `pt:${k}:in`, x: p.dx + u.w / 2, y: 0, layoutOptions: { 'elk.port.side': 'NORTH' } },
          { id: `pt:${k}:out`, x: p.dx + u.w / 2, y: m.h, layoutOptions: { 'elk.port.side': 'SOUTH' } }];
      });
      return { id: `r:${rid}`, width: m.w, height: m.h, ports, layoutOptions: { 'elk.portConstraints': 'FIXED_POS', 'elk.partitioning.partition': String(reg.rank) },
        ox: Math.min(...g.units.filter((u) => u.region === rid).map((u) => u.orig.x)), oy: reg.rank };
    }
    const kids = [
      ...g.units.filter((u) => u.region === rid).map(unitNode),
      ...g.regions.filter((v) => v.parent === rid).map((v) => regionNode(v.r.id)),
    ].sort(byOrder);
    const mine = g.units.filter((u) => u.region === rid);
    return { id: `r:${rid}`, children: kids, layoutOptions: { ...compound, 'elk.partitioning.partition': String(reg.rank) },
      ox: mine.length ? Math.min(...mine.map((u) => u.orig.x)) : 0, oy: reg.rank };
  };
  // Units drawn in no compartment take the band they sit level with in the original.
  const levelRank = (u: (typeof g.units)[number]) => {
    const near = g.units.filter((v) => v.region).sort((a, b) => Math.abs(a.orig.y - u.orig.y) - Math.abs(b.orig.y - u.orig.y))[0];
    return near ? g.regions.find((v) => v.r.id === near.region)!.rank : 4;
  };
  const level = (panel: string | null) => [
    ...g.regions.filter((v) => !v.parent && (v.panel ?? null) === panel).map((v) => regionNode(v.r.id)),
    ...g.units.filter((u) => !u.region && (u.panel ?? null) === panel).map((u) => ({ ...unitNode(u), layoutOptions: { 'elk.partitioning.partition': String(levelRank(u)) } })),
  ].sort(byOrder);
  const cell = { 'elk.algorithm': 'layered', 'elk.direction': 'DOWN', 'elk.partitioning.activate': 'true',
    'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES', 'elk.spacing.nodeNode': '22', 'elk.layered.spacing.nodeNodeBetweenLayers': '34', ...tune };
  const edgesWithin = (ids: Set<string>): ElkExtendedEdge[] => g.edges
    .filter((e) => ids.has(e.from) && ids.has(e.to) && !(membraneOf.has(e.from) && membraneOf.get(e.from) === membraneOf.get(e.to)))
    .map((e) => ({ id: e.id, sources: [endpoint(e.from, 'out')], targets: [endpoint(e.to, 'in')] }));
  const at = new Map<string, { x: number; y: number }>(), regionBox = new Map<string, Box>(), panelBox = new Map<string, Box>();
  // ELK gives each box relative to its parent: add up the offsets.
  const walk = (n: ElkNode, ox: number, oy: number) => {
    const x0 = ox + (n.x ?? 0), y0 = oy + (n.y ?? 0);
    const b = { x: x0, y: y0, width: n.width ?? 0, height: n.height ?? 0 };
    if (n.id.startsWith('u:')) at.set(n.id.slice(2), { x: x0, y: y0 });
    if (n.id.startsWith('r:')) regionBox.set(n.id.slice(2), b);
    // The membrane's units, at their places in its row.
    for (const [k, p] of membrane.get(n.id.slice(2))?.place ?? []) at.set(k, { x: x0 + p.dx, y: y0 + p.dy });
    for (const k of n.children ?? []) walk(k, x0, y0);
  };
  // Side-by-side panels (Wnt OFF | ON) are laid out one at a time and set next to each other in the figure's
  // order; arrows between panels, if any, are left to the drawing. (ELK's own nesting of panels failed on Wnt.)
  const groups = g.panels.length ? [...g.panels, null] : [null];
  let left = 0;
  for (const p of groups) {
    const ids = new Set(g.units.filter((u) => (u.panel ?? null) === p).map((u) => u.key));
    if (!ids.size) continue;
    const out: ElkNode = await elk.layout({ id: 'root', layoutOptions: { ...cell, 'elk.hierarchyHandling': 'INCLUDE_CHILDREN' }, children: level(p), edges: edgesWithin(ids) });
    for (const k of out.children ?? []) walk(k, left, 0);
    if (p) panelBox.set(p, { x: left - 16, y: -16, width: (out.width ?? 0) + 32, height: (out.height ?? 0) + 32 });
    left += (out.width ?? 0) + 80;
  }
  return toValue(x, g, t, opts, at, regionBox, panelBox);
}
