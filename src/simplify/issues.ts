/**
 * Step 1 (Issues): what in the figure might need a decision before it is simplified.
 *  - typos the model flagged (a shape's name or an arrow's text);
 *  - unlabelled parts: every shape with no label, flagged or not (DNA, symbols and headings aside, unless flagged);
 *  - colour or styling the model thinks carries meaning ("red dashed = negative regulation"). These are only
 *    acknowledged here; no key is drawn.
 *  - what each shape is (kind 'identity'): one per labelled shape, made in SimplifyScreen once the databases have
 *    answered (src/identify/, server/identify.ts), not here, because the lookups run on the server;
 *  - arrows to look at (kind 'relation'): recorded by SIGNOR or OmniPath with the opposite effect, or only the other
 *    way round (server/relations.ts); also made in SimplifyScreen.
 * Counts and clusters are left to their own steps, and crossings to the layout step.
 */
import type { Extraction } from '../types/extraction.ts';

export type IssueKind = 'typo' | 'unlabelled' | 'meaning' | 'identity' | 'relation';
export interface Issue {
  /** Stable across visits, for the decisions saved with the run. */
  key: string;
  kind: IssueKind;
  /** The shape, group or arrow it is about. */
  id: string;
  /** What each shape is: every shape with this label, answered together (the first is `id`). */
  ids?: string[];
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
  return groupLookalikes(x, out);
}

/**
 * Unlabelled shapes that look the same and sit in the same place (same kind, outline, fill colour, a similar size,
 * and the same compartment and panel) become one card, answered together: a row of identical unlabelled receptors
 * is named once, not one by one. The card keeps the first shape's key, so a decision saved before grouping still
 * counts. Each shape still gets its own change, so any one can be undone on its own.
 */
function groupLookalikes(x: Extraction, list: Issue[]): Issue[] {
  const byId = new Map(x.elements.map((e) => [e.id, e]));
  const similar = (a: number, b: number) => Math.min(a, b) / Math.max(a, b) >= 0.7;
  const out: Issue[] = [];
  for (const i of list) {
    const e = i.kind === 'unlabelled' ? byId.get(i.id) : undefined;
    const into = e && out.find((g) => {
      const f = g.kind === 'unlabelled' ? byId.get(g.id) : undefined;
      return !!f && f.kind === e.kind && f.outline === e.outline && (f.fill ?? '').toLowerCase() === (e.fill ?? '').toLowerCase()
        && f.region === e.region && f.panel === e.panel && similar(f.box[2], e.box[2]) && similar(f.box[3], e.box[3]);
    });
    if (into) into.ids = [...(into.ids ?? [into.id]), i.id];
    else out.push({ ...i });
  }
  return out;
}
