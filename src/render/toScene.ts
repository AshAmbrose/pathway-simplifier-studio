/**
 * Extraction → scene: everything placed at its original position (percent boxes → pixels of the image).
 * Only what was extracted is drawn; nothing is added, inferred or tidied. What can't be placed is listed in `skipped`.
 */
import type { Extraction } from '../types/extraction.ts';
import type { BoxPx } from './edgePorts.ts';
import { edgeGeometry } from './edgeGeometry.ts';

export interface SceneNode extends BoxPx {
  id: string; label: string | null; kind: string; outline: string; fill: string | null; textColour: string | null;
  mods: { text: string }[];
}
export interface SceneGroup extends BoxPx { id: string; label: string | null; members: string[] }
export interface SceneRegion extends BoxPx { id: string; kind: string; label: string | null; boundary: string | null }
export interface SceneArrow {
  id: string; from: string; to: string; d: string; midX: number; midY: number;
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

function union(boxes: BoxPx[], pad: number): BoxPx {
  const x0 = Math.min(...boxes.map((b) => b.x)) - pad, y0 = Math.min(...boxes.map((b) => b.y)) - pad;
  const x1 = Math.max(...boxes.map((b) => b.x + b.width)) + pad, y1 = Math.max(...boxes.map((b) => b.y + b.height)) + pad;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

export function toScene(x: Extraction, width: number, height: number): Scene {
  const skipped: string[] = [];
  const nodes: SceneNode[] = x.elements.map((e) => ({
    id: e.id, label: e.label, kind: e.kind, outline: e.outline, fill: e.fill, textColour: e.textColour,
    mods: e.modifications.map((m) => ({ text: m.type + (m.site ? ` ${m.site}` : '') + (m.count && m.count > 1 ? `×${m.count}` : '') })),
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
    arrows.push({ id: a.id, from: a.from, to: a.to, d: geo.d, midX: geo.midX, midY: geo.midY, head: a.head, line: a.line,
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
