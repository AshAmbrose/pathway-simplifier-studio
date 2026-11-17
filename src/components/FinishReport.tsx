/**
 * The Finish report: the figure as the model read it against the finished figure.
 *  - Original and finished side by side: the uploaded image and the finished figure, each with its counts;
 *    "Larger" makes both taller. The SVG download is this finished figure, whichever step the report opened on.
 *  - Fidelity first: whether every shape and arrow is accounted for (src/report/account.ts), and any that changed
 *    with no change saying so, listed at the top.
 *  - Simpler, in numbers: shapes, arrows, clusters and compartments as read, after Check, and finished.
 *  - What happened to each shape and arrow, grouped (kept, renamed, left out and why, merged, collapsed, ...), with
 *    the step it happened in; each shape with what it was identified as.
 *  - Downloads: the report as a PDF (printed by the local Chrome, server/pdf.ts; the browser's print dialog if
 *    there is none), the finished figure as SVG, and the report as Markdown.
 * Compact: the figures side by side, the counts beside the science checks, and shapes beside arrows, each group
 * folded until opened. Opens on Finish, and from the header at any time.
 */
import { AlertTriangle, Check, Download, FileDown } from 'lucide-react';
import { useRef, useState } from 'react';
import type { Scene } from '../render/toScene.ts';
import type { Report } from '../report/account.ts';
import { reportPdf } from '../api.ts';
import { reportMarkdown } from '../report/markdown.ts';
import { reportHtml } from '../report/printable.ts';
import { CloseButton } from './Popover.tsx';
import { MarkerDefs, SceneSvg, stillUi } from './SceneSvg.tsx';
import { button, cta, ICON, meta, okNote, quiet, sectionTitle, warnNote } from './ui.ts';
import { STEP_INFO } from './StepBar.tsx';

const where = (w: string | null) => (w ? (w === 'Check' ? 'Check' : `${STEP_INFO[w as keyof typeof STEP_INFO]?.n ?? ''} ${STEP_INFO[w as keyof typeof STEP_INFO]?.name ?? w}`) : '');

export function FinishReport({ name, report, extra, finished, imageUrl, finalScene, onClose, onHover }: {
  name: string;
  /** The uploaded figure, and the finished figure (every change applied), for the side-by-side view. */
  imageUrl: string;
  finalScene: Scene;
  report: Report;
  /** Further lines for the summary (the arrow check, when it has run). */
  extra: string[];
  /** Opened by Finish (true) or from the header (false). */
  finished: boolean;
  onClose: () => void;
  onHover: (ids: string[] | null) => void;
}) {
  const c = report.counts;
  const [large, setLarge] = useState(false);
  const finalSvg = useRef<SVGSVGElement>(null);
  /** Saves the finished figure drawn here as an SVG file (not the step on screen behind the report). */
  const downloadSvg = () => {
    const svg = finalSvg.current;
    if (!svg) return;
    const copy = svg.cloneNode(true) as SVGSVGElement;
    copy.setAttribute('width', String(Math.round(finalScene.width)));
    copy.setAttribute('height', String(Math.round(finalScene.height)));
    copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    copy.removeAttribute('class');
    const blob = new Blob([new XMLSerializer().serializeToString(copy)], { type: 'image/svg+xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${name.replace(/[^\w-]+/g, '-')}-simplified.svg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const frame = `relative flex ${large ? 'h-[70vh]' : 'h-[260px]'} items-center justify-center overflow-hidden rounded border border-line bg-white`;
  const file = name.replace(/[^\w-]+/g, '-');
  const save = (blob: Blob, as: string) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = as;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const downloadMd = () => save(new Blob([reportMarkdown(name, report, extra)], { type: 'text/markdown' }), `${file}-report.md`);
  const [pdf, setPdf] = useState<'idle' | 'making' | 'failed'>('idle');
  /**
   * The report as a PDF: the printable page (the uploaded image inlined, the finished figure as vector SVG) printed
   * by the local Chrome; with no Chrome, the browser's print dialog opens on the same page ("Save as PDF").
   */
  const downloadPdf = async () => {
    setPdf('making');
    try {
      const img = await fetch(imageUrl).then((r) => r.blob());
      const original = await new Promise<string>((ok) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result)); fr.readAsDataURL(img); });
      const svg = finalSvg.current!.cloneNode(true) as SVGSVGElement;
      svg.removeAttribute('class');
      const html = reportHtml({ name, report, extra, original, finishedSvg: new XMLSerializer().serializeToString(svg) });
      const blob = await reportPdf(html);
      if (blob) save(blob, `${file}-report.pdf`);
      else {
        const frameEl = document.createElement('iframe');
        frameEl.style.cssText = 'position:fixed;width:0;height:0;border:0';
        document.body.appendChild(frameEl);
        frameEl.contentDocument!.open(); frameEl.contentDocument!.write(html); frameEl.contentDocument!.close();
        setTimeout(() => { frameEl.contentWindow!.print(); setTimeout(() => frameEl.remove(), 1000); }, 400);
      }
      setPdf('idle');
    } catch { setPdf('failed'); }
  };
  const unacc = [...report.shapes, ...report.arrows].filter((v) => v.fate === 'unaccounted');
  const added = [...report.shapes, ...report.arrows].filter((v) => v.fate === 'added').length;
  return (
    <div role="dialog" aria-label="Report" className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[rgb(0_0_0/0.35)] p-6" onClick={onClose}>
      <div className="w-full max-w-[1040px] rounded border border-line-2 bg-panel p-5 shadow-[0_8px_24px_rgb(0_0_0/0.18)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <h2 className="text-title font-semibold text-ink">{finished ? 'Finished: report' : 'Report'}</h2>
            <p className={meta}>{name} · as the model read it, against the figure now</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button className={cta} onClick={downloadPdf} disabled={pdf === 'making'}><FileDown size={ICON} />{pdf === 'making' ? 'Making the PDF…' : 'Download PDF'}</button>
            <CloseButton onClose={onClose} />
          </div>
        </div>
        {pdf === 'failed' && <p className={`${warnNote} mt-2`}>The PDF couldn't be made. Try again, or download the Markdown version below.</p>}

        {report.unaccounted === 0 ? (
          <p className={`${okNote} mt-3 flex items-start gap-2 py-1.5`}><Check size={ICON} className="mt-0.5 shrink-0" />
            <span>All <b className="num">{c.read.shapes}</b> shapes and <b className="num">{c.read.arrows}</b> arrows the model read are accounted for{added ? <>, plus <span className="num">{added}</span> you added</> : ''}: nothing was removed, renamed, reversed or re-pointed silently.</span></p>
        ) : (
          <div className={`${warnNote} mt-3`}>
            <p className="flex items-start gap-2"><AlertTriangle size={ICON} className="mt-0.5 shrink-0" /><span><b className="num">{report.unaccounted}</b> item{report.unaccounted === 1 ? '' : 's'} changed with no change in the list saying so:</span></p>
            <ul className="mt-1 list-disc pl-8">{unacc.map((v) => <li key={v.id} onMouseEnter={() => onHover([v.id])} onMouseLeave={() => onHover(null)}>{v.asDrawn}: {v.detail}</li>)}</ul>
          </div>
        )}

        <section className="mt-3">
          <div className="mb-1 flex justify-end"><button className={`${quiet} text-meta`} onClick={() => setLarge((v) => !v)}>{large ? 'Smaller pictures' : 'Larger pictures'}</button></div>
          <div className="grid grid-cols-2 gap-3">
            <figure>
              <div className={frame}><img src={imageUrl} alt="The uploaded figure" className="max-h-full max-w-full object-contain" /></div>
              <figcaption className={`${meta} num mt-1`}>Original, as uploaded · {c.read.shapes} shapes, {c.read.arrows} arrows as read</figcaption>
            </figure>
            <figure>
              <div className={frame}>
                <svg ref={finalSvg} viewBox={`0 0 ${finalScene.width} ${finalScene.height}`} className="h-full w-full" preserveAspectRatio="xMidYMid meet">
                  <MarkerDefs /><SceneSvg scene={finalScene} ui={stillUi(finalScene.width / 600)} />
                </svg>
              </div>
              <figcaption className={`${meta} num mt-1`}>Finished · {c.finished.shapes} shapes, {c.finished.arrows} arrows</figcaption>
            </figure>
          </div>
        </section>

        <section className="mt-4 grid grid-cols-2 gap-6 border-t border-line pt-3">
          <div>
          <h3 className={sectionTitle}>Simpler, in numbers</h3>
          <table className="num mt-1 w-full text-body">
            <thead><tr className={meta}><th className="text-left font-normal" /><th className="text-right font-normal">As read</th><th className="text-right font-normal">After Check</th><th className="text-right font-normal">Finished</th><th className="text-right font-normal">Change</th></tr></thead>
            <tbody>
              {(['shapes', 'arrows', 'clusters', 'compartments'] as const).map((k) => {
                const d = c.read[k] ? Math.round(((c.finished[k] - c.read[k]) / c.read[k]) * 100) : 0;
                return (
                  <tr key={k} className="border-t border-line">
                    <td className="py-1 text-ink">{k[0].toUpperCase() + k.slice(1)}</td>
                    <td className="text-right text-ink-2">{c.read[k]}</td><td className="text-right text-ink-2">{c.checked[k]}</td>
                    <td className="text-right font-semibold text-ink">{c.finished[k]}</td>
                    <td className={`text-right ${d < 0 ? 'text-ok' : 'text-ink-3'}`}>{c.read[k] ? `${d > 0 ? '+' : ''}${d}%` : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
          <div>
            <h3 className={sectionTitle}>Science checks</h3>
            <p className={`${meta} mt-1`}>Shapes identified in public databases (step 1): <span className="num">{report.identified} of the {c.read.shapes}</span> the model read.</p>
            {extra.map((l) => <p key={l} className={`${meta} mt-1`}>{l}</p>)}
          </div>
        </section>

        <section className="mt-4 grid grid-cols-2 gap-6 border-t border-line pt-3">
          <Fates title="Shapes" list={report.shapes} onHover={onHover} identity />
          <Fates title="Arrows" list={report.arrows} onHover={onHover} />
        </section>

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-3">
          <button className={button} onClick={downloadSvg}><Download size={ICON} />Finished figure (SVG)</button>
          <button className={`${quiet} text-meta`} onClick={downloadMd}>Report as Markdown</button>
          <span className={meta}>The PDF has both figures, the checks, and every shape and arrow with what happened to it.</span>
        </div>
      </div>
    </div>
  );
}

/** One list (shapes or arrows) grouped by what happened, each group folded but for the unaccounted. */
function Fates({ title, list, identity, onHover }: {
  title: string; list: Report['shapes'] | Report['arrows']; identity?: boolean; onHover: (ids: string[] | null) => void;
}) {
  const fates = [...new Set(list.map((v) => v.fate))].sort((a, b) => Number(b === 'unaccounted') - Number(a === 'unaccounted'));
  const [open, setOpen] = useState<Set<string>>(new Set(['unaccounted']));
  return (
    <div>
      <h3 className={sectionTitle}>{title}</h3>
      <ul className="mt-1 divide-y divide-line border-y border-line">
        {fates.map((f) => {
          const items = list.filter((v) => v.fate === f);
          const shown = open.has(f);
          return (
            <li key={f} className="py-1">
              <button className="flex w-full items-baseline justify-between text-left text-body" aria-expanded={shown} onClick={() => setOpen((s) => { const n = new Set(s); if (n.has(f)) n.delete(f); else n.add(f); return n; })}>
                <span className={f === 'unaccounted' ? 'font-semibold text-warn-ink' : 'font-medium text-ink'}>{f[0].toUpperCase() + f.slice(1)}</span>
                <span className={`${meta} num`}>{items.length} {shown ? '▴' : '▾'}</span>
              </button>
              {shown && (
                <table className="mt-1 w-full text-meta">
                  <tbody>
                    {items.map((v) => (
                      <tr key={v.id} className="border-t border-line align-top" onMouseEnter={() => onHover([v.id])} onMouseLeave={() => onHover(null)}>
                        <td className="w-[34%] py-0.5 pr-2 text-ink">{v.asDrawn}</td>
                        <td className="py-0.5 pr-2 text-ink-2">{v.detail}{v.where ? <span className="text-ink-3"> · {where(v.where)}</span> : null}{identity && 'identity' in v && v.identity ? <span className="block text-ink-3">Identified as {v.identity}</span> : null}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
