/**
 * Step 3 (Repeats): copies of the same molecule drawn more than once, from the drawing alone.
 *
 *  - A plain repeat: the same label as written, in the same compartment, with the same badges; and, when the
 *    user says the figure's parts are different conditions, in the same part. Those can merge into one copy.
 *  - Copies with the same label but a different compartment, badges or part are left apart, with the reason,
 *    so it is clear why they weren't offered (one molecule in two places or states is part of the story).
 *  - Copies drawn together in one cluster (a pair, like a dimer) stay apart: merging them would erase the pair.
 *  - Compartments are compared by kind and name, not by id: a figure with two panels has two cytoplasms.
 *  - Headings, DNA, unlabelled and text-only shapes are never repeats.
 *  - The copy that stays is the one with the most arrows (arrows to its clusters count); the user can pick another.
 */
import { badgeText } from '../edit/applyEdits.ts';
import type { Extraction } from '../types/extraction.ts';
import type { Tracing } from './routes.ts';

export interface RepeatGroup {
  key: string;
  /** The label as written, plus the part's name when parts are kept apart. */
  name: string;
  /** Every copy, in the figure's order. */
  copies: string[];
  /** The suggested copy to keep. */
  keeper: string;
}
export interface Apart { key: string; name: string; ids: string[]; reason: string }

export function findRepeats(x: Extraction, t: Tracing, partsApart: boolean): { groups: RepeatGroup[]; apart: Apart[] } {
  const usable = x.elements.filter((e) => e.label && !['heading', 'dna'].includes(e.kind) && e.outline !== 'text only');
  const byLabel = new Map<string, typeof usable>();
  for (const e of usable) byLabel.set(e.label!, [...(byLabel.get(e.label!) ?? []), e]);

  const arrowsOf = (id: string) => {
    const mine = new Set([id, ...x.groups.filter((g) => g.members.includes(id)).map((g) => g.id)]);
    return x.arrows.filter((a) => mine.has(a.from) || mine.has(a.to)).length;
  };
  const badges = (e: (typeof usable)[number]) => e.modifications.map(badgeText).sort().join(',');
  const place = (e: (typeof usable)[number]) => { const r = x.regions.find((v) => v.id === e.region); return r ? `${r.kind}:${r.label ?? ''}` : ''; };
  const clusterOf = (id: string) => x.groups.find((g) => g.members.includes(id))?.id ?? null;
  const partLabel = (k: string | undefined) => t.parts.find((p) => p.key === k)?.label ?? '';

  const groups: RepeatGroup[] = [], apart: Apart[] = [];
  for (const [label, els] of byLabel) {
    if (els.length < 2) continue;
    const sub = new Map<string, typeof els>();
    for (const e of els) {
      const k = [place(e), badges(e), partsApart ? t.partOf.get(e.id) ?? '' : ''].join('§');
      sub.set(k, [...(sub.get(k) ?? []), e]);
    }
    for (const all of sub.values()) {
      // Only one copy per cluster can merge; the rest of a pair drawn together stay as drawn.
      const seenCluster = new Set<string>(), paired: string[] = [];
      const list = all.filter((e) => { const c = clusterOf(e.id); if (!c) return true; if (seenCluster.has(c)) { paired.push(e.id); return false; } seenCluster.add(c); return true; });
      if (paired.length) apart.push({ key: `pair:${paired[0]}`, name: label, ids: [...all.filter((e) => clusterOf(e.id) && paired.some((p) => clusterOf(p) === clusterOf(e.id))).map((e) => e.id)], reason: 'drawn together in one cluster (a pair, like a dimer)' });
      if (list.length < 2) continue;
      const ids = list.map((e) => e.id);
      const keeper = [...ids].sort((a, b) => arrowsOf(b) - arrowsOf(a))[0];
      const part = partsApart && t.parts.length > 1 ? partLabel(t.partOf.get(ids[0])) : '';
      groups.push({ key: `rep:${ids[0]}`, name: part ? `${label} (${part})` : label, copies: ids, keeper });
    }
    if (sub.size > 1) {
      const reasons: string[] = [];
      if (new Set(els.map(place)).size > 1) reasons.push('drawn in different compartments');
      if (new Set(els.map(badges)).size > 1) reasons.push('different badges (a different state)');
      if (partsApart && new Set(els.map((e) => t.partOf.get(e.id))).size > 1) reasons.push('in different panels, which you said are different conditions');
      apart.push({ key: `apart:${els[0].id}`, name: label, ids: els.map((e) => e.id), reason: reasons.join('; ') });
    }
  }
  return { groups, apart };
}
