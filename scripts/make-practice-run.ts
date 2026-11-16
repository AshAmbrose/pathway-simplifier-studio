/**
 * Makes a practice run for the review screen, offline (no model call): a saved result with chosen shapes taken
 * out, to be put back by hand. Their arrows, contacts and cluster memberships go with them.
 *
 *   node scripts/make-practice-run.ts <result.json> <image> "<name>" [shape ids to remove, comma-separated]
 *
 * With no ids, the run is a plain copy (for adding shapes freely). What was removed is kept with the run
 * (practice.json beside run.json), so scripts/check-practice.ts can say whether it was put back.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { ExtractionSchema, referenceProblems } from '../src/types/extraction.ts';
import { optionProblems } from '../src/edit/applyEdits.ts';
import { saveRun } from '../server/runs.ts';

const [resultPath, imagePath, name, idList] = process.argv.slice(2);
if (!resultPath || !imagePath || !name) { console.error('usage: node scripts/make-practice-run.ts <result.json> <image> "<name>" [ids]'); process.exit(1); }
const raw = JSON.parse(readFileSync(resultPath, 'utf8'));
const original = ExtractionSchema.parse(raw);
const remove = new Set((idList ?? '').split(',').map((s) => s.trim()).filter(Boolean));
for (const id of remove) if (!original.elements.some((e) => e.id === id)) { console.error(`no shape "${id}" in ${resultPath}`); process.exit(1); }

const gone = (id: string) => remove.has(id);
const removed = {
  elements: original.elements.filter((e) => gone(e.id)),
  arrows: original.arrows.filter((a) => gone(a.from) || gone(a.to)),
  contacts: original.contacts.filter((c) => gone(c.a) || gone(c.b)),
  groups: original.groups.filter((g) => g.members.some(gone)).map((g) => ({ id: g.id, members: g.members.filter(gone) })),
};
const x = structuredClone(original);
x.elements = x.elements.filter((e) => !gone(e.id));
x.arrows = x.arrows.filter((a) => !gone(a.from) && !gone(a.to));
x.contacts = x.contacts.filter((c) => !gone(c.a) && !gone(c.b));
x.groups = x.groups.map((g) => ({ ...g, members: g.members.filter((m) => !gone(m)) })).filter((g) => g.members.length > 0);
x.flags = x.flags.filter((f) => !gone(f.on) && !removed.arrows.some((a) => a.id === f.on));
// A question about a removed shape can't be answered any more.
x.clarify = x.clarify.filter((c) => !c.about.some(gone) && !c.about.some((id) => removed.arrows.some((a) => a.id === id))
  && !c.options.some((o) => (o.shape && gone(o.shape)) || o.edits.some((e) => gone(e.id) || (e.to && gone(e.to)))));

const sips = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', imagePath], { encoding: 'utf8' });
const width = Number(/pixelWidth: (\d+)/.exec(sips)![1]), height = Number(/pixelHeight: (\d+)/.exec(sips)![1]);
const mimeType = /\.png$/i.test(imagePath) ? 'image/png' : /\.webp$/i.test(imagePath) ? 'image/webp' : 'image/jpeg';
const rec = saveRun(name, mimeType, readFileSync(imagePath), { width, height }, {
  extraction: x, problems: [...referenceProblems(x), ...optionProblems(x)],
  model: String(raw._run?.model ?? raw.model ?? 'unknown'), promptVersion: `practice (from ${resultPath.split('/').pop()})`,
  seconds: 0, usage: { inputTokens: 0, outputTokens: 0, thoughtTokens: 0 }, costUsd: 0, priceKnown: false,
});
writeFileSync(new URL(`../data/runs/${rec.id}/practice.json`, import.meta.url), JSON.stringify({ source: resultPath, removed }, null, 1));
console.log(rec.id);
for (const e of removed.elements) {
  const arrows = removed.arrows.filter((a) => a.from === e.id || a.to === e.id).map((a) => {
    const n = (id: string) => original.elements.find((v) => v.id === id)?.label ?? original.groups.find((g) => g.id === id)?.label ?? id;
    return `${n(a.from)} ${a.head === 'bar' ? '⊣' : '→'} ${n(a.to)}`;
  });
  console.log(`  removed: ${e.label ?? '(no label)'} [${e.box.map((v) => v.toFixed(0)).join(', ')}]${arrows.length ? `; arrows: ${arrows.join('; ')}` : ''}`);
}
