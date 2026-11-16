/**
 * The browser's calls to the local API (server/plugin.ts): status, extract a figure, list and open runs,
 * and save the review. Types are shared with the server, so both sides agree on the shape of a run.
 */
import type { RunRecord, RunSummary } from '../server/runs.ts';
import type { Review } from './types/extraction.ts';

export type { RunRecord, RunSummary };

export interface Status { ready: boolean; hasKey: boolean; model: string; spentTodayUsd: number; dailyCapUsd: number }

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
/** Sends an image for extraction (one model call); the saved run comes back. */
export const extract = (body: { name: string; mimeType: string; data: string; width: number; height: number }) =>
  call<RunRecord>('/api/extract', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
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
