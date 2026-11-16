/** Shows AI spend by day, from the call log in data/ai-ledger.jsonl: `npm run spend` */
import { readLedger } from '../server/aiLedger.ts';

const byDay = new Map<string, { calls: number; usd: number; tokensIn: number; tokensOut: number }>();
for (const r of readLedger()) {
  const d = byDay.get(r.day) ?? { calls: 0, usd: 0, tokensIn: 0, tokensOut: 0 };
  d.calls++; d.usd += r.costUsd; d.tokensIn += r.inputTokens; d.tokensOut += r.outputTokens;
  byDay.set(r.day, d);
}
if (!byDay.size) console.log('No AI calls logged yet.');
for (const [day, d] of [...byDay].sort()) console.log(`${day}  ${d.calls} call(s)  $${d.usd.toFixed(4)}  ${d.tokensIn.toLocaleString()} in / ${d.tokensOut.toLocaleString()} out tokens`);
