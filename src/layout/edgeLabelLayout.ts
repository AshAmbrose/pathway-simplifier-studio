// Copied from BioPathway Studio (src/utils/edgeLabelLayout.ts), adapted: plain boxes instead of its node and edge
// types, this app's edgeGeometry, labels drawn on one line, and no earlier-form afterimages.
/**
 * Places reaction-arrow labels so they never sit on a node or on another label.
 *
 * Each label tries positions along its own arrow, from the middle outwards, on the preferred
 * side first, then the other side, then on the line, stepping further from the line only if
 * needed. It takes the first spot that is clear.
 * If no spot is clear (a very crowded area), it takes the spot with the least overlap,
 * and `findLabelOverlaps` reports it.
 */

import { edgeGeometry as geometry } from '../render/edgeGeometry.ts';
import type { LEdge, LNode } from './cellLayout.ts';

type PathwayNode = LNode;
type PathwayEdge = LEdge;
/** The curve of an arrow between two laid-out shapes, with its bend. */
export const edgeGeometry = (e: PathwayEdge, a: PathwayNode, b: PathwayNode) => geometry(a, b, e.sourceNodeId === e.targetNodeId, e.curvature || 0);

export type LabelSide = 'below' | 'on' | 'above';

export interface LabelBox {
  /** Centre of the label pill. */
  x: number;
  y: number;
  width: number;
  height: number;
  lines: string[];
}

interface Rect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Extra clearance around nodes, covering PTM badges that sit just outside the shape. */
const NODE_PAD = 8;
/** Gap kept between neighbouring labels. */
const LABEL_PAD = 3;
const T_ORDER = [0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74, 0.18, 0.82];
/** Additional distance from the line, tried in order when closer spots are blocked. */
const EXTRA_OFFSETS = [0, 12, 24, 36];

/** Arrow text is drawn on one line here. `scale` sizes it for the font it will be drawn at (1 = about 11px). */
export function labelSize(label: string, scale = 1): { width: number; height: number; lines: string[] } {
  const lines = [label.trim()];
  const maxLen = Math.max(...lines.map((l) => l.length), 1);
  const width = Math.max(38, maxLen * (lines.length === 1 ? 6.2 : 5.8) + 16);
  const height = lines.length === 1 ? 19 : lines.length === 2 ? 30 : 42;
  return { width: width * scale, height: height * scale, lines };
}

function boxRect(b: { x: number; y: number; width: number; height: number }, pad = 0): Rect {
  return { x1: b.x - b.width / 2 - pad, y1: b.y - b.height / 2 - pad, x2: b.x + b.width / 2 + pad, y2: b.y + b.height / 2 + pad };
}

export function nodeRect(n: PathwayNode, pad = NODE_PAD): Rect {
  const b = n;
  return { x1: b.x - pad, y1: b.y - pad, x2: b.x + b.width + pad, y2: b.y + b.height + pad };
}

function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
  const h = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Point and downward-facing unit normal on the edge's cubic bezier at parameter t. */
function pointAndNormal(
  g: { p1: { x: number; y: number }; p2: { x: number; y: number }; cp1: { x: number; y: number }; cp2: { x: number; y: number } },
  t: number
) {
  const { p1, cp1, cp2, p2 } = g;
  const u = 1 - t;
  const x = u * u * u * p1.x + 3 * u * u * t * cp1.x + 3 * u * t * t * cp2.x + t * t * t * p2.x;
  const y = u * u * u * p1.y + 3 * u * u * t * cp1.y + 3 * u * t * t * cp2.y + t * t * t * p2.y;
  const dx = 3 * u * u * (cp1.x - p1.x) + 6 * u * t * (cp2.x - cp1.x) + 3 * t * t * (p2.x - cp2.x);
  const dy = 3 * u * u * (cp1.y - p1.y) + 6 * u * t * (cp2.y - cp1.y) + 3 * t * t * (p2.y - cp2.y);
  const len = Math.hypot(dx, dy) || 1;
  let nx = -dy / len;
  let ny = dx / len;
  // Orient the normal downwards; for vertical lines, to the right.
  if (ny < 0 || (Math.abs(ny) < 0.001 && nx < 0)) {
    nx = -nx;
    ny = -ny;
  }
  return { x, y, nx, ny };
}

export function layoutEdgeLabels(
  edges: PathwayEdge[],
  nodes: PathwayNode[],
  preferred: LabelSide = 'below',
  scale = 1
): Map<string, LabelBox> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const nodeRects = nodes.map((n) => nodeRect(n));
  const placed: Rect[] = [];
  const result = new Map<string, LabelBox>();
  // Points along every arrow, so a label is not put on top of another arrow (where it reads as that arrow's).
  const samples = new Map<string, Array<{ x: number; y: number }>>();
  for (const e of edges) {
    const a = byId.get(e.sourceNodeId);
    const b = byId.get(e.targetNodeId);
    if (!a || !b) continue;
    const g = edgeGeometry(e, a, b);
    samples.set(e.id, Array.from({ length: 23 }, (_, i) => pointAndNormal(g, (i + 1) / 24)));
  }

  const sides: LabelSide[] =
    preferred === 'on' ? ['on', 'below', 'above'] : preferred === 'above' ? ['above', 'below', 'on'] : ['below', 'above', 'on'];

  for (const edge of edges) {
    const src = byId.get(edge.sourceNodeId);
    const tgt = byId.get(edge.targetNodeId);
    if (!edge.label || !src || !tgt) continue;

    const { width, height, lines } = labelSize(edge.label, scale);
    const g = edgeGeometry(edge, src, tgt);

    let best: LabelBox | null = null;
    let bestScore = Infinity;
    let rank = 0;

    // Nearest-to-the-line spots first; step further out only when everything closer is blocked.
    search: for (const extra of EXTRA_OFFSETS) {
      for (const side of sides) {
        if (side === 'on' && extra > 0) continue;
        for (const t of T_ORDER) {
        const p = pointAndNormal(g, t);
        const offset = side === 'on' ? 0 : (height / 2 + 7 + extra) * (side === 'below' ? 1 : -1);
        const box = { x: p.x + p.nx * offset, y: p.y + p.ny * offset, width, height, lines };
        const r = boxRect(box);
        const rLabel = boxRect(box, LABEL_PAD);

        let overlap = 0;
        for (const nr of nodeRects) overlap += overlapArea(r, nr);
        for (const pr of placed) overlap += overlapArea(rLabel, pr);
        // A spot nearer to another arrow than to its own reads as that arrow's label: ranked last.
        const d2 = (q: { x: number; y: number }) => (q.x - box.x) ** 2 + (q.y - box.y) ** 2;
        const own = Math.min(...(samples.get(edge.id) ?? []).map(d2));
        for (const [id, pts] of samples) {
          if (id === edge.id) continue;
          for (const q of pts) if (q.x > r.x1 && q.x < r.x2 && q.y > r.y1 && q.y < r.y2) overlap += 60;
          if (Math.min(...pts.map(d2)) < own) overlap += 1e6;
        }

        const score = overlap * 100 + rank++;
        if (score < bestScore) {
          bestScore = score;
          best = box;
        }
        if (overlap === 0) break search;
        }
      }
    }

    if (best) {
      result.set(edge.id, best);
      placed.push(boxRect(best, LABEL_PAD));
    }
  }
  return result;
}

export interface LabelOverlap {
  edgeId: string;
  label: string;
  /** Node label or edge label it overlaps. */
  with: string;
  kind: 'node' | 'label';
}

/** Lists every arrow label that still overlaps a node or another arrow label after layout. */
export function findLabelOverlaps(edges: PathwayEdge[], nodes: PathwayNode[], preferred: LabelSide = 'below'): LabelOverlap[] {
  const boxes = layoutEdgeLabels(edges, nodes, preferred);
  const out: LabelOverlap[] = [];
  const entries = [...boxes.entries()];
  entries.forEach(([edgeId, box], i) => {
    const label = edges.find((e) => e.id === edgeId)?.label ?? edgeId;
    const r = boxRect(box);
    for (const n of nodes) {
      if (overlapArea(r, nodeRect(n, 0)) > 0) out.push({ edgeId, label, with: n.label ?? n.id, kind: 'node' });
    }
    for (const [otherId, other] of entries.slice(i + 1)) {
      if (overlapArea(r, boxRect(other)) > 0) {
        out.push({ edgeId, label, with: edges.find((e) => e.id === otherId)?.label ?? otherId, kind: 'label' });
      }
    }
  });
  return out;
}

export interface LineCrossing {
  edgeId: string;
  label: string;
  /** Label of the node the arrow passes through. */
  through: string;
}

/** Lists arrows whose drawn path passes through a node other than the two it connects. */
export function findLineCrossings(edges: PathwayEdge[], nodes: PathwayNode[]): LineCrossing[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out: LineCrossing[] = [];
  for (const e of edges) {
    const src = byId.get(e.sourceNodeId);
    const tgt = byId.get(e.targetNodeId);
    if (!src || !tgt || src === tgt) continue;
    const g = edgeGeometry(e, src, tgt);
    for (const n of nodes) {
      if (n.id === src.id || n.id === tgt.id) continue;
      const r = nodeRect(n, -4); // a few px inside the node: grazing an edge is fine
      for (let i = 1; i < 40; i++) {
        const p = pointAndNormal(g, i / 40);
        if (p.x > r.x1 && p.x < r.x2 && p.y > r.y1 && p.y < r.y2) {
          out.push({ edgeId: e.id, label: `${src.label} → ${tgt.label}`, through: n.label ?? n.id });
          break;
        }
      }
    }
  }
  return out;
}
