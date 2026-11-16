/**
 * The first screen: choose or drop a figure, extract it with one model call, or reopen an earlier run.
 * Says plainly when the key or model isn't set, and shows each run's time and cost.
 */
import { useEffect, useRef, useState } from 'react';
import { extract, getStatus, listRuns, type RunRecord, type RunSummary, type Status } from '../api.ts';

const TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_BYTES = 11_000_000;

interface Picked { file: File; url: string; width: number; height: number }

function readSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('That file could not be read as an image.'));
    img.src = url;
  });
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(new Error('That file could not be read.'));
    r.readAsDataURL(file);
  });
}

export function UploadScreen({ onDone, onOpen }: { onDone: (run: RunRecord) => void; onOpen: (id: string) => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getStatus().then(setStatus).catch(() => setStatus(null));
    listRuns().then(setRuns).catch(() => setRuns([]));
  }, []);
  useEffect(() => {
    if (!busy) return;
    const t0 = Date.now();
    const t = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 500);
    return () => clearInterval(t);
  }, [busy]);

  async function pick(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (!TYPES.includes(file.type)) return setError('Use a PNG, JPEG or WebP image.');
    if (file.size > MAX_BYTES) return setError('That image is larger than 11 MB. Export a smaller copy and try again.');
    const url = URL.createObjectURL(file);
    try {
      setPicked({ file, url, ...(await readSize(url)) });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function run() {
    if (!picked) return;
    setBusy(true);
    setError(null);
    try {
      const rec = await extract({ name: picked.file.name, mimeType: picked.file.type, data: await toBase64(picked.file), width: picked.width, height: picked.height });
      onDone(rec);
    } catch (e) {
      const d = (e as Error & { detail?: unknown }).detail;
      setError((e as Error).message + (d ? ` (${JSON.stringify(d).slice(0, 300)})` : ''));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Pathway Simplifier Studio</h1>
      <p className="mt-1 text-slate-600 dark:text-slate-300">Upload a pathway figure. It is read once into structured data and redrawn at its original positions, beside the original.</p>

      {status && !status.ready && (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          {!status.hasKey ? 'Add GEMINI_API_KEY to .env.local, then restart `npm run dev`.' : 'Add EXTRACT_MODEL (the model id) to .env.local, then restart `npm run dev`.'}
        </div>
      )}

      <div
        className={`mt-6 flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition ${over ? 'border-blue-500 bg-blue-50 dark:bg-blue-950' : 'border-slate-300 dark:border-slate-600'}`}
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files[0]); }}
      >
        <input ref={input} type="file" accept={TYPES.join(',')} className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        {picked ? (
          <>
            <img src={picked.url} alt="Selected figure" className="max-h-72 max-w-full rounded" />
            <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">{picked.file.name} · {picked.width}×{picked.height} px · {(picked.file.size / 1e6).toFixed(1)} MB · click to choose another</div>
          </>
        ) : (
          <>
            <div className="font-medium">Drop a figure here, or click to choose one</div>
            <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">PNG, JPEG or WebP, up to 11 MB</div>
          </>
        )}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!picked || busy || !status?.ready}
          onClick={run}
        >
          {busy ? 'Reading the figure…' : 'Extract'}
        </button>
        {busy && <span className="text-sm text-slate-600 dark:text-slate-300">{elapsed}s. One model call; this usually takes under a minute.</span>}
        {status?.ready && !busy && <span className="text-sm text-slate-500 dark:text-slate-400">Model: {status.model} · spent today ${status.spentTodayUsd.toFixed(2)} of ${status.dailyCapUsd}</span>}
      </div>
      {error && <div className="mt-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100">{error}</div>}

      {runs.length > 0 && (
        <div className="mt-10">
          <h2 className="text-lg font-semibold">Earlier extractions</h2>
          <ul className="mt-2 divide-y divide-slate-200 dark:divide-slate-700">
            {runs.map((r) => (
              <li key={r.id}>
                <button className="w-full py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => onOpen(r.id)}>
                  <span className="font-medium">{r.name}</span>
                  <span className="ml-2 text-sm text-slate-500 dark:text-slate-400">
                    {new Date(r.at).toLocaleString()} · {r.model} · {r.counts.elements} elements, {r.counts.arrows} arrows · {r.seconds.toFixed(0)}s{r.priceKnown ? ` · $${r.costUsd.toFixed(3)}` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
