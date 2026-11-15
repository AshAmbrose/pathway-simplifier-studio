// Copied from BioPathway Studio (src/utils/textContrast.ts), unchanged.
/**
 * Picks legible text colours for a node label drawn on top of the node's fill.
 *
 * Uses WCAG relative luminance. A node's own text colour is kept when it has good contrast
 * (≥ 4.5:1) with the fill; otherwise white is used on mid/dark fills and near-black on light ones.
 * A halo in the opposite colour keeps text readable where it overhangs the membrane or background.
 */

const DARK = '#0f172a';
const LIGHT = '#ffffff';

function parseHex(color: string): [number, number, number] | null {
  const m = color.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})([0-9a-f]{2})?$/i);
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance(color: string): number | null {
  const rgb = parseHex(color);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number | null {
  const la = luminance(a);
  const lb = luminance(b);
  if (la === null || lb === null) return null;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export interface NodeTextColors {
  text: string;
  /** Outline drawn behind the text (SVG paint-order: stroke). */
  halo: string;
}

export function readableTextColors(fill: string, preferred?: string): NodeTextColors {
  if (preferred && (contrastRatio(preferred, fill) ?? 0) >= 4.5) {
    const preferredIsLight = (luminance(preferred) ?? 0) > 0.5;
    return { text: preferred, halo: preferredIsLight ? 'rgba(15, 23, 42, 0.55)' : 'rgba(255, 255, 255, 0.85)' };
  }
  // White reads better than black on saturated mid-tones (blue, purple, pink) even when
  // WCAG scores are close, so prefer it from 3:1 upwards.
  const useLight = (contrastRatio(LIGHT, fill) ?? 0) >= 3;
  return useLight ? { text: LIGHT, halo: 'rgba(15, 23, 42, 0.55)' } : { text: DARK, halo: 'rgba(255, 255, 255, 0.85)' };
}
