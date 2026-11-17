---
version: 1
slug: "src-components"
primary_target: "src/components"
related_targets: []
---

Scope: the whole app (upload, Check, simplification steps 1-5). Mode: Operate.
Job: a researcher checks a reconstructed pathway figure against the original, then simplifies it step by step; every change visible and undoable.
Constraints: the drawn figure is content (its colours are the authors'); plain language; nothing hidden.

## Direction contract
THESIS: A precise instrument for reading figures: the interface is calibrated, quiet and exact, and the two figures own the screen. Refuses the generic dashboard (slate cards in cards, blue everywhere, glyph soup).
OWN-WORLD: Cool neutral greys on a near-white field; 1px hairlines instead of boxes; one workhorse face (Public Sans) with tabular figures for every count and measure; ink-filled primary actions; one sharp orange used only for "this is what you are looking at" (selection, current step, focus), the same orange that outlines items on the figures; drawn icons (Lucide), never glyphs; small 4px corners.
STORY: The researcher sees the figure first, the current step and its decision second, the change log on demand; numbers read like readings.
FIRST VIEWPORT: Top bar (back, figure name, change count); a step rail of numbered steps with the current one marked in ink and orange underline; left: the step's document-like panel (heading, short explanation, sections divided by hairlines); right: before and after figures filling the height, framed by a hairline.
FORM: code-led refinement of the incumbent structure into a new visual world; position 1 (user pinned).
seed: none (pinned)
