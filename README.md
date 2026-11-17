# Pathway Simplifier Studio

Turns a published pathway figure into an editable diagram, copied faithfully first.

You check the copy beside the original and fix anything the model got wrong. Then you simplify it, step by step. Every change you make is listed and can be undone.

## Setup
1. `npm install`
2. Copy `.env.example` to `.env.local`, then fill in `GEMINI_API_KEY` and `EXTRACT_MODEL`. The key stays on your computer and is never sent to the browser.
3. `npm run dev`, then open the address it prints.

## Using it
A step bar across the top walks you through: **Check**, then **1 Issues → 2 Focus → 3 Repeats → 4 Clusters → 5 Layout**. Zoom with the scroll wheel or a trackpad pinch, or pick a level from the zoom menu under the pictures. Each step opens with the whole picture in view. Arrows are drawn straight; where several meet one side of a shape, their ends are spread along it.

1. **Upload** a PNG, JPEG or WebP figure. One model call reads it, and the result is saved, so reopening it is free.
2. **Answer the questions.** Numbered pins mark where the model wasn't sure. Pick an answer, and both views move on to the next question.
3. **Fix** anything else: click a shape or arrow to rename it, re-point it, change it or remove it.
4. **Add** what's missing: use "+ Shape" and "+ Arrow". A new shape takes its colour from the figure. To draw an arrow from or to a whole cluster, hover it and use its grey "cluster" tab, or select the cluster and drag from its blue dots.
5. **Review your changes:** the list at the top shows each one in plain words, with undo, and "Show as extracted" shows the model's own reading.
6. **Simplify:** press **Continue to simplify →**. Five steps follow in order, and any can be skipped. Each shows one large canvas: the figure after the step, with what the step leaves out faded so it can be clicked back. The original sits folded on the canvas's left edge; click the "Original" rail (or the header button) to open it beside the canvas. It stays open or folded from step to step. "Back" from step 1 returns to Check.
   - **1 Issues:** click a card to outline its item on the figure. Fix typos, name or leave out unlabelled parts, and note what colours or line styles mean.
     - **What each shape is:** every labelled shape is looked up in HGNC, UniProt, the Complex Portal, Gene Ontology and ChEBI (only the label text is sent; answers are cached in `data/identify-cache/`). Exact gene symbols are taken as found; aliases wait for you to confirm, and labels several genes share ("TAK1", "p50") for you to choose. Every option says why it matched, in the database's words, with a link to the record. If none is right, choose **Other**, type what it is ("CARMA1", "protein kinase C") and what kind of thing, and **Search again**, or **Use my words** to keep your name as it is (marked as yours, with no database record). Shapes with the same label are answered together; click any card to work on it. Shapes still to answer have a dashed orange outline.
   - **2 Focus:** choose which routes to show. The routes are traced from the figure's own arrows, after your fixes in Check and step ①. Open a route ("show ▾") to tick its shapes one by one, or click any shape on the pictures.
   - **3 Repeats:** merge copies of a molecule drawn more than once in the same place and state. If the figure has panels, say first whether they are different conditions (copies stay apart) or one picture.
   - **4 Clusters:** open a cluster, tick the shapes that should become one, name it and press Collapse. Its members' names stay small under the new name.
   - **5 Layout:** five ways, chosen at the top of the step. "Compare every way on this figure" opens them all side by side, with the same numbers (`?compare=<run id>`).
     - **Compact** (the default) keeps the figure's arrangement but re-spaces it on an even grid. Compartments fit what's in them, and shapes of one kind share one size. Where several routes meet in one shape, that shape goes in the middle of them, with what follows it straight down. Otherwise the longest route runs straight down the middle, with everything else packed beside it.
     - **Tidy as drawn** keeps the figure at its own size. It lines up shapes that are nearly in line, closes and crops the space earlier steps left, moves overlapping shapes clear, and bows arrows around shapes.
     - **Squeeze** keeps the original's order exactly and closes the gaps: one size per kind, rows level, columns straight, the smallest canvas a constraint solver can find under those rules.
     - **Layered (ELK)** uses a general-purpose network layout: shapes ranked so arrows run down, each row ordered to cut crossings.
     - **Redraw as a cell** rebuilds it top to bottom: compartments as rows, panels as columns, and the route into the nucleus as a straight line.
     - A table shows before → after: arrows crossing, behind a shape, and pointing up.
     - Optional: one consistent style, and hiding the member names under collapsed shapes. Any rule that doesn't help can be switched off.
     - Afterwards, click a shape on the right and drag it to fine-tune.
   - **Finish** marks the simplification done and offers the figure as an SVG download. An editing canvas for final tweaks is planned next.

## Scripts
| Command | What it does |
|---|---|
| `npm run check:extraction` | Offline checks (no network) |
| `npm run lint` | Type-check |
| `node scripts/identify-coverage.ts` | How far step 1's identification gets on the saved test figures (online; only label text is sent) |
| `node scripts/compare-layouts.ts` | Step 5's layouts on the saved test figures, side by side by the numbers (`FCOSE=1` adds fCoSE) |
| `npm run spend` | AI spend by day |
| `node scripts/make-practice-run.ts <result.json> <image> "<name>" [ids]` | A practice copy of a run with chosen shapes taken out |
| `node scripts/check-practice.ts <run id>` | Says whether the removed shapes and arrows were put back |
| `node scripts/run-figures.ts --yes` | **Paid:** re-runs the prompt on the local test figures |

## More
- [docs/design.md](docs/design.md): the design decisions and why.
- [CLAUDE.md](CLAUDE.md): rules for working on the code.
- [DESIGN.md](DESIGN.md): the visual system (colours, type, components), and [PRODUCT.md](PRODUCT.md): who it's for and what it must keep.
