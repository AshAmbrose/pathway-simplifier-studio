Model: {{MODEL}}

You are transcribing biological pathway figures into structured data. I will send figures one at a time, each with a short ID (F1–F6). For each figure, reply with **one JSON code block and nothing else**, following the schema and rules below. Start the JSON with the "model" and "figure" fields.

Treat each figure on its own. Don't reuse anything from an earlier figure in this chat.

## Your job: transcribe, don't interpret
Record what is **drawn**, exactly as drawn. This is not a biology exercise. If the figure differs from what you know about the pathway, record the figure, not your knowledge. Don't add molecules, steps or labels that aren't drawn. Don't correct anything; put suspected problems in `flags`.

## Rules
1. **Labels exactly as written**, including typos, Latin letters standing in for Greek ones, odd spacing and capitals. If a shape has no label, use `"label": null` and describe the shape.
2. **One drawn shape = one element.** If the same molecule is drawn several times, each copy is a separate element. Don't merge copies.
3. **Shapes drawn touching as one cluster form a group** (in `groups`, listing member element ids). The group itself gets a label only if the figure labels the cluster as a whole. Don't decide whether it's a "real" complex; just record that they're drawn together.
4. **A receptor drawn as several chains is one element**, unless the chains are drawn as different molecules (e.g. different colours). Then each chain is an element and the receptor is a group.
5. **Other touching is a contact**: a ligand bound to a receptor, a protein docked on a receptor, a protein on DNA. A modification badge or chain that merely reaches another shape is **not** a contact.
6. **Modifications** (P, Ub/ub, etc.) belong on the shape that carries them, not on the enzyme that adds them. Copy the text as written ("ub" vs "Ub"), record the site if one is written, and record a chain length as `count`. If you can't tell which shape a badge belongs to, put it on the most likely shape and add an "ambiguous target" flag.
7. **DNA is an element** (kind "dna"), one per helix drawn. Genes and promoter arrows are elements too.
8. **Panel titles, panel letters and headings are elements** (kind "heading"). Text labels for compartments ("Cytoplasm", "Nucleus") go on the region, as `label`.
9. **Arrows exactly as drawn.** Record:
   - the head (arrow, bar, none, or something else);
   - the line (solid, dashed, dotted, faint, or mixed);
   - the colour if it isn't black;
   - any text or "?" written on or beside it;
   - which element or group the tail starts at and the head touches.
   - Don't skip arrows that are faint, short, curved or self-loops.
   - If the head ends in empty space or between two shapes, pick the nearest and flag it "ambiguous target".
10. **Meaning** of an arrow comes from the drawing: a bar head means inhibits, a "?" means uncertain. A step-number label or narrative order counts as drawn. Otherwise use your best reading from the vocabulary, or "unknown".
11. **Flags** are suspected problems or features a careful editor would raise. They aren't corrections. Say what each is based on. A biology concern is a *question* ("differs from the usual model: intended?"), never a claim that the figure is wrong.
12. **Positions:** give each element a rough `box` as [x, y, width, height] in percent of the image (0–100). Approximate is fine.
13. **Be complete.** List every shape, label, arrow and badge, even small or pale ones. Anything you can't read goes in `unsure`.

## Vocabularies (use these words; "other: …" if nothing fits)
- **region kind:** extracellular, plasma_membrane, cytoplasm, nucleus, endosome, mitochondrion, ER, other
- **element kind:** protein, protein family, receptor, ligand, gene, dna, small molecule, complex (a single shape representing a complex, e.g. a proteasome drawing), process, phenotype, stimulus, heading, symbol, other
- **contact kind:** binds, docked_on, on
- **arrow head:** arrow, bar, none, other: …
- **arrow line:** solid, dashed, dotted, faint, mixed: …
- **arrow meaning:** activates, inhibits, binds, modifies, translocates, transcribes, degrades, releases, processes, joins, recruited, next state, leads to, uncertain, unknown
- **flag type:**
  - typo
  - label convention
  - unlabelled part
  - unlabelled part: suggested identity
  - ambiguous target
  - ambiguous source
  - low-contrast arrow
  - uncertainty marker: keep
  - one shape, several molecules
  - one label, several items
  - unconnected element (question)
  - possible missing step (question)
  - differs from convention (question)
  - location unclear
  - layout (question)
  - panel boundary
  - panel contents
  - styling carries meaning
  - colour carries meaning
  - duplicate regulator
  - structure: one molecule in successive states
  - change between panels with no drawn cause (question)
  - other: …
- **confidence:** high, medium, low

## Schema
```json
{
  "model": "{{MODEL}}",
  "figure": "F1",
  "structure": "one or two sentences: panels, numbered steps, before/after states, or 'single panel'",
  "panels": [{"id": "p1", "label": "text as written or null"}],
  "regions": [{"id": "r1", "kind": "cytoplasm", "label": "text as written or null"}],
  "elements": [
    {"id": "e1", "label": "as written or null", "kind": "protein", "region": "r1", "panel": "p1 or null",
     "modifications": [{"type": "P", "site": null, "count": null}],
     "description": "only if unlabelled or unusual: shape, colour", "box": [10, 20, 8, 4]}
  ],
  "groups": [{"id": "g1", "members": ["e1", "e2"], "label": null, "region": "r1"}],
  "contacts": [{"a": "e3", "b": "e1", "kind": "docked_on"}],
  "arrows": [
    {"id": "a1", "from": "e1 or g1", "to": "e5 or g2", "head": "arrow", "line": "solid", "colour": null,
     "text": null, "meaning": "activates", "notes": null}
  ],
  "flags": [
    {"type": "typo", "on": "e7 or a3", "asWritten": "…", "suggestion": "…", "basis": "why", "confidence": "high"}
  ],
  "unsure": ["anything you could not read or decide"]
}
```

Reply only with the JSON code block. Its file name will be `{{MODEL}}__F1.json` (with the figure's ID). Ready? I'll send F1.
