/**
 * Step 5: shape sizes and the arrangement inside a group of shapes that travel together, shared by
 * "Compact" (compact.ts) and "Redraw as a cell" (adapt.ts). Sizes are in layout units: a protein is 40 high,
 * and names are set at about 16, so they stay readable once the picture is shrunk to fit.
 */
import type { Element } from '../types/extraction.ts';

export const UNIT_H = 40;
export const FONT = 16;
/** Gap between shapes inside one group (they are drawn touching, or nearly). */
export const BLOCK_GAP = 4;

export const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 1; };

/** One height per kind (rule "sizes"), and the narrowest a shape of that kind may be. */
export function kindSize(e: Element): { w: number; h: number } {
  if (e.outline === 'text only') return { w: 60, h: 28 };
  switch (e.kind) {
    case 'receptor': return e.outline === 'other' ? { w: 48, h: 90 } : { w: 72, h: 40 };
    case 'dna': return { w: 160, h: 28 };
    case 'gene': return { w: 80, h: 36 };
    case 'process': case 'phenotype': return { w: 120, h: 44 };
    case 'small molecule': case 'ligand': return e.outline === 'circle' || e.outline === 'oval' ? { w: 44, h: 36 } : { w: 56, h: 32 };
    case 'symbol': return { w: 28, h: 28 };
    case 'complex': return { w: 90, h: 48 };
    default: return { w: 72, h: UNIT_H };
  }
}

/** The width a name needs at a readable size, on at most two lines (rule "fit"). */
export function nameWidth(label: string | null): { w: number; lines: number } {
  if (!label) return { w: 0, lines: 1 };
  const longest = Math.max(...label.split(/\s+/).map((v) => v.length));
  const lines = label.length > 16 && label.includes(' ') ? 2 : 1;
  const w = Math.max(longest * 0.62 * FONT, (label.length * 0.58 * FONT) / lines);
  return { w: Math.min(260, w) + 14, lines };
}

/**
 * A shape's size in layout units: one size per kind (or its drawn size scaled by `s`), widened to fit its name,
 * and taller for a collapsed shape's member names.
 */
export function sizeOf(e: Element, drawn: { w: number; h: number }, s: number, o: { sizes: boolean; fit: boolean; sublabels: boolean }) {
  let { w, h } = o.sizes ? kindSize(e) : { w: drawn.w * s, h: drawn.h * s };
  const glyph = e.kind === 'receptor' && e.outline === 'other' && h > w * 0.6;
  if (o.fit && e.label) {
    const need = nameWidth(e.label);
    if (glyph) { w = Math.max(w, Math.min(80, need.w / 2)); h = Math.max(h, w * 1.8); }
    else { w = Math.max(w, need.w); if (need.lines > 1) h = Math.max(h, 2 * FONT * 1.15 + 10); }
  }
  if (o.sublabels && e.sublabel) { h += 16; if (o.fit) w = Math.max(w, Math.min(260, e.sublabel.length * 0.36 * FONT + 14)); }
  return { w: Math.round(w), h: Math.round(h) };
}

/**
 * Shapes that travel together keep their rows as drawn: rows by height in the original, each row left to right,
 * touching, centred. `at` gives each shape's drawn box; `size` its new size. Returns offsets and the group's size.
 */
export function arrangeRows(ids: string[], at: (id: string) => { x: number; y: number; w: number; h: number }, size: (id: string) => { w: number; h: number }) {
  const cy = (id: string) => at(id).y + at(id).h / 2;
  const sorted = [...ids].sort((a, b) => cy(a) - cy(b));
  const tol = 0.5 * median(ids.map((id) => at(id).h));
  const rows: string[][] = [];
  for (const id of sorted) { const row = rows[rows.length - 1]; if (row && Math.abs(cy(id) - cy(row[0])) <= tol) row.push(id); else rows.push([id]); }
  const rowW = rows.map((r) => r.reduce((sum, id) => sum + size(id).w, 0) + (r.length - 1) * BLOCK_GAP);
  const width = Math.max(...rowW);
  const offset = new Map<string, { dx: number; dy: number }>();
  let y = 0;
  rows.forEach((r, i) => {
    r.sort((a, b) => at(a).x - at(b).x);
    const rowH = Math.max(...r.map((id) => size(id).h));
    let xx = (width - rowW[i]) / 2;
    for (const id of r) { offset.set(id, { dx: xx, dy: y + (rowH - size(id).h) / 2 }); xx += size(id).w + BLOCK_GAP; }
    y += rowH + BLOCK_GAP;
  });
  return { offset, width, height: y - BLOCK_GAP };
}
