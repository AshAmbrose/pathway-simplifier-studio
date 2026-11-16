/**
 * Where each change comes from, and the order changes are applied in.
 *
 * Sources: 'q<n>' (the answer to question n), 'manual' (a fix by hand), 'step:<step>' (a simplification step).
 * Order: answers first, in question order (they are written against the model's own reading), then fixes by
 * hand, then the simplification steps in step order. So the simplified figure is always built on the corrected
 * one, and an earlier step's choices are in place before a later step looks at the figure.
 */
import { STEPS, type StepId } from '../types/extraction.ts';

export const isAnswer = (source: string) => /^q\d+$/.test(source);
export const stepSource = (s: StepId) => `step:${s}`;
/** The step a change belongs to, or null for an answer or a fix by hand. */
export function stepOf(source: string): StepId | null {
  const s = source.startsWith('step:') ? source.slice(5) : null;
  return s && (STEPS as readonly string[]).includes(s) ? (s as StepId) : null;
}
/** Answers and fixes by hand: the corrections that make the reconstruction match the figure. */
export const isCorrection = (source: string) => stepOf(source) === null;

/** The changes in the order they are applied (stable within each source). */
export function inOrder<T extends { source: string }>(edits: T[]): T[] {
  const rank = (e: T) => {
    if (isAnswer(e.source)) return Number(e.source.slice(1));
    if (e.source === 'manual') return 1e6;
    const s = stepOf(e.source);
    return s ? 2e6 + STEPS.indexOf(s) : 1e6;
  };
  return edits.map((e, i) => ({ e, i, r: rank(e) })).sort((a, b) => a.r - b.r || a.i - b.i).map((v) => v.e);
}

let counter = 0;
/** A new key for a change: unique within a run, and roughly in time order. */
export const newKey = () => `${Date.now().toString(36)}${(counter++).toString(36)}`;
