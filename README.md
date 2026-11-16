# Pathway Simplifier Studio

Turns a published pathway figure into an editable diagram, copied faithfully first.

You check the copy beside the original and fix anything the model got wrong. Every change you make is listed and can be undone. Next: making the figure clearer, with every difference from the original listed.

## Setup
1. `npm install`
2. Copy `.env.example` to `.env.local`, then fill in `GEMINI_API_KEY` and `EXTRACT_MODEL`. The key stays on your computer and is never sent to the browser.
3. `npm run dev`, then open the address it prints.

## Using it
1. **Upload** a PNG, JPEG or WebP figure. One model call reads it, and the result is saved, so reopening it is free.
2. **Answer the questions.** Numbered pins mark where the model wasn't sure. Pick an answer, and both views move on to the next question.
3. **Fix** anything else: click a shape or arrow to rename it, re-point it, change it or remove it.
4. **Add** what's missing: use "+ Shape" and "+ Arrow". A new shape takes its colour from the figure.
5. **Review your changes:** the list at the top shows each one in plain words, with undo, and "Show as extracted" shows the model's own reading.

## Scripts
| Command | What it does |
|---|---|
| `npm run check:extraction` | Offline checks (no network) |
| `npm run lint` | Type-check |
| `npm run spend` | AI spend by day |
| `node scripts/make-practice-run.ts <result.json> <image> "<name>" [ids]` | A practice copy of a run with chosen shapes taken out |
| `node scripts/check-practice.ts <run id>` | Says whether the removed shapes and arrows were put back |
| `node scripts/run-figures.ts --yes` | **Paid:** re-runs the prompt on the local test figures |

## More
- [docs/design.md](docs/design.md): the design decisions and why.
- [CLAUDE.md](CLAUDE.md): rules for working on the code.
