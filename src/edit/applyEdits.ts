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

/**
 * Takes shapes out of the extraction, with everything that can't stand without them: their arrows and contacts,
 * their places in clusters, and any cluster left empty (and that cluster's arrows).
 */
function dropElements(x: Extraction, ids: string[], touched: Set<string>) {
  const out = new Set(ids);
  x.elements = x.elements.filter((v) => !out.has(v.id));
  for (const g of x.groups) {
    if (g.members.some((m) => out.has(m))) { g.members = g.members.filter((m) => !out.has(m)); touched.add(g.id); }
  }
  const emptied = new Set(x.groups.filter((g) => g.members.length === 0).map((g) => g.id));
  x.groups = x.groups.filter((g) => !emptied.has(g.id));
  const gone = (id: string) => out.has(id) || emptied.has(id);
  x.arrows = x.arrows.filter((a) => !gone(a.from) && !gone(a.to));
  x.contacts = x.contacts.filter((c) => !gone(c.a) && !gone(c.b));
}

/**
 * Points everything that refers to one shape or cluster at another instead: arrow ends, contacts, and cluster
 * places (dropped where the other is already a member).
 */
function repoint(x: Extraction, from: string, to: string) {
  for (const a of x.arrows) { if (a.from === from) a.from = to; if (a.to === from) a.to = to; }
  for (const c of x.contacts) { if (c.a === from) c.a = to; if (c.b === from) c.b = to; }
  for (const g of x.groups) if (g.members.includes(from)) g.members = [...new Set(g.members.map((m) => (m === from ? to : m)))];
}

/** What a merge or collapse starts from, so its tidy-up only touches what the change itself affected. */
function snapshot(x: Extraction) {
  return { loops: new Set(x.arrows.filter((a) => a.from === a.to).map((a) => a.id)), sizes: new Map(x.groups.map((g) => [g.id, g.members.length])) };
}

/**
 * After merging or collapsing, around the shapes in `around` only: an arrow from a shape to itself is dropped
 * (unless it was drawn as a self-loop), arrows with the same ends, head and line are drawn as one (BioPathway
 * Studio's rule for several records of one arrow), contacts are de-duplicated, clusters holding exactly the same
 * shapes become one, and a cluster this change left with one shape stops being a cluster.
 */
function tidy(x: Extraction, before: ReturnType<typeof snapshot>, around: Set<string>) {
  const loops = before.loops;
  for (const g of x.groups) if (g.members.some((m) => around.has(m))) around.add(g.id);
  // Clusters that now hold the same shapes: keep the first, point the others' arrows at it.
  const seen = new Map<string, string>();
  for (const g of [...x.groups]) {
    const k = [...g.members].sort().join('|');
    const first = seen.get(k);
    if (first && (around.has(g.id) || around.has(first))) { around.add(first); repoint(x, g.id, first); x.groups = x.groups.filter((v) => v.id !== g.id); } else if (!first) seen.set(k, g.id);
  }
  // A cluster this change left with one shape is no longer a cluster: its arrows go to that shape.
  for (const g of [...x.groups]) if (g.members.length === 1 && (before.sizes.get(g.id) ?? 1) > 1) { repoint(x, g.id, g.members[0]); x.groups = x.groups.filter((v) => v.id !== g.id); }
  const arrows = new Set<string>();
  x.arrows = x.arrows.filter((a) => {
    if (!around.has(a.from) && !around.has(a.to)) return true;
    if (a.from === a.to && !loops.has(a.id)) return false;
    const k = `${a.from}>${a.to}>${a.head}>${a.line}`;
    if (arrows.has(k)) return false;
    arrows.add(k);
    return true;
  });
  const contacts = new Set<string>();
  x.contacts = x.contacts.filter((c) => {
    if (!around.has(c.a) && !around.has(c.b)) return true;
    if (c.a === c.b) return false;
    const k = [c.a, c.b].sort().join('|') + c.kind;
    if (contacts.has(k)) return false;
    contacts.add(k);
    return true;
  });
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
      if (!el(e.id)) return `shape "${e.id}" is not there`;
      dropElements(x, [e.id], touched);
      return null;
    }
    case 'hide': {
      // Left out of the simplified figure. Same effect as removing, but kept apart so the change list can say why.
      if (ar(e.id)) { x.arrows = x.arrows.filter((a) => a.id !== e.id); return null; }
      const g = gr(e.id);
      if (g) { dropElements(x, [...g.members], touched); x.groups = x.groups.filter((v) => v.id !== g.id); return null; }
      if (!el(e.id)) return `"${e.id}" is not there`;
      dropElements(x, [e.id], touched);
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
    case 'merge_into': {
      const gone = el(e.id), stays = el(e.to);
      if (!gone) return `shape "${e.id}" is not there`;
      if (!stays) return `shape "${e.to}" is not there`;
      if (gone.id === stays.id) return 'a shape cannot be merged into itself';
      const before = snapshot(x);
      repoint(x, gone.id, stays.id);
      x.elements = x.elements.filter((v) => v.id !== gone.id);
      tidy(x, before, new Set([stays.id]));
      touched.add(stays.id);
      return null;
    }
    case 'collapse': {
      let spec: { members?: unknown; label?: unknown; sub?: unknown };
      try { spec = JSON.parse(e.value ?? ''); } catch { return 'the collapse has no members'; }
      const ids = Array.isArray(spec.members) ? spec.members.filter((m): m is string => typeof m === 'string') : [];
      if (ids.length < 2) return 'a collapse needs at least two shapes';
      if (el(e.id) || gr(e.id) || ar(e.id)) return `"${e.id}" already exists`;
      const missing = ids.find((m) => !el(m));
      if (missing) return `shape "${missing}" is not there`;
      const ms = ids.map((m) => el(m)!);
      const before = snapshot(x);
      const inner = new Set(ids);
      // Arrows between the collapsed shapes disappear into the new shape.
      x.arrows = x.arrows.filter((a) => !(inner.has(a.from) && inner.has(a.to)));
      const x0 = Math.min(...ms.map((m) => m.box[0])), y0 = Math.min(...ms.map((m) => m.box[1]));
      const x1 = Math.max(...ms.map((m) => m.box[0] + m.box[2])), y1 = Math.max(...ms.map((m) => m.box[1] + m.box[3]));
      const common = <T,>(vals: T[]) => { const c = new Map<T, number>(); for (const v of vals) c.set(v, (c.get(v) ?? 0) + 1); return [...c].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null; };
      const same = <T,>(vals: T[]) => (vals.every((v) => v === vals[0]) ? vals[0] : null);
      x.elements.push({
        id: e.id, label: typeof spec.label === 'string' && spec.label.trim() ? spec.label.trim() : null, kind: 'complex',
        region: same(ms.map((m) => m.region)), panel: same(ms.map((m) => m.panel)),
        modifications: ms.flatMap((m) => m.modifications), description: 'collapsed from several shapes',
        box: [x0, y0, x1 - x0, y1 - y0], fill: common(ms.map((m) => m.fill).filter((f): f is string => !!f)), outline: 'rounded box', textColour: null,
        sublabel: typeof spec.sub === 'string' && spec.sub.trim() ? spec.sub.trim() : null,
      });
      // A cluster made entirely of these shapes is the new shape now: its arrows go to it.
      for (const g of [...x.groups]) if (g.members.every((m) => inner.has(m))) { repoint(x, g.id, e.id); x.groups = x.groups.filter((v) => v.id !== g.id); }
      for (const m of ids) repoint(x, m, e.id);
      x.elements = x.elements.filter((v) => !inner.has(v.id));
      tidy(x, before, new Set([e.id]));
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
  if (e.op === 'add_element' || e.op === 'collapse') return e.id;
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
