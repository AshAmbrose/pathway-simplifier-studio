/**
 * What step 5's set_layout change stores: the figure's new positions, worked out once by src/layout/adapt.ts and
 * kept with the run, so the picture stays exactly as laid out (and an out-of-date layout can be noticed).
 * The laid-out picture has its own size (the canvas, in layout units: a protein is 40 high); positions are in
 * percent of it, like the extraction's own boxes are of the original image.
 */
import type { Extraction } from '../types/extraction.ts';

/** Step 5's switches: layout rules switched off (all are on by default), and whether member names show under collapsed shapes. */
export interface LayoutOptions { off: string[]; sublabels: boolean }
export const DEFAULT_LAYOUT: LayoutOptions = { off: [], sublabels: true };

export interface LayoutNotes {
  /** Shapes the figure gives no compartment: placed beside their most-connected partner (or, with none, in the cytoplasm). */
  beside: { id: string; partner: string | null }[];
  /** Compartments the figure draws that hold nothing after the earlier steps: not drawn. Named as in the figure. */
  emptyRegions: string[];
  /** Arrows that still pass behind a shape, after bowing around what they could. */
  behind: string[];
  /** Arrows whose text could not be kept clear of shapes and other text. */
  textClashes: string[];
}

export interface LayoutValue {
  opts: LayoutOptions;
  /** The laid-out picture's width and height. */
  canvas: number[];
  /** Every shape's new box, [x, y, width, height] in percent. */
  boxes: Record<string, number[]>;
  /** Every shape's compartment in the new drawing. */
  region: Record<string, string | null>;
  /** The compartments, redrawn as one cell. */
  regions: Extraction['regions'];
  /** The panels, redrawn as side-by-side columns. */
  panels: Extraction['panels'];
  /** Per arrow: its bow (percent of the canvas width), where its text sits, and any end in open space. */
  arrows: Record<string, { bend: number; textAt: number[] | null; ends?: { from: number[] | null; to: number[] | null } }>;
  notes: LayoutNotes;
}
