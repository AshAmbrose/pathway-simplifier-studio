// Copied from BioPathway Studio (src/utils/edgePorts.ts); PathwayNode replaced by a plain box.
/**
 * Automatic attachment of reaction lines to nodes.
 *
 * Every node has 8 attachment points (4 side midpoints + 4 corners). Ports are not stored per
 * edge; they are chosen every time an edge is drawn, from where the two nodes currently sit.
 * Moving a node therefore re-attaches its lines to the clearest ports.
 */

export type PortDirection = 'top' | 'top-right' | 'right' | 'bottom-right' | 'bottom' | 'bottom-left' | 'left' | 'top-left' | 'auto';
export interface BoxPx { x: number; y: number; width: number; height: number }

export type FixedPort = Exclude<PortDirection, 'auto'>;

export const PORTS: FixedPort[] = ['top', 'top-right', 'right', 'bottom-right', 'bottom', 'bottom-left', 'left', 'top-left'];

const D = Math.SQRT1_2;
/** Outward direction of each port. */
const NORMAL: Record<FixedPort, { x: number; y: number }> = {
  top: { x: 0, y: -1 },
  'top-right': { x: D, y: -D },
  right: { x: 1, y: 0 },
  'bottom-right': { x: D, y: D },
  bottom: { x: 0, y: 1 },
  'bottom-left': { x: -D, y: D },
  left: { x: -1, y: 0 },
  'top-left': { x: -D, y: -D },
};

const isCorner = (p: FixedPort) => p.includes('-');

export function getPortCoordinate(node: BoxPx, port: PortDirection): { x: number; y: number } {
  const { x, y, width, height } = node;
  switch (port) {
    case 'top':
      return { x: x + width * 0.5, y };
    case 'top-right':
      return { x: x + width, y };
    case 'right':
      return { x: x + width, y: y + height * 0.5 };
    case 'bottom-right':
      return { x: x + width, y: y + height };
    case 'bottom':
      return { x: x + width * 0.5, y: y + height };
    case 'bottom-left':
      return { x, y: y + height };
    case 'left':
      return { x, y: y + height * 0.5 };
    case 'top-left':
      return { x, y };
    default:
      return { x: x + width * 0.5, y: y + height * 0.5 };
  }
}

/** Does the segment a→b pass through the inside of the node's box (shrunk slightly so touching the edge is fine)? */
function crossesNode(a: { x: number; y: number }, b: { x: number; y: number }, n: BoxPx): boolean {
  const pad = 4;
  const minX = n.x + pad;
  const maxX = n.x + n.width - pad;
  const minY = n.y + pad;
  const maxY = n.y + n.height - pad;
  // Sample along the segment; nodes are small relative to typical edges, so 12 samples are enough.
  for (let i = 1; i < 12; i++) {
    const t = i / 12;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    if (x > minX && x < maxX && y > minY && y < maxY) return true;
  }
  return false;
}

/**
 * Picks the clearest pair of ports between two nodes. Lower cost wins:
 *  - short lines,
 *  - lines that leave the source and enter the target facing each other (no doubling back),
 *  - side midpoints over corners, for a simpler look,
 *  - no line cutting through either node.
 */
export function bestPorts(source: BoxPx, target: BoxPx): [FixedPort, FixedPort] {
  let best: [FixedPort, FixedPort] = ['bottom', 'top'];
  let bestCost = Infinity;

  for (const sp of PORTS) {
    const a = getPortCoordinate(source, sp);
    for (const tp of PORTS) {
      const b = getPortCoordinate(target, tp);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;

      const leave = NORMAL[sp].x * ux + NORMAL[sp].y * uy; // 1 = leaves straight out
      const enter = -(NORMAL[tp].x * ux + NORMAL[tp].y * uy); // 1 = enters straight in

      let cost = len;
      cost += (1 - leave) * 60 + (1 - enter) * 60;
      if (leave < 0.1) cost += 400; // would double back over the source
      if (enter < 0.1) cost += 400; // would approach the target from behind
      if (isCorner(sp)) cost += 18;
      if (isCorner(tp)) cost += 18;
      if (crossesNode(a, b, source) || crossesNode(a, b, target)) cost += 300;

      if (cost < bestCost) {
        bestCost = cost;
        best = [sp, tp];
      }
    }
  }
  return best;
}

/** Ports used to draw an edge right now. Self-loops use a fixed pair. */
export function resolveEdgePorts(isSelfLoop: boolean, source: BoxPx, target: BoxPx): [FixedPort, FixedPort] {
  if (isSelfLoop) return ['top-right', 'right'];
  return bestPorts(source, target);
}
