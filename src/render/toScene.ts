/**
 * Extraction → scene: everything placed at its original position (percent boxes → pixels of the image, or of
 * step 5's canvas once the figure has been laid out again).
 * Only what was extracted is drawn; nothing is added, inferred or tidied. What can't be placed is listed in `skipped`.
 */
import type { Extraction } from '../types/extraction.ts';
import type { BoxPx } from './edgePorts.ts';
import { boxExit, edgeGeometry, type Side } from './edgeGeometry.ts';
import { badgeText } from '../edit/applyEdits.ts';

export interface SceneNode extends BoxPx {
  id: string; label: string | null; kind: string; outline: string; fill: string | null; textColour: string | null;
  mods: { text: string }[];
  /** A collapsed shape's members ("A + B + C"), drawn small under its name. */
  sublabel: string | null;
}
export interface SceneGroup extends BoxPx { id: string; label: string | null; members: string[] }
export interface SceneRegion extends BoxPx { id: string; kind: string; label: string | null; boundary: string | null }
export interface SceneArrow {
  id: string; from: string; to: string; d: string; midX: number; midY: number;
  /** Where the line leaves its start shape and meets its end shape. */
  x1: number; y1: number; x2: number; y2: number;
  head: string; line: string; colour: string; text: string | null; meaning: string;
  /** This end is not on a shape: it sits in open space or on a compartment (a user's change). */
  freeFrom: boolean; freeTo: boolean;
  /** Points along the drawn line, start to end, for measuring crossings (src/layout/measures.ts). */
  pts: { x: number; y: number }[];
}
export interface SceneText extends BoxPx { id: string; text: string }
export interface Scene {
  width: number; height: number;
  regions: SceneRegion[]; panels: SceneText[]; groups: SceneGroup[]; nodes: SceneNode[]; arrows: SceneArrow[];
  skipped: string[];
}

// The leading # is optional: models sometimes leave it off.
const HEX = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i;
const NAMED: Record<string, string> = { black: '#1e293b', red: '#c0392b', blue: '#2563eb', green: '#15803d', grey: '#94a3b8', gray: '#94a3b8', purple: '#7e22ce', orange: '#ea580c', pink: '#db2777' };
/** A colour the model wrote (hex, with or without #, or a plain name like "red") → hex; otherwise the fallback. */
export function colour(c: string | null | undefined, fallback: string): string {
  if (!c) return fallback;
  const t = c.trim().toLowerCase();
  if (HEX.test(t)) return t.startsWith('#') ? t : '#' + t;
  for (const [k, v] of Object.entries(NAMED)) if (t.includes(k)) return v;
  return fallback;
}

function px(box: number[], w: number, h: number): BoxPx {
  const [x, y, bw, bh] = box.map((v) => (Number.isFinite(v) ? v : 0));
  const cx = Math.min(Math.max(x, 0), 100), cy = Math.min(Math.max(y, 0), 100);
  return { x: (cx / 100) * w, y: (cy / 100) * h, width: (Math.max(0.3, Math.min(bw, 100 - cx)) / 100) * w, height: (Math.max(0.3, Math.min(bh, 100 - cy)) / 100) * h };
}

/** The smallest box around several boxes, with a margin. */
export function union(boxes: BoxPx[], pad: number): BoxPx {
  const x0 = Math.min(...boxes.map((b) => b.x)) - pad, y0 = Math.min(...boxes.map((b) => b.y)) - pad;
  const x1 = Math.max(...boxes.map((b) => b.x + b.width)) + pad, y1 = Math.max(...boxes.map((b) => b.y + b.height)) + pad;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** A point on an arrow's curve at t (0–1). */
function cubic(g: { p1: { x: number; y: number }; cp1: { x: number; y: number }; cp2: { x: number; y: number }; p2: { x: number; y: number } }, t: number) {
  const u = 1 - t;
  return {
    x: u * u * u * g.p1.x + 3 * u * u * t * g.cp1.x + 3 * u * t * t * g.cp2.x + t * t * t * g.p2.x,
    y: u * u * u * g.p1.y + 3 * u * u * t * g.cp1.y + 3 * u * t * t * g.cp2.y + t * t * t * g.p2.y,
  };
}

/**
 * Turns an extraction into what gets drawn: every shape, cluster, compartment and arrow in pixels of the
 * original image, at the positions the model gave. Anything that can't be placed is listed in `skipped`.
 */
export function toScene(x: Extraction, imageW: number, imageH: number): Scene {
  // After step 5's layout the figure has its own canvas; before, positions are in percent of the original image.
  const [width, height] = x.canvas ?? [imageW, imageH];
  const skipped: string[] = [];
  const nodes: SceneNode[] = x.elements.map((e) => ({
    id: e.id, label: e.label, kind: e.kind, outline: e.outline, fill: e.fill, textColour: e.textColour, sublabel: e.sublabel ?? null,
    mods: e.modifications.map((m) => ({ text: badgeText(m) })),
    ...px(e.box, width, height),
  }));
  const byId = new Map<string, BoxPx>(nodes.map((n) => [n.id, n]));
  const groups: SceneGroup[] = [];
  for (const g of x.groups) {
    const boxes = g.members.map((m) => byId.get(m)).filter((b): b is SceneNode => !!b);
    if (!boxes.length) { skipped.push(`group ${g.id}: no members could be placed`); continue; }
    const u = union(boxes, Math.max(3, width / 300));
    groups.push({ id: g.id, label: g.label, members: g.members, ...u });
  }
  for (const g of groups) byId.set(g.id, g);
  // Each arrow's ends first: where its line leaves each shape. Then arrows meeting the same side of one shape are
  // spread along it, ordered by the direction they arrive from, so they stay apart and don't cross.
  const at = (p: number[] | null | undefined): BoxPx | undefined => (p ? { x: (p[0] / 100) * width, y: (p[1] / 100) * height, width: 0, height: 0 } : undefined);
  type Pt = { x: number; y: number };
  const placed: { a: Extraction['arrows'][number]; s: BoxPx; t: BoxPx; freeFrom: boolean; freeTo: boolean; p1: Pt & { side: Side }; p2: Pt & { side: Side }; from1: Pt; from2: Pt }[] = [];
  for (const a of x.arrows) {
    // An end in open space is a point; everything else is the box of its shape or group.
    const freeFrom = !!a.ends?.from, freeTo = !!a.ends?.to;
    const s = freeFrom ? at(a.ends!.from) : byId.get(a.from), t = freeTo ? at(a.ends!.to) : byId.get(a.to);
    if (!s || !t) { skipped.push(`arrow ${a.id}: ${!s ? a.from : a.to} could not be placed`); continue; }
    const c = (b: BoxPx) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
    const p1 = boxExit(s, c(t)), p2 = boxExit(t, c(s));
    // Where each end is approached from: the other end, or for a bowed arrow, the point it bows out to.
    const bend = ((a.bend ?? 0) / 100) * width, len = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
    const q = { x: (p1.x + p2.x) / 2 - ((p2.y - p1.y) / len) * bend * 1.5, y: (p1.y + p2.y) / 2 + ((p2.x - p1.x) / len) * bend * 1.5 };
    placed.push({ a, s, t, freeFrom, freeTo, p1, p2, from1: bend ? q : p2, from2: bend ? q : p1 });
  }
  const sides = new Map<string, { box: BoxPx; ends: { p: { x: number; y: number; side: Side }; other: { x: number; y: number } }[] }>();
  for (const v of placed) {
    if (v.a.from === v.a.to) continue;
    for (const [id, box, p, other] of [[v.a.from, v.s, v.p1, v.from1], [v.a.to, v.t, v.p2, v.from2]] as const) {
      if (!box.width || !box.height) continue;
      const k = `${id}|${p.side}`;
      if (!sides.has(k)) sides.set(k, { box, ends: [] });
      sides.get(k)!.ends.push({ p, other });
    }
  }
  for (const { box, ends } of sides.values()) {
    if (ends.length < 2) continue;
    const across = ends[0].p.side === 'top' || ends[0].p.side === 'bottom';
    // By the angle each arrives at, seen from the shape's centre: steeper from above comes first, so lines don't cross.
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    const slope = (o: { x: number; y: number }) => (across ? (o.x - cx) / Math.max(1e-6, Math.abs(o.y - cy)) : (o.y - cy) / Math.max(1e-6, Math.abs(o.x - cx)));
    ends.sort((m, n) => slope(m.other) - slope(n.other));
    ends.forEach((e, i) => {
      const f = 0.2 + (0.6 * (i + 0.5)) / ends.length;
      if (across) e.p.x = box.x + box.width * f; else e.p.y = box.y + box.height * f;
    });
  }
  const arrows: SceneArrow[] = [];
  for (const { a, s, t, freeFrom, freeTo, p1, p2 } of placed) {
    // Step 5's layout may bow an arrow around a shape, and place its text clear of other lines.
    const geo = edgeGeometry(s, t, a.from === a.to, ((a.bend ?? 0) / 100) * width, { p1, p2 });
    const text = a.textAt ? { x: (a.textAt[0] / 100) * width, y: (a.textAt[1] / 100) * height } : { x: geo.midX, y: geo.midY };
    const pts = Array.from({ length: 17 }, (_, i) => cubic(geo, i / 16));
    arrows.push({ id: a.id, from: a.from, to: a.to, d: geo.d, midX: text.x, midY: text.y, x1: geo.p1.x, y1: geo.p1.y, x2: geo.p2.x, y2: geo.p2.y, head: a.head, line: a.line,
      colour: colour(a.colour, '#1e293b'), text: a.text, meaning: a.meaning, freeFrom, freeTo, pts });
  }
  return {
    width, height,
    regions: x.regions.map((r) => ({ id: r.id, kind: r.kind, label: r.label, boundary: r.boundary, ...px(r.box, width, height) })),
    panels: x.panels.filter((p) => p.label).map((p) => ({ id: p.id, text: p.label!, ...px(p.box, width, height) })),
    groups, nodes, arrows, skipped,
  };
}

/**
 * Wraps a label to at most 3 lines for a box of the given width.
 * Copied from BioPathway Studio (BioRenderGlyphs.tsx, wrapLabelToRows); the character width now scales with the font size.
 */
export function wrapLabel(text: string | null | undefined, width: number, fontSize: number): string[] {
  if (!text) return [];
  const clean = text.trim();
  if (!clean) return [];
  const maxChars = Math.max(4, Math.floor(width / (fontSize * 0.58)));
  if (clean.length <= maxChars) return [clean];
  if (clean.includes(' / ')) {
    const parts = clean.split(' / ');
    if (parts.length === 2) return [parts[0] + ' /', parts[1]];
  }
  const words = clean.split(/\s+/);
  if (words.length === 1) return [clean];
  const lines: string[] = [];
  let current = words[0];
  for (let i = 1; i < words.length; i++) {
    if ((current + ' ' + words[i]).length <= maxChars) current += ' ' + words[i];
    else {
      lines.push(current);
      current = words[i];
      if (lines.length === 2) {
        const rest = words.slice(i + 1).join(' ');
        if (rest) current += ' ' + rest;
        break;
      }
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 3);
}

/** The box of a shape or group, or for an arrow the box around both its ends. Null if it isn't drawn. */
export function boxOf(scene: Scene, id: string): BoxPx | null {
  const n = scene.nodes.find((v) => v.id === id) ?? scene.groups.find((v) => v.id === id);
  if (n) return { x: n.x, y: n.y, width: n.width, height: n.height };
  const a = scene.arrows.find((v) => v.id === id);
  if (!a) return null;
  const ends = [a.freeFrom ? null : boxOf(scene, a.from), a.freeTo ? null : boxOf(scene, a.to)].filter((b): b is BoxPx => !!b);
  return union([...ends, { x: a.x1, y: a.y1, width: 0, height: 0 }, { x: a.x2, y: a.y2, width: 0, height: 0 }], 0);
}

/** Where a pin for this item sits: a shape's bottom-right corner (badges sit along the top), or an arrow's midpoint. */
export function anchorOf(scene: Scene, id: string): { x: number; y: number; onArrow?: boolean } | null {
  const a = scene.arrows.find((v) => v.id === id);
  if (a) return { x: a.midX, y: a.midY, onArrow: true };
  const b = boxOf(scene, id);
  if (!b) return null;
  // The first corner that isn't over another shape, so a pin doesn't hide a neighbour's label.
  const corners = [{ x: b.x + b.width, y: b.y + b.height }, { x: b.x, y: b.y + b.height }, { x: b.x + b.width, y: b.y }, { x: b.x, y: b.y }];
  const m = Math.min(b.width, b.height) * 0.15;
  const covered = (p: { x: number; y: number }) => scene.nodes.some((n) => n.id !== id && p.x > n.x + m && p.x < n.x + n.width - m && p.y > n.y + m && p.y < n.y + n.height - m);
  return corners.find((c) => !covered(c)) ?? corners[0];
}

/** Gap between two boxes (0 if they touch or overlap). */
export function gap(a: BoxPx, b: BoxPx): number {
  const dx = Math.max(0, a.x - (b.x + b.width), b.x - (a.x + a.width));
  const dy = Math.max(0, a.y - (b.y + b.height), b.y - (a.y + a.height));
  return Math.hypot(dx, dy);
}

/** The shapes (and, if asked, groups) drawn nearest to a box, nearest first. Position only: no biology. */
export function nearest(scene: Scene, from: BoxPx, opts: { exclude: string[]; groups: boolean; count: number }): string[] {
  const pool: (BoxPx & { id: string })[] = [...scene.nodes, ...(opts.groups ? scene.groups : [])];
  return pool.filter((n) => !opts.exclude.includes(n.id))
    .map((n) => ({ id: n.id, d: gap(from, n) }))
    .sort((a, b) => a.d - b.d).slice(0, opts.count).map((n) => n.id);
}

/** The smallest shape containing a point, else the smallest group containing it. */
export function hitTest(scene: Scene, x: number, y: number, groups: boolean): string | null {
  const inside = (b: BoxPx) => x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height;
  const area = (b: BoxPx) => b.width * b.height;
  const n = scene.nodes.filter(inside).sort((a, b) => area(a) - area(b))[0];
  if (n) return n.id;
  return groups ? scene.groups.filter(inside).sort((a, b) => area(a) - area(b))[0]?.id ?? null : null;
}

/** The smallest compartment containing a point, if any. */
export function regionAt(scene: Scene, x: number, y: number): SceneRegion | null {
  const inside = scene.regions.filter((r) => x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height);
  return inside.sort((a, b) => a.width * a.height - b.width * b.height)[0] ?? null;
}
