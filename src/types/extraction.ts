/**
 * The data formats everything else is built on:
 *  - the extraction: what the model returns for one figure (prompt v3);
 *  - an edit: one change on top of it (an answer, a fix by hand, an added shape);
 *  - the review: the list of edits a user has made to a run.
 *
 * One zod schema serves three jobs:
 *  - its JSON Schema is sent to Gemini as `responseJsonSchema` (structured output);
 *  - the reply is validated with it;
 *  - the TypeScript types below come from it.
 * The shape matches the chat-window test format (v1), so local/tools/score_runs.py can score app output too.
 * Boxes are [x, y, width, height] in percent of the image (0–100); after step 5's layout, of its own canvas.
 */
import { z } from 'zod';

const nullable = <T extends z.ZodTypeAny>(t: T) => t.nullable();
const Box = z.array(z.number()).length(4).describe('[x, y, width, height] in percent of the image, 0–100');

export const REGION_KINDS = ['extracellular', 'plasma_membrane', 'cytoplasm', 'nucleus', 'endosome', 'mitochondrion', 'ER', 'other'] as const;
export const ELEMENT_KINDS = ['protein', 'protein family', 'receptor', 'ligand', 'gene', 'dna', 'small molecule', 'complex', 'process', 'phenotype', 'stimulus', 'heading', 'symbol', 'other'] as const;
export const OUTLINES = ['rounded box', 'box', 'oval', 'circle', 'text only', 'other'] as const;
export const CONTACT_KINDS = ['binds', 'docked_on', 'on'] as const;
export const HEADS = ['arrow', 'bar', 'none', 'other'] as const;
export const LINES = ['solid', 'dashed', 'dotted', 'faint', 'mixed'] as const;
export const MEANINGS = ['activates', 'inhibits', 'binds', 'modifies', 'translocates', 'transcribes', 'degrades', 'releases', 'processes', 'joins', 'recruited', 'next state', 'leads to', 'uncertain', 'unknown'] as const;
export const FLAG_TYPES = [
  'typo', 'ambiguous target', 'ambiguous source', 'low-contrast arrow', 'uncertainty marker: keep', 'unlabelled part',
  'unconnected element (question)', 'duplicate regulator', 'one shape, several molecules', 'one label, several items',
  'styling carries meaning', 'colour carries meaning', 'structure: one molecule in successive states',
  'change between panels with no drawn cause (question)', 'other',
] as const;
export const CONFIDENCE = ['high', 'medium', 'low'] as const;

/**
 * One change to an extraction. The same small vocabulary serves three jobs: the ready-made answers the model
 * attaches to its clarification questions, fixes made by hand, and simplification steps.
 * Flat on purpose (op + id + to + value), so the model can write it under structured output.
 *
 *   move_badge        id = shape carrying the badge, value = badge text, to = the shape that should carry it
 *   add_badge         id = shape, value = badge text (a chain may be written "Ub×3")
 *   remove_badge      id = shape, value = badge text
 *   set_arrow_from    id = arrow, to = shape or group it should start at
 *   set_arrow_to      id = arrow, to = shape or group it should end at
 *                     (by hand only: value = "x,y" in percent puts that end in open space; to = the compartment there, or null)
 *   add_arrow         id = start shape or group, to = end shape or group, value = head (arrow | bar | none)
 *   remove_arrow      id = arrow
 *   set_arrow_head    id = arrow, value = arrow | bar | none | other
 *   set_arrow_line    id = arrow, value = solid | dashed | dotted | faint | mixed
 *   set_arrow_meaning id = arrow, value = one of the arrow meanings
 *   set_arrow_text    id = arrow, value = text (null clears it)
 *   set_label         id = shape or group, value = label (null clears it)
 *   remove_element    id = shape (its arrows, contacts and group memberships go with it)
 *   add_to_group      id = shape, to = group
 *   remove_from_group id = shape, to = group
 *   set_box           id = shape, value = "x,y,width,height" in percent (hand fixes only)
 *   add_element       id = the new shape's id, to = the compartment it sits in (or null),
 *                     value = '{"box":[x,y,w,h],"fill":"#rrggbb"}' (hand fixes only; never offered to the model)
 *
 * Simplification only (never offered to the model, so not in MODEL_EDIT_OPS):
 *   hide              id = shape, group or arrow, value = the reason in plain words ("not on a chosen pathway").
 *                     Leaves it out of the simplified figure; a shape's arrows and contacts go with it.
 *   merge_into        id = a repeated copy that goes, to = the copy that stays. Its arrows, contacts and cluster
 *                     places move to the staying copy.
 *   collapse          id = the new shape's id ("col-…"), value = '{"members":[ids],"label":"…","sub":"A + B + C"|null}'.
 *                     One shape over the members' area replaces them; their arrows point at it.
 *   set_layout        id = "layout", value = the new positions as JSON (see src/layout/adapt.ts, LayoutValue): every
 *                     shape's box, the compartments and panels redrawn as one cell, each arrow's bend and text spot.
 *                     Worked out by step 5 and stored, so the figure stays exactly as laid out.
 *   restyle           id = "style": one consistent style. Shapes take a fill by kind (at most five colours);
 *                     arrows are black, or red for a bar. Text colours go back to the default.
 * After merge_into and collapse, arrows that have become identical are drawn as one, an arrow from a shape to
 * itself is dropped, and clusters holding the same shapes become one.
 */
export const MODEL_EDIT_OPS = [
  'move_badge', 'add_badge', 'remove_badge', 'set_arrow_from', 'set_arrow_to', 'add_arrow', 'remove_arrow',
  'set_arrow_head', 'set_arrow_line', 'set_arrow_meaning', 'set_arrow_text', 'set_label', 'remove_element',
  'add_to_group', 'remove_from_group', 'set_box', 'add_element',
] as const;
export const EDIT_OPS = [...MODEL_EDIT_OPS, 'hide', 'merge_into', 'collapse', 'set_layout', 'restyle'] as const;
const editFields = {
  id: z.string().describe('the shape, group or arrow the change applies to'),
  to: nullable(z.string()).describe('the other shape or group, for moves and arrow ends; otherwise null'),
  value: nullable(z.string()).describe('the badge text, label, head, line, meaning or text; otherwise null'),
};
/** A change the model may write (in a question's answers). */
export const ModelEditSchema = z.object({ op: z.enum(MODEL_EDIT_OPS), ...editFields });
/** Any change, including the simplification-only ones. */
export const EditSchema = z.object({ op: z.enum(EDIT_OPS), ...editFields });
export type Edit = z.infer<typeof EditSchema>;

/**
 * A change that has been applied to a run: where it came from, and a key to undo it by.
 * Sources: 'manual' (a fix by hand), 'q<n>' (the answer to question n), 'step:<step>' (a simplification step).
 */
export const AppliedEditSchema = EditSchema.extend({
  key: z.string(),
  source: z.string().describe("'manual', 'q<n>' for the answer to clarification question n, or 'step:<step>' for a simplification step"),
  at: z.string(),
});
export type AppliedEdit = z.infer<typeof AppliedEditSchema>;

/** The simplification steps, in the order they apply. */
export const STEPS = ['issues', 'focus', 'repeats', 'clusters', 'layout'] as const;
export type StepId = (typeof STEPS)[number];

/**
 * What the user decided in the simplification steps, beyond the changes themselves (those are in the change list).
 *  - steps:  which steps are done or skipped;
 *  - issues: step 1 items settled without a change ("kept as written", "seen", with an optional note of what it means);
 *  - focus:  step 2's choices: routes and regulators ticked off, and shapes kept or dropped by clicking.
 *            The step's changes are worked out from these, so ticking a route back on restores it exactly.
 *  - panels: step 3's answer about the panels.
 *  - layout: step 5's switches: the layout rules in use (all on unless switched off) and whether collapsed
 *            shapes show their members' names. The positions themselves are in the step's set_layout change.
 */
export const SimplifySchema = z.object({
  steps: z.record(z.string(), z.enum(['done', 'skipped'])),
  issues: z.record(z.string(), z.object({ kind: z.enum(['kept', 'seen']), note: nullable(z.string()) })),
  focus: z.object({ off: z.array(z.string()), keep: z.array(z.string()), drop: z.array(z.string()) }),
  /** Step 3's question: are the figure's panels different conditions (repeats kept apart) or one picture? */
  panels: z.enum(['conditions', 'one']).nullable().optional(),
  /** Step 5's switches. */
  layout: z.object({ off: z.array(z.string()), sublabels: z.boolean() }).optional(),
});
export type Simplify = z.infer<typeof SimplifySchema>;
export const EMPTY_SIMPLIFY: Simplify = { steps: {}, issues: {}, focus: { off: [], keep: [], drop: [] } };

/** What the user has done to a run: the change list, which answer was chosen for each question (-1 = fixed by hand), and the simplification record. */
export const ReviewSchema = z.object({
  edits: z.array(AppliedEditSchema),
  answers: z.record(z.string(), z.number()),
  simplify: SimplifySchema.optional(),
});
export type Review = z.infer<typeof ReviewSchema>;
export const EMPTY_REVIEW: Review = { edits: [], answers: {} };

export const ExtractionSchema = z.object({
  structure: z.string().describe("one or two sentences: panels, numbered steps, before/after states, or 'single panel'"),
  panels: z.array(z.object({ id: z.string(), label: nullable(z.string()), box: Box })),
  regions: z.array(z.object({
    id: z.string(),
    kind: z.enum(REGION_KINDS),
    label: nullable(z.string()).describe('text as written, or null if the compartment is not labelled'),
    boundary: nullable(z.string()).describe("how its edge is drawn, e.g. 'dashed line', 'lipid bilayer', 'none'"),
    box: Box,
  })),
  elements: z.array(z.object({
    id: z.string(),
    label: nullable(z.string()).describe('exactly as written, typos included; null if the shape has no label'),
    kind: z.enum(ELEMENT_KINDS),
    region: nullable(z.string()),
    panel: nullable(z.string()),
    modifications: z.array(z.object({
      type: z.string().describe("badge text as written, e.g. 'P', 'ub', 'Ub'"),
      site: nullable(z.string()),
      count: nullable(z.number()).describe('chain length if a chain is drawn'),
    })),
    description: nullable(z.string()).describe('only if unlabelled or unusual: shape, colour'),
    box: Box,
    fill: nullable(z.string()).describe('main fill colour as #rrggbb, or null if none'),
    outline: z.enum(OUTLINES),
    textColour: nullable(z.string()).describe('label colour as #rrggbb'),
    /** Set only by step 4's collapse, never by the model: the members' names ("A + B + C") under a new name. */
    sublabel: z.string().nullable().optional(),
  })),
  groups: z.array(z.object({ id: z.string(), members: z.array(z.string()), label: nullable(z.string()), region: nullable(z.string()) })),
  contacts: z.array(z.object({ a: z.string(), b: z.string(), kind: z.enum(CONTACT_KINDS) })),
  arrows: z.array(z.object({
    id: z.string(),
    from: z.string().describe('an element or group id'),
    to: z.string().describe('an element or group id'),
    head: z.enum(HEADS),
    line: z.enum(LINES),
    colour: nullable(z.string()).describe('#rrggbb, or null for black'),
    text: nullable(z.string()).describe('text, step number or "?" written on or beside the arrow'),
    meaning: z.enum(MEANINGS),
    notes: nullable(z.string()),
    /**
     * Set only by a user's change, never by the model: where an end sits when it is in open space or on a
     * compartment instead of a shape, as [x, y] in percent. `from`/`to` then hold the compartment's id, or "open".
     */
    ends: z.object({ from: nullable(z.array(z.number()).length(2)), to: nullable(z.array(z.number()).length(2)) }).optional(),
    /** Set only by step 5's layout: how far the arrow bows (in percent of the picture's width) to keep clear of shapes. */
    bend: z.number().optional(),
    /** Set only by step 5's layout: where the arrow's text sits, [x, y] in percent, clear of shapes and lines. */
    textAt: z.array(z.number()).length(2).nullable().optional(),
  })),
  flags: z.array(z.object({
    type: z.enum(FLAG_TYPES),
    on: z.string().describe('an element, group or arrow id'),
    asWritten: nullable(z.string()),
    suggestion: nullable(z.string()),
    basis: z.string(),
    confidence: z.enum(CONFIDENCE),
  })),
  /**
   * Set only by step 5's layout, never by the model: the laid-out picture's own [width, height]. Boxes are then
   * in percent of it rather than of the original image.
   */
  canvas: z.array(z.number()).length(2).optional(),
  clarify: z.array(z.object({
    about: z.array(z.string()).describe('the element, group or arrow ids the question concerns'),
    question: z.string(),
    options: z.array(z.object({
      label: z.string().describe('the answer in a few words, naming the shape as written'),
      shape: nullable(z.string()).describe('the id of the candidate shape or group this answer points at, if it is one'),
      asRead: z.boolean().describe('true for the one option that matches what you recorded'),
      edits: z.array(ModelEditSchema).describe('the changes that turn what you recorded into this answer; empty for the asRead option'),
    })),
  })),
});

export type Extraction = z.infer<typeof ExtractionSchema>;
export type Element = Extraction['elements'][number];
export type Arrow = Extraction['arrows'][number];
export type Group = Extraction['groups'][number];
export type Region = Extraction['regions'][number];
export type Question = Extraction['clarify'][number];
export type Option = Question['options'][number];

/** JSON Schema for Gemini's responseJsonSchema. */
export function extractionJsonSchema(): unknown {
  const s = z.toJSONSchema(ExtractionSchema, { io: 'input' }) as Record<string, any>;
  delete s.$schema;
  // Open-space arrow ends are a user's change; the model is never asked for them.
  delete s.properties?.arrows?.items?.properties?.ends;
  // Nor for a collapsed shape's sub-label, which only simplification sets.
  delete s.properties?.elements?.items?.properties?.sublabel;
  // Nor for the layout step's canvas, arrow bends and text spots.
  delete s.properties?.canvas;
  if (Array.isArray(s.required)) s.required = s.required.filter((k: string) => k !== 'canvas');
  delete s.properties?.arrows?.items?.properties?.bend;
  delete s.properties?.arrows?.items?.properties?.textAt;
  return s;
}

/**
 * References that do not resolve (an arrow to an unknown id, a group member that is not an element, …).
 * They are reported, not silently dropped; the render skips what it cannot place.
 */
export function referenceProblems(x: Extraction): string[] {
  const el = new Set(x.elements.map((e) => e.id));
  const gr = new Set(x.groups.map((g) => g.id));
  const ar = new Set(x.arrows.map((a) => a.id));
  const rg = new Set(x.regions.map((r) => r.id));
  const pn = new Set(x.panels.map((p) => p.id));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of [...el, ...gr, ...ar]) {
    if (seen.has(id)) out.push(`id "${id}" is used twice`);
    seen.add(id);
  }
  const node = (id: string) => el.has(id) || gr.has(id);
  for (const e of x.elements) {
    if (e.region && !rg.has(e.region)) out.push(`element ${e.id}: unknown region "${e.region}"`);
    if (e.panel && !pn.has(e.panel)) out.push(`element ${e.id}: unknown panel "${e.panel}"`);
  }
  for (const g of x.groups) for (const m of g.members) if (!el.has(m)) out.push(`group ${g.id}: member "${m}" is not an element`);
  for (const c of x.contacts) for (const id of [c.a, c.b]) if (!node(id)) out.push(`contact ${c.a}–${c.b}: unknown id "${id}"`);
  for (const a of x.arrows) {
    if (!node(a.from) && !a.ends?.from) out.push(`arrow ${a.id}: unknown end "${a.from}"`);
    if (!node(a.to) && !a.ends?.to) out.push(`arrow ${a.id}: unknown end "${a.to}"`);
  }
  for (const f of x.flags) if (!node(f.on) && !ar.has(f.on)) out.push(`flag "${f.type}": unknown target "${f.on}"`);
  // Appearance the render depends on: say so when it is missing, instead of quietly drawing everything grey.
  const filled = x.elements.filter((e) => e.outline !== 'text only');
  const noFill = filled.filter((e) => !e.fill).length;
  if (filled.length >= 4 && noFill > filled.length / 2) out.push(`${noFill} of ${filled.length} shapes came back without a fill colour, so they are drawn in a default grey`);
  x.clarify.forEach((c, i) => {
    for (const id of c.about) if (!node(id) && !ar.has(id)) out.push(`question ${i + 1}: unknown id "${id}"`);
    for (const o of c.options) if (o.shape && !node(o.shape)) out.push(`question ${i + 1}, answer "${o.label}": unknown shape "${o.shape}"`);
  });
  return out;
}
