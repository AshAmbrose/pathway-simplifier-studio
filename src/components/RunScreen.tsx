/**
 * One run, as one linear journey shown in the step bar:
 *  - Check: the original beside the reconstruction; answer the questions, fix and add (ReviewScreen).
 *    "Continue to simplify →" moves on.
 *  - ① Issues … ⑤ Layout: the simplification steps, each shown before → after (SimplifyScreen).
 * Every step edits one change list, held here and saved here, so moving back and forth never loses anything.
 * Where you are is kept in the address (?step=focus), so a reload comes back to it.
 */
import { ArrowLeft } from 'lucide-react';
import { button, ICON } from './ui.ts';
import { useEffect, useRef, useState } from 'react';
import { saveReview, type RunRecord } from '../api.ts';
import { EMPTY_REVIEW, STEPS, type Review, type StepId } from '../types/extraction.ts';
import { ReviewScreen } from './ReviewScreen.tsx';
import { SimplifyScreen } from './SimplifyScreen.tsx';
import { StepBar, type JourneyStep } from './StepBar.tsx';

const chip = button;

function stepParam(): JourneyStep {
  const s = new URL(location.href).searchParams.get('step');
  return s && (STEPS as readonly string[]).includes(s) ? (s as StepId) : 'check';
}

export function RunScreen({ run, imageUrl, onBack }: { run: RunRecord; imageUrl: string; onBack: () => void }) {
  const [review, setReview] = useState<Review>(run.review ?? EMPTY_REVIEW);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [reloaded, setReloaded] = useState(false);
  const [step, setStepState] = useState<JourneyStep>(stepParam);
  const setStep = (s: JourneyStep) => {
    setStepState(s);
    const u = new URL(location.href);
    if (s === 'check') u.searchParams.delete('step'); else u.searchParams.set('step', s);
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
      <button className={chip} onClick={() => { setStep('check'); onBack(); }}><ArrowLeft size={ICON} />All figures</button>
      <h1 className="text-page font-semibold text-ink">{run.name}</h1>
    </>
  );
  // From Check, "Continue" goes to the first simplification step not yet done or skipped.
  const status = review.simplify?.steps ?? {};
  const firstOpen = STEPS.find((k) => !status[k]) ?? 'issues';
  const checkBar = (
    <StepBar current="check" status={status} choices={0} onJump={setStep} onNext={() => setStep(firstOpen)}
      note={openQuestions ? `${openQuestions} question${openQuestions === 1 ? '' : 's'} still open (you can come back to ${openQuestions === 1 ? 'it' : 'them'})` : null} />
  );
  const notices = (
    <>
      {saveError && <div className="mb-2 rounded bg-warn-wash px-3 py-1.5 text-body text-bad">Your last change was not saved: {saveError}</div>}
      {reloaded && (
        <div className="mb-2 flex items-center justify-between rounded bg-warn-wash px-3 py-1.5 text-body text-warn-ink">
          <span>This run was changed somewhere else (another tab, or an older copy of this page). The newer changes are now shown, and your last change was not applied over them.</span>
          <button className="ml-3 shrink-0 underline" onClick={() => setReloaded(false)}>OK</button>
        </div>
      )}
    </>
  );

  return step === 'check'
    ? <ReviewScreen run={run} imageUrl={imageUrl} review={review} setReview={setReview} top={top} notices={<>{notices}<div className="mb-3">{checkBar}</div></>} />
    : <SimplifyScreen run={run} imageUrl={imageUrl} review={review} setReview={setReview} top={top} notices={notices} openQuestions={openQuestions}
        step={step} onStep={setStep} />;
}
