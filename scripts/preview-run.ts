/**
 * Saves an existing result file as a run, so the review screen can be opened without another model call.
 * Usage: node scripts/preview-run.ts <result.json> <image> [name]
 *  - a result from scripts/run-figures.ts is used as it is;
 *  - an earlier chat-window (prompt v1) result is converted first, and labelled so: it has no appearance data.
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { ExtractionSchema, referenceProblems } from '../src/types/extraction.ts';
import { saveRun } from '../server/runs.ts';
import { optionProblems } from '../src/edit/applyEdits.ts';
import { v1ToV2 } from './v1ToV2.ts';

const [resultPath, imagePath, name] = process.argv.slice(2);
if (!resultPath || !imagePath) { console.error('usage: node scripts/preview-run.ts <result.json> <image> [name]'); process.exit(1); }
const raw = JSON.parse(readFileSync(resultPath, 'utf8'));
const fromApp = Array.isArray(raw.clarify);
const extraction = ExtractionSchema.parse(fromApp ? raw : v1ToV2(raw));
const sips = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', imagePath], { encoding: 'utf8' });
const width = Number(/pixelWidth: (\d+)/.exec(sips)![1]), height = Number(/pixelHeight: (\d+)/.exec(sips)![1]);
const mimeType = /\.png$/i.test(imagePath) ? 'image/png' : /\.webp$/i.test(imagePath) ? 'image/webp' : 'image/jpeg';
const rec = saveRun(name ?? imagePath.split('/').pop()!, mimeType, readFileSync(imagePath), { width, height }, {
  extraction, problems: [...referenceProblems(extraction), ...optionProblems(extraction)],
  model: fromApp ? String(raw._run?.model ?? raw.model ?? 'unknown') : `${raw.model ?? 'unknown'} (chat)`,
  promptVersion: fromApp ? String(raw.model ?? '').split('-').pop() || 'app' : 'v1 (chat result, converted)',
  seconds: raw._run?.seconds ?? 0, usage: raw._run?.usage ?? { inputTokens: 0, outputTokens: 0, thoughtTokens: 0 }, costUsd: raw._run?.costUsd ?? 0, priceKnown: false,
});
console.log(rec.id);
