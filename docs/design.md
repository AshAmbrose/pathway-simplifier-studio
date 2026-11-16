# Design decisions

This page records the main decisions and why each was made, for anyone new to the project. It's updated with each feature.

The open-licence test figures named here:
- Liu 2022 (Wnt);
- Hu 2021 (JAK-STAT);
- Yu 2020 and Guo 2024 (NF-κB).

All four are from *Signal Transduction and Targeted Therapy* (CC BY 4.0).

## 1. Faithful extraction first
**Decision:** before anything is simplified, the figure is copied exactly as drawn. That includes typos, unlabelled shapes, repeated copies of a molecule, and the authors' "?" marks.

**Why:** a scientist must be able to trust that the starting point is their figure, not the model's idea of the pathway. In early tests, every model "corrected" figures from textbook knowledge. For example, they added a step the figure doesn't draw. That is exactly what we want to avoid.

**How:**
- **One model call per figure,** and the reply's format is enforced, not just requested.
- **The prompt is written from tested mistakes.**
  - **v1:** compared six models on hand-checked answer keys.
  - **v2:** added rules for the mistakes found:
    - draw only lines that are drawn;
    - step numbers belong to arrows;
    - badges belong to the shape they sit on;
    - never name an unlabelled shape.
  - **v3:** each question the model asks comes with ready-made answers (see 3).
- **Unlabelled parts stay unlabelled and are flagged.** Detecting them is a feature: the user decides what they are.

## 2. One list of changes on top of the untouched extraction
**Decision:** the model's extraction is never edited. Every answer, fix or added shape is a change in a list saved with the run. What you see is the extraction with that list applied.

**Why:**
- **Every difference from the model's reading can be listed in plain words and undone,** one at a time.
- **"Show as extracted" always works.**
- **Simplification can reuse the same mechanism:** opt-in, reversible, every difference listed.
- **A change that no longer applies** (for example, its shape was removed) is reported, not silently dropped.

## 3. Review on the canvas
**Decision:** the model's questions about ambiguous parts appear as numbered pins on both the original and the reconstruction. Opening one moves both views to the shapes concerned and offers the answers beside them.

**Why answers are the main route:** choosing from a short list is quick and consistent. Fixing by hand (click a shape or arrow for a small form) is the other route, and dragging is only a shortcut for the same fixes.

**Answers come only from what can be seen:**
- The options are the shapes drawn next to the item, listed in the order they sit in the figure.
- None is preferred on the basis of biology knowledge.
- The only tag is "shown now", meaning that option leaves the picture as it is. That's a fact about the screen, not a recommendation.

**Kept uncluttered:**
- one pop-up at a time, placed beside the shapes and never over them;
- everything else (questions, flags, run details) in one panel under the pictures, closed until asked for.

## 4. Adding what the model missed
**Decision:** "+ Shape" and "+ Arrow" buttons.
- **A new shape takes its colour from the original image** where it's placed.
- **Its name box suggests names already written in the figure.** Greek letters can be typed as Latin ones.
- **New arrows** can be drawn from any shape, as an arrow or a bar. An arrow ending where there is no shape is accepted after a check.

**Why:** the colour and the name suggestions come from the figure itself, so additions stay faithful without guessing. Undoing an added shape also undoes everything that depends on it (its name, arrows and moves).

## 5. Safe saving
**Decision:**
- each save says which version it was built on, and the server refuses it if the run has changed since;
- every save is also kept in a history file beside the run;
- nothing is saved unless the change list actually changed.

**Why:** a test run lost its changes. The page reloaded from an older copy during development and saved it over newer work. The same could happen with two tabs open on one run.

## 6. How it's tested
- **Offline checks** (`npm run check:extraction`): the formats, every kind of change, undo, saved runs loading, the order changes apply in, and step 2's routes on the saved test figures (untick → left out → tick back → restored).
- **Practice runs:** a copy of a real extraction with shapes taken out, and a checker that says whether each was put back with the right name, place and arrows.
- **Browser tests at human pace,** only on throwaway copies. A test that clicks instantly once missed a real fault: a pop-up that moved while the pointer hovered.

## 7. Simplification in five steps
**Decision:** a **Current | Simplified** switch in the header. Simplified runs five steps in a fixed order:
1. Issues
2. Focus
3. Repeats
4. Clusters
5. Layout

Any step can be skipped. Each is shown before → after: the left view is the figure after every earlier step, the right view the same with this step's choices. What a step leaves out stays on the right view, faded, so it can be clicked back in. The original opens in a small floating window.

**Why:**
- **A fixed order:** each step works on a cleaner figure than the last. For example, a name fixed in step 1 is the name step 2 shows.
- **Before → after for each step:** the effect of one step is easy to see on its own.

**How it fits the change list** (see 2):
- **Every choice is a change in the same list, tagged with its step.**
  - Changes apply as answers, then fixes by hand, then each step in order.
  - So Current never shows simplifications, and Simplified is always built on the corrected figure.
- **A new change, "leave out" (`hide`),** says why: "not on a chosen pathway", "unlabelled part left out". It is never offered to the model.
- **A small record is saved with the run:** which steps are done or skipped, the issues settled without a change ("kept as written", "seen"), and step 2's ticks and clicks.
- **Step 2's changes are rebuilt from its ticks and clicks.** Ticking a route back on restores it exactly. If the figure under it changed since (a correction in Current), the step says so and offers "Update" rather than changing anything unasked.

**Step 1, Issues:**
- **Lists:** the model's typo flags, every shape with no label, and the colour or styling the model thinks carries meaning.
- **Colour meanings are only acknowledged,** with an optional note. No key is drawn.
- **Counts and clusters wait for their own steps.**

**Step 2, Focus: routes are traced from the drawing.** There's no model call and no biology.
- **Shapes that travel together form one unit:** shapes drawn touching, or drawn in one cluster.
- **A route** starts where nothing points in and follows the arrows.
- **Inhibition arrows aren't followed.** What they come from is listed as a regulator.
- **Routes are grouped as the figure groups them:** by panel, else by the nearest heading.
- **Everything starts ticked,** so skipping the step changes nothing.

**Next:** step 3 (merge plain repeats), step 4 (collapse chosen clusters), step 5 (reorganise the layout, reusing BioPathway Studio's Organize Layout, with locations taken only from the original figure). Suggestions from prior knowledge may come later, always labelled with their source.
