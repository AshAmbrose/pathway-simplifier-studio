// computeBezierPath is copied from BioPathway Studio (src/utils/edgeGeometry.ts), used here for self-loops only.
/**
 * The shape of each arrow: a straight line between the two shapes it joins, leaving each where the line between
 * their centres crosses its edge; bowed only when asked (the layout step bows an arrow around a shape).
 * BioPathway Studio's port-to-port curves made arrows in published figures look curly, so they are no longer
 * used for ordinary arrows. Pure geometry, no drawing.
 */

import type { BoxPx, PortDirection } from './edgePorts.ts';
import { getPortCoordinate, resolveEdgePorts } from './edgePorts.ts';

/** The curve between two points, leaving and arriving along the given sides; also its midpoint, for labels. */
export function computeBezierPath(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  port1: PortDirection,
  port2: PortDirection,
  curvature = 0,
  isSelfLoop = false
): { d: string; midX: number; midY: number; cp1: { x: number; y: number }; cp2: { x: number; y: number } } {
  // Handle self-loop (e.g. Autophosphorylation or self-inhibition)
  if (isSelfLoop) {
    const loopOffset = Math.max(50, Math.abs(curvature) + 50);
    const cp1 = { x: p1.x - loopOffset * 0.6, y: p1.y - loopOffset };
    const cp2 = { x: p2.x + loopOffset * 0.6, y: p2.y - loopOffset };
    const d = `M ${p1.x} ${p1.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${p2.x} ${p2.y}`;
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2 - loopOffset * 0.75;
    return { d, midX, midY, cp1, cp2 };
  }

  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const handleLen = Math.max(25, Math.min(130, dist * 0.4));

  // Determine control point offsets based on port direction (8-port tangents)
  let cp1 = { ...p1 };
  let cp2 = { ...p2 };

  switch (port1) {
    case 'top':
      cp1.y -= handleLen;
      break;
    case 'top-right':
      cp1.x += handleLen * 0.7;
      cp1.y -= handleLen * 0.7;
      break;
    case 'right':
      cp1.x += handleLen;
      break;
    case 'bottom-right':
      cp1.x += handleLen * 0.7;
      cp1.y += handleLen * 0.7;
      break;
    case 'bottom':
      cp1.y += handleLen;
      break;
    case 'bottom-left':
      cp1.x -= handleLen * 0.7;
      cp1.y += handleLen * 0.7;
      break;
    case 'left':
      cp1.x -= handleLen;
      break;
    case 'top-left':
      cp1.x -= handleLen * 0.7;
      cp1.y -= handleLen * 0.7;
      break;
    default:
      cp1.y += handleLen;
  }

  switch (port2) {
    case 'top':
      cp2.y -= handleLen;
      break;
    case 'top-right':
      cp2.x += handleLen * 0.7;
      cp2.y -= handleLen * 0.7;
      break;
    case 'right':
      cp2.x += handleLen;
      break;
    case 'bottom-right':
      cp2.x += handleLen * 0.7;
      cp2.y += handleLen * 0.7;
      break;
    case 'bottom':
      cp2.y += handleLen;
      break;
    case 'bottom-left':
      cp2.x -= handleLen * 0.7;
      cp2.y += handleLen * 0.7;
      break;
    case 'left':
      cp2.x -= handleLen;
      break;
    case 'top-left':
      cp2.x -= handleLen * 0.7;
      cp2.y -= handleLen * 0.7;
      break;
    default:
      cp2.y -= handleLen;
  }

  // Apply optional curvature deflection perpendicular to chord
  if (curvature !== 0) {
    const perpX = -dy / (dist || 1);
    const perpY = dx / (dist || 1);
    cp1.x += perpX * curvature;
    cp1.y += perpY * curvature;
    cp2.x += perpX * curvature;
    cp2.y += perpY * curvature;
  }

  const d = `M ${p1.x} ${p1.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${p2.x} ${p2.y}`;

  // Approximate midpoint for label and handle placement
  const midX = (p1.x + 3 * cp1.x + 3 * cp2.x + p2.x) / 8;
  const midY = (p1.y + 3 * cp1.y + 3 * cp2.y + p2.y) / 8;

  return { d, midX, midY, cp1, cp2 };
}

type P = { x: number; y: number };
export type Side = 'top' | 'bottom' | 'left' | 'right';

/** Where the line from a box's centre towards `toward` leaves the box, and through which side. */
export function boxExit(b: BoxPx, toward: P): P & { side: Side } {
  const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
  const dx = toward.x - cx, dy = toward.y - cy;
  if (!b.width || !b.height || (!dx && !dy)) return { x: cx, y: cy, side: dy < 0 ? 'top' : 'bottom' };
  const tx = dx ? b.width / 2 / Math.abs(dx) : Infinity, ty = dy ? b.height / 2 / Math.abs(dy) : Infinity;
  const t = Math.min(tx, ty);
  // The other end sits inside this box (shapes drawn on each other): leave from the centre.
  if (t >= 1) return { x: cx, y: cy, side: dy < 0 ? 'top' : 'bottom' };
  return { x: cx + dx * t, y: cy + dy * t, side: tx < ty ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'bottom' : 'top' };
}

/**
 * The path of an arrow between two boxes: straight, or bowed sideways by `curvature` (picture units). `at` can
 * fix either end (the renderer spreads several arrows meeting one side of a shape, so they stay apart).
 */
export function edgeGeometry(sourceNode: BoxPx, targetNode: BoxPx, isSelfLoop: boolean, curvature = 0, at?: { p1?: P; p2?: P }) {
  if (isSelfLoop) {
    const [sourcePort, targetPort] = resolveEdgePorts(isSelfLoop, sourceNode, targetNode);
    const p1 = getPortCoordinate(sourceNode, sourcePort), p2 = getPortCoordinate(targetNode, targetPort);
    return { p1, p2, ...computeBezierPath(p1, p2, sourcePort as PortDirection, targetPort as PortDirection, curvature, true) };
  }
  const c1 = { x: sourceNode.x + sourceNode.width / 2, y: sourceNode.y + sourceNode.height / 2 };
  const c2 = { x: targetNode.x + targetNode.width / 2, y: targetNode.y + targetNode.height / 2 };
  const p1: P = at?.p1 ?? boxExit(sourceNode, c2), p2: P = at?.p2 ?? boxExit(targetNode, c1);
  const dx = p2.x - p1.x, dy = p2.y - p1.y, len = Math.hypot(dx, dy) || 1;
  // A bow: one control point off the middle of the line (as a cubic, so every path has the same shape of numbers).
  const q = { x: (p1.x + p2.x) / 2 - (dy / len) * curvature * 1.5, y: (p1.y + p2.y) / 2 + (dx / len) * curvature * 1.5 };
  const cp1 = curvature ? { x: p1.x + (2 / 3) * (q.x - p1.x), y: p1.y + (2 / 3) * (q.y - p1.y) } : { x: p1.x + dx / 3, y: p1.y + dy / 3 };
  const cp2 = curvature ? { x: p2.x + (2 / 3) * (q.x - p2.x), y: p2.y + (2 / 3) * (q.y - p2.y) } : { x: p1.x + (2 * dx) / 3, y: p1.y + (2 * dy) / 3 };
  const d = `M ${p1.x} ${p1.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${p2.x} ${p2.y}`;
  return { p1, p2, d, midX: (p1.x + 3 * cp1.x + 3 * cp2.x + p2.x) / 8, midY: (p1.y + 3 * cp1.y + 3 * cp2.y + p2.y) / 8, cp1, cp2 };
}
