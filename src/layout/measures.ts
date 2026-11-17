/**
 * Step 5's before → after numbers: how readable a drawing is, measured the way BioPathway Studio's Organize
 * Layout scores its own results.
 *  - crossings: pairs of arrows whose lines cross (arrows meeting at a shape count only if they cross away from it);
 *  - behind: arrows whose line runs behind a shape they don't join (a shape drawn in one cluster with an end counts as joined);
 *  - up: arrows pointing up, against the top-to-bottom reading direction; those that return to where the
 *    signal came from (feedback: their end leads back to their start) are counted separately, as they may.
 * Worked out on the drawn scene, so they hold for any positions: the original's or the new layout's.
 */
import type { Scene } from '../render/toScene.ts';

export interface Measures { crossings: number; behind: number; up: number; feedbackUp: number }

type P = { x: number; y: number };
const orient = (p: P, q: P, r: P) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
const cross = (a: P, b: P, c: P, d: P) => orient(a, b, c) * orient(a, b, d) < 0 && orient(c, d, a) * orient(c, d, b) < 0;

export function measure(scene: Scene): Measures {
  const groupMembers = new Map(scene.groups.map((g) => [g.id, g.members]));
  /** A shape or cluster, with the shapes inside a cluster, and the shapes drawn in one cluster with a shape. */
  const reach = (id: string) => {
    const around = scene.groups.filter((g) => g.members.includes(id));
    return new Set([id, ...(groupMembers.get(id) ?? []), ...around.map((g) => g.id), ...around.flatMap((g) => g.members)]);
  };
  const arrows = scene.arrows.filter((a) => a.from !== a.to && !a.freeFrom && !a.freeTo);
  const ends = new Map(arrows.map((a) => [a.id, new Set([...reach(a.from), ...reach(a.to)])]));

  let crossings = 0;
  for (let i = 0; i < arrows.length; i++)
    for (let j = i + 1; j < arrows.length; j++) {
      const a = arrows[i], b = arrows[j];
      // Arrows meeting at a shape count only if their lines cross away from it (the middle of each line).
      const shared = [...ends.get(a.id)!].some((id) => ends.get(b.id)!.has(id));
      const pa = shared ? a.pts.slice(3, 14) : a.pts, pb = shared ? b.pts.slice(3, 14) : b.pts;
      if (pa.slice(1).some((p, k) => pb.slice(1).some((q, m) => cross(pa[k], p, pb[m], q)))) crossings++;
    }

  let behind = 0;
  for (const a of arrows) {
    const skip = ends.get(a.id)!;
    const hit = scene.nodes.some((n) => {
      if (skip.has(n.id)) return false;
      const m = Math.max(2, Math.min(n.width, n.height) * 0.15);
      return a.pts.some((p) => p.x > n.x + m && p.x < n.x + n.width - m && p.y > n.y + m && p.y < n.y + n.height - m);
    });
    if (hit) behind++;
  }

  // Feedback: the arrow's end leads back to its start along the figure's arrows (clusters reach their shapes).
  const next = new Map<string, string[]>();
  for (const a of arrows) for (const f of reach(a.from)) next.set(f, [...(next.get(f) ?? []), ...reach(a.to)]);
  const leadsTo = (from: string, to: Set<string>) => {
    const seen = new Set<string>(), queue = [...reach(from)];
    while (queue.length) { const v = queue.shift()!; if (to.has(v)) return true; if (seen.has(v)) continue; seen.add(v); queue.push(...(next.get(v) ?? [])); }
    return false;
  };
  const heights = scene.nodes.map((n) => n.height).sort((p, q) => p - q);
  const step = (heights[Math.floor(heights.length / 2)] ?? 10) * 0.5;
  let up = 0, feedbackUp = 0;
  for (const a of arrows) {
    if (a.y2 >= a.y1 - step) continue;
    if (leadsTo(a.to, reach(a.from))) feedbackUp++; else up++;
  }
  return { crossings, behind, up, feedbackUp };
}
