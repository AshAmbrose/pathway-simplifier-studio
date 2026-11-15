# Pathway Simplifier Studio

Upload a published pathway figure, extract it faithfully into an editable graph, then make it clearer through
opt-in, reversible changes, with every difference from the original listed.

**Stage 1 (now):** upload → one model call extracts the figure → the original and a render of the extraction,
side by side, at the original positions. No other data sources, no editing yet.

## Setup
1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in `GEMINI_API_KEY` and `EXTRACT_MODEL`. The key is read only by the local server and never sent to the browser.
3. `npm run dev`, then open the address it prints.

## How it works
- **`server/extract.ts`:** sends the image plus `server/prompts/extraction-v2.md` to Gemini once.
  - The output format is enforced by a JSON Schema built from `src/types/extraction.ts`.
  - The reply is validated, and references that don't resolve are listed, not hidden.
  - Every call is logged to `data/ai-ledger.jsonl`, with a daily budget (`DAILY_USD`).
- **`data/runs/`:** each extraction is saved here, so reopening a figure doesn't call the model again. `data/` is gitignored, because uploads may be confidential.
- **`src/render/toScene.ts`:** places each extracted element at its box on the original image. The arrow routing and text-contrast helpers are copied from BioPathway Studio.

## Scripts
- `npm run check:extraction`: offline checks of the schema and render (no network).
- `npm run spend`: AI spend by day.
- `node scripts/run-figures.ts --yes`: **paid**. Runs the prompt on the local test figures, for scoring against the answer keys.
