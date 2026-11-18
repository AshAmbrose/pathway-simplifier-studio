/**
 * The browser's calls to the local API (server/plugin.ts): status, extract a figure, list and open runs,
 * and save the review. Types are shared with the server, so both sides agree on the shape of a run.
 */
import type { RunRecord, RunSummary } from '../server/runs.ts';
import type { LabelLookup } from './identify/types.ts';
import type { ArrowCheck, RelationQuery } from './relations/types.ts';
import type { Review } from './types/extraction.ts';

export type { RunRecord, RunSummary };

export interface Status { ready: boolean; hasKey: boolean; model: string; spentTodayUsd: number; dailyCapUsd: number; thinking?: string }

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error ?? `Request failed (${res.status}).`) as Error & { detail?: unknown };
    err.detail = body.detail;
    throw err;
  }
  return body as T;
}

/** Whether the key and model are set, and today's spend against the budget. */
export const getStatus = () => call<Status>('/api/status');
export const listRuns = () => call<RunSummary[]>('/api/runs');
export const getRun = (id: string) => call<RunRecord>(`/api/runs/${id}`);
export const runImageUrl = (id: string) => `/api/runs/${id}/image`;
/**
 * Sends an image for extraction (one model call); the saved run comes back. The server answers 200 at once and
 * keeps the line open while the model works (see keepAlive in server/plugin.ts), so a failure arrives as an
 * `error` field in a 200 reply, not as an error status.
 */
export async function extract(body: { name: string; mimeType: string; data: string; width: number; height: number }): Promise<RunRecord> {
  const rec = await call<RunRecord & { error?: string; detail?: unknown }>('/api/extract', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (rec.error) {
    const err = new Error(rec.error) as Error & { detail?: unknown };
    err.detail = rec.detail;
    throw err;
  }
  return rec;
}
/** What public databases say a label is (server/identify.ts). Only the label text and the shape's kind are sent. */
export const identify = (label: string, kind: string) =>
  call<LabelLookup>('/api/identify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label, kind }) });
/** Each arrow between identified shapes, looked up in the local SIGNOR and OmniPath snapshots (server/relations.ts). */
export const checkRelations = (q: RelationQuery) =>
  call<{ ready: boolean; snapshots: { signor?: string; omnipath?: string }; results: ArrowCheck[] }>('/api/relations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(q) });
/** The Finish report printed to PDF by the local Chrome (server/pdf.ts); null if no Chrome was found. */
export async function reportPdf(html: string): Promise<Blob | null> {
  const res = await fetch('/api/report-pdf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ html }) });
  if (res.status === 501) return null;
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Request failed (${res.status}).`);
  return res.blob();
}
/**
 * Saves the change list, naming the version it was built on. If the run was saved somewhere else since,
 * nothing is written and the newer review comes back as `stale`.
 */
export async function saveReview(id: string, review: Review, version: number):
  Promise<{ kind: 'saved'; version: number } | { kind: 'stale'; review: Review; version: number }> {
  const res = await fetch(`/api/runs/${id}/review`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ review, version }) });
  const body = await res.json().catch(() => ({}));
  if (res.status === 409) return { kind: 'stale', review: body.review, version: body.version };
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status}).`);
  return { kind: 'saved', version: body.version };
}
