/**
 * Everything that isn't the picture, in one quiet panel under it: the questions, the flags, and facts about the run.
 * One tab at a time, closed until asked for, so the two views stay the focus.
 */
import { useState, type ReactNode } from 'react';
import type { RunRecord } from '../api.ts';
import { nameOf } from '../edit/describe.ts';
import type { Extraction } from '../types/extraction.ts';

export interface QuestionStatus { state: 'open' | 'done' | 'byHand' | 'needsHand'; answer: string | null }
type Tab = 'questions' | 'flags' | 'about';

const dot: Record<QuestionStatus['state'], string> = {
  open: 'bg-orange-500 text-white', done: 'bg-green-600 text-white', byHand: 'bg-green-600 text-white', needsHand: 'bg-amber-600 text-white',
};

export function ReviewPanel({ run, base, statuses, problems, onOpenQuestion, onShow, onHover }: {
  run: RunRecord; base: Extraction; statuses: QuestionStatus[]; problems: string[];
  onOpenQuestion: (i: number) => void;
  /** Bring an item into view on both pictures. */
  onShow: (id: string) => void;
  onHover: (id: string | null) => void;
}) {
  const open = statuses.filter((s) => s.state === 'open' || s.state === 'needsHand').length;
  const [tab, setTab] = useState<Tab | null>(null);
  const tabBtn = (t: Tab, label: string, badge: ReactNode) => (
    <button onClick={() => setTab((cur) => (cur === t ? null : t))} aria-expanded={tab === t}
      className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${tab === t ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
      {label}{badge}
    </button>
  );
  const pill = (text: string, tone: 'plain' | 'warn' | 'good' = 'plain') => (
    <span className={`rounded-full px-1.5 text-xs font-semibold ${tone === 'warn' ? 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200' : tone === 'good' ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200' : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'}`}>{text}</span>
  );

  // Flags of the same kind together, most numerous first.
  const groups = new Map<string, Extraction['flags']>();
  for (const f of base.flags) groups.set(f.type, [...(groups.get(f.type) ?? []), f]);
  const flagGroups = [...groups].sort((a, b) => b[1].length - a[1].length);
  const facts: [string, string][] = [
    ['Model', run.model], ['Prompt', run.promptVersion], ['Time taken', `${run.seconds.toFixed(0)} s`],
    ['Tokens', `${run.usage.inputTokens.toLocaleString()} in · ${run.usage.outputTokens.toLocaleString()} out`],
    ['Cost', run.priceKnown ? `$${run.costUsd.toFixed(4)}` : 'not priced'],
    ['Read from the figure', `${base.elements.length} shapes · ${base.arrows.length} arrows · ${base.groups.length} clusters · ${base.regions.length} compartments`],
  ];

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-center gap-1 p-1.5">
        {tabBtn('questions', 'Questions', base.clarify.length === 0 ? pill('0') : open ? pill(`${open} open`, 'warn') : pill('all answered', 'good'))}
        {tabBtn('flags', 'Flags', pill(String(base.flags.length)))}
        {tabBtn('about', 'About this run', problems.length ? pill(`${problems.length} note${problems.length === 1 ? '' : 's'}`, 'warn') : null)}
      </div>

      {tab === 'questions' && (
        <div className="border-t border-slate-200 p-3 dark:border-slate-700">
          {base.clarify.length === 0 ? <p className="text-sm text-slate-500 dark:text-slate-400">The model had no questions about this figure.</p> : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {base.clarify.map((c, i) => {
                const s = statuses[i];
                return (
                  <li key={i}>
                    <button className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800" onClick={() => onOpenQuestion(i)}>
                      <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${dot[s.state]}`}>{s.state === 'open' ? i + 1 : s.state === 'needsHand' ? '!' : '✓'}</span>
                      <span className="min-w-0 flex-1">{c.question}</span>
                      <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">
                        {s.state === 'open' ? 'Not answered' : s.state === 'byHand' ? 'Fixed by hand' : s.state === 'needsHand' ? `${s.answer}: still needs a fix by hand` : s.answer}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {tab === 'flags' && (
        <div className="border-t border-slate-200 p-3 dark:border-slate-700">
          <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">Things about the drawing the model noticed. They are observations, not corrections. Click one to see it on the picture.</p>
          {flagGroups.length === 0 ? <p className="text-sm text-slate-500 dark:text-slate-400">None.</p> : (
            <div className="grid gap-x-6 gap-y-1 lg:grid-cols-2">
              {flagGroups.map(([type, list]) => (
                <details key={type} className="group rounded-lg">
                  <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
                    <span className="text-slate-400 transition-transform group-open:rotate-90">›</span>
                    <span className="flex-1 font-medium">{type.replace(' (question)', '')}</span>
                    {pill(String(list.length))}
                  </summary>
                  <ul className="mb-2 ml-6 mt-1 space-y-1.5 border-l border-slate-200 pl-3 dark:border-slate-700">
                    {list.map((f, i) => (
                      <li key={i}>
                        <button className="w-full rounded px-1 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800" onMouseEnter={() => onHover(f.on)} onMouseLeave={() => onHover(null)} onClick={() => onShow(f.on)}>
                          <span className="font-medium">{nameOf(base, f.on)}</span>
                          {f.asWritten && f.suggestion && <span className="text-slate-500 dark:text-slate-400"> · written "{f.asWritten}", perhaps "{f.suggestion}"</span>}
                          <span className="block text-xs text-slate-500 dark:text-slate-400">{f.basis}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'about' && (
        <div className="border-t border-slate-200 p-3 text-sm dark:border-slate-700">
          <dl className="grid gap-x-8 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {facts.map(([k, v]) => <div key={k}><dt className="text-xs text-slate-500 dark:text-slate-400">{k}</dt><dd>{v}</dd></div>)}
          </dl>
          {base.structure && <p className="mt-3 text-slate-600 dark:text-slate-300"><span className="text-xs text-slate-500 dark:text-slate-400">How the model describes the figure: </span>{base.structure}</p>}
          {problems.length > 0 && (
            <div className="mt-3 rounded-lg bg-amber-50 p-2.5 dark:bg-amber-950/40">
              <div className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">Could not be placed or used</div>
              <ul className="mt-1 list-disc pl-5 text-amber-900 dark:text-amber-100">{problems.map((p, i) => <li key={i}>{p}</li>)}</ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
