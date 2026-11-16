/**
 * How well a practice run was put back: for each shape taken out by make-practice-run.ts, is there now a shape
 * with the same name in roughly the same place, and are its arrows back (same ends and head)? Offline.
 *
 *   node scripts/check-practice.ts <run id>
 */
import { existsSync, readFileSync } from 'node:fs';
import { getRun } from '../server/runs.ts';
import { applyEdits } from '../src/edit/applyEdits.ts';
import type { Extraction } from '../src/types/extraction.ts';

const id = process.argv[2];
const run = id ? getRun(id) : null;
const pfile = new URL(`../data/runs/${id}/practice.json`, import.meta.url);
if (!run || !existsSync(pfile)) { console.error('usage: node scripts/check-practice.ts <run id> (a run made by make-practice-run.ts)'); process.exit(1); }
const { removed } = JSON.parse(readFileSync(pfile, 'utf8')) as { removed: { elements: Extraction['elements']; arrows: Extraction['arrows'] } };
const order = (es: typeof run.review.edits) => [...es.filter((e) => e.source !== 'manual'), ...es.filter((e) => e.source === 'manual')];
const now = applyEdits(run.extraction, order(run.review.edits)).extraction;

const norm = (s: string | null) => (s ?? '').toLowerCase().replace(/\s+/g, '');
/** Overlap of two percent boxes, as a share of the smaller one. */
const overlap = (a: number[], b: number[]) => {
  const w = Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]));
  const h = Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]));
  return (w * h) / Math.min(a[2] * a[3], b[2] * b[3]);
};
const centreGap = (a: number[], b: number[]) => Math.hypot(a[0] + a[2] / 2 - (b[0] + b[2] / 2), a[1] + a[3] / 2 - (b[1] + b[3] / 2));

// Each removed shape is matched to the best added shape: same name, nearest place.
const added = now.elements.filter((e) => e.id.startsWith('new-'));
const match = new Map<string, string>();
for (const e of removed.elements) {
  const best = added.filter((a) => !match.has(a.id) && ![...match.values()].includes(a.id))
    .map((a) => ({ a, named: norm(a.label) === norm(e.label), gap: centreGap(a.box, e.box) }))
    .sort((p, q) => Number(q.named) - Number(p.named) || p.gap - q.gap)[0];
  if (best && (best.named || best.gap < 8)) match.set(e.id, best.a.id);
}
const mapped = (id: string) => match.get(id) ?? id;
let ok = 0, total = 0;
const line = (pass: boolean, text: string) => { total++; if (pass) ok++; console.log(`${pass ? 'ok  ' : 'MISS'} ${text}`); };
for (const e of removed.elements) {
  const m = match.get(e.id);
  const a = m ? now.elements.find((v) => v.id === m)! : null;
  line(!!a, `${e.label ?? '(no label)'}: added back`);
  if (!a) continue;
  line(norm(a.label) === norm(e.label), `  name "${a.label ?? ''}" (originally "${e.label ?? ''}")`);
  line(overlap(a.box, e.box) > 0.3 || centreGap(a.box, e.box) < 4, `  in the right place (centre ${centreGap(a.box, e.box).toFixed(1)}% of the image away)`);
}
for (const r of removed.arrows) {
  const el = (id: string) => removed.elements.find((v) => v.id === id) ?? run.extraction.elements.find((v) => v.id === id);
  const name = (id: string) => el(id)?.label ?? (el(id) ? `(${el(id)!.kind}, no label)` : run.extraction.groups.find((g) => g.id === id)?.label ?? id);
  const back = now.arrows.find((a) => a.from === mapped(r.from) && a.to === mapped(r.to));
  line(!!back && back.head === r.head, `arrow ${name(r.from)} ${r.head === 'bar' ? '⊣' : '→'} ${name(r.to)}: back${back && back.head !== r.head ? ` (but its head is "${back.head}", was "${r.head}")` : ''}`);
}
const extra = added.filter((a) => ![...match.values()].includes(a.id));
if (extra.length) console.log(`note: ${extra.length} other shape(s) added: ${extra.map((e) => e.label ?? '(no name)').join(', ')}`);
console.log(`\n${ok} of ${total} checks pass`);
