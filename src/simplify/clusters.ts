/**
 * Step 4 (Clusters): the clusters drawn in the figure (shapes drawn touching as one group), for the user to
 * collapse the members they choose into one shape. Nothing is suggested: being drawn together doesn't prove the
 * members belong together. (Suggestions from known biology, with their source, are a later idea.)
 */
import { nameOf } from '../edit/describe.ts';
import type { Edit, Extraction } from '../types/extraction.ts';

export interface ClusterItem { id: string; name: string; members: string[] }

/** Every cluster of two or more shapes, named by its label or its members. */
export function listClusters(x: Extraction): ClusterItem[] {
  return x.groups
    .map((g) => ({ id: g.id, members: g.members.filter((m) => x.elements.some((e) => e.id === m)), label: g.label }))
    .filter((g) => g.members.length >= 2)
    .map((g) => ({ id: g.id, members: g.members, name: g.label ?? joinNames(x, g.members) }));
}

/** "A + B + C": the members' names as written. */
export const joinNames = (x: Extraction, ids: string[]) => ids.map((id) => nameOf(x, id)).join(' + ');

/**
 * The change that collapses `members` into one shape. With a name of its own, the members' names are kept as
 * a sub-label under it; named only by its members, it needs no sub-label.
 */
export function collapseEdit(x: Extraction, key: string, members: string[], name: string | null): Edit {
  const joined = joinNames(x, members);
  const label = name?.trim() || joined;
  return { op: 'collapse', id: `col-${key}`, to: null, value: JSON.stringify({ members, label, sub: label === joined ? null : joined }) };
}

/** The members of a collapse change. */
export function collapsed(e: Edit): string[] {
  try { return (JSON.parse(e.value ?? '{}').members ?? []) as string[]; } catch { return []; }
}
