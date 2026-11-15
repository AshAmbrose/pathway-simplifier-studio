/**
 * PAID: runs prompt v2 on the six test figures through the same code the app uses, and saves each result
 * where local/tools/score_runs.py can score it against the answer keys (as model "Hydrogen4-v2").
 *
 *   node scripts/run-figures.ts --yes [F1 F2 …]
 *
 * Refuses to run without --yes. Every call is logged to data/ai-ledger.jsonl and counts against DAILY_USD.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extractFigure } from '../server/extract.ts';
import { localDay, spentOn } from '../server/aiLedger.ts';

const FIGS: Record<string, [string, string]> = {
  F1: ['exercise-il6.png', 'image/png'], F2: ['exercise-nfkb.png', 'image/png'], F3: ['jakstat-hu2021-fig3.jpg', 'image/jpeg'],
  F4: ['nfkb-yu2020-fig1.jpg', 'image/jpeg'], F5: ['nfkb-guo2024-fig1.jpg', 'image/jpeg'], F6: ['wnt-liu2022.jpg', 'image/jpeg'],
};

function env(): Record<string, string> {
  const f = new URL('../.env.local', import.meta.url);
  if (!existsSync(f)) return {};
  return Object.fromEntries(readFileSync(f, 'utf8').split('\n').map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)).filter((m): m is RegExpMatchArray => !!m).map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]));
}

const args = process.argv.slice(2);
if (!args.includes('--yes')) { console.error('This makes paid model calls. Re-run with --yes.'); process.exit(1); }
const pick = args.filter((a) => /^F[1-6]$/.test(a));
const e = env();
const model = e.EXTRACT_MODEL ?? '', cap = Number(e.DAILY_USD ?? 5) || 5;
const out = new URL('../local/extraction-tests/runs/Hydrogen4-v2/', import.meta.url);
mkdirSync(out, { recursive: true });

for (const fig of pick.length ? pick : Object.keys(FIGS)) {
  if (spentOn(localDay()) >= cap) { console.error(`Daily budget ($${cap}) reached; stopping.`); break; }
  const [file, mimeType] = FIGS[fig];
  const data = readFileSync(new URL(`../local/examples/${file}`, import.meta.url)).toString('base64');
  try {
    const r = await extractFigure({ apiKey: e.GEMINI_API_KEY ?? '', model, mimeType, dataBase64: data, route: 'run-figures' });
    // Same shape the scorer reads; `unsure` carries the clarification questions so they reach the review.
    const rec = { model: 'Hydrogen4-v2', figure: fig, ...r.extraction, unsure: r.extraction.clarify.map((c) => c.question), _run: { model: r.model, seconds: r.seconds, usage: r.usage, costUsd: r.costUsd, problems: r.problems } };
    writeFileSync(new URL(`Hydrogen4-v2_f${fig.slice(1)}.json`, out), JSON.stringify(rec, null, 1));
    console.log(`${fig}: ${r.extraction.elements.length} elements, ${r.extraction.arrows.length} arrows, ${r.seconds.toFixed(1)}s, $${r.costUsd.toFixed(4)}${r.priceKnown ? '' : ' (price not set)'}${r.problems.length ? `, ${r.problems.length} reference problem(s)` : ''}`);
  } catch (err) {
    console.error(`${fig}: ${(err as Error).message}`);
  }
}
