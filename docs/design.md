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
- **Offline checks** (`npm run check:extraction`): the formats, every kind of change, undo, and saved runs loading.
- **Practice runs:** a copy of a real extraction with shapes taken out, and a checker that says whether each was put back with the right name, place and arrows.
- **Browser tests at human pace,** only on throwaway copies. A test that clicks instantly once missed a real fault: a pop-up that moved while the pointer hovered.

## Next: simplification
- **Opt-in, reversible simplifications,** listed against the faithful reconstruction. For example: merge repeated copies, collapse a cluster, hide a side branch.
- **Suggestions from prior knowledge may be allowed here,** unlike in review, but always labelled with their source.
