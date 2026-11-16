# Pathway Simplifier Studio: instructions for Claude Code

Read this first in every session.

## What this is
A local web app that turns a published pathway figure into an editable diagram.
1. **Upload:** you upload a figure.
2. **Extract:** one model call reads what is drawn.
3. **Review:** you check the result side by side with the original, answer the model's questions, and fix or add anything it got wrong.
4. **Simplify (next):** opt-in, reversible changes make the figure clearer, with every difference listed.

Design decisions and their reasons are in [docs/design.md](docs/design.md).

## Principles
- **Faithful first.** The input image is the starting point. Record what is drawn, exactly as drawn (typos, unlabelled shapes, odd styling), before anything is changed.
- **The extraction is never altered.** Every answer, fix or simplification is a change in a list on top of it. Each change is shown in plain words and can be undone.
- **During extraction and review, answers come only from what can be seen.** Options are the shapes drawn nearby. None is preferred on the basis of biology knowledge.
  - This may be relaxed for simplification, where suggestions from prior knowledge are planned. They must always be labelled with their source.
- **Nothing is hidden.** Problems, and changes that can no longer apply, are listed, never dropped.

## Working rules
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
- **Update with each feature:** `README.md` and `docs/design.md`.
- **Model calls:** a free-tier key may let the provider use what is sent, so send only open-licence figures on it. Ask before any paid run (`scripts/run-figures.ts` refuses without `--yes`).

## Map of the code
| Where | What it does |
|---|---|
| `src/types/extraction.ts` | The data formats: the extraction, an edit (one change), the review (a run's list of edits). |
| `server/extract.ts`, `server/prompts/` | One model call per figure, with the current extraction prompt (v3). |
| `server/runs.ts`, `server/plugin.ts` | Saving and loading runs, and the local API. Saves are versioned so newer work is never overwritten. |
| `server/aiLedger.ts` | A log of every AI call and its cost, and the daily budget. |
| `src/edit/` | Applying the list of changes to the extraction, and describing each in plain words. |
| `src/render/` | Turning an extraction into shapes and arrows at their original positions. |
| `src/components/ReviewScreen.tsx` | The review screen: the two views, pins, pop-ups, adding shapes and arrows, the change list. |
| `src/components/SceneSvg.tsx` | Drawing the reconstruction and the marks on top of it (pins, outlines, handles). |
| `scripts/` | Offline checks, practice runs, spend, and the paid re-test of the prompt. |
