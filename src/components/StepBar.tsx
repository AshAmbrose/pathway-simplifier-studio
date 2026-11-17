/**
 * The whole journey across the top, in its fixed order: Check (answer the model's questions, fix and add what it
 * missed), then the five simplification steps. All six are always shown; the step before, the current one and
 * the step after are full size (the current one highlighted), the rest small and muted. Each simplification step
 * shows whether it is done or skipped. The controls move along it.
 */
import { STEPS, type StepId } from '../types/extraction.ts';

export type JourneyStep = 'check' | StepId;
export const JOURNEY: JourneyStep[] = ['check', ...STEPS];

export const STEP_INFO: Record<JourneyStep, { n: string; name: string; what: string }> = {
  check: { n: '', name: 'Check', what: "Answer the model's questions, and fix or add anything it got wrong." },
  issues: { n: '①', name: 'Issues', what: 'Typos, unlabelled parts, and colour or styling that carries meaning.' },
  focus: { n: '②', name: 'Focus', what: 'What do you want to show? Choose the routes to keep.' },
  repeats: { n: '③', name: 'Repeats', what: 'One copy of each plain repeat.' },
  clusters: { n: '④', name: 'Clusters', what: 'Collapse the clusters you choose into one shape.' },
  layout: { n: '⑤', name: 'Layout', what: 'Compact the figure, tidy it as drawn, or redraw it as a cell.' },
};
export const stepTitle = (s: JourneyStep) => `${STEP_INFO[s].n ? STEP_INFO[s].n + ' ' : ''}${STEP_INFO[s].name}`;

const btn = 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-40 dark:border-slate-600 dark:bg-slate-900 dark:hover:bg-slate-800';

export function StepBar({ current, status, choices, note, onJump, onBack, onSkip, onNext, onReset }: {
  current: JourneyStep;
  status: Partial<Record<StepId, 'done' | 'skipped'>>;
  /** How many choices the current step holds (Skip and Reset undo them). Not used on Check. */
  choices: number;
  /** A short line beside the controls (e.g. "2 questions still open"). */
  note?: string | null;
  onJump: (s: JourneyStep) => void; onNext: () => void;
  onBack?: () => void; onSkip?: () => void; onReset?: () => void;
}) {
  const at = JOURNEY.indexOf(current);
  const checking = current === 'check';
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <ol className="flex flex-1 flex-wrap items-center gap-1" aria-label="Steps">
        {JOURNEY.map((s, i) => {
          const near = Math.abs(i - at) <= 1, here = i === at, st = s === 'check' ? undefined : status[s];
          const look = here ? 'bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm'
            : near ? 'px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800'
              : 'px-2 py-1 text-xs text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300';
          return (
            <li key={s} className="flex items-center gap-1">
              {i > 0 && <span className="text-slate-300 dark:text-slate-600" aria-hidden>›</span>}
              <button className={`rounded-lg ${look}`} aria-current={here ? 'step' : undefined} onClick={() => onJump(s)}
                title={`${STEP_INFO[s].name}: ${STEP_INFO[s].what}${st ? ` (${st})` : ''}`}>
                {stepTitle(s)}
                {st === 'done' && <span className={here ? 'ml-1' : 'ml-1 text-green-600 dark:text-green-400'} aria-label="done">✓</span>}
                {st === 'skipped' && <span className="ml-1 font-normal italic opacity-80">skipped</span>}
              </button>
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap items-center gap-1.5">
        {note && <span className="mr-1 text-sm text-amber-700 dark:text-amber-300">{note}</span>}
        {!checking && <button className={btn} onClick={onBack}>← Back</button>}
        {!checking && <button className="px-2 text-xs text-slate-500 underline hover:text-slate-800 disabled:opacity-40 dark:text-slate-400 dark:hover:text-slate-200" disabled={choices === 0 && !status[current as StepId]} onClick={onReset}>Reset this step</button>}
        {!checking && <button className={btn} onClick={onSkip} title={choices ? 'Skip this step and undo its choices' : 'Skip this step'}>{choices ? `Skip (undo ${choices})` : 'Skip'}</button>}
        <button className="rounded-lg bg-blue-600 px-3.5 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700" onClick={onNext}>
          {checking ? 'Continue to simplify →' : at === JOURNEY.length - 1 ? 'Finish ✓' : 'Next →'}
        </button>
      </div>
    </div>
  );
}
