// Copied from BioPathway Studio (src/utils/edgeGeometry.ts); takes plain boxes. Label wrapping removed (not used).
/**
 * The shape of each arrow: a smooth curve between the two shapes it joins, leaving and arriving at the
 * clearest side of each (see edgePorts.ts). Pure geometry, no drawing.
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

/** Endpoints, ports and path for an edge, using automatically chosen ports. */
export function edgeGeometry(sourceNode: BoxPx, targetNode: BoxPx, isSelfLoop: boolean, curvature = 0) {
  const [sourcePort, targetPort] = resolveEdgePorts(isSelfLoop, sourceNode, targetNode);
  const p1 = getPortCoordinate(sourceNode, sourcePort);
  const p2 = getPortCoordinate(targetNode, targetPort);
  const path = computeBezierPath(p1, p2, sourcePort, targetPort, curvature, isSelfLoop);
  return { p1, p2, sourcePort, targetPort, ...path };
}
