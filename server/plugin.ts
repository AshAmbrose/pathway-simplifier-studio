/**
 * Local-only API, mounted into the Vite dev server (pattern from BioPathway Studio's server/plugin.ts).
 *
 *   GET  /api/status            -> { ready, model, spentTodayUsd, dailyCapUsd }
 *   POST /api/extract           -> RunRecord   ({ name, mimeType, data: base64, width, height })
 *   GET  /api/runs              -> RunSummary[] (newest first)
 *   GET  /api/runs/<id>         -> RunRecord
 *   GET  /api/runs/<id>/image   -> the uploaded image
 *   PUT  /api/runs/<id>/review  -> { review, version }   body { review, version }: the user's answers and fixes;
 *                                  409 with the newer review if the run was saved elsewhere since `version`
 *   POST /api/relations         -> { ready, snapshots, results }   body RelationQuery: each arrow between identified
 *                                  shapes looked up in the local SIGNOR and OmniPath snapshots (server/relations.ts)
 *   POST /api/report-pdf        -> the Finish report as a PDF   body { html }: printed by the local Chrome
 *                                  (server/pdf.ts); 501 when no Chrome is found
 *   POST /api/identify          -> LabelLookup   body { label, kind }: what public databases say the label is
 *                                  (server/identify.ts; only the label text is sent, answers are cached)
 *
 * Keys are read on the server from .env.local and never sent to the browser.
 *
 * The same routes also run under `vite preview` (`npm run demo`), which serves only the built app in dist/, for the
 * hosted demo. Its settings come from .env.demo: DEMO_PASSWORD puts every page and route behind the browser's own
 * login box, DATA_DIR keeps the demo's runs apart, and MAX_CALLS_PER_DAY caps model calls. EXTRACT_THINKING=LOW
 * (either server) makes readings quicker but less careful. See docs/hosting.md.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { loadEnv, type Connect, type Plugin } from 'vite';
import { callsOn, localDay, spentOn } from './aiLedger.ts';
import { ExtractError, extractFigure } from './extract.ts';
import { identifyLabel } from './identify.ts';
import { checkArrows } from './relations.ts';
import { htmlToPdf } from './pdf.ts';
import { getRun, listRuns, runImage, saveReview, saveRun } from './runs.ts';

const MAX_BODY = 15_000_000; // base64 of a ~11 MB image
const MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);

function readJson(req: IncomingMessage, maxBytes: number): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c) => {
      body += c;
      if (body.length > maxBytes) {
        reject(new ExtractError('The image is too large (limit about 11 MB).', 413));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new ExtractError('Bad request body.', 400));
      }
    });
    req.on('error', reject);
  });
}

interface Settings { key: string; model: string; dailyCapUsd: number; maxCallsPerDay: number; password: string; thinking: string }

/**
 * Sends the reply's headers and a space at once, then a space every 15 s, then the JSON (JSON may start with
 * spaces). Reading a figure can take minutes, and the tunnel used for the hosted demo drops a request that sends
 * nothing for about 100 s. The status is 200 before the result is known, so a failure is sent as { error } in the
 * body, which the browser checks for (src/api.ts).
 */
async function keepAlive(res: ServerResponse, work: () => Promise<unknown>): Promise<void> {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.write(' ');
  const beat = setInterval(() => res.write(' '), 15_000);
  try {
    res.end(JSON.stringify(await work()));
  } catch (err) {
    const e = err as ExtractError;
    res.end(JSON.stringify({ error: e.message, status: e.status ?? 500, detail: e.detail }));
  } finally {
    clearInterval(beat);
  }
}

/**
 * The demo's password check, using the browser's own login box (HTTP Basic auth; any user name). The tunnel serves
 * the app over HTTPS, so the password isn't sent in the clear. Both sides are hashed first so the comparison takes
 * the same time whatever was typed.
 */
function passwordOk(req: IncomingMessage, password: string): boolean {
  const header = req.headers.authorization ?? '';
  if (!header.startsWith('Basic ')) return false;
  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  const given = decoded.slice(decoded.indexOf(':') + 1);
  const hash = (v: string) => createHash('sha256').update(v).digest();
  return timingSafeEqual(hash(given), hash(password));
}

/** The middleware for both servers: the password check (when one is set), then the /api routes listed above. */
function middleware(s: Settings): Connect.NextHandleFunction {
  return async (req, res, next) => {
    if (s.password && !passwordOk(req, s.password)) {
      res.statusCode = 401;
      res.setHeader('WWW-Authenticate', 'Basic realm="Pathway Simplifier Studio demo", charset="UTF-8"');
      return res.end('A password is needed to open this demo.');
    }
    if (!req.url?.startsWith('/api/')) return next();
    const url = req.url.split('?')[0];
    const json = (status: number, data: unknown) => {
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(data));
    };
    try {
      if (url === '/api/status' && req.method === 'GET') {
        return json(200, { ready: !!s.key && !!s.model, hasKey: !!s.key, model: s.model, spentTodayUsd: spentOn(localDay()), dailyCapUsd: s.dailyCapUsd, thinking: s.thinking || undefined });
      }
      if (url === '/api/extract' && req.method === 'POST') {
        const body = await readJson(req, MAX_BODY);
        if (!MIME.has(body.mimeType)) throw new ExtractError('Use a PNG, JPEG or WebP image.', 400);
        if (typeof body.data !== 'string' || !body.data) throw new ExtractError('No image data.', 400);
        const width = Number(body.width), height = Number(body.height);
        if (!(width > 0 && height > 0)) throw new ExtractError('Missing image size.', 400);
        if (spentOn(localDay()) >= s.dailyCapUsd) throw new ExtractError(`Today's AI budget ($${s.dailyCapUsd}) is used up.`, 429);
        // A count as well as a budget: the budget never triggers while a model's price is unknown (cost logged as 0).
        if (callsOn(localDay()) >= s.maxCallsPerDay) throw new ExtractError(`Today's limit of ${s.maxCallsPerDay} figure readings is used up. The saved examples still open.`, 429);
        return await keepAlive(res, async () => {
          const result = await extractFigure({ apiKey: s.key, model: s.model, mimeType: body.mimeType, dataBase64: body.data, thinking: s.thinking || undefined });
          return saveRun(String(body.name || 'figure'), body.mimeType, Buffer.from(body.data, 'base64'), { width, height }, result);
        });
      }
      if (url === '/api/runs' && req.method === 'GET') return json(200, listRuns());
      if (url === '/api/report-pdf' && req.method === 'POST') {
        // The page carries the uploaded image as a data URL, so it can be as large as an upload.
        const body = await readJson(req, MAX_BODY + 2_000_000);
        if (typeof body.html !== 'string' || !body.html.startsWith('<!doctype html>')) throw new ExtractError('No report to print.', 400);
        const pdf = await htmlToPdf(body.html);
        if (!pdf) return json(501, { error: 'No Chrome found to print the PDF.' });
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/pdf');
        return res.end(pdf);
      }
      if (url === '/api/relations' && req.method === 'POST') {
        const body = await readJson(req, 4_000_000);
        if (!Array.isArray(body.arrows)) throw new ExtractError('No arrows to check.', 400);
        return json(200, checkArrows(body));
      }
      if (url === '/api/identify' && req.method === 'POST') {
        const body = await readJson(req, 10_000);
        if (typeof body.label !== 'string' || !body.label.trim() || body.label.length > 200) throw new ExtractError('No label to look up.', 400);
        return json(200, await identifyLabel(body.label, String(body.kind ?? 'other')));
      }
      const rv = url.match(/^\/api\/runs\/([^/]+)\/review$/);
      if (rv && req.method === 'PUT') {
        // Body: { review, version } where version is the one the changes were built on.
        const body = await readJson(req, 2_000_000);
        let result;
        try { result = saveReview(rv[1], body.review, Number(body.version)); } catch { throw new ExtractError('The changes could not be saved (unexpected format).', 400); }
        if (result.kind === 'missing') return json(404, { error: 'Not found.' });
        if (result.kind === 'stale') return json(409, { error: 'This run was changed somewhere else since it was opened.', review: result.review, version: result.version });
        return json(200, { review: result.review, version: result.version });
      }
      const m = url.match(/^\/api\/runs\/([^/]+)(\/image)?$/);
      if (m && req.method === 'GET') {
        if (m[2]) {
          const img = runImage(m[1]);
          if (!img) return json(404, { error: 'Not found.' });
          res.setHeader('Content-Type', img.mimeType);
          return res.end(img.data);
        }
        const r = getRun(m[1]);
        return r ? json(200, r) : json(404, { error: 'Not found.' });
      }
      return json(404, { error: 'Not found.' });
    } catch (err) {
      const e = err as ExtractError;
      return json(e.status ?? 500, { error: e.message, detail: e.detail });
    }
  };
}

/**
 * Adds the password check and the /api routes to the dev server (`npm run dev`) and to the preview server
 * (`npm run demo`). Reads the key and settings from .env.local, or from .env.demo in demo mode.
 */
export function apiPlugin(): Plugin {
  const s: Settings = { key: '', model: '', dailyCapUsd: 5, maxCallsPerDay: Infinity, password: '', thinking: '' };
  return {
    name: 'pathway-simplifier-api',
    config(_, { mode }) {
      const env = loadEnv(mode, process.cwd(), '');
      s.key = env.GEMINI_API_KEY ?? '';
      s.model = env.EXTRACT_MODEL ?? '';
      s.dailyCapUsd = Number(env.DAILY_USD ?? 5) || 5;
      // Unset means no cap; 0 is a real cap (no new readings, saved results only).
      const cap = Number(env.MAX_CALLS_PER_DAY);
      s.maxCallsPerDay = env.MAX_CALLS_PER_DAY?.trim() && cap >= 0 ? cap : Infinity;
      s.password = env.DEMO_PASSWORD ?? '';
      // A quick read (less thinking): faster, but fewer questions and flags. Only LOW is offered; see extractFigure.
      s.thinking = env.EXTRACT_THINKING?.trim().toUpperCase() === 'LOW' ? 'LOW' : '';
      // runs.ts and aiLedger.ts read this when they first save or load, which is after this point.
      if (env.DATA_DIR) process.env.DATA_DIR = env.DATA_DIR;
    },
    configureServer(server) {
      server.middlewares.use(middleware(s));
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware(s));
    },
  };
}
