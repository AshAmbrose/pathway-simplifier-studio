/**
 * Saved extraction runs, so reopening a figure never pays for a second call.
 * data/runs/<id>/  image.<ext>  run.json   (data/ is gitignored: uploads may be confidential)
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { ExtractResult } from './extract.ts';

const ROOT = new URL('../data/runs/', import.meta.url);
const ID = /^[0-9]{8}-[0-9]{6}-[a-z0-9-]{1,40}$/;
const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

export interface RunRecord extends ExtractResult {
  id: string;
  name: string;
  at: string;
  mimeType: string;
  image: { width: number; height: number };
}

export interface RunSummary {
  id: string; name: string; at: string; model: string; seconds: number; costUsd: number; priceKnown: boolean;
  counts: { elements: number; arrows: number; flags: number; clarify: number };
}

const dir = (id: string) => new URL(`${id}/`, ROOT);

function stamp(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export function saveRun(name: string, mimeType: string, image: Buffer, size: { width: number; height: number }, result: ExtractResult): RunRecord {
  const slug = name.toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'figure';
  const id = `${stamp()}-${slug}`;
  mkdirSync(dir(id), { recursive: true });
  writeFileSync(new URL(`image.${EXT[mimeType] ?? 'bin'}`, dir(id)), image);
  const rec: RunRecord = { id, name, at: new Date().toISOString(), mimeType, image: size, ...result };
  writeFileSync(new URL('run.json', dir(id)), JSON.stringify(rec, null, 1));
  return rec;
}

export function listRuns(): RunSummary[] {
  if (!existsSync(ROOT)) return [];
  return readdirSync(ROOT)
    .filter((id) => ID.test(id) && existsSync(new URL('run.json', dir(id))))
    .sort()
    .reverse()
    .map((id) => {
      const r = getRun(id)!;
      return { id, name: r.name, at: r.at, model: r.model, seconds: r.seconds, costUsd: r.costUsd, priceKnown: r.priceKnown,
        counts: { elements: r.extraction.elements.length, arrows: r.extraction.arrows.length, flags: r.extraction.flags.length, clarify: r.extraction.clarify.length } };
    });
}

export function getRun(id: string): RunRecord | null {
  if (!ID.test(id)) return null;
  const f = new URL('run.json', dir(id));
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
}

export function runImage(id: string): { mimeType: string; data: Buffer } | null {
  const r = getRun(id);
  if (!r) return null;
  const f = new URL(`image.${EXT[r.mimeType] ?? 'bin'}`, dir(id));
  return existsSync(f) ? { mimeType: r.mimeType, data: readFileSync(f) } : null;
}
