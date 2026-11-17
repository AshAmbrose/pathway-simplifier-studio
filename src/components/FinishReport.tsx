/**
 * The Finish report: the figure as the model read it against the finished figure.
 *  - Fidelity first: whether every shape and arrow is accounted for (src/report/account.ts), and any that changed
 *    with no change saying so, listed at the top.
 *  - Simpler, in numbers: shapes, arrows, clusters and compartments as read, after Check, and finished.
 *  - What happened to each shape and arrow, grouped (kept, renamed, left out and why, merged, collapsed, ...), with
 *    the step it happened in; each shape with what it was identified as.
 *  - Downloads: the report as Markdown, and the figure as SVG.
 * Opens on Finish, and from the header at any time.
 */
import { AlertTriangle, Check, Download, FileText } from 'lucide-react';
import { useState } from 'react';
import type { Report } from '../report/account.ts';
import { reportMarkdown } from '../report/markdown.ts';
import { CloseButton } from './Popover.tsx';
import { button, cta, ICON, meta, okNote, section, sectionTitle, warnNote } from './ui.ts';
import { STEP_INFO } from './StepBar.tsx';

const where = (w: string | null) => (w ? (w === 'Check' ? 'Check' : `${STEP_INFO[w as keyof typeof STEP_INFO]?.n ?? ''} ${STEP_INFO[w as keyof typeof STEP_INFO]?.name ?? w}`) : '');

export function FinishReport({ name, report, extra, finished, onDownloadSvg, onClose, onHover }: {
  name: string;
  report: Report;
  /** Further lines for the summary (the arrow check, when it has run). */
  extra: string[];
  /** Opened by Finish (true) or from the header (false). */
  finished: boolean;
  onDownloadSvg: () => void;
  onClose: () => void;
  onHover: (ids: string[] | null) => void;
}) {
  const c = report.counts;
  const downloadMd = () => {
    const blob = new Blob([reportMarkdown(name, report, extra)], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${name.replace(/[^\w-]+/g, '-')}-report.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const unacc = [...report.shapes, ...report.arrows].filter((v) => v.fate === 'unaccounted');
  const added = [...report.shapes, ...report.arrows].filter((v) => v.fate === 'added').length;
  return (
    <div role="dialog" aria-label="Report" className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[rgb(0_0_0/0.35)] p-6" onClick={onClose}>
      <div className="w-full max-w-[920px] rounded border border-line-2 bg-panel p-6 shadow-[0_8px_24px_rgb(0_0_0/0.18)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-page font-semibold text-ink">{finished ? 'Finished: report' : 'Report'}</h2>
            <p className={`${meta} mt-0.5`}>{name} · the figure as the model read it, against the figure as it stands now.</p>
          </div>
          <CloseButton onClose={onClose} />
        </div>

        {report.unaccounted === 0 ? (
          <p className={`${okNote} mt-4 flex items-start gap-2`}><Check size={ICON} className="mt-0.5 shrink-0" />
            <span>Every one of the <b className="num">{c.read.shapes}</b> shapes and <b className="num">{c.read.arrows}</b> arrows the model read is accounted for{added ? <>, and so is everything you added (<span className="num">{added}</span>)</> : ''}: each is unchanged, or a change in the list says what happened to it. Nothing was added, removed, renamed, reversed or re-pointed silently.</span></p>
        ) : (
          <div className={`${warnNote} mt-4`}>
            <p className="flex items-start gap-2"><AlertTriangle size={ICON} className="mt-0.5 shrink-0" /><span><b className="num">{report.unaccounted}</b> item{report.unaccounted === 1 ? '' : 's'} changed with no change in the list saying so:</span></p>
            <ul className="mt-1 list-disc pl-8">{unacc.map((v) => <li key={v.id} onMouseEnter={() => onHover([v.id])} onMouseLeave={() => onHover(null)}>{v.asDrawn}: {v.detail}</li>)}</ul>
          </div>
        )}

        <section className={`${section} mt-5`}>
          <h3 className={sectionTitle}>Simpler, in numbers</h3>
          <table className="num mt-2 w-full text-body">
            <thead><tr className={meta}><th className="text-left font-normal" /><th className="text-right font-normal">As read</th><th className="text-right font-normal">After Check</th><th className="text-right font-normal">Finished</th><th className="text-right font-normal">Change</th></tr></thead>
            <tbody>
              {(['shapes', 'arrows', 'clusters', 'compartments'] as const).map((k) => {
                const d = c.read[k] ? Math.round(((c.finished[k] - c.read[k]) / c.read[k]) * 100) : 0;
                return (
                  <tr key={k} className="border-t border-line">
                    <td className="py-1.5 text-ink">{k[0].toUpperCase() + k.slice(1)}</td>
                    <td className="text-right text-ink-2">{c.read[k]}</td><td className="text-right text-ink-2">{c.checked[k]}</td>
                    <td className="text-right font-semibold text-ink">{c.finished[k]}</td>
                    <td className={`text-right ${d < 0 ? 'text-ok' : 'text-ink-3'}`}>{c.read[k] ? `${d > 0 ? '+' : ''}${d}%` : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className={`${meta} mt-2`}>Shapes identified in public databases (step 1): <span className="num">{report.identified} of the {c.read.shapes}</span> the model read.</p>
          {extra.map((l) => <p key={l} className={`${meta} mt-1`}>{l}</p>)}
        </section>

        <Fates title="Shapes" list={report.shapes} onHover={onHover} identity />
        <Fates title="Arrows" list={report.arrows} onHover={onHover} />

        <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <button className={cta} onClick={downloadMd}><FileText size={ICON} />Download report</button>
          <button className={button} onClick={onDownloadSvg}><Download size={ICON} />Download figure (SVG)</button>
          <span className={meta}>The report is Markdown: every shape and arrow, what happened to it, and where.</span>
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
    <section className={`${section} mt-5`}>
      <h3 className={sectionTitle}>{title}</h3>
      <ul className="mt-2 divide-y divide-line border-y border-line">
        {fates.map((f) => {
          const items = list.filter((v) => v.fate === f);
          const shown = open.has(f);
          return (
            <li key={f} className="py-1.5">
              <button className="flex w-full items-baseline justify-between text-left text-body" aria-expanded={shown} onClick={() => setOpen((s) => { const n = new Set(s); if (n.has(f)) n.delete(f); else n.add(f); return n; })}>
                <span className={f === 'unaccounted' ? 'font-semibold text-warn-ink' : 'font-medium text-ink'}>{f[0].toUpperCase() + f.slice(1)}</span>
                <span className={`${meta} num`}>{items.length} {shown ? '▴' : '▾'}</span>
              </button>
              {shown && (
                <table className="mt-1 w-full text-body">
                  <tbody>
                    {items.map((v) => (
                      <tr key={v.id} className="border-t border-line align-top" onMouseEnter={() => onHover([v.id])} onMouseLeave={() => onHover(null)}>
                        <td className="w-[28%] py-1 pr-2 text-ink">{v.asDrawn}</td>
                        <td className="py-1 pr-2 text-ink-2">{v.detail}{identity && 'identity' in v && v.identity ? <span className={`${meta} block`}>Identified as {v.identity}</span> : null}</td>
                        <td className={`${meta} w-[14%] py-1 text-right`}>{where(v.where)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
