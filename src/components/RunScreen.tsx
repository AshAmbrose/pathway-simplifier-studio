/**
 * One run, in two stages, switched in the header:
 *  - Current: the original beside the reconstruction, with questions, fixes and additions (ReviewScreen);
 *  - Simplified: the five simplification steps, each shown before → after (SimplifyScreen).
 * Both edit one change list, held here and saved here, so switching never loses or overwrites anything.
 * The stage is kept in the address (?stage=simplified), so a reload comes back to it.
 */
import { useEffect, useRef, useState } from 'react';
import { saveReview, type RunRecord } from '../api.ts';
import { EMPTY_REVIEW, type Review } from '../types/extraction.ts';
import { ReviewScreen } from './ReviewScreen.tsx';
import { SimplifyScreen } from './SimplifyScreen.tsx';

export type Stage = 'current' | 'simplified';
export const chip = 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:hover:bg-slate-800';

function stageParam(): Stage {
  return new URL(location.href).searchParams.get('stage') === 'simplified' ? 'simplified' : 'current';
}

export function RunScreen({ run, imageUrl, onBack }: { run: RunRecord; imageUrl: string; onBack: () => void }) {
  const [review, setReview] = useState<Review>(run.review ?? EMPTY_REVIEW);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [reloaded, setReloaded] = useState(false);
  const [stage, setStageState] = useState<Stage>(stageParam);
  const setStage = (s: Stage) => {
    setStageState(s);
    const u = new URL(location.href);
    if (s === 'simplified') u.searchParams.set('stage', s); else u.searchParams.delete('stage');
    history.replaceState(null, '', u);
  };

  // Save after every real change. Three guards so newer work is never overwritten:
  //  - only a review that differs from the last one saved (or loaded) is sent, so a re-run of this effect
  //    (a code reload while developing, React re-running effects) never saves anything by itself;
  //  - each save names the version it was built on, and the server refuses it if the run moved on since;
  //  - when refused, the screen takes the newer copy and says so, instead of overwriting it.
  const version = useRef(run.reviewVersion ?? 0);
  const lastSaved = useRef(JSON.stringify(run.review ?? EMPTY_REVIEW));
  useEffect(() => {
    const json = JSON.stringify(review);
    if (json === lastSaved.current) return;
    saveReview(run.id, review, version.current).then((r) => {
      if (r.kind === 'saved') { version.current = r.version; lastSaved.current = json; setSaveError(null); return; }
      version.current = r.version;
      lastSaved.current = JSON.stringify(r.review);
      setReview(r.review);
      setReloaded(true);
    }).catch((e) => setSaveError((e as Error).message));
  }, [review, run.id]);

  const openQuestions = run.extraction.clarify.filter((_, i) => review.answers[String(i)] === undefined).length;

  const top = (
    <>
      <button className={chip} onClick={() => { setStage('current'); onBack(); }}>← Back</button>
      <h1 className="text-lg font-semibold tracking-tight">{run.name}</h1>
      <div className="flex items-center gap-0.5 rounded-lg bg-slate-200 p-0.5 dark:bg-slate-800" role="group" aria-label="Stage">
        {([['current', 'Current', 'The reconstruction, checked against the original'], ['simplified', 'Simplified', 'Simplify the figure, step by step']] as const).map(([s, label, title]) => (
          <button key={s} title={title} aria-pressed={stage === s} onClick={() => setStage(s)}
            className={`rounded-md px-3 py-1 text-sm font-medium ${stage === s ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-600 dark:text-white' : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'}`}>{label}</button>
        ))}
      </div>
    </>
  );
  const notices = (
    <>
      {saveError && <div className="mb-2 rounded-lg bg-red-50 px-3 py-1.5 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">Your last change was not saved: {saveError}</div>}
      {reloaded && (
        <div className="mb-2 flex items-center justify-between rounded-lg bg-amber-50 px-3 py-1.5 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          <span>This run was changed somewhere else (another tab, or an older copy of this page). The newer changes are now shown, and your last change was not applied over them.</span>
          <button className="ml-3 shrink-0 underline" onClick={() => setReloaded(false)}>OK</button>
        </div>
      )}
    </>
  );

  return stage === 'current'
    ? <ReviewScreen run={run} imageUrl={imageUrl} review={review} setReview={setReview} top={top} notices={notices} />
    : <SimplifyScreen run={run} imageUrl={imageUrl} review={review} setReview={setReview} top={top} notices={notices} openQuestions={openQuestions} onOpenCurrent={() => setStage('current')} />;
}
