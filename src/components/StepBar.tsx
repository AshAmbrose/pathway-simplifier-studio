/**
 * The whole journey across the top, in its fixed order: Check (answer the model's questions, fix and add what it
 * missed), then the five simplification steps. A rail of numbered steps: the current one in ink with an orange
 * underline, done steps with a drawn tick, skipped ones marked in words. The controls sit at its right.
 */
import { ArrowLeft, ArrowRight, Check as Tick } from 'lucide-react';
import { STEPS, type StepId } from '../types/extraction.ts';
import { button, ICON, primary, quiet } from './ui.ts';

export type JourneyStep = 'check' | StepId;
export const JOURNEY: JourneyStep[] = ['check', ...STEPS];

export const STEP_INFO: Record<JourneyStep, { n: string; name: string; what: string }> = {
  check: { n: '', name: 'Check', what: "Answer the model's questions, and fix or add anything it got wrong." },
  issues: { n: '1', name: 'Issues', what: 'Typos, unlabelled parts, and colour or styling that carries meaning.' },
  focus: { n: '2', name: 'Focus', what: 'What do you want to show? Choose the routes to keep.' },
  repeats: { n: '3', name: 'Repeats', what: 'One copy of each plain repeat.' },
  clusters: { n: '4', name: 'Clusters', what: 'Collapse the clusters you choose into one shape.' },
  layout: { n: '5', name: 'Layout', what: 'Compact the figure, tidy it as drawn, or redraw it as a cell.' },
};
/** "Check", or with its number where the order matters: "Step 5: Layout". */
export const stepTitle = (s: JourneyStep) => (STEP_INFO[s].n ? `Step ${STEP_INFO[s].n}: ${STEP_INFO[s].name}` : STEP_INFO[s].name);

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
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-line">
      <ol className="flex flex-wrap items-end" aria-label="Steps">
        {JOURNEY.map((s) => {
          const here = s === current, st = s === 'check' ? undefined : status[s];
          return (
            <li key={s}>
              <button aria-current={here ? 'step' : undefined} onClick={() => onJump(s)}
                title={`${STEP_INFO[s].name}: ${STEP_INFO[s].what}${st ? ` (${st})` : ''}`}
                className={`-mb-px flex items-center gap-2 border-b-2 px-3 pb-2.5 pt-1 text-body ${here ? 'border-accent font-semibold text-ink' : 'border-transparent text-ink-2 hover:border-line-2 hover:text-ink'}`}>
                {STEP_INFO[s].n && <span className={`num text-meta ${here ? 'text-ink' : 'text-ink-3'}`}>{STEP_INFO[s].n}</span>}
                {STEP_INFO[s].name}
                {st === 'done' && <Tick size={13} strokeWidth={2.5} className="text-ok" aria-label="done" />}
                {st === 'skipped' && <span className="text-meta text-ink-3">skipped</span>}
              </button>
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap items-center gap-2 pb-2">
        {note && <span className="text-body text-warn-ink">{note}</span>}
        {!checking && (
          <button className={quiet} disabled={choices === 0 && !status[current as StepId]} onClick={onReset}>Reset this step</button>
        )}
        {!checking && (
          <button className={button} onClick={onSkip} title={choices ? 'Skip this step and undo its choices' : 'Skip this step'}>
            {choices ? <>Skip <span className="num text-ink-3">(undoes {choices})</span></> : 'Skip'}
          </button>
        )}
        {!checking && <button className={button} onClick={onBack}><ArrowLeft size={ICON} />Back</button>}
        <button className={primary} onClick={onNext}>
          {checking ? <>Continue to simplify<ArrowRight size={ICON} /></> : at === JOURNEY.length - 1 ? <>Finish<Tick size={ICON} /></> : <>Next<ArrowRight size={ICON} /></>}
        </button>
      </div>
    </div>
  );
}
