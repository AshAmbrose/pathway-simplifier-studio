// Copied from BioPathway Studio (src/utils/cellLayout.ts), adapted for this app:
//  - plain node, arrow, compartment and panel types (below) instead of BioPathway Studio's;
//  - no ghosts or earlier-form afterimages (this app has neither), no regulation halos, no compartment colours
//    (this app draws compartments by kind);
//  - an "other" compartment (a figure's own) takes the Golgi slot, which this app's figures never use.
// The layout rules themselves are unchanged. src/layout/adapt.ts turns an extraction into its input.
/**
 * Lays a pathway out as a cell. Shared by generated figures (buildFigure.ts) and the canvas's
 * "Organize Layout" button (organizeProject.ts), so both follow the same priorities:
 *
 *  - Rows are compartments drawn as a cell (extracellular, plasma membrane, cytosol with any organelles,
 *    nucleus); every node stays in the compartment it was given.
 *  - Within a compartment, nodes flow top to bottom by depth. In modular figures only arrows inside a
 *    module count, so modules sit side by side like the panels of a paper figure; a module fed from the
 *    one beside it starts no higher than its input, so arrows between modules run across, not up.
 *  - The main path of each column (the spine) is one straight vertical line. The plasma membrane is a
 *    line, not a room: everything on it shares one row, and a path that returns to the membrane
 *    (TCR → ZAP70 → LAT) runs along it, then drops straight down from its last membrane step.
 *  - Modules are translucent shaded columns titled above the cell, never compartments.
 *  - Regulators sit beside what they regulate; members joining a complex share a row above it.
 *  - Outputs form a row beneath the cell.
 *  - Ordering minimises crossings and arrows behind nodes; leftovers bow around; spacing grows with size.
 *
 * Nothing here decides where a molecule is: the caller supplies each node's compartment.
 */

import { findLineCrossings } from './edgeLabelLayout.ts';

export type CompartmentType = 'extracellular' | 'plasma_membrane' | 'cytoplasm' | 'nucleus' | 'mitochondria' | 'endoplasmic_reticulum' | 'golgi' | 'endosome' | 'lysosome';
/** A shape to place: x and y are set by the layout (top-left corner); width and height are fixed. */
export interface LNode { id: string; label: string | null; x: number; y: number; width: number; height: number; compartmentId?: string }
/** An arrow; the layout sets its bend (curvature) when it would otherwise pass behind a shape. */
export interface LEdge { id: string; sourceNodeId: string; targetNodeId: string; curvature: number; label?: string | null }
export interface LCompartment { id: string; name: string; type: CompartmentType; x: number; y: number; width: number; height: number }
export interface LPanel { id: string; title: string; kind: 'module' | 'outputs'; x: number; y: number; width: number; height: number }
type PathwayNode = LNode;
type PathwayEdge = LEdge;
type PathwayCompartment = LCompartment;
type PathwayPanel = LPanel;
/** A shape's footprint (no afterimages in this app). */
const occupiedBox = (n: LNode) => ({ x: n.x, y: n.y, width: n.width, height: n.height });

export const BAND_NAME: Record<CompartmentType, string> = {
  extracellular: 'Extracellular Space',
  plasma_membrane: 'Plasma Membrane',
  cytoplasm: 'Cytosol',
  nucleus: 'Nucleus',
  mitochondria: 'Mitochondria',
  endoplasmic_reticulum: 'Endoplasmic Reticulum',
  golgi: 'Golgi Apparatus',
  endosome: 'Endosomes / Vesicles',
  lysosome: 'Lysosomes',
};
/** Top-to-bottom order of compartment rows in the cell. */
export const ROW_ORDER: CompartmentType[] = ['extracellular', 'plasma_membrane', 'cytoplasm', 'endosome', 'lysosome', 'golgi', 'endoplasmic_reticulum', 'mitochondria', 'nucleus'];
const ORGANELLES = new Set<CompartmentType>(['endosome', 'lysosome', 'golgi', 'endoplasmic_reticulum', 'mitochondria']);

const MARGIN = 60;
const CELL_PAD = 56; // inside the cell, left and right of the content
const TITLE_SPACE = 40; // room for module titles above the cell
const MEMBRANE_TAG = 210; // room for the "Plasma Membrane" / "Extracellular Space" name tag (CompartmentRenderer: ~8px per letter + padding)

export const mostCommon = <T,>(items: T[]): T | undefined => {
  const counts = new Map<T, number>();
  for (const i of items) counts.set(i, (counts.get(i) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
};

/** Does segment p→q pass through rectangle r (sampled)? */
function segmentHitsRect(p: { x: number; y: number }, q: { x: number; y: number }, r: { x1: number; y1: number; x2: number; y2: number }) {
  for (let i = 1; i < 24; i++) {
    const x = p.x + ((q.x - p.x) * i) / 24;
    const y = p.y + ((q.y - p.y) * i) / 24;
    if (x > r.x1 && x < r.x2 && y > r.y1 && y < r.y2) return true;
  }
  return false;
}

function segmentsCross(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }, d: { x: number; y: number }) {
  const o = (p: typeof a, q: typeof a, r: typeof a) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}

export function neighbourMap(ids: string[], edges: Array<{ sourceNodeId: string; targetNodeId: string }>) {
  const neighbours = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const e of edges) {
    if (e.sourceNodeId === e.targetNodeId || !neighbours.has(e.sourceNodeId) || !neighbours.has(e.targetNodeId)) continue;
    neighbours.get(e.sourceNodeId)!.push(e.targetNodeId);
    neighbours.get(e.targetNodeId)!.push(e.sourceNodeId);
  }
  return neighbours;
}

/**
 * Nodes with no compartment go beside their most-connected placed partner (repeated so chains resolve);
 * anything still unplaced goes in the cytosol. Fills `compartmentOf` in place; returns who each sits beside.
 */
export function placeByPartner(ids: string[], neighbours: Map<string, string[]>, compartmentOf: Map<string, CompartmentType | null>) {
  const partnerOf = new Map<string, string>();
  for (let pass = 0; pass < 4; pass++)
    for (const id of ids) {
      if (compartmentOf.get(id)) continue;
      const partner = mostCommon(neighbours.get(id)!.filter((k) => compartmentOf.get(k)));
      if (partner) {
        compartmentOf.set(id, compartmentOf.get(partner)!);
        partnerOf.set(id, partner);
      }
    }
  for (const id of ids) if (!compartmentOf.get(id)) compartmentOf.set(id, 'cytoplasm');
  return partnerOf;
}

export interface CellLayoutInput {
  /** All nodes; x, y and compartmentId are set in place. */
  nodes: PathwayNode[];
  /** All arrows; curvature is set in place (arrows still passing behind a node bow around it). */
  edges: PathwayEdge[];
  /** Compartment of every non-output node. */
  compartmentOf: Map<string, CompartmentType>;
  isOutput: (id: string) => boolean;
  /** Sits beside what it acts on rather than in the path (regulators, catalysing enzymes). */
  isRegulator: (id: string) => boolean;
  /** Module names in display order, or null for a single-column (backbone) figure. */
  modules: string[] | null;
  moduleOf: Map<string, string>;
  /** Initial left-to-right order within a row (lower first). */
  orderHint: (id: string) => number;
  /** Arrows that mean "joins this complex" (members share a row above the complex). */
  formsComplex: (e: PathwayEdge) => boolean;
  /**
   * Gene expression out of the nucleus (a transcription factor's arrow to the protein made): the product
   * appears back in the cytoplasm, so this arrow may point up and does not push its target down.
   */
  isExpression?: (e: PathwayEdge) => boolean;
  /** Nodes the figure itself names as its main path (preferred for the straight centre line). */
  mainPath?: (id: string) => boolean;
  /** Arrows never drawn as the main path (a shortcut beside the mechanism it skips). */
  sideEdge?: (e: PathwayEdge) => boolean;
  /** Names to keep for compartment bands (e.g. the user's own). */
  bandName?: Partial<Record<CompartmentType, string>>;
  /**
   * Added in this app: how airy the layout is, as a share of BioPathway Studio's own gaps (1 = as there).
   * Published figures are denser than BioPathway Studio's, and the result is fitted into the original's frame.
   */
  spacing?: number;
}

export interface CellLayoutResult {
  compartments: PathwayCompartment[];
  panels: PathwayPanel[];
  /** Arrows that still pass behind an unrelated node. */
  crossings: string[];
  /** Main path of each column, top to bottom (node ids); each is drawn as one straight vertical line below the membrane. */
  spines: string[][];
  /** How each arrow was read: main path, feedback (returns upstream), from a regulator, or between modules. */
  edgeRole: Map<string, 'spine' | 'feedback' | 'side' | 'crossModule' | 'flow' | 'expression'>;
  /** Added in this app: the column (module) each node was laid out in, left to right from 0, for the adapter's tidy-up. */
  columnOf: Map<string, number>;
}

export function layoutCell(input: CellLayoutInput): CellLayoutResult {
  const { nodes, edges, compartmentOf, isOutput, isRegulator, moduleOf, orderHint } = input;
  const byKey = new Map(nodes.map((n) => [n.id, n]));
  const expression = (e: PathwayEdge) => Boolean(input.isExpression?.(e)) && compartmentOf.get(e.sourceNodeId) === 'nucleus' && compartmentOf.get(e.targetNodeId) !== 'nucleus';
  const links = edges.filter((e) => byKey.has(e.sourceNodeId) && byKey.has(e.targetNodeId) && e.sourceNodeId !== e.targetNodeId);
  const neighbours = neighbourMap(nodes.map((n) => n.id), links);
  const cellNodes = nodes.filter((n) => !isOutput(n.id));
  const outputNodes = nodes.filter((n) => isOutput(n.id));
  const modular = input.modules !== null;

  // 1. Depth (top-to-bottom flow) from the main arrows; regulators take their target's depth. In modular
  //    figures only arrows inside a module count, so every module starts at the top of its compartment and
  //    arrows between modules run across (like the panels of a paper figure), not down a staircase.
  // A node the figure gave no module joins its partners' module (as its column does below), so an input
  // or output beside a module still flows top to bottom with it.
  const effModule = new Map(moduleOf);
  for (let pass = 0; pass < 4; pass++)
    for (const n of nodes) {
      if (effModule.has(n.id) || isOutput(n.id)) continue;
      const m = mostCommon(neighbours.get(n.id)!.map((k) => effModule.get(k)).filter((x): x is string => Boolean(x)));
      if (m) effModule.set(n.id, m);
    }
  const sameModule = (a: string, b: string) => !modular || (effModule.get(a) ?? '') === (effModule.get(b) ?? '');
  const upstream = new Map<string, string[]>();
  for (const e of links) {
    const s = e.sourceNodeId;
    const t = e.targetNodeId;
    if (!isRegulator(s) && !isOutput(t) && !isOutput(s) && sameModule(s, t) && !expression(e)) upstream.set(t, [...(upstream.get(t) ?? []), s]);
  }
  // Feedback arrows (back edges of a walk from the top-most sources) don't push nodes down, so a loop
  // reads as the forward path plus one arrow returning upstream.
  const rowRank = (id: string) => ROW_ORDER.indexOf(compartmentOf.get(id)!);
  const mainNodes = cellNodes.filter((n) => !isRegulator(n.id)).map((n) => n.id);
  const downstream = new Map<string, string[]>();
  for (const [t, ss] of upstream) if (!isRegulator(t)) for (const s of ss) downstream.set(s, [...(downstream.get(s) ?? []), t]);
  const byStart = (a: string, b: string) => rowRank(a) - rowRank(b) || orderHint(a) - orderHint(b);
  // Feedback arrows: within a loop, an arrow pointing back to a node closer to the signal's entry
  // (distance from the sources in the top-most compartment; other sources seed what that leaves unreached).
  // Arrows on no loop are never feedback.
  const reach = new Map<string, Set<string>>();
  for (const id of mainNodes) {
    const seenIds = new Set<string>();
    const queue = [id];
    while (queue.length) for (const t of downstream.get(queue.shift()!) ?? []) if (!seenIds.has(t)) (seenIds.add(t), queue.push(t));
    reach.set(id, seenIds);
  }
  const onLoop = (u: string, v: string) => reach.get(v)?.has(u) ?? false;
  const dist = new Map<string, number>();
  const spread = (roots: string[]) => {
    const queue = roots.filter((r) => !dist.has(r));
    for (const r of queue) dist.set(r, 0);
    while (queue.length) {
      const u = queue.shift()!;
      for (const t of downstream.get(u) ?? []) if (!dist.has(t)) (dist.set(t, dist.get(u)! + 1), queue.push(t));
    }
  };
  const sources = mainNodes.filter((id) => !upstream.get(id)?.length).sort(byStart);
  const topRank = Math.min(...sources.map(rowRank));
  spread(sources.filter((id) => rowRank(id) === topRank));
  spread(sources);
  // A loop entered from another module (ATM → p53 in p53 → MDM2 ⊣ p53) starts where that arrow arrives.
  spread(mainNodes.filter((id) => links.some((e) => e.targetNodeId === id && byKey.has(e.sourceNodeId) && !sameModule(e.sourceNodeId, id))).sort(byStart));
  for (const id of [...mainNodes].sort(byStart)) spread([id]); // loops with no way in
  const feedback = new Set<string>();
  for (const [t, ss] of upstream) for (const s of ss) if (onLoop(s, t) && dist.get(s)! > dist.get(t)!) feedback.add(`${s}>${t}`);
  // Any loop left (all its nodes equally far from the entry): break it where a walk from the top returns.
  const state = new Map<string, 'open' | 'done'>();
  const walk = (id: string) => {
    state.set(id, 'open');
    for (const t of [...(downstream.get(id) ?? [])].filter((t) => !feedback.has(`${id}>${t}`)).sort(byStart)) {
      if (state.get(t) === 'open') feedback.add(`${id}>${t}`);
      else if (!state.has(t)) walk(t);
    }
    state.set(id, 'done');
  };
  for (const id of [...mainNodes].sort((a, b) => dist.get(a)! - dist.get(b)! || byStart(a, b))) if (!state.has(id)) walk(id);
  const depth = new Map<string, number>();
  const depthOf = (id: string): number => {
    if (depth.has(id)) return depth.get(id)!;
    const ups = (upstream.get(id) ?? []).filter((u) => !feedback.has(`${u}>${id}`));
    const d = ups.length ? Math.max(...ups.map(depthOf)) + 1 : 0;
    depth.set(id, d);
    return d;
  };
  for (const id of mainNodes) depthOf(id);
  // Side entries (a source, and any chain fed only by it) sit just above where they join the path,
  // not at the top of the cell: Amino acids → RagA sit just above mTORC1.
  const forwardUps = (id: string) => (upstream.get(id) ?? []).filter((u) => !feedback.has(`${u}>${id}`));
  const forwardDowns = (id: string) => (downstream.get(id) ?? []).filter((t) => !feedback.has(`${id}>${t}`));
  const entry = new Set<string>();
  for (let grew = true; grew; ) {
    grew = false;
    for (const id of mainNodes) {
      if (entry.has(id)) continue;
      const ups = forwardUps(id);
      if (!ups.length || (ups.length === 1 && entry.has(ups[0]))) (entry.add(id), (grew = true));
    }
  }
  const moved = new Set<string>();
  const settle = (id: string): void => {
    const downs = forwardDowns(id).filter((t) => compartmentOf.get(t) === compartmentOf.get(id));
    downs.forEach((t) => entry.has(t) && settle(t));
    // Only when stranded well above (a trigger one row above its target already reads as an input).
    const target = downs.length ? Math.min(...downs.map((t) => depth.get(t)!)) - 1 : -1;
    if (target - depth.get(id)! >= 2 || (target > depth.get(id)! && downs.some((t) => moved.has(t)))) (depth.set(id, target), moved.add(id));
  };
  for (const id of entry) settle(id);
  // A node that only carries a signal back upstream (all its arrows out are feedback, e.g. mTORC1 → S6K
  // ⊣ IRS1) sits halfway up, beside the path, so neither arrow has to span the whole figure.
  const returners = new Set<string>();
  for (const id of mainNodes) {
    const outs = downstream.get(id) ?? [];
    if (!outs.length || !outs.every((t) => feedback.has(`${id}>${t}`))) continue;
    returners.add(id);
    const mid = Math.round((depth.get(id)! - 1 + Math.min(...outs.map((t) => depth.get(t)!))) / 2);
    if (mid < depth.get(id)!) depth.set(id, Math.max(0, mid));
  }
  // Members joining the same complex share a row above it, so the assembly reads as a fan.
  const joiners = new Map<string, string[]>();
  for (const e of links)
    if (input.formsComplex(e) && depth.has(e.sourceNodeId) && sameModule(e.sourceNodeId, e.targetNodeId) && compartmentOf.get(e.sourceNodeId) === compartmentOf.get(e.targetNodeId))
      joiners.set(e.targetNodeId, [...(joiners.get(e.targetNodeId) ?? []), e.sourceNodeId]);
  for (const members of joiners.values()) {
    const d = Math.max(...members.map((m) => depth.get(m)!));
    for (const m of members) depth.set(m, d);
  }
  /** Regulators sit beside (to the right of) what they regulate, not in its path. */
  const regulatorTarget = new Map<string, string>();
  for (const n of cellNodes) {
    if (!isRegulator(n.id)) continue;
    const ts = links.filter((e) => e.sourceNodeId === n.id && !isRegulator(e.targetNodeId) && !isOutput(e.targetNodeId)).map((e) => e.targetNodeId);
    if (ts[0]) regulatorTarget.set(n.id, ts[0]);
    // A regulator with no target in the cell (e.g. a product it induces) sits just after what feeds it.
    const feeders = links.filter((e) => e.targetNodeId === n.id && depth.has(e.sourceNodeId)).map((e) => depth.get(e.sourceNodeId)! + 1);
    depth.set(n.id, ts.length ? Math.min(...ts.map((t) => depth.get(t) ?? 0)) : feeders.length ? Math.max(...feeders) : 0);
  }

  // A module fed by an arrow from a module beside it starts no higher than that arrow's source, so arrows
  // between modules run across (or down), never back up.
  if (modular)
    for (const m of [...new Set([...input.modules!, ...cellNodes.map((n) => moduleOf.get(n.id)).filter((x): x is string => Boolean(x))])]) {
      const inM = cellNodes.filter((n) => effModule.get(n.id) === m).map((n) => n.id);
      const drop = Math.max(
        0,
        ...links
          .filter((e) => effModule.get(e.targetNodeId) === m && effModule.get(e.sourceNodeId) !== m && !isRegulator(e.sourceNodeId))
          .filter((e) => depth.has(e.sourceNodeId) && depth.has(e.targetNodeId) && compartmentOf.get(e.sourceNodeId) === compartmentOf.get(e.targetNodeId))
          .map((e) => depth.get(e.sourceNodeId)! - depth.get(e.targetNodeId)!)
      );
      if (drop > 0) for (const id of inM) depth.set(id, depth.get(id)! + drop);
    }

  // 2. Columns: modules (modular figures) or one column (backbone).
  const moduleNames: string[] = modular
    ? [...new Set([...input.modules!, ...cellNodes.map((n) => moduleOf.get(n.id)).filter((m): m is string => Boolean(m))])]
    : [];
  const groupOf = new Map<string, number>();
  for (const n of cellNodes) {
    const m = moduleOf.get(n.id);
    if (m && moduleNames.includes(m)) groupOf.set(n.id, moduleNames.indexOf(m));
  }
  for (let pass = 0; pass < 4; pass++)
    for (const n of cellNodes) {
      if (groupOf.has(n.id)) continue;
      const g = mostCommon(neighbours.get(n.id)!.filter((k) => groupOf.has(k)).map((k) => groupOf.get(k)!));
      if (g !== undefined) groupOf.set(n.id, g);
    }
  for (const n of cellNodes) if (!groupOf.has(n.id)) groupOf.set(n.id, 0);
  // Drop empty modules and renumber.
  const usedGroups = [...new Set(cellNodes.map((n) => groupOf.get(n.id)!))].sort((a, b) => a - b);
  for (const n of cellNodes) groupOf.set(n.id, usedGroups.indexOf(groupOf.get(n.id)!));
  const groupTitles = usedGroups.map((g) => moduleNames[g] ?? null);
  const groupCount = Math.max(1, usedGroups.length);

  // 2b. Spine: one forward chain per column, drawn as a straight vertical line (the figure's main path).
  //     Preference: the most nodes the caller marks as main path (e.g. the brief's numbered stages), then
  //     the longest chain, then one ending in an output. Equal rivals stop the line at the split.
  const feedsOutput = (id: string) => links.some((e) => e.sourceNodeId === id && isOutput(e.targetNodeId));
  const preferred = input.mainPath ?? (() => false);
  const sidePairs = new Set(edges.filter((e) => input.sideEdge?.(e)).map((e) => `${e.sourceNodeId}>${e.targetNodeId}`));
  const rank = (c: string[]) => [c.filter(preferred).length, c.length, feedsOutput(c[c.length - 1]) ? 1 : 0];
  const cmp = (a: string[], b: string[]) => {
    const [ra, rb] = [rank(a), rank(b)];
    for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] - rb[i];
    return 0;
  };
  const chainFrom = new Map<string, string[]>();
  const chain = (id: string): string[] => {
    if (chainFrom.has(id)) return chainFrom.get(id)!;
    chainFrom.set(id, [id]); // guards against any loop left
    // Only steps that go further down the cell (a node that just carries a signal back sits beside the path).
    const nexts = forwardDowns(id).filter((t) => groupOf.get(t) === groupOf.get(id) && depth.get(t)! > depth.get(id)! && !sidePairs.has(`${id}>${t}`));
    const options = [...nexts].sort((a, b) => orderHint(a) - orderHint(b)).map(chain);
    let best: string[] = [];
    for (const c of options) if (!best.length || cmp(c, best) > 0) best = c;
    // Equal branches: the line stops at the split and the branches fan out on either side, rather than
    // one being picked arbitrarily. If they join again (Adrenaline → ADRB1/2/3 → GNAS), the line continues
    // from where they join, with the branches fanned out between.
    const rivals = options.filter((c) => c !== best && cmp(c, best) === 0);
    if (rivals.length) best = rivals.every((c) => c.slice(1).join() === best.slice(1).join()) && best.length > 1 ? best.slice(1) : [];
    chainFrom.set(id, [id, ...best]);
    return chainFrom.get(id)!;
  };
  const spines: string[][] = Array.from({ length: groupCount }, (_, g) => {
    const starts = mainNodes.filter((id) => groupOf.get(id) === g && !forwardUps(id).some((u) => groupOf.get(u) === g));
    let best: string[] = [];
    for (const s of [...starts].sort(byStart)) {
      const c = chain(s);
      if (!best.length || cmp(c, best) > 0) best = c;
    }
    // Equal starts that merge into the same chain (members joining one complex): the line starts where
    // they merge, and they fan out above it.
    const merged = starts.map(chain).some((c) => c !== best && cmp(c, best) === 0 && c.slice(1).join() === best.slice(1).join());
    if (merged) best = best.slice(1);
    return best.length >= 2 ? best : [];
  });
  const onSpine = new Set(spines.flat());
  const atMembrane = (id: string) => compartmentOf.get(id) === 'plasma_membrane' || compartmentOf.get(id) === 'extracellular';
  /** Index of the last spine node at the membrane: before it the path runs along the membrane, after it straight down. */
  const descentAt = spines.map((s) => s.map(atMembrane).lastIndexOf(true));

  // 3. Layers: one row per (compartment, depth level within it).
  const rowCompartments = ROW_ORDER.filter((c) => cellNodes.some((n) => compartmentOf.get(n.id) === c));
  const byCompartment: Array<{ compartment: CompartmentType; ids: string[] }> = [];
  for (const c of rowCompartments) {
    const inC = cellNodes.filter((n) => compartmentOf.get(n.id) === c);
    // The membrane is a line, not a room: everything on it (and every ligand outside it) shares one row,
    // and a path that returns to the membrane runs along it instead of stacking inside it.
    if (c === 'plasma_membrane' || c === 'extracellular') {
      byCompartment.push({ compartment: c, ids: inC.map((n) => n.id).sort((a, b) => (depth.get(a) ?? 0) - (depth.get(b) ?? 0)) });
      continue;
    }
    for (const d of [...new Set(inC.map((n) => depth.get(n.id) ?? 0))].sort((a, b) => a - b))
      byCompartment.push({ compartment: c, ids: inC.filter((n) => (depth.get(n.id) ?? 0) === d).map((n) => n.id) });
  }
  // Organelles sit where they act in the flow (interleaved with cytosol rows by depth), not all at the end.
  // All rows of one organelle stay together (at its first point in the flow): one inset per organelle, since
  // two boxes would read as two organelles.
  const interior = (c: CompartmentType) => c === 'cytoplasm' || ORGANELLES.has(c);
  const layerDepth = (l: { ids: string[] }) => depth.get(l.ids[0]) ?? 0;
  const organelleStart = new Map<CompartmentType, number>();
  for (const l of byCompartment) if (ORGANELLES.has(l.compartment)) organelleStart.set(l.compartment, Math.min(organelleStart.get(l.compartment) ?? Infinity, layerDepth(l)));
  const slot = (l: { compartment: CompartmentType; ids: string[] }) => (ORGANELLES.has(l.compartment) ? organelleStart.get(l.compartment)! : layerDepth(l));
  const layers = [
    ...byCompartment.filter((l) => ROW_ORDER.indexOf(l.compartment) < ROW_ORDER.indexOf('cytoplasm')),
    ...byCompartment
      .filter((l) => interior(l.compartment))
      .sort((a, b) => slot(a) - slot(b) || ROW_ORDER.indexOf(a.compartment) - ROW_ORDER.indexOf(b.compartment) || layerDepth(a) - layerDepth(b)),
    ...byCompartment.filter((l) => l.compartment === 'nucleus'),
  ];
  const layerOf = new Map<string, number>();
  layers.forEach((l, i) => l.ids.forEach((id) => layerOf.set(id, i)));

  // Spacing grows with content: white space rather than a crammed figure.
  const busiest = Math.max(1, ...layers.map((l) => l.ids.length));
  const coreCount = cellNodes.length;
  const sp = input.spacing ?? 1;
  const GAP_X = sp * (84 + (coreCount > 8 ? 16 : 0) + (coreCount > 12 ? 16 : 0) + Math.max(0, busiest - 3) * 8);
  const LAYER_GAP = sp * (84 + (coreCount > 12 ? 16 : 0));
  const MODULE_GAP = GAP_X + 36;

  // Column spans: wide enough for the busiest layer of each module, plus room for regulators beside it.
  const spanWidth = Array.from({ length: groupCount }, (_, g) =>
    Math.max(
      180 * sp,
      ...layers.map((l) => {
        const ws = l.ids.filter((id) => groupOf.get(id) === g).map((id) => byKey.get(id)!.width);
        return ws.reduce((s, w) => s + w, 0) + Math.max(0, ws.length - 1) * GAP_X;
      })
    ) +
      40 +
      ([...regulatorTarget].some(([r, t]) => groupOf.get(r) === g && groupOf.get(t) === g) ? 2 * (GAP_X + 120 * sp) : 0)
  );
  // A path that runs along the membrane needs room to the left of the spine for its earlier steps.
  // The column keeps its own width to the right of the spine; the run adds its length on the left.
  const runOf = spines.map((s, g) => s.slice(0, descentAt[g] + 1).filter((id) => compartmentOf.get(id) === 'plasma_membrane'));
  const runLength = runOf.map((run) => run.slice(1).reduce((sum, id, i) => sum + (byKey.get(run[i])!.width + byKey.get(id)!.width) / 2 + GAP_X, 0));
  const spineFromLeft = spanWidth.map((w, g) => Math.max(w / 2, runLength[g] + byKey.get(runOf[g][0] ?? cellNodes[0].id)!.width / 2 + 20));
  for (let g = 0; g < groupCount; g++) spanWidth[g] = Math.max(spanWidth[g], spineFromLeft[g] + spanWidth[g] / 2);
  // The straight part of each spine is a corridor: in rows it passes through without a node of its own, the
  // column's other nodes sit beside it, not on the line. Columns with such nodes get room for them.
  const corridor = spines.map((sp, g) => {
    const straight = sp.slice(Math.max(0, descentAt[g]));
    if (straight.length < 2) return null;
    const ls = straight.map((id) => layerOf.get(id)!);
    const rows = new Set(ls);
    const half = Math.max(...straight.map((id) => byKey.get(id)!.width)) / 2;
    const beside = cellNodes.filter((n) => groupOf.get(n.id) === g && !onSpine.has(n.id) && layerOf.get(n.id)! > Math.min(...ls) && layerOf.get(n.id)! < Math.max(...ls) && !rows.has(layerOf.get(n.id)!));
    return { from: Math.min(...ls), to: Math.max(...ls), rows, half, beside: new Set(beside.map((n) => n.id)) };
  });
  for (let g = 0; g < groupCount; g++) {
    const c = corridor[g];
    if (!c?.beside.size) continue;
    const widest = Math.max(...[...c.beside].map((id) => byKey.get(id)!.width));
    spanWidth[g] = Math.max(spanWidth[g], spineFromLeft[g] + c.half + GAP_X + widest + 20);
  }
  const cellLeft = MARGIN;
  const spanLeft: number[] = [];
  let cursor = cellLeft + CELL_PAD;
  for (let g = 0; g < groupCount; g++) {
    spanLeft.push(cursor);
    cursor += spanWidth[g] + MODULE_GAP;
  }
  const contentRight = cursor - MODULE_GAP;
  let cellRight = Math.max(contentRight + CELL_PAD, cellLeft + 760 * sp);
  // Centre the content when the cell's minimum width is wider than the content.
  const shift = (cellRight - CELL_PAD - contentRight - (cellLeft + CELL_PAD - spanLeft[0])) / 2;
  for (let g = 0; g < groupCount; g++) spanLeft[g] += Math.max(0, shift);

  // Pinned centres for spine nodes: after the descent point, all on the column's centre line; before it,
  // membrane steps run leftwards along the membrane, a ligand sits over its receptor, and a cytosolic step
  // between two membrane steps sits under the gap between them.
  const pin = new Map<string, number>();
  spines.forEach((s, g) => {
    if (!s.length) return;
    const spineX = spanLeft[g] + spineFromLeft[g];
    const k = descentAt[g];
    const run = runOf[g];
    let rx = spineX;
    for (let r = run.length - 1; r >= 0; r--) {
      pin.set(run[r], rx);
      if (r) rx -= (byKey.get(run[r])!.width + byKey.get(run[r - 1])!.width) / 2 + GAP_X;
    }
    s.slice(Math.max(0, k + (run.length ? 1 : 0))).forEach((id) => pin.has(id) || pin.set(id, spineX));
    for (let i = k; i >= 0; i--) if (!pin.has(s[i]) && compartmentOf.get(s[i]) === 'extracellular' && pin.has(s[i + 1])) pin.set(s[i], pin.get(s[i + 1])!);
    for (let i = 0; i <= k; i++) {
      if (pin.has(s[i])) continue;
      const around = [s[i - 1], s[i + 1]].filter((id) => id && pin.has(id)).map((id) => pin.get(id)!);
      pin.set(s[i], around.length ? around.reduce((a, b) => a + b, 0) / around.length : spineX);
    }
  });

  // 4. Ordering and x placement (barycentre sweeps, then swaps that reduce crossings).
  const provisionalY = (id: string) => layerOf.get(id)! * 140;
  const centre = (x: Map<string, number>, id: string) => x.get(id)! + byKey.get(id)!.width / 2;
  const cellNeighbours = (id: string) => neighbours.get(id)!.filter((k) => layerOf.has(k));

  /** Extra room to a node's left (BioPathway Studio's afterimages; none here). */
  const leftExtra = (_id: string) => 0;
  /** Pack ordered nodes into [left, right] near their desired centres, keeping order and gaps. */
  const pack = (ids: string[], desired: number[], left: number, right: number, x: Map<string, number>) => {
    const w = ids.map((id) => byKey.get(id)!.width);
    const gap = (i: number) => GAP_X + leftExtra(ids[i]);
    const pos = ids.map((_, i) => desired[i] - w[i] / 2);
    for (let i = 0; i < ids.length; i++) pos[i] = Math.max(pos[i], i ? pos[i - 1] + w[i - 1] + gap(i) : left);
    for (let i = ids.length - 1; i >= 0; i--) pos[i] = Math.min(pos[i], i < ids.length - 1 ? pos[i + 1] - gap(i + 1) - w[i] : right - w[i]);
    for (let i = 0; i < ids.length; i++) pos[i] = Math.max(pos[i], i ? pos[i - 1] + w[i - 1] + gap(i) : left);
    // Centre the packed row on where its nodes want to be (siblings straddle their shared parent).
    if (ids.length > 1) {
      const drift = ids.reduce((s, _, i) => s + desired[i] - (pos[i] + w[i] / 2), 0) / ids.length;
      const room = drift > 0 ? right - (pos[ids.length - 1] + w[ids.length - 1]) : pos[0] - left;
      const move = drift > 0 ? Math.min(drift, Math.max(0, room)) : -Math.min(-drift, Math.max(0, room));
      for (let i = 0; i < ids.length; i++) pos[i] += move;
    }
    ids.forEach((id, i) => x.set(id, pos[i]));
  };

  const assignX = (order: string[][]) => {
    const x = new Map<string, number>();
    for (const id of layerOf.keys()) {
      const g = groupOf.get(id)!;
      x.set(id, spanLeft[g] + spanWidth[g] / 2 - byKey.get(id)!.width / 2);
    }
    for (let iter = 0; iter < 6; iter++) {
      const seq = iter % 2 === 0 ? order : [...order].reverse();
      for (const ids of seq)
        for (let g = 0; g < groupCount; g++) {
          const list = ids.filter((id) => groupOf.get(id) === g);
          if (!list.length) continue;
          const desired = list.map((id) => {
            if (pin.has(id)) return pin.get(id)!;
            const t = regulatorTarget.get(id);
            if (t) return centre(x, t) + byKey.get(t)!.width / 2 + GAP_X + byKey.get(id)!.width / 2;
            const ns = cellNeighbours(id).filter((k) => !regulatorTarget.has(k));
            const want = ns.length ? ns.reduce((s, k) => s + centre(x, k), 0) / ns.length : spanLeft[g] + spanWidth[g] / 2;
            // Keep off the spine's corridor (rows the straight line passes through).
            const c = corridor[g];
            if (c?.beside.has(id)) {
              const cx = spanLeft[g] + spineFromLeft[g];
              const clear = c.half + GAP_X + byKey.get(id)!.width / 2;
              if (Math.abs(want - cx) < clear) return cx + (want < cx - 1 ? -clear : clear);
            }
            return want;
          });
          // Keep the chosen order, but let the desired centres pull the group as a whole.
          pack(list, desired, spanLeft[g], spanLeft[g] + spanWidth[g], x);
          holdPins(list, x);
        }
    }
    return x;
  };
  /** Spine nodes sit exactly on their pinned centre; row-mates are pushed aside (order kept). */
  const holdPins = (list: string[], x: Map<string, number>) => {
    const w = (id: string) => byKey.get(id)!.width;
    list.forEach((id) => pin.has(id) && x.set(id, pin.get(id)! - w(id) / 2));
    for (let i = 1; i < list.length; i++)
      if (!pin.has(list[i])) x.set(list[i], Math.max(x.get(list[i])!, x.get(list[i - 1])! + w(list[i - 1]) + GAP_X + leftExtra(list[i])));
    for (let i = list.length - 2; i >= 0; i--)
      if (!pin.has(list[i])) x.set(list[i], Math.min(x.get(list[i])!, x.get(list[i + 1])! - GAP_X - leftExtra(list[i + 1]) - w(list[i])));
  };

  const cellEdges = links.filter((e) => layerOf.has(e.sourceNodeId) && layerOf.has(e.targetNodeId));
  const score = (x: Map<string, number>) => {
    const pt = (id: string) => ({ x: centre(x, id), y: provisionalY(id) + byKey.get(id)!.height / 2 });
    let s = 0;
    for (let i = 0; i < cellEdges.length; i++) {
      const a = cellEdges[i];
      for (let j = i + 1; j < cellEdges.length; j++) {
        const b = cellEdges[j];
        if ([a.sourceNodeId, a.targetNodeId].some((k) => k === b.sourceNodeId || k === b.targetNodeId)) continue;
        if (segmentsCross(pt(a.sourceNodeId), pt(a.targetNodeId), pt(b.sourceNodeId), pt(b.targetNodeId))) s += 1;
      }
      for (const id of layerOf.keys()) {
        if (id === a.sourceNodeId || id === a.targetNodeId) continue;
        const n = byKey.get(id)!;
        const r = { x1: x.get(id)! - 6, x2: x.get(id)! + n.width + 6, y1: provisionalY(id) - 6, y2: provisionalY(id) + n.height + 6 };
        if (segmentHitsRect(pt(a.sourceNodeId), pt(a.targetNodeId), r)) s += 2;
      }
    }
    return s;
  };

  /**
   * Row-mates that want the same spot as a spine node (e.g. members joining the complex below it) fan out
   * on both sides of it rather than queueing on one side.
   */
  const balance = (ids: string[], x: Map<string, number>): string[] => {
    const want = (id: string) => {
      const ns = cellNeighbours(id).filter((k) => !regulatorTarget.has(k));
      return ns.length ? ns.reduce((s, k) => s + centre(x, k), 0) / ns.length : centre(x, id);
    };
    const out: string[] = [];
    for (const g of [...new Set(ids.map((id) => groupOf.get(id)!))].sort((a, b) => a - b)) {
      const mine = ids.filter((id) => groupOf.get(id) === g);
      const pinned = mine.filter((id) => pin.has(id));
      if (pinned.length !== 1) {
        out.push(...mine);
        continue;
      }
      const p = pinned[0];
      const px = pin.get(p)!;
      const left: string[] = [];
      const right: string[] = [];
      const tied: string[] = [];
      for (const id of mine) {
        if (id === p) continue;
        const d = want(id) - px;
        (Math.abs(d) < GAP_X / 2 ? tied : d < 0 ? left : right).push(id);
      }
      for (const id of tied) (left.length <= right.length ? left : right).push(id);
      out.push(...left, p, ...right);
    }
    return out;
  };

  let order = layers.map((l) => [...l.ids].sort((a, b) => groupOf.get(a)! - groupOf.get(b)! || orderHint(a) - orderHint(b)));
  let x = assignX(order);
  order = order.map((ids) => balance(ids, x));
  x = assignX(order);
  let best = { order, x, s: score(x) };
  for (let sweep = 0; sweep < 6 && best.s > 0; sweep++) {
    order = order.map((ids) =>
      [...ids].sort((a, b) => {
        const bary = (id: string) => {
          if (pin.has(id)) return pin.get(id)!;
          const ns = cellNeighbours(id);
          return ns.length ? ns.reduce((s, k) => s + centre(x, k), 0) / ns.length : centre(x, id);
        };
        return groupOf.get(a)! - groupOf.get(b)! || bary(a) - bary(b);
      })
    ).map((ids) => balance(ids, x));
    x = assignX(order);
    const s = score(x);
    if (s < best.s) best = { order, x, s };
  }
  // Adjacent swaps within a module, kept when they reduce crossings.
  for (let pass = 0; pass < 3 && best.s > 0; pass++) {
    let improved = false;
    for (let li = 0; li < best.order.length; li++)
      for (let i = 0; i + 1 < best.order[li].length; i++) {
        const ids = best.order[li];
        if (groupOf.get(ids[i]) !== groupOf.get(ids[i + 1])) continue;
        const trial = best.order.map((l) => [...l]);
        [trial[li][i], trial[li][i + 1]] = [trial[li][i + 1], trial[li][i]];
        const tx = assignX(trial);
        const s = score(tx);
        if (s < best.s) {
          best = { order: trial, x: tx, s };
          improved = true;
        }
      }
    if (!improved) break;
  }
  // Nudges: an arrow can still run through a node that has its row to itself (A → B → C with A → C).
  // Shift single nodes sideways, within their column and clear of row neighbours, when that helps.
  for (let pass = 0; pass < 2 && best.s > 0; pass++)
    for (const [li, ids] of best.order.entries())
      for (const id of ids) {
        if (pin.has(id)) continue;
        const g = groupOf.get(id)!;
        const wid = byKey.get(id)!.width;
        const rowMates = layers[li].ids.filter((k) => k !== id);
        for (const step of [0.75, -0.75, 1.25, -1.25, 1.75, -1.75]) {
          const nx = best.x.get(id)! + step * (wid + GAP_X / 2);
          if (nx < spanLeft[g] || nx + wid > spanLeft[g] + spanWidth[g]) continue;
          if (rowMates.some((k) => nx < best.x.get(k)! + byKey.get(k)!.width + GAP_X / 2 && best.x.get(k)! < nx + wid + GAP_X / 2)) continue;
          const tx = new Map(best.x).set(id, nx);
          const s = score(tx);
          if (s < best.s) {
            best = { ...best, x: tx, s };
            break;
          }
        }
      }
  for (const [id, nx] of best.x) byKey.get(id)!.x = Math.round(nx);
  // Pinned rows may have pushed nodes past their column: grow the cell to fit (shifting right if needed).
  {
    const placed = [...best.x.keys()].map((id) => byKey.get(id)!);
    // The membrane's name tag sits at its left end: membrane-row molecules start after it.
    const onMembrane = placed.filter((n) => compartmentOf.get(n.id) === 'plasma_membrane' || compartmentOf.get(n.id) === 'extracellular');
    const over = Math.max(
      cellLeft + CELL_PAD - Math.min(...placed.map((n) => occupiedBox(n).x)),
      onMembrane.length ? cellLeft + MEMBRANE_TAG - Math.min(...onMembrane.map((n) => n.x)) : -Infinity
    );
    if (over > 0) {
      for (const n of placed) n.x += Math.round(over);
      for (let g = 0; g < groupCount; g++) spanLeft[g] += over;
    }
    cellRight = Math.max(cellRight, Math.max(...placed.map((n) => n.x + n.width)) + CELL_PAD);
  }

  // 5. Rows and the cell: compartments stacked top to bottom.
  const compartments: PathwayCompartment[] = [];
  const panels: PathwayPanel[] = [];
  const bandName = (c: CompartmentType) => input.bandName?.[c] ?? BAND_NAME[c];
  const hasTitles = groupTitles.some(Boolean);
  const cellTop = MARGIN + (hasTitles ? TITLE_SPACE : 0);
  let y = cellTop;
  const placeLayers = (c: CompartmentType, startY: number): number => {
    let yy = startY;
    layers.forEach((l) => {
      if (l.compartment !== c) return;
      const rowH = Math.max(...l.ids.map((id) => byKey.get(id)!.height));
      for (const id of l.ids) byKey.get(id)!.y = Math.round(yy + (rowH - byKey.get(id)!.height) / 2);
      yy += rowH + LAYER_GAP;
    });
    return yy - LAYER_GAP; // bottom of the last row
  };
  const addCompartment = (c: CompartmentType, x0: number, y0: number, w: number, h: number, members?: PathwayNode[], boxId?: string) => {
    const id = boxId ?? `cell-${c}`;
    compartments.push({ id, name: bandName(c), type: c, x: x0, y: y0, width: w, height: h });
    for (const n of members ?? cellNodes.filter((m) => compartmentOf.get(m.id) === c)) n.compartmentId = id;
  };
  const cellWidth = cellRight - cellLeft;

  if (rowCompartments.includes('extracellular')) {
    const bottom = placeLayers('extracellular', y + 36);
    addCompartment('extracellular', cellLeft, y, cellWidth, bottom - y + 28);
    y = bottom + 28 + 10;
  }
  // The plasma membrane is always drawn: it is what makes the figure read as a cell.
  if (rowCompartments.includes('plasma_membrane')) {
    const bottom = placeLayers('plasma_membrane', y + 12);
    addCompartment('plasma_membrane', cellLeft, y, cellWidth, bottom - y + 12);
    y = bottom + 12 + 10;
  } else {
    addCompartment('plasma_membrane', cellLeft, y, cellWidth, 44);
    y += 44 + 10;
  }
  const cytosolTop = y;
  // Cytosol rows and organelle insets, top to bottom in flow order; each run of organelle rows is boxed.
  const runs: Array<{ compartment: CompartmentType; layers: typeof layers }> = [];
  for (const l of layers.filter((l) => interior(l.compartment))) {
    const last = runs[runs.length - 1];
    if (last && last.compartment === l.compartment) last.layers.push(l);
    else runs.push({ compartment: l.compartment, layers: [l] });
  }
  const placeRun = (run: (typeof runs)[number], startY: number) => {
    let yy = startY;
    for (const l of run.layers) {
      const rowH = Math.max(...l.ids.map((id) => byKey.get(id)!.height));
      for (const id of l.ids) byKey.get(id)!.y = Math.round(yy + (rowH - byKey.get(id)!.height) / 2);
      yy += rowH + LAYER_GAP;
    }
    return yy - LAYER_GAP;
  };
  const boxes = new Map<CompartmentType, number>();
  let previous: 'cytosol' | 'organelle' | null = null;
  y = cytosolTop + 30;
  for (const run of runs) {
    if (run.compartment === 'cytoplasm') {
      y = placeRun(run, previous === null ? cytosolTop + 44 : y + 40);
      previous = 'cytosol';
      continue;
    }
    const c = run.compartment;
    const top = y + 56;
    const bottom = placeRun(run, top + 34);
    const inRun = run.layers.flatMap((l) => l.ids).map((id) => byKey.get(id)!);
    const x1 = Math.max(cellLeft + 24, Math.min(...inRun.map((n) => n.x)) - 40);
    const x2 = Math.min(cellRight - 24, Math.max(...inRun.map((n) => n.x + n.width)) + 40);
    const w = Math.max(260, x2 - x1);
    const nth = (boxes.get(c) ?? 0) + 1;
    boxes.set(c, nth);
    addCompartment(c, Math.min(x1, cellRight - 24 - w), top, w, bottom - top + 24, inRun, nth > 1 ? `cell-${c}-${nth}` : undefined);
    y = bottom + 24;
    previous = 'organelle';
  }
  if (rowCompartments.includes('nucleus')) {
    const top = y + 56;
    const bottom = placeLayers('nucleus', top + 40);
    addCompartment('nucleus', cellLeft + 32, top, cellWidth - 64, bottom - top + 28);
    y = bottom + 28;
  }
  const cellBottom = y + 30;
  // The cytosol is the cell body: drawn first (largest), so organelles and nucleus sit inside it.
  {
    compartments.push({ id: 'cell-cytoplasm', name: bandName('cytoplasm'), type: 'cytoplasm', x: cellLeft, y: cytosolTop, width: cellWidth, height: cellBottom - cytosolTop });
    for (const n of cellNodes) if (compartmentOf.get(n.id) === 'cytoplasm') n.compartmentId = 'cell-cytoplasm';
  }

  // 6. Module shading: a translucent column over the whole cell, titled above it.
  groupTitles.forEach((title, g) => {
    if (!title) return;
    const ids = cellNodes.filter((n) => groupOf.get(n.id) === g);
    const x1 = Math.min(spanLeft[g], ...ids.map((n) => n.x)) - 16;
    const x2 = Math.max(spanLeft[g] + spanWidth[g], ...ids.map((n) => n.x + n.width)) + 16;
    panels.push({ id: `panel-module-${g}`, title, kind: 'module', x: x1, y: MARGIN, width: x2 - x1, height: cellBottom - MARGIN + 10 });
  });

  // 8. Outputs row beneath the cell, each under the node(s) that drive it.
  if (outputNodes.length) {
    const top = cellBottom + 50;
    const desired = outputNodes.map((n) => {
      const ups = neighbours.get(n.id)!.filter((k) => layerOf.has(k)).map((k) => byKey.get(k)!);
      return ups.length ? ups.reduce((s, u) => s + u.x + u.width / 2, 0) / ups.length : (cellLeft + cellRight) / 2;
    });
    const idx = outputNodes.map((_, i) => i).sort((a, b) => desired[a] - desired[b]);
    const ids = idx.map((i) => outputNodes[i].id);
    const ox = new Map<string, number>();
    pack(ids, idx.map((i) => desired[i]), cellLeft + 30, Math.max(cellRight - 30, cellLeft + 30 + ids.length * 200), ox);
    for (const n of outputNodes) {
      n.x = Math.round(ox.get(n.id)!);
      n.y = top + 34;
      n.compartmentId = undefined;
    }
    const x1 = Math.min(cellLeft, ...outputNodes.map((n) => n.x - 24));
    const x2 = Math.max(...outputNodes.map((n) => n.x + n.width + 24));
    panels.push({ id: 'panel-outputs', title: 'Outputs', kind: 'outputs', x: x1, y: top, width: x2 - x1, height: 34 + Math.max(...outputNodes.map((n) => n.height)) + 18 });
  }

  // 9. Arrows still passing behind an unrelated node bow around it.
  const CURVES = [70, -70, 120, -120, 180, -180, 250, -250, 330, -330, 420, -420, 520, -520];
  for (const edge of edges) {
    edge.curvature = 0;
    if (!findLineCrossings([edge], nodes).length) continue;
    const fix = CURVES.find((c) => !findLineCrossings([{ ...edge, curvature: c }], nodes).length);
    if (fix !== undefined) edge.curvature = fix;
  }
  // Two-way pairs (p53 → MDM2 ⊣ p53) would draw on top of each other: bow each to its own side (the same
  // curvature bends opposite ways because the arrows run in opposite directions).
  for (const e of edges) {
    const back = edges.find((f) => f !== e && f.sourceNodeId === e.targetNodeId && f.targetNodeId === e.sourceNodeId);
    if (back && !e.curvature && !back.curvature) {
      e.curvature = 40;
      back.curvature = 40;
    }
  }
  const crossings = findLineCrossings(edges, nodes).map((c) => `${c.label} passes behind ${c.through}`);

  // An arrow into a regulator from downstream of what it regulates closes a feedback loop
  // (p53 → MDM2 gene → MDM2 ⊣ p53).
  const closesLoop = (e: PathwayEdge) => {
    const t = regulatorTarget.get(e.targetNodeId);
    return Boolean(t && (t === e.sourceNodeId || reach.get(t)?.has(e.sourceNodeId)));
  };
  const edgeRole = new Map<string, 'spine' | 'feedback' | 'side' | 'crossModule' | 'flow' | 'expression'>();
  const spineNext = new Set(spines.flatMap((s) => s.slice(1).map((t, i) => `${s[i]}>${t}`)));
  for (const e of links) {
    const key = `${e.sourceNodeId}>${e.targetNodeId}`;
    const role = expression(e)
      ? 'expression'
      : spineNext.has(key)
      ? 'spine'
      : feedback.has(key) || returners.has(e.targetNodeId) || closesLoop(e)
        ? 'feedback'
        : isRegulator(e.sourceNodeId)
          ? 'side'
          : !isOutput(e.targetNodeId) && !isOutput(e.sourceNodeId) && groupOf.get(e.sourceNodeId) !== groupOf.get(e.targetNodeId)
            ? 'crossModule'
            : 'flow';
    edgeRole.set(e.id, role);
  }
  // The arrow from the last spine node into its output continues the line.
  for (const e of links) if (isOutput(e.targetNodeId) && spines.some((s) => s[s.length - 1] === e.sourceNodeId)) edgeRole.set(e.id, 'spine');

  return { compartments, panels, crossings, spines: spines.filter((sp) => sp.length), edgeRole, columnOf: groupOf };
}
