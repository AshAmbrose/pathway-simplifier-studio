/**
 * Step 2 (Focus): the routes drawn in the figure, traced from its arrows alone. No model call, and no biology.
 *
 *  - Shapes that travel together form one unit: shapes drawn touching (a ligand on its receptor, a protein on
 *    DNA) and shapes drawn in one cluster. An arrow to a cluster reaches all of it.
 *  - A route starts at a unit nothing points into (a ligand, receptor, stimulus or any other source) and takes
 *    in everything reachable from it along the figure's arrows. Inhibition arrows (bars) are not followed:
 *    what they come from is a regulator, listed on its own.
 *  - A source that only feeds into the middle of another route (every unit it points at has another way in)
 *    is a regulator too, unless it is a ligand, receptor or stimulus.
 *  - Routes are grouped the way the figure groups them: by panel, else by the nearest heading.
 *
 * The user's choices (routes ticked off, shapes clicked in or out) live in the review's simplify record;
 * `focusHidden` turns them into the shapes to leave out, so the step's changes can always be rebuilt from them.
 */
import { gap, union } from '../render/toScene.ts';
import type { Extraction, Simplify } from '../types/extraction.ts';

export interface Route {
  key: string;
  /** "TNF-α → TNFR → … → Gene expression": named by its ends, from the figure's own labels. */
  name: string;
  members: string[];
  /** Members also on another route. */
  shared: string[];
}
export interface Regulator { key: string; name: string; members: string[]; actsOn: string[] }
export interface RouteGroup { key: string; label: string; headings: string[]; routes: Route[]; regulators: Regulator[] }
export interface Tracing {
  /** Routes, and the regulators that sit with them, grouped as the figure groups them. */
  groups: RouteGroup[];
  /** All regulators: shapes on no route that act on one (through an inhibition, or by joining a route midway). */
  regulators: Regulator[];
  /** Shapes on no route that act on nothing (unconnected shapes, labels): one tick for all of them. */
  others: string[];
  /** The shapes each shape travels with (itself included). Headings are not in any unit. */
  unitOf: Map<string, string[]>;
}
export const OTHERS = 'others';

const SOURCE_KINDS = new Set(['ligand', 'receptor', 'stimulus']);
const inhibits = (a: Extraction['arrows'][number]) => a.head === 'bar' || a.meaning === 'inhibits';

/** Box in percent as {x, y, width, height}, for distances. */
const boxPct = (b: number[]) => ({ x: b[0], y: b[1], width: b[2], height: b[3] });

export function traceRoutes(x: Extraction): Tracing {
  const els = x.elements.filter((e) => e.kind !== 'heading');
  const byId = new Map(x.elements.map((e) => [e.id, e]));
  const members = (id: string): string[] => {
    if (byId.has(id)) return byId.get(id)!.kind === 'heading' ? [] : [id];
    return x.groups.find((g) => g.id === id)?.members.filter((m) => byId.has(m)) ?? [];
  };

  // Units: union-find over contacts and cluster membership.
  const parent = new Map(els.map((e) => [e.id, e.id]));
  const find = (id: string): string => { let r = id; while (parent.get(r) !== r) r = parent.get(r)!; parent.set(id, r); return r; };
  const join = (a: string, b: string) => { if (!parent.has(a) || !parent.has(b)) return; const ra = find(a), rb = find(b); if (ra !== rb) parent.set(rb, ra); };
  for (const g of x.groups) for (const m of g.members) join(g.members[0], m);
  for (const c of x.contacts) for (const a of members(c.a)) for (const b of members(c.b)) join(a, b);
  // Each unit is named by its first shape in the extraction's order, so keys stay the same between visits.
  const unitIds = new Map<string, string[]>();
  for (const e of els) { const r = find(e.id); unitIds.set(r, [...(unitIds.get(r) ?? []), e.id]); }
  const keyOf = new Map<string, string>();
  for (const ids of unitIds.values()) for (const id of ids) keyOf.set(id, ids[0]);
  const units = new Map([...unitIds.values()].map((ids) => [ids[0], ids]));
  const unitOf = new Map<string, string[]>();
  for (const ids of units.values()) for (const id of ids) unitOf.set(id, ids);

  // Arrows between units: the ones followed (everything but inhibition), and all of them (for regulators).
  const out = new Map<string, Set<string>>(), into = new Map<string, Set<string>>(), any = new Map<string, Set<string>>();
  const link = (m: Map<string, Set<string>>, a: string, b: string) => { if (!m.has(a)) m.set(a, new Set()); m.get(a)!.add(b); };
  for (const a of x.arrows) {
    for (const f of members(a.from)) for (const t of members(a.to)) {
      const uf = keyOf.get(f)!, ut = keyOf.get(t)!;
      if (uf === ut) continue;
      link(any, uf, ut);
      if (!inhibits(a)) { link(out, uf, ut); link(into, ut, uf); }
    }
  }

  const label = (id: string) => byId.get(id)?.label ?? null;
  /**
   * A unit's name: its ligand, stimulus or receptor if it has a labelled one; otherwise its labelled shapes
   * ("TAB2/3 + TAK1", or "GSK-3β + CKIα + 5 more"); otherwise its cluster's label or what kind of shape it is.
   */
  const unitName = (u: string) => {
    const ids = units.get(u)!;
    const source = ids.find((id) => label(id) && SOURCE_KINDS.has(byId.get(id)!.kind) && byId.get(id)!.kind !== 'receptor')
      ?? ids.find((id) => label(id) && byId.get(id)!.kind === 'receptor');
    if (source) return label(source)!;
    const names = [...new Set(ids.map(label).filter((l): l is string => !!l))];
    if (names.length) return names.length <= 3 ? names.join(' + ') : `${names.slice(0, 2).join(' + ')} + ${names.length - 2} more`;
    const g = x.groups.find((v) => v.members.includes(ids[0]) && v.label);
    return g?.label ?? `(unlabelled ${byId.get(ids[0])!.kind})`;
  };
  const pos = (u: string) => { const b = union(units.get(u)!.map((id) => boxPct(byId.get(id)!.box)), 0); return b; };

  // Starts: nothing points in, something points out, and it begins a chain rather than joining one midway.
  const starts = [...units.keys()].filter((u) => {
    if ((into.get(u)?.size ?? 0) > 0 || (out.get(u)?.size ?? 0) === 0) return false;
    if (units.get(u)!.some((id) => SOURCE_KINDS.has(byId.get(id)!.kind))) return true;
    const joins = [...out.get(u)!].every((t) => [...(into.get(t) ?? [])].some((s) => s !== u));
    return !joins;
  }).sort((a, b) => pos(a).y - pos(b).y || pos(a).x - pos(b).x);

  const reach = (s: string) => {
    const seen = new Set([s]), queue = [s];
    while (queue.length) for (const n of out.get(queue.shift()!) ?? []) if (!seen.has(n)) { seen.add(n); queue.push(n); }
    return [...seen];
  };
  const routeUnits = starts.map((s) => ({ start: s, units: reach(s) }));
  const count = new Map<string, number>();
  for (const r of routeUnits) for (const u of r.units) count.set(u, (count.get(u) ?? 0) + 1);

  const routes = routeUnits.map(({ start, units: us }): Route & { start: string } => {
    const ends = us.filter((u) => (out.get(u)?.size ?? 0) === 0 && u !== start);
    const second = [...(out.get(start) ?? [])].find((u) => !ends.includes(u));
    // Outcomes (a phenotype, then a gene, then a process) name the end first; several ends show as "X (+2 more ends)".
    const rank = (u: string) => Math.min(...units.get(u)!.map((id) => { const r = ['phenotype', 'gene', 'process'].indexOf(byId.get(id)!.kind); return r < 0 ? 9 : r; }));
    const endNames = [...new Set([...ends].sort((a, b) => rank(a) - rank(b)).map(unitName))];
    const endText = endNames.length > 1 ? `${endNames[0]} (+${endNames.length - 1} more end${endNames.length > 2 ? 's' : ''})` : endNames[0];
    const parts = [unitName(start), ...(second ? [unitName(second)] : []), ...(us.length > 2 + ends.length ? ['…'] : []), ...(endText ? [endText] : [])];
    return {
      key: `route:${start}`, start, name: parts.join(' → '),
      members: us.flatMap((u) => units.get(u)!),
      shared: us.filter((u) => (count.get(u) ?? 0) > 1).flatMap((u) => units.get(u)!),
    };
  });

  const onRoute = new Set(routeUnits.flatMap((r) => r.units));
  const regulators: Regulator[] = [...units.keys()]
    .filter((u) => !onRoute.has(u) && (any.get(u)?.size ?? 0) > 0)
    .sort((a, b) => pos(a).y - pos(b).y || pos(a).x - pos(b).x)
    .map((u) => ({ key: `reg:${u}`, name: unitName(u), members: units.get(u)!, actsOn: [...new Set([...any.get(u)!].map(unitName))] }));
  const placed = new Set([...onRoute, ...regulators.map((r) => r.key.slice(4))]);
  const others = [...units.keys()].filter((u) => !placed.has(u)).flatMap((u) => units.get(u)!);

  // Grouping: by panel when routes start in two or more panels, else by the nearest heading, else one group.
  const headings = x.elements.filter((e) => e.kind === 'heading');
  const panelOf = (u: string) => byId.get(u)!.panel;
  const startPanels = new Set(routes.map((r) => panelOf(r.start)).filter(Boolean));
  let groups: RouteGroup[];
  let groupOf: (u: string) => string;
  if (startPanels.size >= 2) {
    groupOf = (u) => (x.panels.some((p) => p.id === panelOf(u)) ? `panel:${panelOf(u)}` : 'panel:none');
    groups = [...x.panels.map((p, i) => ({ key: `panel:${p.id}`, label: p.label ?? `Panel ${i + 1}`, headings: headings.filter((h) => h.panel === p.id).map((h) => h.id) })),
      { key: 'panel:none', label: 'Outside the panels', headings: [] }].map((g) => ({ ...g, routes: [], regulators: [] }));
  } else if (headings.length >= 2) {
    groupOf = (u) => `heading:${headings.map((h) => ({ h, d: gap(boxPct(h.box), pos(u)) })).sort((a, b) => a.d - b.d)[0].h.id}`;
    groups = headings.map((h) => ({ key: `heading:${h.id}`, label: h.label ?? '(heading)', headings: [h.id], routes: [], regulators: [] }));
  } else {
    groupOf = () => 'all';
    groups = [{ key: 'all', label: 'Routes', headings: [], routes: [], regulators: [] }];
  }
  const groupBy = new Map(groups.map((g) => [g.key, g]));
  for (const r of routes) groupBy.get(groupOf(r.start))!.routes.push(r);
  // A regulator sits with the routes it acts on: the group holding most of the route units it points at.
  // Only one that acts on nothing on a route falls back to the panel or heading it sits nearest.
  const routeGroupOf = new Map<string, Map<string, number>>();
  for (const r of routeUnits) { const g = groupOf(r.start); for (const u of r.units) { const m = routeGroupOf.get(u) ?? new Map(); m.set(g, (m.get(g) ?? 0) + 1); routeGroupOf.set(u, m); } }
  for (const r of regulators) {
    const votes = new Map<string, number>();
    for (const t of any.get(r.key.slice(4)) ?? []) for (const [g, n] of routeGroupOf.get(t) ?? []) votes.set(g, (votes.get(g) ?? 0) + n);
    // A tie (a target shared by two routes) goes to whichever tied group's heading sits nearest the regulator.
    const top = Math.max(0, ...votes.values());
    const tied = [...votes].filter(([, n]) => n === top).map(([g]) => g);
    const near = (g: string) => { const hs = groupBy.get(g)!.headings.map((h) => byId.get(h)!); return hs.length ? Math.min(...hs.map((h) => gap(boxPct(h.box), pos(r.key.slice(4))))) : Infinity; };
    const best = tied.sort((a, b) => near(a) - near(b))[0];
    groupBy.get(best ?? groupOf(r.key.slice(4)))!.regulators.push(r);
  }
  groups = groups.filter((g) => g.routes.length > 0 || g.regulators.length > 0);

  return { groups, regulators, others, unitOf };
}

/** Every route, regulator and the "others" item, with its key and members. */
export const items = (t: Tracing) => [
  ...t.groups.flatMap((g) => g.routes), ...t.regulators, ...(t.others.length ? [{ key: OTHERS, members: t.others }] : []),
];

/**
 * The shapes step 2 leaves out, with the reason for each, from the user's choices:
 * everything on a ticked route or regulator is kept, then shapes clicked in or out override that.
 * A heading goes when nothing in its group is ticked or clicked back in.
 */
export function focusHidden(x: Extraction, t: Tracing, f: Simplify['focus']): Map<string, string> {
  const off = new Set(f.off);
  const kept = new Set<string>();
  for (const it of items(t)) if (!off.has(it.key)) for (const id of it.members) kept.add(id);
  const unit = (id: string) => t.unitOf.get(id) ?? [id];
  for (const id of f.keep) for (const u of unit(id)) kept.add(u);
  const dropped = new Set(f.drop.flatMap(unit));
  for (const id of dropped) kept.delete(id);

  const hidden = new Map<string, string>();
  const groupHeadings = new Set(t.groups.flatMap((g) => g.headings));
  for (const e of x.elements) {
    if (e.kind === 'heading') continue;
    if (!kept.has(e.id)) hidden.set(e.id, dropped.has(e.id) ? 'left out by clicking' : 'not on a chosen pathway');
  }
  // A group stays "on" while any of its routes or regulators is ticked, or one of its shapes was clicked back in.
  // (Shapes shared with other groups, like one DNA strand, don't keep a group's heading by themselves.)
  const clickedIn = new Set(f.keep.flatMap(unit));
  for (const g of t.groups) {
    const on = [...g.routes, ...g.regulators].some((r) => !off.has(r.key) || r.members.some((m) => clickedIn.has(m) && kept.has(m)));
    for (const h of g.headings) if (!on && !f.keep.includes(h)) hidden.set(h, 'heading of a part left out');
  }
  for (const h of x.elements.filter((e) => e.kind === 'heading')) {
    if (f.drop.includes(h.id)) hidden.set(h.id, 'left out by clicking');
    else if (!groupHeadings.has(h.id)) hidden.delete(h.id);
  }
  return hidden;
}

/** Ticks a route, a regulator or "others" on or off. Clicks on its shapes are forgotten, so the tick decides. */
export function setItem(f: Simplify['focus'], t: Tracing, key: string, on: boolean): Simplify['focus'] {
  const it = items(t).find((v) => v.key === key);
  const mine = new Set(it?.members ?? []);
  return {
    off: on ? f.off.filter((k) => k !== key) : [...new Set([...f.off, key])],
    keep: f.keep.filter((id) => !mine.has(id)),
    drop: f.drop.filter((id) => !mine.has(id)),
  };
}

/** A click on a shape: drops it (and whatever travels with it) if it is kept, brings it back if it isn't. */
export function toggleShape(f: Simplify['focus'], t: Tracing, id: string, keptNow: boolean): Simplify['focus'] {
  const unit = new Set(t.unitOf.get(id) ?? [id]);
  const keep = f.keep.filter((v) => !unit.has(v)), drop = f.drop.filter((v) => !unit.has(v));
  return keptNow ? { ...f, keep, drop: [...drop, id] } : { ...f, keep: [...keep, id], drop };
}
