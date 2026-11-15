// Copied from BioPathway Studio (server/aiLedger.ts), unchanged.
/**
 * Every AI call the app makes, one JSON line each, in data/ai-ledger.jsonl (local only, gitignored with data/).
 * The daily budget and the totals shown in the app are summed from this file, so a run that fails halfway
 * still counts what it used, and the numbers can be compared line by line with the provider's billing page.
 *
 * Days are the computer's local calendar days (the provider's billing page shows local days too); the
 * earlier spend file reset at UTC midnight, which moved evening calls onto "tomorrow".
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';

export interface LedgerEntry {
  /** ISO time with the local offset, e.g. 2026-11-12T21:04:11-08:00. */
  at: string;
  /** Local calendar day (YYYY-MM-DD). */
  day: string;
  route: string;
  model: string;
  /** Prompt tokens billed at the full input rate (prompt minus cached). */
  inputTokens: number;
  cachedTokens: number;
  /** Answer tokens, thinking included (billed at the output rate). */
  outputTokens: number;
  thoughtTokens?: number;
  cacheWriteTokens?: number;
  costUsd: number;
}

const FILE = new URL('../data/ai-ledger.jsonl', import.meta.url);

/** Local calendar day, YYYY-MM-DD. */
export const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function localIso(d = new Date()) {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const hh = String(Math.floor(Math.abs(off) / 60)).padStart(2, '0');
  const mm = String(Math.abs(off) % 60).padStart(2, '0');
  const local = new Date(d.getTime() + off * 60_000).toISOString().slice(0, 19);
  return `${local}${sign}${hh}:${mm}`;
}

let cache: LedgerEntry[] | null = null;

export function readLedger(file: URL | string = FILE): LedgerEntry[] {
  if (file === FILE && cache) return cache;
  const rows: LedgerEntry[] = [];
  if (existsSync(file))
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        rows.push(JSON.parse(line));
      } catch {
        // a half-written line (crash mid-write): skip it
      }
    }
  if (file === FILE) cache = rows;
  return rows;
}

/** Appends one call. Never throws: a failure to log is reported but does not fail the user's request. */
export function recordCall(entry: Omit<LedgerEntry, 'at' | 'day'>, file: URL | string = FILE): LedgerEntry {
  const now = new Date();
  const row: LedgerEntry = { at: localIso(now), day: localDay(now), ...entry, costUsd: Number(entry.costUsd.toFixed(6)) };
  try {
    mkdirSync(new URL('.', typeof file === 'string' ? new URL(`file://${file}`) : file), { recursive: true });
    appendFileSync(file, JSON.stringify(row) + '\n');
    if (file === FILE) readLedger().push(row);
  } catch (err) {
    console.warn('[ledger] could not record an AI call:', (err as Error).message);
  }
  return row;
}

export function spentOn(day: string, rows = readLedger()): number {
  return rows.filter((r) => r.day === day).reduce((s, r) => s + r.costUsd, 0);
}

export function spentInMonth(month: string, rows = readLedger()): number {
  return rows.filter((r) => r.day.startsWith(month)).reduce((s, r) => s + r.costUsd, 0);
}
