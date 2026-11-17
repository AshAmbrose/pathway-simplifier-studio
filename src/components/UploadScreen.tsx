/**
 * The first screen: choose or drop a figure, extract it with one model call, or reopen an earlier run.
 * Says plainly when the key or model isn't set, and shows each run's time and cost.
 */
import { Upload } from 'lucide-react';
import { primary, warnNote } from './ui.ts';
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
    <div className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-page font-semibold text-ink">Pathway Simplifier Studio</h1>
      <p className="mt-1 max-w-[65ch] text-ink-2">Upload a published pathway figure. It is read once, redrawn beside the original for you to check, then simplified step by step. Every change is listed and can be undone.</p>

      {status && !status.ready && (
        <div className={`${warnNote} mt-4`}>
          {!status.hasKey ? 'Add GEMINI_API_KEY to .env.local, then restart `npm run dev`.' : 'Add EXTRACT_MODEL (the model id) to .env.local, then restart `npm run dev`.'}
        </div>
      )}

      <div
        className={`mt-6 flex min-h-56 cursor-pointer flex-col items-center justify-center rounded border border-dashed p-6 text-center transition-colors ${over ? 'border-accent bg-accent-wash' : 'border-line-2 bg-panel hover:bg-sunk'}`}
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files[0]); }}
      >
        <input ref={input} type="file" accept={TYPES.join(',')} className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        {picked ? (
          <>
            <img src={picked.url} alt="Selected figure" className="max-h-72 max-w-full rounded" />
            <div className="num mt-2 text-body text-ink-2">{picked.file.name} · {picked.width}×{picked.height} px · {(picked.file.size / 1e6).toFixed(1)} MB · click to choose another</div>
          </>
        ) : (
          <>
            <Upload size={20} className="mb-2 text-ink-3" />
            <div className="font-medium text-ink">Drop a figure here, or click to choose one</div>
            <div className="mt-1 text-body text-ink-3">PNG, JPEG or WebP, up to 11 MB</div>
          </>
        )}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          className={primary}
          disabled={!picked || busy || !status?.ready}
          onClick={run}
        >
          {busy ? 'Reading the figure…' : 'Extract'}
        </button>
        {busy && <span className="num text-body text-ink-2">{elapsed}s. One model call; this usually takes under a minute.</span>}
        {status?.ready && !busy && <span className="num text-meta text-ink-3">Model {status.model} · spent today ${status.spentTodayUsd.toFixed(2)} of ${status.dailyCapUsd}</span>}
      </div>
      {error && <div className={`${warnNote} mt-3 text-bad`}>{error}</div>}

      {runs.length > 0 && (
        <section className="mt-12">
          <h2 className="text-section font-semibold text-ink">Earlier figures</h2>
          {/* A table, so dates and counts line up and can be compared at a glance. */}
          <table className="mt-2 w-full text-body">
            <thead>
              <tr className="border-b border-line text-left text-meta text-ink-3">
                <th className="py-2 pr-4 font-normal">Name</th>
                <th className="py-2 pr-4 font-normal">Read</th>
                <th className="py-2 pr-4 text-right font-normal">Shapes</th>
                <th className="py-2 pr-4 text-right font-normal">Arrows</th>
                <th className="py-2 font-normal">Model</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {runs.map((r) => (
                <tr key={r.id} className="cursor-pointer hover:bg-sunk" onClick={() => onOpen(r.id)}>
                  <td className="py-2 pr-4"><button className="text-left font-medium text-ink hover:underline" onClick={(e) => { e.stopPropagation(); onOpen(r.id); }}>{r.name}</button></td>
                  <td className="num whitespace-nowrap py-2 pr-4 text-ink-2">{new Date(r.at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                  <td className="num py-2 pr-4 text-right text-ink-2">{r.counts.elements}</td>
                  <td className="num py-2 pr-4 text-right text-ink-2">{r.counts.arrows}</td>
                  {/* Practice copies are made from saved results, not read by a model. */}
                  <td className="num py-2 text-meta text-ink-3">{r.model === 'unknown' ? 'practice copy' : `${r.model} · ${r.seconds.toFixed(0)} s${r.priceKnown ? ` · $${r.costUsd.toFixed(3)}` : ''}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
