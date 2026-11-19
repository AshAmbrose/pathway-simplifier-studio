# Pathway Simplifier Studio

Turns a published pathway figure into an editable, simpler diagram, without losing track of what the original said.

Pathway figures in papers are dense: the same molecule drawn several times, unlabelled shapes, arrows whose ends are unclear. This app reads a figure, lets you check that reading against the original, then guides you through simplifying it. Every change is listed in plain words and can be undone, and the final report shows that nothing went missing on the way.

## How it works
1. **Upload** a figure (PNG, JPEG or WebP). One call to Google's Gemini model reads what is drawn, exactly as drawn.
2. **Check:** the reading sits beside the original. Answer the model's questions (it asks rather than guesses), and fix or add anything it got wrong.
3. **Simplify** in five steps, each optional:
   - **Issues:** what each shape is, looked up in public gene and protein databases, and arrows checked against curated records;
   - **Focus:** choose which routes to keep;
   - **Repeats:** merge copies of the same molecule;
   - **Clusters:** collapse groups into one shape;
   - **Layout:** tidy the arrangement.
4. **Finish:** a report that accounts for every shape and arrow, with the original and the result side by side, downloadable as PDF, SVG or Markdown.

The principles behind it: record the figure faithfully before changing anything, never alter the model's reading (changes are a list on top of it), and never hide anything (what's left out is listed with its reason). The full guide to each screen is in [docs/using.md](docs/using.md).

## Run it yourself
About 15 minutes, most of it waiting for downloads.

**You need:**
- **[Node.js](https://nodejs.org) 22.18 or newer** (it runs the TypeScript scripts directly). Check with `node --version`.
- **A Google Gemini API key** (free to create; step 3 below).
- **Google Chrome** (optional), for the PDF download. Without it, the browser's print dialog opens instead.

Built and tested on macOS. It should work on Linux and Windows, but that hasn't been tried.

**Steps:**
1. **Get the code.** `git clone https://github.com/AshAmbrose/pathway-simplifier-studio.git`, then `cd pathway-simplifier-studio`.
2. **Install.** `npm install`
3. **Get an API key.**
   1. Go to [Google AI Studio's API keys page](https://aistudio.google.com/apikey) and sign in with a Google account.
   2. Choose **Create API key**. If asked, let it create a new Google Cloud project.
   3. Copy the key.

   A new key starts on the **free tier**. See [Your key, your data and cost](#your-key-your-data-and-cost) before uploading anything that isn't already published.
4. **Add the key.** Copy the settings template, `cp .env.example .env.local`, then open `.env.local` and fill in:
   ```
   GEMINI_API_KEY=your-key-here
   EXTRACT_MODEL=gemini-4-hydrogen
   DAILY_USD=5
   ```
   `.env.local` is never committed (it's in `.gitignore`). The key is read only by the local server and never sent to the browser.
5. **Optional: download the curated records** for step 1's arrow check. These are free, public and about 7 MB; they take about 2 minutes (OmniPath) and 5 minutes (SIGNOR):
   ```
   npm run fetch:omnipath
   npm run fetch:signor
   ```
   Without them, everything else works and the arrow check says it has no records.
6. **Start it.** `npm run dev`, then open the address it prints (usually http://localhost:5173).
7. **Try a figure.** The upload screen offers five open-licence example figures. Choose one ("Choose to read again"), then **Extract**. A reading takes 1–4 minutes. When it's done, the run is saved, and reopening it later is free.

**To check the install:** `npm run check:extraction` runs the offline checks. It needs no key or network, and should end with "all checks passed". A few checks are skipped on a fresh copy because they use the author's local test files.

**If something goes wrong:**
- **"No GEMINI_API_KEY":** check that `.env.local` is in the project folder, then restart `npm run dev`.
- **"Today's free-tier limit … is used up":** the free tier allows about 20 readings a day per Google project, and failed attempts count. It resets at midnight Pacific time; turning on billing lifts it.
- **"The model is busy":** Google reports high demand. Try again in a few minutes.
- **The PDF opens a print dialog:** Chrome wasn't found. Set `CHROME_PATH` to Chrome's program file.

## Your key, your data and cost
- **What leaves your computer:**
  - the figure, sent to Google's Gemini API to be read;
  - shape labels (text only), sent to HGNC, UniProt, Complex Portal, Gene Ontology and ChEBI in step 1.

  Everything else (runs, changes, reports) stays in the project's `data/` folder, which is never committed.
- **Free tier:** about 20 readings a day, and Google [may use what you send](https://ai.google.dev/gemini-api/terms) to improve its products, with human review. Use published figures only.
- **Paid tier:** turn on billing for the key's Google Cloud project (in AI Studio, under the key's project). What you send is then not used to improve Google's products. A reading costs about **$0.13–0.24** (about 6,000 tokens in and 16,000–30,000 out, at $1.50 and $7.50 per million). The app logs every call's cost and stops for the day at `DAILY_USD`; `npm run spend` shows spend by day.
- **Faster, less careful readings:** add `EXTRACT_THINKING=LOW` to `.env.local` and restart. A reading is about 3× faster, but the model asks fewer questions and may settle unclear arrows without asking. Runs made this way are marked "quick read".

## How it was built
Built over five days (15–19 November 2026), one feature per pull request, with [Claude Code](https://claude.com/claude-code) as the pair programmer. The pull requests, in order:

| PR | What it added |
|---|---|
| (first commits) | One model call reads a figure; the reading is shown beside the original |
| [#1](https://github.com/AshAmbrose/pathway-simplifier-studio/pull/1) | Check on the canvas: answer the model's questions and fix the reading |
| [#2](https://github.com/AshAmbrose/pathway-simplifier-studio/pull/2) | Add shapes and arrows the model missed |
| [#3](https://github.com/AshAmbrose/pathway-simplifier-studio/pull/3) | Documentation: decisions, plain-language README, code comments |
| [#4](https://github.com/AshAmbrose/pathway-simplifier-studio/pull/4) | One guided journey (Check, then steps); steps 1–2 |
| [#5](https://github.com/AshAmbrose/pathway-simplifier-studio/pull/5) | Polish: regulators kept with their routes |
| [#6](https://github.com/AshAmbrose/pathway-simplifier-studio/pull/6) | Steps 3–4: Repeats and Clusters |
| [#7](https://github.com/AshAmbrose/pathway-simplifier-studio/pull/7) | Step 5: Layout |
| [#8](https://github.com/AshAmbrose/pathway-simplifier-studio/pull/8) | Design pass: "a precise instrument" ([DESIGN.md](DESIGN.md)) |
| [#9](https://github.com/AshAmbrose/pathway-simplifier-studio/pull/9) | More layout methods, and a page comparing them on one figure |
| [#10](https://github.com/AshAmbrose/pathway-simplifier-studio/pull/10) | One canvas after Check, with the original folded beside it |
| [#12](https://github.com/AshAmbrose/pathway-simplifier-studio/pull/12) | Step 1: what each shape is, from public databases |
| [#13](https://github.com/AshAmbrose/pathway-simplifier-studio/pull/13) | Finish report: every shape and arrow accounted for |
| [#14](https://github.com/AshAmbrose/pathway-simplifier-studio/pull/14) | Step 1: arrows checked against curated records (SIGNOR, OmniPath) |
| [#15](https://github.com/AshAmbrose/pathway-simplifier-studio/pull/15) | Report: original and finished side by side; PDF download |
| [#16](https://github.com/AshAmbrose/pathway-simplifier-studio/pull/16) | Sharing a live demo from the laptop |
| [#32](https://github.com/AshAmbrose/pathway-simplifier-studio/pull/32) | Demo polish: change list and Issues cards |

Each pull request explains what changed and how it was checked. [docs/decisions.md](docs/decisions.md) records why each choice was made, including approaches that were tried and dropped.

**Under the hood:** React 19, TypeScript and Tailwind, served by Vite 8. The small local API (model call, saving runs, database lookups, PDF) runs inside the Vite server ([server/](server/)). Layout uses ELK and the kiwi.js constraint solver. A map of the code is in [CLAUDE.md](CLAUDE.md#map-of-the-code).

## What's next
Planned work is in the [issues](https://github.com/AshAmbrose/pathway-simplifier-studio/issues). It includes using the figure's legend as context, a larger accuracy test set, SBGN/GPML export, an editor after Finish, and calibrated confidence for the model's questions.

## Docs
| Page | For |
|---|---|
| [docs/using.md](docs/using.md) | Every screen, step by step |
| [docs/decisions.md](docs/decisions.md) | The design decisions and why, including what was tried |
| [PRODUCT.md](PRODUCT.md) | Who it's for and what it must keep |
| [DESIGN.md](DESIGN.md) | The visual system: colours, type, components |
| [docs/hosting.md](docs/hosting.md) | Sharing a live demo from a laptop, behind a password |
| [docs/examples.md](docs/examples.md) | The example figures, their sources and licences |
| [CLAUDE.md](CLAUDE.md) | Working rules and a map of the code |

## Scripts
| Command | What it does |
|---|---|
| `npm run dev` | Runs the app locally, reloading as the code changes |
| `npm run check:extraction` | Offline checks (no key, no network) |
| `npm run lint` | Type-check |
| `npm run build` | Builds the app into `dist/` |
| `npm run fetch:signor`, `npm run fetch:omnipath` | Download the curated records for step 1's arrow check |
| `npm run spend` | AI spend by day |
| `npm run demo` | Builds the app and serves it for a shared demo (settings in `.env.demo`; see [docs/hosting.md](docs/hosting.md)) |
| `npm run seed:demo` | Copies the examples' saved results into the demo's run list |
| `node scripts/identify-coverage.ts` | How far step 1's identification gets on saved runs (online; only label text is sent) |
| `node scripts/compare-layouts.ts` | Step 5's layouts on the saved test figures, by the numbers (`FCOSE=1` adds fCoSE) |
| `node scripts/make-practice-run.ts <result.json> <image> "<name>" [ids]` | A practice copy of a run with chosen shapes taken out |
| `node scripts/check-practice.ts <run id>` | Says whether the removed shapes and arrows were put back |
| `node scripts/run-figures.ts --yes` | **Paid:** re-runs the prompt on local test figures (list in `local/examples/figures.json`) |

## Credits
- **Example figures:** four from *Signal Transduction and Targeted Therapy* (CC BY 4.0) and one from WikiPathways (CC0); full credits in [docs/examples.md](docs/examples.md) and on the upload screen.
- **Curated records:** [SIGNOR](https://signor.uniroma2.it) (CC BY-SA 4.0) and [OmniPath](https://omnipathdb.org) (academic licence), downloaded to your computer, not included here.
- **Identity lookups:** HGNC, UniProt, Complex Portal, Gene Ontology and ChEBI, queried live.
- **Layout:** [ELK](https://eclipse.dev/elk/) (EPL 2.0), [kiwi.js](https://github.com/IjzerenHein/kiwi.js) (BSD), and the "Redraw as a cell" engine, arrow bowing, text placement and arrow markers, copied with changes from BioPathway Studio (each file marked).
