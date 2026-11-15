/**
 * Saves an earlier chat-window result as a run, so the review screen can be seen without a paid call.
 * Usage: node scripts/preview-run.ts <result.json> <image> [name]
 * The run is labelled "v1 (chat result, converted)": no appearance data, and no cost.
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { ExtractionSchema, referenceProblems } from '../src/types/extraction.ts';
import { saveRun } from '../server/runs.ts';
import { v1ToV2 } from './v1ToV2.ts';

const [resultPath, imagePath, name] = process.argv.slice(2);
if (!resultPath || !imagePath) { console.error('usage: node scripts/preview-run.ts <result.json> <image> [name]'); process.exit(1); }
const raw = JSON.parse(readFileSync(resultPath, 'utf8'));
const extraction = ExtractionSchema.parse(v1ToV2(raw));
const sips = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', imagePath], { encoding: 'utf8' });
const width = Number(/pixelWidth: (\d+)/.exec(sips)![1]), height = Number(/pixelHeight: (\d+)/.exec(sips)![1]);
const mimeType = /\.png$/i.test(imagePath) ? 'image/png' : /\.webp$/i.test(imagePath) ? 'image/webp' : 'image/jpeg';
const rec = saveRun(name ?? imagePath.split('/').pop()!, mimeType, readFileSync(imagePath), { width, height }, {
  extraction, problems: referenceProblems(extraction), model: `${raw.model ?? 'unknown'} (chat)`, promptVersion: 'v1 (chat result, converted)',
  seconds: 0, usage: { inputTokens: 0, outputTokens: 0, thoughtTokens: 0 }, costUsd: 0, priceKnown: false,
});
console.log(rec.id);
