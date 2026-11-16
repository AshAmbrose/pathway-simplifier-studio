# Pathway Simplifier Studio

Upload a published pathway figure, extract it faithfully into an editable graph, then make it clearer through
opt-in, reversible changes, with every difference from the original listed.

**Stage 1 (now):**
- **Extract:** upload → one model call extracts the figure → the original and a reconstruction side by side, at the original positions.
- **Review on the canvas:**
  - The model's questions about ambiguous parts are pins on both views. Each comes with ready-made answers: the shapes drawn next to the item, chosen by position only.
  - Any shape or arrow can be fixed by hand.
  - Every answer or fix is a change on top of the untouched extraction, listed in plain words and undoable.
- No other data sources and no simplification yet.

## Setup
1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in `GEMINI_API_KEY` and `EXTRACT_MODEL`. The key is read only by the local server and never sent to the browser.
3. `npm run dev`, then open the address it prints.

## How it works
- **`server/extract.ts`:** sends the image plus `server/prompts/extraction-v3.md` to Gemini once.
  - The output format is enforced by a JSON Schema built from `src/types/extraction.ts`.
  - The reply is validated, and references that don't resolve are listed, not hidden.
  - Every call is logged to `data/ai-ledger.jsonl`, with a daily budget (`DAILY_USD`).
- **`data/runs/`:** each extraction is saved here, so reopening a figure doesn't call the model again. `data/` is gitignored, because uploads may be confidential.
- **`src/edit/applyEdits.ts`:** the extraction is never altered. A run stores a list of changes (answers and hand fixes, one small vocabulary); what is drawn is the extraction with that list applied. A change that can no longer apply is reported, not dropped.
- **`src/components/ReviewScreen.tsx`:** the review on the canvas: pins, the answer and fix pop-ups, the change list.
- **`src/render/toScene.ts`:** places each extracted element at its box on the original image. The arrow routing and text-contrast helpers are copied from BioPathway Studio.

## Scripts
- `npm run check:extraction`: offline checks of the schema and render (no network).
- `npm run spend`: AI spend by day.
- `node scripts/run-figures.ts --yes`: **paid**. Runs the prompt on the local test figures, for scoring against the answer keys.
