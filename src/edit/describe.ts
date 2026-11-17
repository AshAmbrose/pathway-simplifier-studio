/** Names and plain-words descriptions, for the change list and the pop-ups. */
import { identityText } from '../identify/candidates.ts';
import type { Identity } from '../identify/types.ts';
import type { Edit, Extraction } from '../types/extraction.ts';
import { OPEN, parsePoint } from './applyEdits.ts';

/** A compartment as the figure names it, or by its kind if the figure doesn't. */
export const regionName = (r: { label: string | null; kind: string }) => r.label ?? r.kind.replace('_', ' ');

/** A readable name for a shape, group or arrow id: its label as written, or a description if it has none. */
export function nameOf(x: Extraction, id: string | null): string {
  if (!id) return '(nothing)';
  const e = x.elements.find((v) => v.id === id);
  if (e) return e.label ?? (e.id.startsWith('new-') ? '(new shape)' : `(${e.kind}, no label)`);
  const g = x.groups.find((v) => v.id === id);
  if (g) return g.label ?? g.members.map((m) => nameOf(x, m)).join(' + ');
  const a = x.arrows.find((v) => v.id === id);
  if (a) return `${nameOf(x, a.from)} ${a.head === 'bar' ? '⊣' : '→'} ${nameOf(x, a.to)}`;
  // An arrow end that is not on a shape.
  const r = x.regions.find((v) => v.id === id);
  if (r) return `open space in the ${regionName(r)}`;
  if (id === OPEN) return 'open space';
  return id;
}

/**
 * One change in plain words. `before` is the extraction just before this change, so names still resolve
 * for things the change removes.
 */
export function describeEdit(before: Extraction, e: Edit): string {
  const n = (id: string | null) => nameOf(before, id);
  switch (e.op) {
    case 'move_badge': return `${e.value} moved from ${n(e.id)} to ${n(e.to)}`;
    case 'add_badge': return `${e.value} added to ${n(e.id)}`;
    case 'remove_badge': return `${e.value} removed from ${n(e.id)}`;
    case 'set_arrow_from': return `Arrow ${n(e.id)} now starts ${parsePoint(e.value) ? 'in' : 'at'} ${n(parsePoint(e.value) ? e.to ?? OPEN : e.to)}`;
    case 'set_arrow_to': return `Arrow ${n(e.id)} now ends ${parsePoint(e.value) ? 'in' : 'at'} ${n(parsePoint(e.value) ? e.to ?? OPEN : e.to)}`;
    case 'add_arrow': return `Arrow added: ${n(e.id)} ${e.value === 'bar' ? '⊣' : '→'} ${n(e.to)}`;
    case 'remove_arrow': return `Arrow removed: ${n(e.id)}`;
    case 'set_arrow_head': return `Arrow ${n(e.id)}: head is now "${e.value}"`;
    case 'set_arrow_line': return `Arrow ${n(e.id)}: line is now ${e.value}`;
    case 'set_arrow_meaning': return `Arrow ${n(e.id)}: meaning is now "${e.value}"`;
    case 'set_arrow_text': return e.value ? `Arrow ${n(e.id)}: text is now "${e.value}"` : `Arrow ${n(e.id)}: text removed`;
    case 'set_label': return e.value ? `${n(e.id)} renamed "${e.value}"` : `${n(e.id)}: name cleared`;
    case 'remove_element': return `Shape removed: ${n(e.id)}`;
    case 'add_to_group': return `${n(e.id)} added to group ${n(e.to)}`;
    case 'remove_from_group': return `${n(e.id)} taken out of group ${n(e.to)}`;
    case 'set_box': return `${n(e.id)} moved or resized`;
    case 'add_element': return `Shape added${e.to ? ` in ${n(e.to).replace('open space in the ', 'the ')}` : ''}`;
    case 'hide': return `${n(e.id)} left out${e.value ? `: ${e.value}` : ''}`;
    case 'merge_into': return `${n(e.id)} (a repeat) merged into the other ${n(e.to)}`;
    case 'set_layout': return 'Figure laid out again as a cell, top to bottom';
    case 'restyle': return 'One consistent style: fills by kind, black arrows, red bars';
    case 'identify': {
      let v: Identity | null = null;
      try { v = JSON.parse(e.value ?? 'null'); } catch { /* described without the record */ }
      return v ? `${n(e.id)} identified as ${identityText(v)}` : `${n(e.id)} identified`;
    }
    case 'collapse': {
      let spec: { members?: string[]; label?: string } = {};
      try { spec = JSON.parse(e.value ?? '{}'); } catch { /* described below without names */ }
      const names = (spec.members ?? []).map(n).join(' + ');
      return `${names || 'Shapes'} collapsed into one shape${spec.label ? `: "${spec.label}"` : ''}`;
    }
  }
}

/**
 * Text the model wrote (a question, an answer, a flag's reason), made fit to show: the extraction's internal ids
 * ("e5", "a_tx_1") are never shown on screen. A bracketed list of ids, "(e5, e10, e14)", is dropped; any other id
 * becomes the item's name as written, or a description if it has none.
 */
export function cleanText(x: Extraction, text: string | null | undefined): string {
  if (!text) return '';
  const ids = new Set([...x.elements, ...x.groups, ...x.arrows, ...x.regions, ...x.panels].map((v) => v.id));
  if (!ids.size) return text;
  const alt = [...ids].sort((a, b) => b.length - a.length).map((id) => id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const list = new RegExp(`\\s*\\(\\s*(?:${alt})(?:\\s*(?:,|and|/)\\s*(?:${alt}))*\\s*\\)`, 'g');
  const one = new RegExp(`(?<![\\w-])(?:${alt})(?![\\w-])`, 'g');
  return text.replace(list, '').replace(one, (id) => {
    const r = x.regions.find((v) => v.id === id);
    if (r) return regionName(r);
    const p = x.panels.find((v) => v.id === id);
    if (p) return p.label ? `panel ${p.label}` : 'the panel';
    return nameOf(x, id);
  });
}
