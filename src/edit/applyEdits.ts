/**
 * The extraction with a list of changes applied. The extraction itself is never altered: this returns a copy.
 * A change that can't be applied (its shape is gone, the badge isn't there, …) is skipped and reported,
 * never silently dropped, and the changes after it still run.
 */
import { HEADS, LINES, MEANINGS, type Edit, type Extraction, type Option } from '../types/extraction.ts';

export interface Applied {
  extraction: Extraction;
  /** Changes that could not be applied, by position in the list, with the reason in plain words. */
  failed: { index: number; reason: string }[];
  /** Ids of shapes, groups and arrows that differ from the extraction, for marking on the render. */
  touched: Set<string>;
}

/** "Ub×3" → { type: "Ub", count: 3 }; "P" → { type: "P", count: null }. */
export function parseBadge(text: string): { type: string; count: number | null } {
  const m = /^(.*?)\s*[×x]\s*(\d+)$/.exec(text.trim());
  return m && m[1] ? { type: m[1], count: Number(m[2]) } : { type: text.trim(), count: null };
}

/** A badge as shown on the render: "Ub×3", "P Y705". */
export const badgeText = (m: { type: string; site: string | null; count: number | null }) =>
  m.type + (m.site ? ` ${m.site}` : '') + (m.count && m.count > 1 ? `×${m.count}` : '');

/** "12.5,40" → [12.5, 40]: a point in percent of the image. */
export function parsePoint(value: string | null): number[] | null {
  if (!value) return null;
  const n = value.split(',').map(Number);
  return n.length === 2 && n.every(Number.isFinite) ? n : null;
}

/** The id an arrow end holds when it sits in open space outside every compartment. */
export const OPEN = 'open';

/** "x,y,width,height" in percent → four numbers, or null if it isn't a usable box. */
export function parseBox(value: string | null): number[] | null {
  const n = (value ?? '').split(',').map(Number);
  return n.length === 4 && n.every(Number.isFinite) && n[2] > 0 && n[3] > 0 ? n : null;
}

/** Applies one change in place. Returns the reason it couldn't be applied, or null. */
function applyOne(x: Extraction, e: Edit, key: string, touched: Set<string>): string | null {
  const el = (id: string | null) => x.elements.find((v) => v.id === id);
  const gr = (id: string | null) => x.groups.find((v) => v.id === id);
  const ar = (id: string | null) => x.arrows.find((v) => v.id === id);
  const isNode = (id: string | null) => !!el(id) || !!gr(id);
  const badgeAt = (s: NonNullable<ReturnType<typeof el>>, text: string | null) => {
    const want = parseBadge(text ?? '');
    const exact = s.modifications.findIndex((m) => badgeText(m) === (text ?? '').trim());
    return exact >= 0 ? exact : s.modifications.findIndex((m) => m.type === want.type);
  };
  switch (e.op) {
    case 'move_badge': {
      const from = el(e.id), to = el(e.to);
      if (!from) return `shape "${e.id}" is not there`;
      if (!to) return `shape "${e.to}" is not there`;
      const i = badgeAt(from, e.value);
      if (i < 0) return `no "${e.value}" badge on "${e.id}"`;
      to.modifications.push(...from.modifications.splice(i, 1));
      touched.add(from.id); touched.add(to.id);
      return null;
    }
    case 'add_badge': {
      const s = el(e.id);
      if (!s) return `shape "${e.id}" is not there`;
      if (!e.value?.trim()) return 'no badge text given';
      const b = parseBadge(e.value);
      s.modifications.push({ type: b.type, site: null, count: b.count });
      touched.add(s.id);
      return null;
    }
    case 'remove_badge': {
      const s = el(e.id);
      if (!s) return `shape "${e.id}" is not there`;
      const i = badgeAt(s, e.value);
      if (i < 0) return `no "${e.value}" badge on "${e.id}"`;
      s.modifications.splice(i, 1);
      touched.add(s.id);
      return null;
    }
    case 'set_arrow_from':
    case 'set_arrow_to': {
      const a = ar(e.id);
      if (!a) return `arrow "${e.id}" is not there`;
      const which = e.op === 'set_arrow_from' ? 'from' : 'to';
      const point = parsePoint(e.value);
      if (point) {
        // An end in open space or on a compartment: keep the point, and the compartment it falls in if any.
        if (e.to && !x.regions.some((r) => r.id === e.to)) return `compartment "${e.to}" is not there`;
        a[which] = e.to ?? OPEN;
        a.ends = { from: a.ends?.from ?? null, to: a.ends?.to ?? null, [which]: point };
      } else {
        if (!isNode(e.to)) return `shape "${e.to}" is not there`;
        a[which] = e.to!;
        if (a.ends) a.ends = { ...a.ends, [which]: null };
      }
      touched.add(a.id);
      return null;
    }
    case 'add_arrow': {
      if (!isNode(e.id)) return `shape "${e.id}" is not there`;
      if (!isNode(e.to)) return `shape "${e.to}" is not there`;
      const head = (HEADS as readonly string[]).includes(e.value ?? '') ? (e.value as (typeof HEADS)[number]) : 'arrow';
      const id = `new-${key}`;
      x.arrows.push({ id, from: e.id, to: e.to!, head, line: 'solid', colour: null, text: null, meaning: head === 'bar' ? 'inhibits' : 'unknown', notes: null });
      touched.add(id);
      return null;
    }
    case 'remove_arrow': {
      const i = x.arrows.findIndex((v) => v.id === e.id);
      if (i < 0) return `arrow "${e.id}" is not there`;
      x.arrows.splice(i, 1);
      return null;
    }
    case 'set_arrow_head':
    case 'set_arrow_line':
    case 'set_arrow_meaning': {
      const a = ar(e.id);
      if (!a) return `arrow "${e.id}" is not there`;
      const list: readonly string[] = e.op === 'set_arrow_head' ? HEADS : e.op === 'set_arrow_line' ? LINES : MEANINGS;
      if (!list.includes(e.value ?? '')) return `"${e.value}" is not one of: ${list.join(', ')}`;
      if (e.op === 'set_arrow_head') a.head = e.value as typeof a.head;
      else if (e.op === 'set_arrow_line') a.line = e.value as typeof a.line;
      else a.meaning = e.value as typeof a.meaning;
      touched.add(a.id);
      return null;
    }
    case 'set_arrow_text': {
      const a = ar(e.id);
      if (!a) return `arrow "${e.id}" is not there`;
      a.text = e.value?.trim() || null;
      touched.add(a.id);
      return null;
    }
    case 'set_label': {
      const s = el(e.id) ?? gr(e.id);
      if (!s) return `shape "${e.id}" is not there`;
      s.label = e.value?.trim() || null;
      touched.add(s.id);
      return null;
    }
    case 'remove_element': {
      const i = x.elements.findIndex((v) => v.id === e.id);
      if (i < 0) return `shape "${e.id}" is not there`;
      x.elements.splice(i, 1);
      for (const g of x.groups) {
        if (g.members.includes(e.id)) { g.members = g.members.filter((m) => m !== e.id); touched.add(g.id); }
      }
      const emptied = new Set(x.groups.filter((g) => g.members.length === 0).map((g) => g.id));
      x.groups = x.groups.filter((g) => !emptied.has(g.id));
      const gone = (id: string) => id === e.id || emptied.has(id);
      x.arrows = x.arrows.filter((a) => !gone(a.from) && !gone(a.to));
      x.contacts = x.contacts.filter((c) => !gone(c.a) && !gone(c.b));
      return null;
    }
    case 'add_to_group':
    case 'remove_from_group': {
      const s = el(e.id), g = gr(e.to);
      if (!s) return `shape "${e.id}" is not there`;
      if (!g) return `group "${e.to}" is not there`;
      const inGroup = g.members.includes(s.id);
      if (e.op === 'add_to_group') {
        if (inGroup) return `"${e.id}" is already in that group`;
        g.members.push(s.id);
      } else {
        if (!inGroup) return `"${e.id}" is not in that group`;
        if (g.members.length === 1) return 'a group needs at least one shape';
        g.members = g.members.filter((m) => m !== s.id);
      }
      touched.add(g.id); touched.add(s.id);
      return null;
    }
    case 'add_element': {
      if (!/^new-/.test(e.id)) return 'an added shape needs a new id';
      if (el(e.id) || gr(e.id) || ar(e.id)) return `"${e.id}" already exists`;
      let spec: { box?: unknown; fill?: unknown };
      try { spec = JSON.parse(e.value ?? ''); } catch { return 'the new shape has no position'; }
      const b = parseBox(Array.isArray(spec.box) ? spec.box.join(',') : null);
      if (!b) return 'the new shape has no position';
      if (e.to && !x.regions.some((r) => r.id === e.to)) return `compartment "${e.to}" is not there`;
      x.elements.push({
        id: e.id, label: null, kind: 'protein', region: e.to ?? null, panel: null, modifications: [], description: 'added by hand',
        box: b, fill: typeof spec.fill === 'string' ? spec.fill : null, outline: 'rounded box', textColour: null,
      });
      touched.add(e.id);
      return null;
    }
    case 'set_box': {
      const s = el(e.id);
      if (!s) return `shape "${e.id}" is not there`;
      const b = parseBox(e.value);
      if (!b) return 'the position is not four numbers';
      s.box = b;
      touched.add(s.id);
      return null;
    }
  }
}

/**
 * The extraction with a list of changes applied, in order, on a copy. Also returns the changes that could
 * not be applied (and why), and which items differ from the model's reading, for marking on the picture.
 */
export function applyEdits(x: Extraction, edits: (Edit & { key?: string })[]): Applied {
  const out = structuredClone(x);
  const failed: Applied['failed'] = [];
  const touched = new Set<string>();
  edits.forEach((e, index) => {
    const reason = applyOne(out, e, e.key ?? `p${index}`, touched);
    if (reason) failed.push({ index, reason });
  });
  // Only ids that still exist can be marked.
  const alive = new Set([...out.elements, ...out.groups, ...out.arrows].map((v) => v.id));
  for (const id of touched) if (!alive.has(id)) touched.delete(id);
  return { extraction: out, failed, touched };
}

/**
 * How an answer can be used:
 *  - 'ready': choosing it applies its changes (or, for the as-read answer, changes nothing);
 *  - 'manual': it carries no usable changes, so choosing it opens the fix-by-hand route.
 */
export function optionState(x: Extraction, o: Option): 'ready' | 'manual' {
  if (o.edits.length === 0) return o.asRead ? 'ready' : 'manual';
  return applyEdits(x, o.edits).failed.length === 0 ? 'ready' : 'manual';
}

/** Answers whose changes can't be applied to the extraction as it arrived: listed with the run's other problems. */
export function optionProblems(x: Extraction): string[] {
  const out: string[] = [];
  x.clarify.forEach((c, i) => {
    if (c.options.length > 0 && c.options.filter((o) => o.asRead).length !== 1) out.push(`question ${i + 1}: ${c.options.filter((o) => o.asRead).length} answers are marked as read (expected 1)`);
    for (const o of c.options) {
      const f = applyEdits(x, o.edits).failed;
      if (f.length) out.push(`question ${i + 1}, answer "${o.label}": ${f[0].reason}`);
      else if (o.edits.length === 0 && !o.asRead) out.push(`question ${i + 1}, answer "${o.label}": no changes given (fix by hand)`);
    }
  });
  return out;
}

/** The ids an edit creates: a new shape, or a new arrow (named from the edit's key). */
export function createdBy(e: Edit & { key?: string }): string | null {
  if (e.op === 'add_element') return e.id;
  if (e.op === 'add_arrow' && e.key) return `new-${e.key}`;
  return null;
}

/**
 * The later changes that only make sense because of this one: anything that refers to the shape or arrow it
 * created, and, in turn, anything referring to what those created. Undoing a change takes these with it.
 */
export function dependents<T extends Edit & { key: string }>(edits: T[], key: string): T[] {
  const start = edits.findIndex((e) => e.key === key);
  if (start < 0) return [];
  const ids = new Set<string>();
  const first = createdBy(edits[start]);
  if (first) ids.add(first);
  const out: T[] = [];
  for (const e of edits.slice(start + 1)) {
    if (ids.has(e.id) || (e.to && ids.has(e.to))) {
      out.push(e);
      const c = createdBy(e);
      if (c) ids.add(c);
    }
  }
  return out;
}
