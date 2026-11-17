/**
 * Compares step 5's layouts on the saved test figures (local data/, if present): the current Compact against the
 * two general-purpose solvers, ELK (layered) and fCoSE (compound spring embedder). Offline, no model calls.
 *
 *   node scripts/compare-layouts.ts
 *
 * Cases: Guo, Yu, Wnt and Hu whole; Guo with only its canonical routes; Yu with only route c (as chosen in step 2).
 * For each it prints the measures (crossings, arrows behind a shape, arrows pointing up), the canvas's shape
 * (width × height in protein heights), how far shapes moved from their place in the original (rank order kept,
 * as a share of pairs whose left/right and above/below order flipped), and the time taken.
 */
import { getRun, listRuns } from '../server/runs.ts';
import { applyEdits } from '../src/edit/applyEdits.ts';
import { layOut } from '../src/layout/adapt.ts';
import { measure } from '../src/layout/measures.ts';
import { elkLayout } from '../src/layout/solvers/elk.ts';
import { fcoseLayout } from '../src/layout/solvers/fcose.ts';
import type { LayoutValue } from '../src/layout/value.ts';
import { toScene } from '../src/render/toScene.ts';
import { focusHidden, traceRoutes } from '../src/simplify/routes.ts';
import { DEFAULT_LAYOUT } from '../src/layout/value.ts';
import type { Extraction } from '../src/types/extraction.ts';

const runs = listRuns();
const find = (part: string) => { const r = runs.find((v) => v.id.endsWith(part)); return r ? getRun(r.id)! : null; };
/** The figure with every route group except `keep` left out, as step 2 would. */
const only = (x: Extraction, keep: string) => {
  const t = traceRoutes(x);
  const off = t.groups.filter((g) => g.label !== keep).flatMap((g) => [...g.routes, ...g.regulators].map((v) => v.key));
  return applyEdits(x, [...focusHidden(x, t, { off, keep: [], drop: [] })].map(([id, why]) => ({ op: 'hide' as const, id, to: null, value: why }))).extraction;
};

const cases: { name: string; run: string; pick?: (x: Extraction) => Extraction }[] = [
  { name: 'Guo, canonical only', run: 'guo2024-nfkb-v3', pick: (x) => only(x, 'Canonical pathway') },
  { name: 'Guo, whole', run: 'guo2024-nfkb-v3' },
  { name: 'Yu, route c', run: 'yu2020-nfkb-v3', pick: (x) => only(x, 'c') },
  { name: 'Yu, whole', run: 'yu2020-nfkb-v3' },
  { name: 'Wnt', run: 'wnt-liu2022-v3' },
  { name: 'Hu', run: 'hu2021-jak-stat-v3' },
];

/** How much of the original's arrangement survived: the share of shape pairs whose left/right and above/below order is unchanged. */
function orderKept(before: Extraction, after: Extraction, W: number, H: number) {
  const pos = (x: Extraction, [cw, ch] = x.canvas ?? [W, H]) => new Map(x.elements.filter((e) => e.kind !== 'heading').map((e) => [e.id, { x: ((e.box[0] + e.box[2] / 2) / 100) * cw, y: ((e.box[1] + e.box[3] / 2) / 100) * ch }]));
  const a = pos(before), b = pos(after), ids = [...a.keys()].filter((id) => b.has(id));
  let same = 0, n = 0;
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const p = a.get(ids[i])!, q = a.get(ids[j])!, P = b.get(ids[i])!, Q = b.get(ids[j])!;
    if (Math.abs(p.x - q.x) > 5) { n++; if (Math.sign(p.x - q.x) === Math.sign(P.x - Q.x)) same++; }
    if (Math.abs(p.y - q.y) > 5) { n++; if (Math.sign(p.y - q.y) === Math.sign(P.y - Q.y)) same++; }
  }
  return n ? same / n : 1;
}

const rows: string[][] = [['Case', 'Method', 'Crossings', 'Behind', 'Up', 'Order kept', 'Shape (w × h)', 'ms']];
for (const c of cases) {
  const r = find(c.run);
  if (!r) { console.log(`skip ${c.name} (no saved run)`); continue; }
  const x = c.pick ? c.pick(r.extraction) : r.extraction, W = r.image.width, H = r.image.height, t = traceRoutes(x);
  const before = measure(toScene(x, W, H));
  rows.push([c.name, 'original', String(before.crossings), String(before.behind), String(before.up), '100%', '', '']);
  const methods: [string, () => Promise<LayoutValue> | LayoutValue][] = [
    ['Compact', () => layOut(x, W, H, t, DEFAULT_LAYOUT)],
    ['ELK layered', () => elkLayout(x, W, H, t, DEFAULT_LAYOUT)],
    ...(process.env.TUNE ? [['ELK tuned', () => elkLayout(x, W, H, t, DEFAULT_LAYOUT, JSON.parse(process.env.TUNE!))] as [string, () => Promise<LayoutValue>]] : []),
    ...(process.env.NO_FCOSE ? [] : [['fCoSE', () => fcoseLayout(x, W, H, t, DEFAULT_LAYOUT)] as [string, () => LayoutValue]]),
  ];
  for (const [name, run] of methods) {
    const t0 = performance.now();
    let v: LayoutValue;
    try { v = await run(); } catch (e) { rows.push([c.name, name, `failed: ${(e as Error).message.slice(0, 60)}`, '', '', '', '', '']); continue; }
    const ms = Math.round(performance.now() - t0);
    const y = applyEdits(x, [{ op: 'set_layout', id: 'layout', to: null, value: JSON.stringify(v) }]);
    const m = measure(toScene(y.extraction, W, H));
    rows.push([c.name, name, String(m.crossings), String(m.behind), String(m.up), `${Math.round(orderKept(x, y.extraction, W, H) * 100)}%`,
      `${(v.canvas[0] / 40).toFixed(0)} × ${(v.canvas[1] / 40).toFixed(0)}${y.failed.length ? ' (did not apply)' : ''}`, String(ms)]);
  }
}
const widths = rows[0].map((_, i) => Math.max(...rows.map((r) => r[i].length)));
for (const r of rows) console.log(r.map((v, i) => v.padEnd(widths[i])).join('  '));
process.exit(0);
