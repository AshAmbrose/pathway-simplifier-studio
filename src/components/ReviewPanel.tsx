/**
 * Everything that isn't the picture, in one quiet panel under it: the questions, the flags, and facts about the run.
 * One tab at a time, closed until asked for, so the two views stay the focus.
 */
import { useState, type ReactNode } from 'react';
import type { RunRecord } from '../api.ts';
import { cleanText, nameOf } from '../edit/describe.ts';
import type { Extraction } from '../types/extraction.ts';
import { AlertTriangle, Check, ChevronRight } from 'lucide-react';
import { ICON, meta, warnNote } from './ui.ts';

export interface QuestionStatus { state: 'open' | 'done' | 'byHand' | 'needsHand'; answer: string | null }
type Tab = 'questions' | 'flags' | 'about';

const dot: Record<QuestionStatus['state'], string> = {
  open: 'bg-accent text-on-ink', done: 'bg-ok text-on-ink', byHand: 'bg-ok text-on-ink', needsHand: 'bg-warn-ink text-on-ink',
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
      className={`-mb-px flex items-center gap-2 border-b-2 px-3 pb-2 pt-2.5 text-body ${tab === t ? 'border-accent font-semibold text-ink' : 'border-transparent text-ink-2 hover:text-ink'}`}>
      {label}{badge}
    </button>
  );
  const pill = (text: string, tone: 'plain' | 'warn' | 'good' = 'plain') => (
    <span className={`num rounded px-1.5 text-meta ${tone === 'warn' ? 'bg-accent-wash text-accent-ink' : tone === 'good' ? 'bg-ok-wash text-ok' : 'bg-sunk text-ink-2'}`}>{text}</span>
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
    <div className="mt-4">
      <div className="flex flex-wrap items-end border-b border-line">
        {tabBtn('questions', 'Questions', base.clarify.length === 0 ? pill('0') : open ? pill(`${open} open`, 'warn') : pill('all answered', 'good'))}
        {tabBtn('flags', 'Flags', pill(String(base.flags.length)))}
        {tabBtn('about', 'About this run', problems.length ? pill(`${problems.length} note${problems.length === 1 ? '' : 's'}`, 'warn') : null)}
      </div>

      {tab === 'questions' && (
        <div className="py-3">
          {base.clarify.length === 0 ? <p className={meta}>The model had no questions about this figure.</p> : (
            <ul className="divide-y divide-line">
              {base.clarify.map((c, i) => {
                const s = statuses[i];
                return (
                  <li key={i}>
                    <button className="flex w-full items-center gap-3 rounded px-2 py-2 text-left text-body hover:bg-sunk" onClick={() => onOpenQuestion(i)}>
                      <span className={`num grid h-6 w-6 shrink-0 place-items-center rounded-full text-meta font-semibold ${dot[s.state]}`}>{s.state === 'open' ? i + 1 : s.state === 'needsHand' ? <AlertTriangle size={12} aria-label="needs a fix by hand" /> : <Check size={13} strokeWidth={2.5} aria-label="answered" />}</span>
                      <span className="min-w-0 flex-1">{cleanText(base, c.question)}</span>
                      <span className={`${meta} shrink-0`}>
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
        <div className="py-3">
          <p className={`${meta} mb-2`}>Things about the drawing the model noticed. They are observations, not corrections. Click one to see it on the picture.</p>
          {flagGroups.length === 0 ? <p className={meta}>None.</p> : (
            <div className="grid gap-x-6 gap-y-1 lg:grid-cols-2">
              {flagGroups.map(([type, list]) => (
                <details key={type} className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-2 rounded px-2 py-1.5 text-body hover:bg-sunk">
                    <ChevronRight size={ICON} className="text-ink-3 transition-transform group-open:rotate-90" />
                    <span className="flex-1 text-ink">{type.replace(' (question)', '')}</span>
                    {pill(String(list.length))}
                  </summary>
                  <ul className="mb-2 ml-6 mt-1 space-y-1.5 border-l border-line pl-3">
                    {list.map((f, i) => (
                      <li key={i}>
                        <button className="w-full rounded px-1 text-left text-body hover:bg-sunk" onMouseEnter={() => onHover(f.on)} onMouseLeave={() => onHover(null)} onClick={() => onShow(f.on)}>
                          <span className="font-medium text-ink">{nameOf(base, f.on)}</span>
                          {f.asWritten && f.suggestion && <span className="text-ink-3"> · written "{f.asWritten}", perhaps "{f.suggestion}"</span>}
                          <span className={`${meta} block`}>{cleanText(base, f.basis)}</span>
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
        <div className="py-3 text-body">
          <dl className="grid gap-x-8 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {facts.map(([k, v]) => <div key={k}><dt className={meta}>{k}</dt><dd className="num text-ink">{v}</dd></div>)}
          </dl>
          {base.structure && <p className="mt-3 text-ink-2"><span className={meta}>How the model describes the figure: </span>{base.structure}</p>}
          {problems.length > 0 && (
            <div className={`${warnNote} mt-3`}>
              <div className="font-semibold">Could not be placed or used</div>
              <ul className="mt-1 list-disc pl-5 text-warn-ink">{problems.map((p, i) => <li key={i}>{p}</li>)}</ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
