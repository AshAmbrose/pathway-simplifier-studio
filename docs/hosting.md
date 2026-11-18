# Hosting the demo

How the app is shared for a live session: it runs on the presenter's laptop and is reached through a temporary Cloudflare tunnel, behind one password.

## How it works
- `npm run demo` builds the app and serves **only the built files** (`dist/`) plus the API, on `127.0.0.1:4173`. The dev server (`npm run dev`) is never exposed: it would serve files from the whole project folder, and it reloads open pages whenever code changes.
- A Cloudflare **quick tunnel** gives that local address a temporary public `https://….trycloudflare.com` link. It needs no account or domain. The link changes every time the tunnel starts.
- **One password** (`DEMO_PASSWORD`) guards every page and API route. The browser shows its own login box; any user name works. The tunnel uses HTTPS, so the password isn't sent in the clear.
- **Demo runs are kept apart** (`DATA_DIR=data/demo`), so visitors see only the bundled examples and what they upload, not local test runs. The identity-lookup cache and the SIGNOR/OmniPath snapshots are still read from `data/`.
- **Examples:** open-licence figures are bundled in `public/examples/` with their source and licence (list in `src/examples.ts`). Their saved results open at once with no model call. `npm run seed:demo` copies them into the demo folder.
- **Long readings:** a figure can take 1–4 minutes to read, and Cloudflare drops a request that sends nothing for about 100 seconds. So `/api/extract` replies at once and sends a space every 15 seconds until the result is ready.
- **The PDF download is locked down:** the Finish report is printed by the laptop's Chrome from a page the browser sends. A security policy at the top of that page blocks scripts and local files, so a crafted page can't pull files from the laptop into a PDF (checked in `npm run check:extraction`).
- **Spend limits:** `DAILY_USD` (default $5) stops readings once a day's cost reaches it. `MAX_CALLS_PER_DAY` can also cap the number of readings, whatever they cost; it was needed on the free tier, and is left off now that billing is on.
- **Tunnel addresses are allowed in `vite.config.ts`** (`preview.allowedHosts`). Vite refuses unknown host names, and a tunnel's address changes each time.

**Tested through a real tunnel (2026-11-18):** the password check works, and private paths return only the app's start page. A reading stayed connected for the full 5 minutes. The free-tier model itself was the weak point that day: one attempt got "high demand, try again later", and one ran past the app's 5-minute limit (the same figure took 3 minutes the day before). **In a live demo, open the saved examples first** and treat a fresh reading as a bonus.

## When the model is slow
On a busy day the free tier slows down (Hu took 199 s, against 58 s two days earlier) and turns some requests away with "high demand". The app now:
- waits up to **10 minutes** for a reading (it was 5);
- retries "high demand" refusals three times over about 30 seconds, then says plainly that the model is busy.

**Quick read (optional):** add `EXTRACT_THINKING=LOW` to `.env.demo` (or `.env.local`) and restart. The model thinks less, so a reading is about **3× faster** (Hu: 63 s against 199 s, tested at the same time). But on Hu it asked **no questions instead of 4**, raised 3 flags instead of 10, and quietly picked a target for an unclear inhibition bar instead of asking. That goes against "ask, don't guess", so it's off by default. When it's on, the upload screen says so, and those runs are marked "quick read" in the list. (`MINIMAL` isn't supported by this model.)

## Setup (once)
1. `brew install cloudflared`
2. Create `.env.demo` (gitignored). The key and model are read from `.env.local` as usual; `.env.demo` only adds the demo settings:
   ```
   DEMO_PASSWORD=four-random-words-here
   DATA_DIR=data/demo
   # MAX_CALLS_PER_DAY=20   (optional; off by default)
   ```
3. `npm run seed:demo` (with `DATA_DIR=data/demo` in the environment, or it uses `data/demo` by default).

## On the day
1. `caffeinate -dims &` keeps the laptop awake.
2. `npm run demo`
3. In a second terminal: `cloudflared tunnel --url http://127.0.0.1:4173`. It prints the `trycloudflare.com` link.
4. Open the link in a private window, log in, and open an example.
5. Paste the link and the password into the call chat.
6. **Afterwards:** stop the tunnel (Ctrl-C) and change the password.

**Backups:** saved examples open instantly. Keep a screen recording of one full run. `npm run dev` still works locally if the tunnel fails.

## The model: paid since 2026-11-18
Billing is now on for the Google project (with $20 of credit). That lifts the free tier's 20-a-day limit and stops Google using uploads to improve its products. It doesn't make readings faster.
- **Price** (`gemini-4-hydrogen`, Standard tier, per million tokens): $1.50 input, $7.50 output including thinking, $0.075 cached input. It's in `PRICES` in `server/extract.ts`, so each run shows its cost and `DAILY_USD` (default $5) is a real daily budget.
- **A typical figure** is about 6k tokens in and 16–30k out, so roughly **$0.13–0.24 per reading**: $5 a day covers about 20–35 readings, and $20 covers about 80–150.
- **Priority tier:** Google also sells a Priority tier at 1.8× the price, meant to be served first when the model is busy. It's not used.

### Before billing: the free tier
Kept for reference.
- **Data:** on the free tier, Google may use what is sent to improve its products, and human reviewers may read it. So the upload screen asks visitors to use published figures, and the bundled examples mean they rarely need their own. On a paid key, uploads aren't used to improve Google's products. Switching is a key swap in `.env.local` (and filling in the model's prices in `server/extract.ts`, so the dollar budget works).
- **Limits:** set per Google project, not per key or per visitor. For this model the free tier allows **only 20 requests a day** for the whole project (seen in the 429 error on 2026-11-18), reset at midnight Pacific. **Failed and refused requests count too**, and each "high demand" refusal is retried up to 3 times, so on a busy day one failed reading can use 4 of the 20. Going over shows "today's free-tier limit is used up", and the saved examples still open.
- **On a demo day,** don't test fresh readings beforehand: keep the 20 for the session. If the panel will try more than a handful, a paid key (billing turned on for the project) lifts this limit; it costs cents per figure.

## What this choice gives up
| | Laptop + quick tunnel |
|---|---|
| Cost | $0 |
| Availability | Only while the laptop is on, awake and online |
| Link | Changes each time the tunnel starts |
| Reliability | Cloudflare calls quick tunnels a testing tool, with no uptime promise |
| Login | One shared password; can't lock out one person |
| Data | Uploads stay on the laptop (apart from the call to Google) |

**Why not a free host (Vercel, Render, Cloud Run, Hugging Face)?** The app needs a disk that keeps runs, a local Chrome for the PDF, and 8 MB of database snapshots read from disk. Free hosts wipe their disk on restart, have no Chrome, sleep when idle, or charge for password protection. Each would mean rebuilding parts of the app.
