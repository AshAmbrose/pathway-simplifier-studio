/**
 * The extraction format (prompt v2): what the model returns for one figure.
 *
 * One zod schema serves three jobs:
 *  - its JSON Schema is sent to Gemini as `responseJsonSchema` (structured output);
 *  - the reply is validated with it;
 *  - the TypeScript types below come from it.
 * The shape matches the chat-window test format (v1), so local/tools/score_runs.py can score app output too.
 * Boxes are [x, y, width, height] in percent of the image (0–100).
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
 * attaches to its clarification questions, fixes made by hand, and (later) simplification steps.
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
 */
export const EDIT_OPS = [
  'move_badge', 'add_badge', 'remove_badge', 'set_arrow_from', 'set_arrow_to', 'add_arrow', 'remove_arrow',
  'set_arrow_head', 'set_arrow_line', 'set_arrow_meaning', 'set_arrow_text', 'set_label', 'remove_element',
  'add_to_group', 'remove_from_group', 'set_box',
] as const;
export const EditSchema = z.object({
  op: z.enum(EDIT_OPS),
  id: z.string().describe('the shape, group or arrow the change applies to'),
  to: nullable(z.string()).describe('the other shape or group, for moves and arrow ends; otherwise null'),
  value: nullable(z.string()).describe('the badge text, label, head, line, meaning or text; otherwise null'),
});
export type Edit = z.infer<typeof EditSchema>;

/** A change that has been applied to a run: where it came from, and a key to undo it by. */
export const AppliedEditSchema = EditSchema.extend({
  key: z.string(),
  source: z.string().describe("'manual', or 'q<n>' for the answer to clarification question n"),
  at: z.string(),
});
export type AppliedEdit = z.infer<typeof AppliedEditSchema>;

/** What the user has done to a run: the change list, and which answer was chosen for each question (-1 = fixed by hand). */
export const ReviewSchema = z.object({
  edits: z.array(AppliedEditSchema),
  answers: z.record(z.string(), z.number()),
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
  })),
  flags: z.array(z.object({
    type: z.enum(FLAG_TYPES),
    on: z.string().describe('an element, group or arrow id'),
    asWritten: nullable(z.string()),
    suggestion: nullable(z.string()),
    basis: z.string(),
    confidence: z.enum(CONFIDENCE),
  })),
  clarify: z.array(z.object({
    about: z.array(z.string()).describe('the element, group or arrow ids the question concerns'),
    question: z.string(),
    options: z.array(z.object({
      label: z.string().describe('the answer in a few words, naming the shape as written'),
      shape: nullable(z.string()).describe('the id of the candidate shape or group this answer points at, if it is one'),
      asRead: z.boolean().describe('true for the one option that matches what you recorded'),
      edits: z.array(EditSchema).describe('the changes that turn what you recorded into this answer; empty for the asRead option'),
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
