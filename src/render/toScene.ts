/**
 * Extraction → scene: everything placed at its original position (percent boxes → pixels of the image).
 * Only what was extracted is drawn; nothing is added, inferred or tidied. What can't be placed is listed in `skipped`.
 */
import type { Extraction } from '../types/extraction.ts';
import type { BoxPx } from './edgePorts.ts';
import { edgeGeometry } from './edgeGeometry.ts';
import { badgeText } from '../edit/applyEdits.ts';

export interface SceneNode extends BoxPx {
  id: string; label: string | null; kind: string; outline: string; fill: string | null; textColour: string | null;
  mods: { text: string }[];
}
export interface SceneGroup extends BoxPx { id: string; label: string | null; members: string[] }
export interface SceneRegion extends BoxPx { id: string; kind: string; label: string | null; boundary: string | null }
export interface SceneArrow {
  id: string; from: string; to: string; d: string; midX: number; midY: number;
  /** Where the line leaves its start shape and meets its end shape. */
  x1: number; y1: number; x2: number; y2: number;
  head: string; line: string; colour: string; text: string | null; meaning: string;
}
export interface SceneText extends BoxPx { id: string; text: string }
export interface Scene {
  width: number; height: number;
  regions: SceneRegion[]; panels: SceneText[]; groups: SceneGroup[]; nodes: SceneNode[]; arrows: SceneArrow[];
  skipped: string[];
}

const HEX = /^#[0-9a-f]{3}([0-9a-f]{3})?$/i;
const NAMED: Record<string, string> = { black: '#1e293b', red: '#c0392b', blue: '#2563eb', green: '#15803d', grey: '#94a3b8', gray: '#94a3b8', purple: '#7e22ce', orange: '#ea580c', pink: '#db2777' };
export function colour(c: string | null | undefined, fallback: string): string {
  if (!c) return fallback;
  const t = c.trim().toLowerCase();
  if (HEX.test(t)) return t;
  for (const [k, v] of Object.entries(NAMED)) if (t.includes(k)) return v;
  return fallback;
}

function px(box: number[], w: number, h: number): BoxPx {
  const [x, y, bw, bh] = box.map((v) => (Number.isFinite(v) ? v : 0));
  const cx = Math.min(Math.max(x, 0), 100), cy = Math.min(Math.max(y, 0), 100);
  return { x: (cx / 100) * w, y: (cy / 100) * h, width: (Math.max(0.3, Math.min(bw, 100 - cx)) / 100) * w, height: (Math.max(0.3, Math.min(bh, 100 - cy)) / 100) * h };
}

export function union(boxes: BoxPx[], pad: number): BoxPx {
  const x0 = Math.min(...boxes.map((b) => b.x)) - pad, y0 = Math.min(...boxes.map((b) => b.y)) - pad;
  const x1 = Math.max(...boxes.map((b) => b.x + b.width)) + pad, y1 = Math.max(...boxes.map((b) => b.y + b.height)) + pad;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

export function toScene(x: Extraction, width: number, height: number): Scene {
  const skipped: string[] = [];
  const nodes: SceneNode[] = x.elements.map((e) => ({
    id: e.id, label: e.label, kind: e.kind, outline: e.outline, fill: e.fill, textColour: e.textColour,
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
  const arrows: SceneArrow[] = [];
  for (const a of x.arrows) {
    const s = byId.get(a.from), t = byId.get(a.to);
    if (!s || !t) { skipped.push(`arrow ${a.id}: ${!s ? a.from : a.to} could not be placed`); continue; }
    const geo = edgeGeometry(s, t, a.from === a.to);
    arrows.push({ id: a.id, from: a.from, to: a.to, d: geo.d, midX: geo.midX, midY: geo.midY, x1: geo.p1.x, y1: geo.p1.y, x2: geo.p2.x, y2: geo.p2.y, head: a.head, line: a.line,
      colour: colour(a.colour, '#1e293b'), text: a.text, meaning: a.meaning });
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
  const ends = [boxOf(scene, a.from), boxOf(scene, a.to)].filter((b): b is BoxPx => !!b);
  return ends.length ? union(ends, 0) : null;
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
