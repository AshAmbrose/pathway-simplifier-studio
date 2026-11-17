/**
 * The Finish report's fidelity check: every shape and arrow the model read from the figure, accounted for.
 *
 * It works independently of how changes are applied (src/edit/applyEdits.ts): it reads the change list for what
 * each change says it did to each item (renamed, left out, merged, collapsed, re-pointed, identified), then
 * compares the model's reading with the final figure item by item. Anything that differs with no change to
 * explain it is reported as unaccounted for. That is how an unintended change would show: a shape or arrow gone,
 * renamed, reversed or with its head changed, without a change in the list saying so.
 *
 * Counts are given at three points (as the model read it, after Check, and finished), so "simpler" is a number.
 */
import { applyEdits } from '../edit/applyEdits.ts';
import { stepOf } from '../edit/order.ts';
import { identityText } from '../identify/candidates.ts';
import type { Identity } from '../identify/types.ts';
import type { AppliedEdit, Extraction, StepId } from '../types/extraction.ts';

export type Where = 'Check' | StepId;
export type ShapeFate = 'kept' | 'renamed' | 'left out' | 'merged' | 'collapsed' | 'removed' | 'added' | 'unaccounted';
export type ArrowFate = 'kept' | 'changed' | 're-pointed' | 'left out' | 'went with a shape' | 'drawn once' | 'removed' | 'added' | 'unaccounted';

export interface ShapeLine { id: string; asDrawn: string; fate: ShapeFate; detail: string; where: Where | null; identity: string | null }
export interface ArrowLine { id: string; asDrawn: string; fate: ArrowFate; detail: string; where: Where | null }
export interface Counts { shapes: number; arrows: number; clusters: number; compartments: number }
export interface Report {
  counts: { read: Counts; checked: Counts; finished: Counts };
  shapes: ShapeLine[];
  arrows: ArrowLine[];
  /** Items that differ between the model's reading and the finished figure with no change explaining it. */
  unaccounted: number;
  identified: number;
}

const whereOf = (e: AppliedEdit): Where => stepOf(e.source) ?? 'Check';
const count = (x: Extraction): Counts => ({
  shapes: x.elements.filter((e) => e.kind !== 'heading').length, arrows: x.arrows.length, clusters: x.groups.length, compartments: x.regions.length,
});
const head = (h: string) => (h === 'bar' ? '⊣' : h === 'none' ? '—' : '→');

/**
 * `known` adds identities not stored as changes: exact symbol matches, taken as found in step 1 (src/identify/).
 */
export function accountFor(base: Extraction, ordered: AppliedEdit[], known: Map<string, Identity> = new Map(), apply: typeof applyEdits = applyEdits): Report {
  // Only changes that actually applied count as explanations. (`apply` is swappable so the offline checks can
  // feed it a faulty one and make sure silent changes are caught.)
  const all = apply(base, ordered);
  const failed = new Set(all.failed.map((f) => f.index));
  const edits = ordered.filter((_, k) => !failed.has(k));
  const finished = all.extraction;
  const checked = apply(base, edits.filter((e) => stepOf(e.source) === null)).extraction;
  /** A shape's or cluster's name in a figure: its label, or a cluster's members joined ("TAK1 + TAB1/2"). */
  const nameIn = (x: Extraction, id: string): string | null => {
    const e = x.elements.find((v) => v.id === id);
    if (e) return e.label ?? `(${e.kind}, no label)`;
    const g = x.groups.find((v) => v.id === id);
    return g ? g.label ?? g.members.map((m) => nameIn(x, m) ?? '?').join(' + ') : null;
  };
  const name = (id: string) => nameIn(base, id) ?? nameIn(checked, id) ?? nameIn(finished, id) ?? '(not found)';
  const nameNow = (id: string) => nameIn(finished, id) ?? name(id);

  // What the change list says happened to each shape, last word wins (an undo removes the change itself).
  const said = new Map<string, { fate: ShapeFate; detail: string; where: Where }>();
  const renamed = new Map<string, { to: string | null; where: Where }>();
  const identity = new Map<string, Identity>(known);
  const collapsedInto = new Map<string, string>();
  for (const e of edits) {
    const w = whereOf(e);
    if (e.op === 'remove_element') said.set(e.id, { fate: 'removed', detail: 'removed in Check', where: w });
    if (e.op === 'hide' && !base.arrows.some((a) => a.id === e.id)) said.set(e.id, { fate: 'left out', detail: e.value ? `left out: ${e.value}` : 'left out', where: w });
    if (e.op === 'merge_into') said.set(e.id, { fate: 'merged', detail: `a repeat, merged into the other ${name(e.to ?? '')}`, where: w });
    if (e.op === 'collapse') {
      let spec: { members?: string[]; label?: string } = {};
      try { spec = JSON.parse(e.value ?? '{}'); } catch { /* no members named */ }
      for (const m of spec.members ?? []) { said.set(m, { fate: 'collapsed', detail: `collapsed into "${spec.label ?? 'one shape'}"`, where: w }); collapsedInto.set(m, e.id); }
    }
    if (e.op === 'set_label') renamed.set(e.id, { to: e.value?.trim() || null, where: w });
    if (e.op === 'identify') { try { identity.set(e.id, JSON.parse(e.value ?? '')); } catch { /* not readable */ } }
  }

  // --- shapes: every one the model read, then those added by hand ---
  const shapes: ShapeLine[] = [];
  for (const b of base.elements.filter((e) => e.kind !== 'heading')) {
    const now = finished.elements.find((e) => e.id === b.id);
    const s = said.get(b.id);
    const idText = identity.has(b.id) ? identityText(identity.get(b.id)!) : null;
    let line: ShapeLine;
    if (!now) {
      line = s ? { id: b.id, asDrawn: b.label ?? `(${b.kind}, no label)`, fate: s.fate, detail: s.detail, where: s.where, identity: idText }
        : { id: b.id, asDrawn: b.label ?? `(${b.kind}, no label)`, fate: 'unaccounted', detail: 'not in the finished figure, and no change says why', where: null, identity: idText };
    } else if ((now.label ?? null) !== (b.label ?? null)) {
      const r = renamed.get(b.id);
      line = r && (r.to ?? null) === (now.label ?? null)
        ? { id: b.id, asDrawn: b.label ?? `(${b.kind}, no label)`, fate: 'renamed', detail: now.label ? `renamed "${now.label}"` : 'name cleared', where: r.where, identity: idText }
        : { id: b.id, asDrawn: b.label ?? '(no label)', fate: 'unaccounted', detail: `now reads "${now.label ?? ''}", and no change says so`, where: null, identity: idText };
    } else {
      line = { id: b.id, asDrawn: b.label ?? `(${b.kind}, no label)`, fate: 'kept', detail: 'kept as drawn', where: null, identity: idText };
    }
    shapes.push(line);
  }
  for (const n of finished.elements.filter((e) => e.kind !== 'heading' && !base.elements.some((b) => b.id === e.id))) {
    const add = edits.find((e) => (e.op === 'add_element' || e.op === 'collapse') && e.id === n.id);
    shapes.push({ id: n.id, asDrawn: n.label ?? '(new shape)', fate: add ? 'added' : 'unaccounted',
      detail: add?.op === 'collapse' ? `one shape standing for ${n.sublabel ?? 'its members'}` : add ? 'added by you' : 'in the finished figure, and no change added it', where: add ? whereOf(add) : null,
      identity: identity.has(n.id) ? identityText(identity.get(n.id)!) : null });
  }

  // --- arrows: every one the model read, then those added by hand ---
  const arrowSaid = new Map<string, { fate: ArrowFate; detail: string; where: Where }>();
  const endMoved = new Map<string, Where>();
  const styled = new Map<string, Where>();
  for (const e of edits) {
    const w = whereOf(e);
    if (e.op === 'remove_arrow') arrowSaid.set(e.id, { fate: 'removed', detail: 'removed in Check', where: w });
    if (e.op === 'hide' && base.arrows.some((a) => a.id === e.id)) arrowSaid.set(e.id, { fate: 'left out', detail: e.value ? `left out: ${e.value}` : 'left out', where: w });
    if (e.op === 'set_arrow_from' || e.op === 'set_arrow_to') endMoved.set(e.id, w);
    if (e.op === 'set_arrow_head' || e.op === 'set_arrow_meaning' || e.op === 'set_arrow_line') styled.set(e.id, w);
  }
  /** A shape left out or removed (its arrows go with it). */
  const goneShape = (id: string) => ['left out', 'removed'].includes(said.get(id)?.fate ?? '');
  /** Where a shape went: the shape it was merged or collapsed into, followed through. */
  const followShape = (id: string): string => {
    for (let k = 0; k < 10; k++) {
      const m = edits.find((e) => e.op === 'merge_into' && e.id === id);
      const c = collapsedInto.get(id);
      if (m?.to) id = m.to; else if (c) id = c; else break;
    }
    return id;
  };
  /**
   * Where an arrow's end went, by the same rules the changes follow: a shape through its merges and collapses; a
   * cluster that no longer exists to the one shape it was left with, or to the cluster now holding the same shapes.
   */
  const follow = (id: string): string => {
    const g = checked.groups.find((v) => v.id === id) ?? base.groups.find((v) => v.id === id);
    if (!g) return followShape(id);
    if (finished.groups.some((v) => v.id === id)) return id;
    const left = [...new Set(g.members.filter((m) => !goneShape(m)).map(followShape))];
    if (left.length === 1) return left[0];
    const key = [...left].sort().join('|');
    return finished.groups.find((v) => [...v.members].sort().join('|') === key)?.id ?? id;
  };
  /** An arrow end that is gone: a left-out or removed shape, or a cluster that was left out or emptied. */
  const goneEnd = (id: string): { detail: string; where: Where } | null => {
    if (goneShape(id)) return said.get(id)!;
    const g = checked.groups.find((v) => v.id === id) ?? base.groups.find((v) => v.id === id);
    if (!g || finished.groups.some((v) => v.id === id)) return null;
    const own = said.get(id);
    if (own) return own;
    if (g.members.every(goneShape)) return said.get(g.members[0])!;
    return null;
  };
  const arrows: ArrowLine[] = [];
  for (const a of base.arrows) {
    const asDrawn = `${name(a.from)} ${head(a.head)} ${name(a.to)}`;
    const now = finished.arrows.find((v) => v.id === a.id);
    const s = arrowSaid.get(a.id);
    if (!now) {
      const gone = goneEnd(a.from) ?? goneEnd(a.to);
      const ends = [follow(a.from), follow(a.to)];
      const twin = finished.arrows.find((v) => v.from === ends[0] && v.to === ends[1]);
      if (s) arrows.push({ id: a.id, asDrawn, fate: s.fate, detail: s.detail, where: s.where });
      else if (gone) arrows.push({ id: a.id, asDrawn, fate: 'went with a shape', detail: `went with ${gone.detail.startsWith('removed') ? 'a removed' : 'a left-out'} shape or cluster (${gone.detail})`, where: gone.where });
      else if (ends[0] === ends[1]) arrows.push({ id: a.id, asDrawn, fate: 'drawn once', detail: `both ends are now one shape (${nameNow(ends[0])}), after merging or collapsing`, where: said.get(a.from)?.where ?? said.get(a.to)?.where ?? null });
      else if (twin) arrows.push({ id: a.id, asDrawn, fate: 'drawn once', detail: `same as ${nameNow(twin.from)} ${head(twin.head)} ${nameNow(twin.to)} after merging or collapsing, drawn once`, where: said.get(a.from)?.where ?? said.get(a.to)?.where ?? null });
      else arrows.push({ id: a.id, asDrawn, fate: 'unaccounted', detail: 'not in the finished figure, and no change says why', where: null });
      continue;
    }
    const moved = now.from !== a.from || now.to !== a.to;
    const restyled = now.head !== a.head || now.meaning !== a.meaning;
    if (moved && !endMoved.has(a.id) && (now.from !== follow(a.from) || now.to !== follow(a.to)))
      arrows.push({ id: a.id, asDrawn, fate: 'unaccounted', detail: `now ${nameNow(now.from)} ${head(now.head)} ${nameNow(now.to)}, and no change says so`, where: null });
    else if (restyled && !styled.has(a.id))
      arrows.push({ id: a.id, asDrawn, fate: 'unaccounted', detail: `head or meaning changed (${a.head}, ${a.meaning} → ${now.head}, ${now.meaning}) with no change saying so`, where: null });
    else if (moved) arrows.push({ id: a.id, asDrawn, fate: endMoved.has(a.id) ? 'changed' : 're-pointed', detail: `now ${nameNow(now.from)} ${head(now.head)} ${nameNow(now.to)}${endMoved.has(a.id) ? '' : ', following a merge or collapse'}`, where: endMoved.get(a.id) ?? said.get(a.from)?.where ?? said.get(a.to)?.where ?? null });
    else if (restyled) arrows.push({ id: a.id, asDrawn, fate: 'changed', detail: `now ${a.head !== now.head ? `head "${now.head}"` : ''}${a.head !== now.head && a.meaning !== now.meaning ? ', ' : ''}${a.meaning !== now.meaning ? `meaning "${now.meaning}"` : ''}`, where: styled.get(a.id)! });
    else arrows.push({ id: a.id, asDrawn, fate: 'kept', detail: 'kept as drawn: same ends, direction and head', where: null });
  }
  for (const n of finished.arrows.filter((v) => !base.arrows.some((a) => a.id === v.id))) {
    // add_arrow names the arrow's start shape as its id and the end as `to`; the new arrow gets its own id.
    const add = edits.find((e) => e.op === 'add_arrow' && n.id === `new-${e.key}`);
    arrows.push({ id: n.id, asDrawn: `${nameNow(n.from)} ${head(n.head)} ${nameNow(n.to)}`, fate: add ? 'added' : 'unaccounted', detail: add ? 'added by you' : 'in the finished figure, and no change added it', where: add ? whereOf(add) : null });
  }

  return {
    counts: { read: count(base), checked: count(checked), finished: count(finished) },
    shapes, arrows,
    unaccounted: shapes.filter((v) => v.fate === 'unaccounted').length + arrows.filter((v) => v.fate === 'unaccounted').length,
    identified: shapes.filter((v) => v.fate !== 'added' && v.identity && !/not a molecule|left unidentified/.test(v.identity)).length,
  };
}
