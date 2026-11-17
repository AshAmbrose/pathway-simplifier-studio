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

## 3. Review on the canvas (the Check step)
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
- **New arrows** can be drawn from any shape or cluster, as an arrow or a bar. A cluster's shapes touch, so in "+ Arrow" mode a cluster you hover (or drag an arrow over) shows a small tab to drag from or drop on. Only that one, so the picture isn't covered in tabs. An arrow ending where there is no shape is accepted after a check.

**Why:** the colour and the name suggestions come from the figure itself, so additions stay faithful without guessing. Undoing an added shape also undoes everything that depends on it (its name, arrows and moves).

## 5. Safe saving
**Decision:**
- each save says which version it was built on, and the server refuses it if the run has changed since;
- every save is also kept in a history file beside the run;
- nothing is saved unless the change list actually changed.

**Why:** a test run lost its changes. The page reloaded from an older copy during development and saved it over newer work. The same could happen with two tabs open on one run.

## 6. How it's tested
- **Offline checks** (`npm run check:extraction`): the formats, every kind of change, undo, saved runs loading, the order changes apply in, step 2's routes on the saved test figures (untick → left out → tick back → restored), steps 3–4, and step 5 all three ways on each test figure, with every rule on and with each switched off: applies cleanly, no overlapping shapes, the same every time. Tidy keeps shapes in place and adds no crossings; Compact puts Guo's hub in the middle with no crossings.
- **Practice runs:** a copy of a real extraction with shapes taken out, and a checker that says whether each was put back with the right name, place and arrows.
- **Browser tests at human pace,** only on throwaway copies. A test that clicks instantly once missed a real fault: a pop-up that moved while the pointer hovered.

## 7. Simplification in five steps
**Decision:** one linear journey in a step bar across the top: **Check** (answer the questions, fix and add), then "Continue to simplify →" into five steps in a fixed order:
1. Issues
2. Focus
3. Repeats
4. Clusters
5. Layout

Any step can be skipped, and Back always works, including back to Check. Each simplification step is shown before → after: the left view is the figure after every earlier step, the right view the same with this step's choices. What a step leaves out stays on the right view, faded, so it can be clicked back in. The original opens in a small floating window.

**Why:**
- **One line to follow:** an early version had a "Current | Simplified" switch in the header. In testing it was confusing, so the whole process became one walk-through.
- **A fixed order:** each step works on a cleaner figure than the last. For example, a name fixed in step 1 is the name step 2 shows.
- **Before → after for each step:** the effect of one step is easy to see on its own.

**How it fits the change list** (see 2):
- **Every choice is a change in the same list, tagged with its step.**
  - Changes apply as answers, then fixes by hand, then each step in order.
  - So Check never shows simplifications, and the simplification steps are always built on the corrected figure.
- **A new change, "leave out" (`hide`),** says why: "not on a chosen pathway", "unlabelled part left out". It is never offered to the model.
- **A small record is saved with the run:** which steps are done or skipped, the issues settled without a change ("kept as written", "seen"), and step 2's ticks and clicks.
- **Step 2's changes are rebuilt from its ticks and clicks.** Ticking a route back on restores it exactly. If the figure under it changed since (a correction in Check), the step says so and offers "Update" rather than changing anything unasked.

**Step 1, Issues:**
- **Shown beside the original,** not the step before: a typo or an unlabelled part is best judged against what was drawn. Clicking a card outlines its item in orange on both pictures.
- **Lists:** the model's typo flags, every shape with no label, and the colour or styling the model thinks carries meaning.
- **Colour meanings are only acknowledged,** with an optional note. No key is drawn.
- **Counts and clusters wait for their own steps.**

**Step 2, Focus: routes are traced from the drawing.** There's no model call and no biology.
- **Shapes that travel together form one unit:** shapes drawn touching, or drawn in one cluster.
- **A route** starts where nothing points in and follows the arrows.
- **Inhibition arrows aren't followed.** What they come from is listed as a regulator, with the routes it acts on (not just the heading it sits nearest).
- **Routes are grouped as the figure groups them:** by panel, else by the nearest heading.
- **Everything starts ticked,** so skipping the step changes nothing.
- **Traced after Check and step 1,** so fixes, names and left-out parts are included.
- **Every shape can be ticked without a box per item:** a route opens to show its shapes as small chips, one per set of shapes that travel together.

**Step 3, Repeats:**
- **A plain repeat** has the same label as written, the same kind of compartment and the same badges. Copies in another compartment or state stay apart, listed with the reason. Copies drawn together in one cluster (a pair, like a dimer) also stay apart, since merging would erase the pair.
- **Asked once per figure** (when it has panels or headings): are they different conditions or parts of one picture? Under "conditions", nothing merges across them.
- **Each card says what merging does** before you choose: shapes fewer, arrows moved, arrows now drawn once.
- **The `merge_into` change** moves the copy's arrows, contacts and cluster places onto the kept copy.

**Step 4, Clusters:**
- **Nothing is suggested:** being drawn together doesn't prove the members belong together. You tick two or more members (shapes from outside can be added by clicking them), then name and collapse them.
- **The `collapse` change** makes one shape over the members' area. Arrows to a member point at it, and arrows between members go. A cluster made only of those members becomes the new shape. With a name of its own, the members' names stay as a small sub-label.
- **Tidy-up after merging or collapsing,** limited to what the change touched: arrows that became identical are drawn once (BioPathway Studio's rule), an arrow from a shape to itself is dropped, clusters holding the same shapes become one, and a cluster left with one shape stops being a cluster.
- **Until step 5,** a collapsed shape keeps the members' area, so shapes that weren't collapsed may overlap it.

**Step 5, Layout: three ways. Compact is the default; tidy as drawn and redraw as a cell are options.**
- **How we got here:**
  - The first version redrew every figure with BioPathway Studio's Organize Layout. On Guo kept to its canonical routes, it read worse than the original: tiny shapes, long diagonal arrows, and the wrong main line. Organize Layout is made for figures drawn from scratch.
  - The second version only tidied the original. On Guo almost nothing changed, and on Yu the empty space, the oversized nucleus and the curly arrows stayed.
  - So a middle ground, **Compact**, became the default.
- **Compact** (`src/layout/compact.ts`) keeps the arrangement (what sits left of, above or beside what) but rebuilds the spacing. Shapes that travel together stay together, keeping their rows as drawn.
  - **Rows and columns from the original:** shapes whose heights overlap by at least 40% share a row, and likewise widths for columns. They are then laid out with even gaps, so empty space disappears, and a staggered drawing doesn't become a staircase.
  - **Hub in the middle** (your request): the first shape, going down, that nearly all routes lead into (NEMO in Guo) goes to the middle of those routes. What follows it runs straight down below it, and where that line splits (Guo's two outcomes), the shapes spread evenly below.
    - Left-to-right order is kept, so this adds no crossings. An earlier attempt that moved whole routes to either side created up to 10.
  - **Main route straight down** (when there is no hub): the longest chain of arrows going down, preferring one that reaches the nucleus, runs straight down the middle. Every other shape keeps the side it was drawn on and packs in beside it, nearest first. On Yu kept to route c, the original's slightly offset columns had turned the one chain into a zigzag.
  - **Kept only where it reads at least as well:** Compact works the layout out both ways, with the main route straight and in its drawn columns, and keeps the straight one unless it has more crossings plus arrows behind shapes. On Wnt it would pull one panel's chain across both panels; on Hu it added arrows behind shapes.
  - **Narrow:** beside the main line, nearest first, each shape takes the innermost column with its row free. A row holding only side shapes joins the row above or below when they fit and no arrow joins them, so side shapes don't open gaps in the line.
  - **Pushes keep sides:** when two shapes overlap, the one off the main line moves outward, on the side it was drawn (Guo's Proteasome stays left of IκB).
  - **Side branches step down:** a shape fed from the main line in the line's own row (IκB → Proteasome), and what it leads to in that row (→ Degradation), move to a row just below, beside the line on the side they were drawn, so the branch reads top to bottom and the line's own arrow continues straight down.
  - **Every compartment is named** in the laid-out figure: one the figure leaves unnamed takes its kind's name ("Extracellular space", "Plasma membrane"). Each name sits in the first corner of its box clear of shapes, and a membrane band's name at its end.
  - **Bands touch, as in a cell:** the membrane crosses its receptors where it did in the original, the space outside reaches down to it, and the cytoplasm starts just under it.
  - **Bows ignore shapes drawn together with an arrow's ends** (an arrow to TAK1 may cross TAB2/3, which TAK1 is drawn on), and the measures count it the same way. No bow is deeper than about half the arrow's length, so short arrows don't loop.
  - **One size per kind,** names fit their shapes.
  - **Compartments and panels fit what's in them:** the nucleus shrinks to its contents, a band spans its panel, and the membrane stays a thin band through its receptors. Empty ones are left out and listed.
  - **A DNA strand spans what its arrows join.**
  - **Arrows:** bowed around shapes only if that adds no crossings, and arrow text kept clear.
  - **On the test figures:** no new crossings on Yu, Guo or Wnt; arrows behind shapes go down on all four; on Guo kept to its canonical routes, NEMO sits between BCR and TNFR with IκB straight below.
- **Arrows everywhere are straight lines** (`src/render/edgeGeometry.ts`). BioPathway Studio's port-to-port curves made arrows in published figures look curly. Where several arrows meet one side of a shape, their ends are spread along it in the order of the angle they arrive at (a bowed arrow arrives from its bow), so they can be told apart and don't cross. Arrows that meet at a shape still count as crossing if their lines cross away from it, and an arrow may bow to avoid that.
- **In step 5 the two views zoom separately,** each fitting its own picture. The zoom menu and "Reset view" apply to both. Every step opens with the whole picture in view.
- **Tidy as drawn** (`src/layout/tidy.ts`) keeps the authors' arrangement and scale. Shapes that travel together (a cluster, shapes drawn touching) move as one. Each rule can be switched off:
  - **Line up:** shapes nearly in one row or column are put exactly in line (small moves only).
  - **No overlaps:** a shape covering another, from a different cluster, is moved the shortest way clear (on Guo, TRAF6 under cIAP2, and Proteasome over p50).
  - **Close gaps:** empty space wider than two shapes, left where step 2 took out a route, shrinks to that width.
  - **Crop:** the picture shrinks to what is left. Compartments and panels move with the space around them, and grow only for a shape moved outside them.
  - **Arrows around shapes:** an arrow passing behind a shape bows around it. A bow that would cross another arrow is not used.
  - **Arrow text clear:** text sitting on a shape moves to a clear spot; text that is already clear stays where the figure put it.
- **On the test figures,** tidying never adds crossings and reduces arrows behind shapes (Yu 4 → 1, Guo 2 → 0, Hu 4 → 2). The typical shape moves 1–4 px.
- **A limit, kept visible:** Guo kept to its canonical routes still keeps the shared DNA strand and the second outcome box, because step 2 traces both routes to them. They hold the figure's width, so cropping takes little.
- **Redraw as a cell** (`src/layout/adapt.ts`) feeds BioPathway Studio's engine (copied and marked: `cellLayout.ts`, `edgeLabelLayout.ts`) only from the figure:
  - a shape's compartment is the one it is drawn in; a shape with none is placed beside its most-connected partner, and listed;
  - the figure's own compartment names are kept;
  - its main line is a route that leads to the nucleus or an outcome, so on Guo IκB runs straight into the nucleus and Proteasome → Degradation sits to one side.
  - **Added rules, each switchable:**
    - blocks for clusters;
    - the original order;
    - panels as columns, with regulators in the column of the routes they act on;
    - names fit, one size per kind, an even grid;
    - arrow text clear;
    - a tidy-up so columns and shapes never overlap.
  - It keeps its own canvas size, shrunk to fit beside the original.
- **Stored as one change (`set_layout`).** The step says when the figure or the switches have changed since. Moves by hand are `set_box` changes on top, and undoing the layout takes them with it.
- **One consistent style (`restyle`), off by default:** five fills by kind, black arrows, red for inhibition. It says what it replaces, including the colour meanings noted in step 1.
- **The before → after numbers** are measured the way Organize Layout scores itself: arrows crossing, arrows behind a shape, and arrows pointing up (feedback counted apart).

## 8. Internal ids stay off the screen
**Decision:** the model's ids for shapes and arrows ("e5", "a_tx_1") are never shown. The model sometimes writes them into its questions and reasons ("drawn twice (e19 and e26)"). A bracketed list of ids is dropped; any other id is replaced by the item's name as written.

## 9. Visual design: a precise instrument
**Decision:** the interface is quiet and exact so the figures dominate. The full system is in [DESIGN.md](../DESIGN.md):
- cool neutral greys and 1px hairlines instead of boxes;
- one typeface (Public Sans, self-hosted) with tabular figures for counts and measures;
- ink for primary actions;
- one orange used only for "look here" (the current step, the selected row, hover outlines on the figures, "To decide" markers) and "do this next" (one larger orange action button per screen).

**Then, from testing:** it wasn't always clear what to do next. So:
- Check opens its first open question when you arrive, zoomed to its item, with orange-outlined answers;
- step 1 selects its first undecided issue;
- undecided items carry an orange "To decide" marker;
- the next action is the one big orange button on each screen.

Colours are named roles defined once per theme in `src/index.css`. Shared control styles are in `src/components/ui.ts`.

**Why:**
- **The first version read as generic and AI-made.** A design critique with [Impeccable](https://github.com/pbakaus/impeccable) scored it 26/40 and found:
  - boxes inside boxes;
  - a coloured left border on cards;
  - grey text below contrast standards in dark mode;
  - 11px text;
  - symbols used as icons;
  - a blue accent that competed with the figures' own blues.
- **The figures are content.** The interface around them should never compete with or recolour them, so figure panes stay white in both themes.

**How it's checked:**
- Impeccable's automated checker runs clean on the code. On the running app, only labels inside the drawn figures remain flagged; they are figure content and zoomable.
- Every text pair is at least 4.5:1 in both themes, and control borders at least 3:1.
