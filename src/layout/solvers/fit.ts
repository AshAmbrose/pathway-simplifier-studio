/**
 * Measures for how a drawing uses its space (comparison page and script), alongside crossings and the rest (measures.ts):
 *  - onScreen: how tall a typical shape is, in screen pixels, when the whole figure is fitted to a 1600 × 1000
 *    window; bigger means more readable text;
 *  - aspect: width ÷ height of the canvas;
 *  - filled: the share of the canvas covered by shapes (the rest is gaps and margins);
 *  - sharedEnds: pairs of arrows whose ends land on the same spot of a shape (hard to tell apart).
 */
import type { Scene } from '../../render/toScene.ts';

export interface Fit { onScreen: number; aspect: number; filled: number; sharedEnds: number }

export function fitMeasures(scene: Scene, screen = { w: 1600, h: 1000 }): Fit {
  const k = Math.min(screen.w / scene.width, screen.h / scene.height);
  const hs = scene.nodes.map((n) => n.height).sort((a, b) => a - b);
  const median = hs.length ? hs[Math.floor(hs.length / 2)] : 0;
  const area = scene.nodes.reduce((sum, n) => sum + n.width * n.height, 0);
  const ends = scene.arrows.flatMap((a) => [{ id: a.from, x: a.x1, y: a.y1 }, { id: a.to, x: a.x2, y: a.y2 }]);
  let sharedEnds = 0;
  const near = Math.max(scene.width, scene.height) / 200;
  for (let i = 0; i < ends.length; i++) for (let j = i + 1; j < ends.length; j++)
    if (ends[i].id === ends[j].id && Math.hypot(ends[i].x - ends[j].x, ends[i].y - ends[j].y) < near) sharedEnds++;
  return { onScreen: Math.round(median * k), aspect: Math.round((scene.width / scene.height) * 100) / 100, filled: Math.round((area / (scene.width * scene.height)) * 100) / 100, sharedEnds };
}
