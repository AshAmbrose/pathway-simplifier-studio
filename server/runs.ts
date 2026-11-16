/**
 * Saved extraction runs, so reopening a figure never pays for a second call.
 * data/runs/<id>/  image.<ext>  run.json   (data/ is gitignored: uploads may be confidential)
 */
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { ExtractResult } from './extract.ts';
import { EMPTY_REVIEW, ReviewSchema, type Review } from '../src/types/extraction.ts';

const ROOT = new URL('../data/runs/', import.meta.url);
const ID = /^[0-9]{8}-[0-9]{6}-[a-z0-9-]{1,40}$/;
const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

export interface RunRecord extends ExtractResult {
  id: string;
  name: string;
  at: string;
  mimeType: string;
  image: { width: number; height: number };
  /** The user's answers and fixes. The extraction above is never altered; these are applied on top of it. */
  review: Review;
  /** Goes up by one on every saved review. A save must name the version it started from (see saveReview). */
  reviewVersion: number;
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

/** Saves a new run (the image and the model's result) under a new id made from the time and the file name. */
export function saveRun(name: string, mimeType: string, image: Buffer, size: { width: number; height: number }, result: ExtractResult): RunRecord {
  const slug = name.toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'figure';
  const id = `${stamp()}-${slug}`;
  mkdirSync(dir(id), { recursive: true });
  writeFileSync(new URL(`image.${EXT[mimeType] ?? 'bin'}`, dir(id)), image);
  const rec: RunRecord = { id, name, at: new Date().toISOString(), mimeType, image: size, ...result, review: EMPTY_REVIEW, reviewVersion: 0 };
  writeFileSync(new URL('run.json', dir(id)), JSON.stringify(rec, null, 1));
  return rec;
}

/** All saved runs, newest first, with a few counts for the list on the upload screen. */
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

/** One saved run, read in the current shape even if it was saved by an older version of the app. */
export function getRun(id: string): RunRecord | null {
  if (!ID.test(id)) return null;
  const f = new URL('run.json', dir(id));
  if (!existsSync(f)) return null;
  const r = JSON.parse(readFileSync(f, 'utf8'));
  // Runs saved before prompt v3 have answers as plain text and no review: read them in the current shape.
  for (const c of r.extraction?.clarify ?? []) {
    c.options = (c.options ?? []).map((o: unknown) => (typeof o === 'string' ? { label: o, shape: null, asRead: false, edits: [] } : o));
  }
  r.review ??= EMPTY_REVIEW;
  r.reviewVersion ??= 0;
  return r;
}

export type SaveResult =
  | { kind: 'saved'; review: Review; version: number }
  /** The run was saved from somewhere else since this copy was loaded: nothing is written; here is the newer one. */
  | { kind: 'stale'; review: Review; version: number }
  | { kind: 'missing' };

/**
 * Saves the user's answers and fixes with the run. The extraction itself is left as the model returned it.
 *
 * `baseVersion` is the version the change list was built on. If the run has been saved since (another tab, or
 * a screen that restarted from an old copy), the save is refused instead of overwriting newer work.
 * Every saved review is also appended to review-history.jsonl beside the run, so no version is ever lost.
 */
export function saveReview(id: string, review: unknown, baseVersion: number): SaveResult {
  if (!ID.test(id)) return { kind: 'missing' };
  const f = new URL('run.json', dir(id));
  if (!existsSync(f)) return { kind: 'missing' };
  const parsed = ReviewSchema.parse(review);
  const r = JSON.parse(readFileSync(f, 'utf8'));
  const current: number = r.reviewVersion ?? 0;
  if (baseVersion !== current) return { kind: 'stale', review: r.review ?? EMPTY_REVIEW, version: current };
  r.review = parsed;
  r.reviewVersion = current + 1;
  writeFileSync(f, JSON.stringify(r, null, 1));
  appendFileSync(new URL('review-history.jsonl', dir(id)), JSON.stringify({ at: new Date().toISOString(), version: r.reviewVersion, review: parsed }) + '\n');
  return { kind: 'saved', review: parsed, version: r.reviewVersion };
}

/** The uploaded image of a run, for the left-hand view. */
export function runImage(id: string): { mimeType: string; data: Buffer } | null {
  const r = getRun(id);
  if (!r) return null;
  const f = new URL(`image.${EXT[r.mimeType] ?? 'bin'}`, dir(id));
  return existsSync(f) ? { mimeType: r.mimeType, data: readFileSync(f) } : null;
}
