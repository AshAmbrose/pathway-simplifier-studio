/**
 * Local-only API, mounted into the Vite dev server (pattern from BioPathway Studio's server/plugin.ts).
 *
 *   GET  /api/status            -> { ready, model, spentTodayUsd, dailyCapUsd }
 *   POST /api/extract           -> RunRecord   ({ name, mimeType, data: base64, width, height })
 *   GET  /api/runs              -> RunSummary[] (newest first)
 *   GET  /api/runs/<id>         -> RunRecord
 *   GET  /api/runs/<id>/image   -> the uploaded image
 *   PUT  /api/runs/<id>/review  -> Review      (the user's answers and fixes; the extraction is not altered)
 *
 * Keys are read on the server from .env.local and never sent to the browser.
 */
import type { IncomingMessage } from 'node:http';
import { loadEnv, type Plugin } from 'vite';
import { localDay, spentOn } from './aiLedger.ts';
import { ExtractError, extractFigure } from './extract.ts';
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

export function apiPlugin(): Plugin {
  let key = '';
  let model = '';
  let dailyCapUsd = 5;
  return {
    name: 'pathway-simplifier-api',
    config(_, { mode }) {
      const env = loadEnv(mode, process.cwd(), '');
      key = env.GEMINI_API_KEY ?? '';
      model = env.EXTRACT_MODEL ?? '';
      dailyCapUsd = Number(env.DAILY_USD ?? 5) || 5;
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next();
        const url = req.url.split('?')[0];
        const json = (status: number, data: unknown) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(data));
        };
        try {
          if (url === '/api/status' && req.method === 'GET') {
            return json(200, { ready: !!key && !!model, hasKey: !!key, model, spentTodayUsd: spentOn(localDay()), dailyCapUsd });
          }
          if (url === '/api/extract' && req.method === 'POST') {
            const body = await readJson(req, MAX_BODY);
            if (!MIME.has(body.mimeType)) throw new ExtractError('Use a PNG, JPEG or WebP image.', 400);
            if (typeof body.data !== 'string' || !body.data) throw new ExtractError('No image data.', 400);
            const width = Number(body.width), height = Number(body.height);
            if (!(width > 0 && height > 0)) throw new ExtractError('Missing image size.', 400);
            if (spentOn(localDay()) >= dailyCapUsd) throw new ExtractError(`Today's AI budget ($${dailyCapUsd}) is used up.`, 429);
            const result = await extractFigure({ apiKey: key, model, mimeType: body.mimeType, dataBase64: body.data });
            const rec = saveRun(String(body.name || 'figure'), body.mimeType, Buffer.from(body.data, 'base64'), { width, height }, result);
            return json(200, rec);
          }
          if (url === '/api/runs' && req.method === 'GET') return json(200, listRuns());
          const rv = url.match(/^\/api\/runs\/([^/]+)\/review$/);
          if (rv && req.method === 'PUT') {
            let saved;
            try { saved = saveReview(rv[1], await readJson(req, 2_000_000)); } catch { throw new ExtractError('The changes could not be saved (unexpected format).', 400); }
            return saved ? json(200, saved) : json(404, { error: 'Not found.' });
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
      });
    },
  };
}
