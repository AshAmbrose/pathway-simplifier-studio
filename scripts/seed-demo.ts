/**
 * Fills the hosted demo's run list with saved results for the bundled open-licence examples, so visitors can open
 * them at once without a model call. Copies each chosen run from data/runs/ into <DATA_DIR>/runs/ (default
 * data/demo/runs/) under a clean name, with an empty change list, so the visitor starts from the model's reading.
 *
 *   node scripts/seed-demo.ts [--reset]
 *
 * A demo run that already exists is left alone, so a visitor's work is never overwritten; --reset replaces it.
 * Only the open-licence figures listed in src/examples.ts are ever copied.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EXAMPLES } from '../src/examples.ts';
import { EMPTY_REVIEW } from '../src/types/extraction.ts';

const reset = process.argv.includes('--reset');
const source = resolve('data/runs');
const target = resolve(process.env.DATA_DIR ?? 'data/demo', 'runs');
mkdirSync(target, { recursive: true });

for (const ex of EXAMPLES) {
  if (!ex.savedRun) continue;
  const from = resolve(source, ex.savedRun.from);
  const to = resolve(target, ex.savedRun.id);
  if (!existsSync(resolve(from, 'run.json'))) { console.log(`skip ${ex.title}: no saved run ${ex.savedRun.from}`); continue; }
  if (existsSync(to)) {
    if (!reset) { console.log(`keep ${ex.savedRun.id} (already there; --reset replaces it)`); continue; }
    rmSync(to, { recursive: true });
  }
  mkdirSync(to);
  const run = JSON.parse(readFileSync(resolve(from, 'run.json'), 'utf8'));
  // Only the image and the model's result come across; the change list and its history start empty.
  const image = `image.${run.mimeType === 'image/png' ? 'png' : run.mimeType === 'image/webp' ? 'webp' : 'jpg'}`;
  cpSync(resolve(from, image), resolve(to, image));
  writeFileSync(resolve(to, 'run.json'), JSON.stringify({ ...run, id: ex.savedRun.id, name: ex.title, review: EMPTY_REVIEW, reviewVersion: 0 }, null, 1));
  console.log(`seeded ${ex.savedRun.id}`);
}
console.log(`demo runs are in ${target}`);
