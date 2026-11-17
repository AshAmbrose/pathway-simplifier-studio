/**
 * Step 1 (Issues): what in the figure might need a decision before it is simplified.
 *  - typos the model flagged (a shape's name or an arrow's text);
 *  - unlabelled parts: every shape with no label, flagged or not (DNA, symbols and headings aside, unless flagged);
 *  - colour or styling the model thinks carries meaning ("red dashed = negative regulation"). These are only
 *    acknowledged here; no key is drawn.
 *  - what each shape is (kind 'identity'): one per labelled shape, made in SimplifyScreen once the databases have
 *    answered (src/identify/, server/identify.ts), not here, because the lookups run on the server.
 * Counts and clusters are left to their own steps, and crossings to the layout step.
 */
import type { Extraction } from '../types/extraction.ts';

export type IssueKind = 'typo' | 'unlabelled' | 'meaning' | 'identity';
export interface Issue {
  /** Stable across visits, for the decisions saved with the run. */
  key: string;
  kind: IssueKind;
  /** The shape, group or arrow it is about. */
  id: string;
  asWritten: string | null;
  suggestion: string | null;
  /** The model's reason, in its words; or what makes it an issue. */
  basis: string | null;
  /** For colour and styling: which of the two the model flagged. */
  flag?: string;
}

export function findIssues(x: Extraction): Issue[] {
  const out: Issue[] = [];
  const seen = new Set<string>();
  const push = (i: Issue) => { if (!seen.has(i.key)) { seen.add(i.key); out.push(i); } };
  for (const f of x.flags) {
    if (f.type === 'typo') push({ key: `typo:${f.on}`, kind: 'typo', id: f.on, asWritten: f.asWritten, suggestion: f.suggestion, basis: f.basis });
    if (f.type === 'unlabelled part') push({ key: `unlabelled:${f.on}`, kind: 'unlabelled', id: f.on, asWritten: null, suggestion: null, basis: f.basis });
    if (f.type === 'colour carries meaning' || f.type === 'styling carries meaning')
      push({ key: `meaning:${f.type}:${f.on}`, kind: 'meaning', id: f.on, asWritten: null, suggestion: null, basis: f.basis, flag: f.type });
  }
  for (const e of x.elements) {
    if (e.label || ['heading', 'symbol', 'dna'].includes(e.kind)) continue;
    push({ key: `unlabelled:${e.id}`, kind: 'unlabelled', id: e.id, asWritten: null, suggestion: null, basis: e.description });
  }
  return out;
}
