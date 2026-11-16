/** Names and plain-words descriptions, for the change list and the pop-ups. */
import type { Edit, Extraction } from '../types/extraction.ts';

/** A readable name for a shape, group or arrow id: its label as written, or a description if it has none. */
export function nameOf(x: Extraction, id: string | null): string {
  if (!id) return '(nothing)';
  const e = x.elements.find((v) => v.id === id);
  if (e) return e.label ?? `(${e.kind}, no label)`;
  const g = x.groups.find((v) => v.id === id);
  if (g) return g.label ?? `[${g.members.map((m) => nameOf(x, m)).join(' + ')}]`;
  const a = x.arrows.find((v) => v.id === id);
  if (a) return `${nameOf(x, a.from)} ${a.head === 'bar' ? '⊣' : '→'} ${nameOf(x, a.to)}`;
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
    case 'set_arrow_from': return `Arrow ${n(e.id)} now starts at ${n(e.to)}`;
    case 'set_arrow_to': return `Arrow ${n(e.id)} now ends at ${n(e.to)}`;
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
  }
}
