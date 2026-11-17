/**
 * How far step 1's identification gets on the saved test figures (local data/, if present): for every labelled
 * shape, what the databases found and what the user would be asked. Online: it uses the same lookups as the app
 * (server/identify.ts), which send only label text, and reuses their cache.
 *
 *   node scripts/identify-coverage.ts            a table per figure, then totals
 *   node scripts/identify-coverage.ts --brief    totals only
 */
import { identifyLabel } from '../server/identify.ts';
import { getRun, listRuns } from '../server/runs.ts';
import { judge, type IdStatus } from '../src/identify/candidates.ts';

const brief = process.argv.includes('--brief');
const figures = ['guo2024-nfkb-v3', 'yu2020-nfkb-v3', 'wnt-liu2022-v3', 'hu2021-jak-stat-v3'];
const runs = listRuns();
const totals = new Map<IdStatus, number>();
for (const f of figures) {
  const r = runs.find((v) => v.id.endsWith(f));
  if (!r) { console.log(`skip ${f} (no saved run)`); continue; }
  const x = getRun(r.id)!.extraction;
  const shapes = [...new Map(x.elements.filter((e) => e.label && !['heading', 'symbol', 'dna'].includes(e.kind)).map((e) => [`${e.kind}|${e.label}`, e])).values()];
  const counts = new Map<IdStatus, number>();
  if (!brief) console.log(`\n${f}: ${shapes.length} distinct labels`);
  for (const e of shapes) {
    const j = judge(await identifyLabel(e.label!, e.kind));
    counts.set(j.status, (counts.get(j.status) ?? 0) + 1);
    totals.set(j.status, (totals.get(j.status) ?? 0) + 1);
    if (!brief) {
      const parts = j.parts.map((p) => (p.generic ? `class: ${p.generic.classTerm?.record.name ?? 'none'}` : p.options.map((o) => `${o.record.name} [${o.field}]`).join(' | ') || 'none')).join('  ‖  ');
      console.log(`  ${j.status.padEnd(9)} ${`${e.label} (${e.kind})`.padEnd(42)} ${parts}`);
    }
  }
  console.log(`${f}: ${[...counts].map(([k, n]) => `${k} ${n}`).join(', ')}`);
}
console.log(`\nAll: ${[...totals].map(([k, n]) => `${k} ${n}`).join(', ')}`);
process.exit(0);
