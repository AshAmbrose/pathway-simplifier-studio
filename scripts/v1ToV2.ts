/**
 * Converts a chat-window (prompt v1) result into the v2 shape, for offline checks and to preview the review
 * screen without a paid call. Appearance fields didn't exist in v1, so they are left empty (null / default outline).
 */
import { ELEMENT_KINDS, FLAG_TYPES, MEANINGS, REGION_KINDS, type Extraction } from '../src/types/extraction.ts';

const ALLOWED = new Set<string>(FLAG_TYPES);
/** v1 allowed "other: …" in every vocabulary; v2 has a fixed list, so unknown words become "other" (kept in the text where there is one). */
const pick = (v: unknown, list: readonly string[]) => (typeof v === 'string' && list.includes(v) ? v : 'other');
const extra = (v: unknown, list: readonly string[]) => (typeof v === 'string' && !list.includes(v) ? v : null);
const box = (b: unknown): number[] => (Array.isArray(b) && b.length === 4 && b.every((v) => typeof v === 'number') ? b : [0, 0, 1, 1]);

export function v1ToV2(d: any): Extraction {
  return {
    structure: d.structure ?? '',
    panels: (d.panels ?? []).map((p: any) => ({ id: p.id, label: p.label ?? null, box: box(p.box ?? [0, 0, 100, 100]) })),
    regions: (d.regions ?? []).map((r: any) => ({ id: r.id, kind: pick(r.kind, REGION_KINDS), label: r.label ?? null, boundary: null, box: box(r.box ?? [0, 0, 100, 100]) })),
    elements: (d.elements ?? []).map((e: any) => ({
      id: e.id, label: e.label ?? null, kind: pick(e.kind, ELEMENT_KINDS), region: e.region ?? null, panel: e.panel ?? null,
      modifications: (e.modifications ?? []).map((m: any) => ({ type: String(m.type ?? ''), site: m.site ?? null, count: typeof m.count === 'number' ? m.count : null })),
      description: [extra(e.kind, ELEMENT_KINDS), e.description].filter(Boolean).join('; ') || null, box: box(e.box), fill: null, outline: 'rounded box', textColour: null,
    })),
    groups: (d.groups ?? []).map((g: any) => ({ id: g.id, members: g.members ?? [], label: g.label ?? null, region: g.region ?? null })),
    contacts: (d.contacts ?? []).filter((c: any) => ['binds', 'docked_on', 'on'].includes(c.kind)),
    arrows: (d.arrows ?? []).map((a: any, i: number) => ({
      id: a.id ?? `a${i}`, from: String(a.from), to: String(a.to),
      head: ['arrow', 'bar', 'none'].includes(a.head) ? a.head : 'other',
      line: ['solid', 'dashed', 'dotted', 'faint'].includes(a.line) ? a.line : 'mixed',
      colour: a.colour ?? null, text: a.text ?? null, meaning: (MEANINGS as readonly string[]).includes(a.meaning) ? a.meaning : 'unknown', notes: [extra(a.meaning, MEANINGS), a.notes].filter(Boolean).join('; ') || null,
    })),
    flags: (d.flags ?? []).map((f: any) => ({ type: ALLOWED.has(f.type) ? f.type : 'other', on: String(Array.isArray(f.on) ? f.on[0] : f.on), asWritten: f.asWritten ?? null,
      suggestion: f.suggestion ?? null, basis: f.basis ?? '', confidence: ['high', 'medium', 'low'].includes(f.confidence) ? f.confidence : 'low' })),
    clarify: (d.unsure ?? []).map((u: any) => ({ about: [], question: String(u), options: [] })),
  } as Extraction;
}
