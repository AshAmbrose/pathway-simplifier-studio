# Pathway Simplifier Studio: instructions for Claude Code

Read this first in every session.

## What this is
A local web app that turns a published pathway figure into an editable diagram.
1. **Upload:** you upload a figure.
2. **Extract:** one model call reads what is drawn.
3. **Check:** you check the result side by side with the original, answer the model's questions, and fix or add anything it got wrong.
4. **Simplify:** "Continue to simplify →" leads into five ordered, skippable steps (Issues, Focus, Repeats, Clusters, Layout), each on one canvas, with the step's changes faded or marked and the original folded beside it. All five steps are built.

Design decisions and their reasons are in [docs/design.md](docs/design.md).

## Principles
- **Faithful first.** The input image is the starting point. Record what is drawn, exactly as drawn (typos, unlabelled shapes, odd styling), before anything is changed.
- **The extraction is never altered.** Every answer, fix or simplification is a change in a list on top of it. Each change is shown in plain words and can be undone.
- **During extraction and review, answers come only from what can be seen.** Options are the shapes drawn nearby. None is preferred on the basis of biology knowledge.
  - This is relaxed for simplification, where prior knowledge always comes with its source. So far only step 1's "what each shape is" uses it: records from public databases, never from a model.
- **Nothing is hidden.** Problems, and changes that can no longer apply, are listed, never dropped. What simplification leaves out is listed with its reason and can be restored.

## Working rules
- **Design work uses Impeccable** (`.claude/skills/impeccable`, `npx impeccable`), with [PRODUCT.md](PRODUCT.md) as its product brief:
  - its anonymous telemetry stays off;
  - don't use its live mode, which runs an agent with approvals and sandboxing off;
  - the drawn figure (`SceneSvg.tsx`, `toScene.ts`) is content, not interface, so design passes leave its colours alone.
- **Annotate code clearly:**
  - every file starts with a short plain-language comment saying what it's for;
  - comment any function or block whose purpose isn't obvious from its name;
  - say why, not just what;
  - use plain words over jargon, and keep it concise.
- **Don't edit app code while the user may have the app open** without telling them first. The dev server reloads open pages.
- **Test only on throwaway copies of runs** (`scripts/make-practice-run.ts`), never on the user's own runs.
- **Browser tests go at human pace** (hover, pause, then click), like a person would.
- **Before committing,** run `npm run lint` and `npm run check:extraction`, and `npm run build` for UI changes.
- **Never commit** anything from `local/`, `data/` or `.env*`. They hold test figures, answer keys, notes, uploads and the API key.
- **Never name the confidential test material** in committed files, issues or pull requests.
- **Push only to the private GitHub repo,** after checking it's still private.
- **One branch per feature,** with a pull request. Merge only when the user says.
- **Keep the docs current with every commit.** Before each commit, check whether `README.md`, `docs/design.md` or this file need updating, and include those updates in the same commit. Keep them short, clear and in plain language.
- **Model calls:** a free-tier key may let the provider use what is sent, so send only open-licence figures on it. Ask before any paid run (`scripts/run-figures.ts` refuses without `--yes`).

## Map of the code
| Where | What it does |
|---|---|
| `src/types/extraction.ts` | The data formats: the extraction, an edit (one change), the review (a run's list of edits, plus the simplification record). |
| `server/extract.ts`, `server/prompts/` | One model call per figure, with the current extraction prompt (v3). |
| `server/runs.ts`, `server/plugin.ts` | Saving and loading runs, and the local API. Saves are versioned so newer work is never overwritten. |
| `server/aiLedger.ts` | A log of every AI call and its cost, and the daily budget. |
| `src/edit/` | Applying the list of changes to the extraction, the order they apply in (`order.ts`), and describing each in plain words (`describe.ts`, which also keeps internal ids off the screen). |
| `src/identify/`, `server/identify.ts` | Step 1's "what each shape is": label spellings and splitting (`normalise.ts`), what the user is asked and why (`candidates.ts`), and the live, cached lookups in HGNC, UniProt, Complex Portal, GO and ChEBI (server). |
| `server/relations.ts`, `src/relations/` | Step 1's arrow check: each arrow between identified shapes against the local SIGNOR and OmniPath snapshots (`data/signor/`, `data/omnipath/`; `npm run fetch:signor`, `fetch:omnipath`). Flags only. |
| `src/report/`, `components/FinishReport.tsx` | The Finish report: the independent fidelity check (every shape and arrow the model read accounted for, `account.ts`), counts as read / after Check / finished, and the Markdown download. |
| `src/simplify/` | The simplification steps' logic, without any screen: step 1's issues, step 2's route tracing (and the figure's parts), step 3's repeats, step 4's clusters. Step 5's is in `src/layout/`. |
| `src/layout/` | Step 5: compact (`compact.ts`, the default), tidy as drawn (`tidy.ts`), squeeze (`solvers/compaction.ts`, order kept, kiwi.js constraint solver), layered (`solvers/elk.ts`, ELK), redraw as a cell (BioPathway Studio's engine, copied and marked, fed by `adapt.ts`); `solvers/` also holds fCoSE (comparison page only) and the space measures (`fit.ts`); shared shape sizes (`shapes.ts`), arrow bows and text placement (`arrows.ts`), and the before → after measures. |
| `src/render/` | Turning an extraction into shapes and arrows at their positions (the original's, or step 5's canvas). |
| `src/components/RunScreen.tsx` | One run: holds and saves the change list, and which step of the journey is open (Check, then ①–⑤). |
| `src/components/StepBar.tsx` | The step bar across the top: the whole journey, with Back, Skip and Next. |
| `src/components/ReviewScreen.tsx` | Check: the two views, pins, pop-ups, adding shapes and arrows, the change list. |
| `src/components/SimplifyScreen.tsx`, `steps/` | The simplification steps: one canvas with the original folded beside it (`PairedViewer.tsx`), and one panel per step. |
| `src/components/ui.ts`, `src/index.css` | The visual system in code: colour roles for light and dark, the type scale, and the shared button, section and note styles. See [DESIGN.md](DESIGN.md). |
| `src/components/SceneSvg.tsx` | Drawing the reconstruction and the marks on top of it (pins, outlines, handles). |
| `scripts/` | Offline checks, practice runs, spend, and the paid re-test of the prompt. |
