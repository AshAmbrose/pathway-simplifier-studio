/** Browser-side calls to the local /api routes. Types come from the server modules (type-only imports). */
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

export const getStatus = () => call<Status>('/api/status');
export const listRuns = () => call<RunSummary[]>('/api/runs');
export const getRun = (id: string) => call<RunRecord>(`/api/runs/${id}`);
export const runImageUrl = (id: string) => `/api/runs/${id}/image`;
export const extract = (body: { name: string; mimeType: string; data: string; width: number; height: number }) =>
  call<RunRecord>('/api/extract', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export const saveReview = (id: string, review: Review) =>
  call<Review>(`/api/runs/${id}/review`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(review) });
