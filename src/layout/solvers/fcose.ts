/**
 * Comparison page only: fCoSE, the compound spring embedder from the Cytoscape.js family (cytoscape-fcose, MIT), made
 * for biological pathways drawn as compound graphs.
 * The figure becomes a compound graph: panels hold compartments, compartments hold units (shapes that travel
 * together, fixed-size). Arrows are springs and shapes repel, starting from where the figure drew them (no random
 * start), so the result stays close to the original. Constraints keep it readable:
 *  - an arrow drawn downward in the original keeps pointing down ("top"/"bottom" placement);
 *  - shapes side by side in one compartment keep their left-to-right order;
 *  - compartments keep the cell's top-to-bottom order (outside, membrane, cytoplasm, nucleus).
 */
import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
import type { Tracing } from '../../simplify/routes.ts';
import type { Extraction } from '../../types/extraction.ts';
import type { Box } from '../arrows.ts';
import type { LayoutOptions, LayoutValue } from '../value.ts';
import { buildGraph, toValue } from './graph.ts';

cytoscape.use(fcose);

export function fcoseLayout(x: Extraction, W: number, H: number, t: Tracing, opts: LayoutOptions): LayoutValue {
  const g = buildGraph(x, W, H, t, opts);
  const unit = new Map(g.units.map((u) => [u.key, u]));
  const parentOf = (u: (typeof g.units)[number]) => (u.region ? `r:${u.region}` : u.panel && g.panels.length ? `p:${u.panel}` : undefined);
  const elements: cytoscape.ElementDefinition[] = [
    ...g.panels.map((p) => ({ data: { id: `p:${p}` } })),
    ...g.regions.map((v) => ({ data: { id: `r:${v.r.id}`, parent: v.parent ? `r:${v.parent}` : v.panel && g.panels.length ? `p:${v.panel}` : undefined } })),
    ...g.units.map((u) => ({ data: { id: `u:${u.key}`, parent: parentOf(u), w: u.w, h: u.h }, position: { x: u.orig.x + u.orig.width / 2, y: u.orig.y + u.orig.height / 2 } })),
    ...g.edges.map((e) => ({ data: { id: `e:${e.id}`, source: `u:${e.from}`, target: `u:${e.to}` } })),
  ];

  // Down stays down: an arrow drawn downward keeps its source above its target, with room between.
  const mid = (k: string) => unit.get(k)!.orig.y + unit.get(k)!.orig.height / 2;
  const relative: { top?: string; bottom?: string; left?: string; right?: string; gap?: number }[] = [];
  const seen = new Set<string>();
  for (const e of g.edges) {
    const pair = `${e.from}>${e.to}`;
    if (seen.has(pair) || seen.has(`${e.to}>${e.from}`)) continue;
    seen.add(pair);
    if (mid(e.to) > mid(e.from) + 5) relative.push({ top: `u:${e.from}`, bottom: `u:${e.to}`, gap: 40 });
  }
  // Left to right stays left to right, for shapes level with each other in one compartment.
  for (const r of g.regions) {
    const row = g.units.filter((u) => u.region === r.r.id).sort((a, b) => a.orig.x - b.orig.x);
    for (let i = 0; i + 1 < row.length; i++) {
      const a = row[i], b = row[i + 1];
      if (Math.min(a.orig.y + a.orig.height, b.orig.y + b.orig.height) - Math.max(a.orig.y, b.orig.y) > 0.3 * Math.min(a.orig.height, b.orig.height))
        relative.push({ left: `u:${a.key}`, right: `u:${b.key}`, gap: 20 });
    }
  }
  // The cell's order: every unit in one band above every unit of the next band down (in the same panel), linked
  // through the band's lowest and the next band's highest shape.
  for (const panel of g.panels.length ? g.panels : [null]) {
    const bands = g.regions.filter((v) => !v.parent && (v.panel ?? null) === panel).sort((a, b) => a.rank - b.rank);
    for (let i = 0; i + 1 < bands.length; i++) {
      if (bands[i].rank === bands[i + 1].rank) continue;
      const upper = g.units.filter((u) => u.region === bands[i].r.id), lower = g.units.filter((u) => u.region === bands[i + 1].r.id);
      if (!upper.length || !lower.length) continue;
      const low = upper.sort((a, b) => b.orig.y + b.orig.height - (a.orig.y + a.orig.height))[0], high = lower.sort((a, b) => a.orig.y - b.orig.y)[0];
      relative.push({ top: `u:${low.key}`, bottom: `u:${high.key}`, gap: 50 });
    }
  }

  const cy = cytoscape({ headless: true, styleEnabled: true, elements,
    style: [{ selector: 'node[w]', style: { width: 'data(w)', height: 'data(h)' } }, { selector: ':parent', style: { 'padding': '18px' } as cytoscape.Css.Node }] });
  cy.layout({
    name: 'fcose', quality: 'proof', randomize: false, animate: false, fit: false,
    nodeSeparation: 40, idealEdgeLength: 70, nodeRepulsion: 6500, edgeElasticity: 0.45, nestingFactor: 0.1,
    gravity: 0.25, gravityCompound: 1.0, numIter: 2500, packComponents: false, tile: false,
    relativePlacementConstraint: relative,
  } as cytoscape.LayoutOptions).run();

  const at = new Map<string, { x: number; y: number }>(), regionBox = new Map<string, Box>(), panelBox = new Map<string, Box>();
  cy.nodes().forEach((n) => {
    const id = n.id(), bb = n.boundingBox({ includeLabels: false, includeOverlays: false });
    const b = { x: bb.x1, y: bb.y1, width: bb.w, height: bb.h };
    if (id.startsWith('u:')) { const u = unit.get(id.slice(2))!; at.set(u.key, { x: n.position('x') - u.w / 2, y: n.position('y') - u.h / 2 }); }
    if (id.startsWith('r:')) regionBox.set(id.slice(2), b);
    if (id.startsWith('p:')) panelBox.set(id.slice(2), b);
  });
  cy.destroy();
  return toValue(x, g, t, opts, at, regionBox, panelBox);
}
