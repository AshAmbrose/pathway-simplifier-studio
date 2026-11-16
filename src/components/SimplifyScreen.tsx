/**
 * The simplification steps, after Check: five steps in a fixed order (Issues, Focus, Repeats, Clusters, Layout), each skippable.
 *
 *  - Left view: the figure after every earlier step (and every correction). Right view: the same with this
 *    step's choices applied, with whatever it leaves out drawn faintly so it can be clicked back in.
 *    Zoom and pan are shared; hovering a choice outlines what it affects on both views.
 *  - The original figure opens in a small floating window.
 *  - Every choice is a change in the run's one change list, tagged with its step, applied after the corrections
 *    in step order, listed in plain words and undoable. A choice that no longer applies (say, its shape was
 *    removed in Check) is reported in its step, never dropped silently.
 *  - Steps 3–5 arrive in later updates; for now they can only be skipped.
 *  - Which step is open is held by RunScreen, so the step bar here and on Check is one journey.
 */
import { useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import type { RunRecord } from '../api.ts';
import { applyEdits } from '../edit/applyEdits.ts';
import { describeEdit, nameOf } from '../edit/describe.ts';
import { inOrder, newKey, stepOf, stepSource } from '../edit/order.ts';
import type { BoxPx } from '../render/edgePorts.ts';
import { boxOf, toScene, union, type Scene } from '../render/toScene.ts';
import { findIssues, type Issue } from '../simplify/issues.ts';
import { focusHidden, items, setItem, toggleShape, traceRoutes } from '../simplify/routes.ts';
import { EMPTY_SIMPLIFY, STEPS, type AppliedEdit, type Edit, type Review, type Simplify, type StepId } from '../types/extraction.ts';
import { FloatingOriginal } from './FloatingOriginal.tsx';
import { PairedViewer, type ViewerHandle } from './PairedViewer.tsx';
import { MarkerDefs, SceneSvg, type Mark, type SceneUi } from './SceneSvg.tsx';
import { STEP_INFO, StepBar, stepTitle, type JourneyStep } from './StepBar.tsx';
import { FocusStep } from './steps/FocusStep.tsx';
import { IssuesStep } from './steps/IssuesStep.tsx';

const chip = 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:hover:bg-slate-800';
const BUILT: StepId[] = ['issues', 'focus'];
const noop = () => {};

/** What resetting a step clears from the step record (its changes are cleared separately). */
const RESET: Partial<Record<StepId, (s: Simplify) => Simplify>> = {
  issues: (s) => ({ ...s, issues: {} }),
  focus: (s) => ({ ...s, focus: EMPTY_SIMPLIFY.focus }),
};

/** The figure after a step, with what that step left out added back underneath, to be drawn faintly. */
function withGhosts(after: Scene, before: Scene): { scene: Scene; ghosts: Set<string> } {
  const has = new Set([...after.nodes, ...after.groups, ...after.arrows].map((v) => v.id));
  const gn = before.nodes.filter((v) => !has.has(v.id)), gg = before.groups.filter((v) => !has.has(v.id)), ga = before.arrows.filter((v) => !has.has(v.id));
  return {
    scene: { ...after, nodes: [...gn, ...after.nodes], groups: [...gg, ...after.groups], arrows: [...ga, ...after.arrows] },
    ghosts: new Set([...gn, ...gg, ...ga].map((v) => v.id)),
  };
}

export function SimplifyScreen({ run, imageUrl, review, setReview, top, notices, openQuestions, step, onStep }: {
  run: RunRecord; imageUrl: string;
  review: Review; setReview: Dispatch<SetStateAction<Review>>;
  top: ReactNode; notices: ReactNode;
  /** Questions not yet answered in Check: said, but not blocking. */
  openQuestions: number;
  /** The open step, and moving to another (including back to Check). */
  step: StepId; onStep: (s: JourneyStep) => void;
}) {
  const backToCheck = () => onStep('check');
  const base = run.extraction;
  const W = run.image.width, H = run.image.height;
  const s = review.simplify ?? EMPTY_SIMPLIFY;
  const [hoverIds, setHoverIds] = useState<string[] | null>(null);
  const [hot, setHot] = useState<string | null>(null);
  const [activeIssue, setActiveIssue] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [showChanges, setShowChanges] = useState(false);
  const viewer = useRef<ViewerHandle>(null);
  const changesBox = useRef<HTMLDivElement>(null);

  // Escape, or a click anywhere outside it, closes the change list; Escape also lets go of the highlighted issue.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setShowChanges(false); setActiveIssue(null); } };
    const onDown = (e: PointerEvent) => { if (changesBox.current && !changesBox.current.contains(e.target as Node)) setShowChanges(false); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('pointerdown', onDown); };
  }, []);

  // --- the figure at each point: corrections, then each step in order ---
  const ordered = useMemo(() => inOrder(review.edits), [review.edits]);
  const upTo = (k: number) => ordered.filter((e) => { const st = stepOf(e.source); return st === null || STEPS.indexOf(st) < k; });
  const at = STEPS.indexOf(step);
  const before = useMemo(() => applyEdits(base, upTo(at)), [base, ordered, at]); // eslint-disable-line react-hooks/exhaustive-deps
  const stepEdits = useMemo(() => ordered.filter((e) => stepOf(e.source) === step), [ordered, step]);
  const after = useMemo(() => applyEdits(before.extraction, stepEdits), [before, stepEdits]);
  const beforeScene = useMemo(() => toScene(before.extraction, W, H), [before, W, H]);
  const afterScene = useMemo(() => toScene(after.extraction, W, H), [after, W, H]);
  const right = useMemo(() => withGhosts(afterScene, beforeScene), [afterScene, beforeScene]);

  // Changes that can't be applied, from the whole list, by key: each is reported in its own step.
  const failed = useMemo(() => {
    const all = applyEdits(base, ordered);
    return new Map(all.failed.map((f) => [ordered[f.index].key, f.reason]));
  }, [base, ordered]);

  // The figure each built step starts from. Kept as strings of their inputs so they only change when an earlier step does.
  const issuesIn = JSON.stringify(upTo(0)), focusIn = JSON.stringify(upTo(1));
  const issueBase = useMemo(() => applyEdits(base, JSON.parse(issuesIn)).extraction, [base, issuesIn]);
  const focusBase = useMemo(() => applyEdits(base, JSON.parse(focusIn)).extraction, [base, focusIn]);
  const issues = useMemo(() => findIssues(issueBase), [issueBase]);
  const tracing = useMemo(() => traceRoutes(focusBase), [focusBase]);
  const hidden = useMemo(() => focusHidden(focusBase, tracing, s.focus), [focusBase, tracing, s.focus]);
  const names = useMemo(() => [...new Set([...issueBase.elements, ...issueBase.groups].map((v) => v.label).filter((l): l is string => !!l && l.length > 1))].sort((a, b) => a.localeCompare(b)), [issueBase]);

  // --- changing the step record and the step's changes ---
  const stamp = (k: StepId) => (e: Edit): AppliedEdit => ({ ...e, key: newKey(), source: stepSource(k), at: new Date().toISOString() });
  const setSimplify = (f: (v: Simplify) => Simplify) => setReview((r) => ({ ...r, simplify: f(r.simplify ?? EMPTY_SIMPLIFY) }));

  /** Step 1: settle an issue with a change, a decision, or neither (which reopens it). */
  const settleIssue = (i: Issue, edit: Edit | null, decision: Simplify['issues'][string] | null) => setReview((r) => {
    const sim = r.simplify ?? EMPTY_SIMPLIFY;
    const mine = (e: AppliedEdit) => stepOf(e.source) === 'issues' && e.id === i.id && i.kind !== 'meaning';
    const issuesRec = { ...sim.issues };
    delete issuesRec[i.key];
    if (decision) issuesRec[i.key] = decision;
    return { ...r, edits: [...r.edits.filter((e) => !mine(e)), ...(edit ? [stamp('issues')(edit)] : [])], simplify: { ...sim, issues: issuesRec } };
  });

  /** Step 2: new choices; its changes are rebuilt from them (an unchanged "left out" keeps its key). */
  const setFocus = (f: Simplify['focus']) => {
    const h = focusHidden(focusBase, tracing, f);
    setReview((r) => {
      const old = new Map(r.edits.filter((e) => stepOf(e.source) === 'focus').map((e) => [e.id, e]));
      const edits = [...h].map(([id, why]) => { const o = old.get(id); return o && o.value === why ? o : stamp('focus')({ op: 'hide', id, to: null, value: why }); });
      const sim = r.simplify ?? EMPTY_SIMPLIFY;
      return { ...r, edits: [...r.edits.filter((e) => stepOf(e.source) !== 'focus'), ...edits], simplify: { ...sim, focus: f } };
    });
  };

  /** Clears a step's changes and choices, and marks it as given (or forgets its mark). */
  const clearStep = (k: StepId, mark: 'skipped' | null) => setReview((r) => {
    const sim = (RESET[k] ?? ((v: Simplify) => v))(r.simplify ?? EMPTY_SIMPLIFY);
    const steps = { ...sim.steps };
    if (mark) steps[k] = mark; else delete steps[k];
    return { ...r, edits: r.edits.filter((e) => stepOf(e.source) !== k), simplify: { ...sim, steps } };
  });

  // Step 2's changes are rebuilt only when its choices change. If the figure under it changed since (a correction
  // in Check, a step 1 choice), they may no longer match: say so and offer to update, rather than change them unasked.
  const focusEdits = ordered.filter((e) => stepOf(e.source) === 'focus');
  const focusStale = focusEdits.length !== hidden.size || focusEdits.some((e) => hidden.get(e.id) !== e.value);

  const choices = step === 'issues' ? stepEdits.length + Object.keys(s.issues).length : step === 'focus' ? hidden.size : stepEdits.length;
  const go = (k: JourneyStep) => { onStep(k); setHoverIds(null); setActiveIssue(null); setShowChanges(false); };
  const next = () => {
    if (BUILT.includes(step)) setSimplify((v) => ({ ...v, steps: { ...v.steps, [step]: 'done' } }));
    if (at < STEPS.length - 1) go(STEPS[at + 1]);
  };

  /** Undo one change from the list. A "left out" from step 2 is undone by keeping that shape, so the step's choices stay true. */
  const undo = (e: AppliedEdit) => {
    if (stepOf(e.source) === 'focus') setFocus(toggleShape(s.focus, tracing, e.id, false));
    else setReview((r) => ({ ...r, edits: r.edits.filter((v) => v.key !== e.key) }));
  };

  // --- on the pictures ---
  const show = (ids: string[]) => {
    const boxes = ids.map((id) => boxOf(right.scene, id)).filter((b): b is BoxPx => !!b);
    if (boxes.length) viewer.current?.focus(union(boxes, 0), { fill: 0.5, anchorX: 0.5 });
  };
  /** A click on a shape: in step 1, open its issue; in step 2, add it or drop it. */
  const select = (id: string) => {
    if (step === 'issues') {
      const i = issues.find((v) => v.id === id);
      if (!i) return;
      setActiveIssue(i.key);
      document.querySelector(`[data-issue="${CSS.escape(i.key)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } else if (step === 'focus') {
      const target = focusBase.elements.some((v) => v.id === id) ? id : focusBase.groups.find((g) => g.id === id)?.members[0];
      if (target) setFocus(toggleShape(s.focus, tracing, target, !hidden.has(target)));
    }
  };
  const marks = new Map<string, Mark>();
  const activeId = issues.find((i) => i.key === activeIssue)?.id;
  if (step === 'issues' && activeId) marks.set(activeId, 'about');
  for (const id of hoverIds ?? []) marks.set(id, 'hover');
  const ui = (unit: number, faded?: Set<string>): SceneUi => ({
    unit, hot, onHover: setHot, marks, selected: null, touched: new Set(), pins: [], quiet: false, picking: false, editable: false,
    drawing: false, placing: false, onPlace: noop, onNewArrow: noop, onSelect: select, onPin: noop, onMoveBadge: noop,
    onArrowEnd: noop, onArrowEndFree: noop, onMoveNode: noop, faded,
  });
  const hint = hot ? (() => {
    const name = after.extraction.elements.some((v) => v.id === hot) || after.extraction.arrows.some((v) => v.id === hot) ? nameOf(after.extraction, hot) : nameOf(before.extraction, hot);
    if (step !== 'focus' || !focusBase.elements.some((v) => v.id === hot)) return name;
    return `${name} · ${hidden.has(hot) ? 'left out: click to bring it back' : 'click to leave it out'}`;
  })() : null;

  // --- the change list, in plain words, grouped by step ---
  const described = useMemo(() => {
    let cur = base;
    return ordered.map((e) => { const text = describeEdit(cur, e); cur = applyEdits(cur, [e]).extraction; return { e, text }; });
  }, [base, ordered]);
  const corrections = described.filter((d) => stepOf(d.e.source) === null).length;
  const simplifications = described.length - corrections;
  const stepFailures = stepEdits.filter((e) => failed.has(e.key));
  const afterIds = new Set(after.extraction.arrows.map((a) => a.id));
  const arrowsLeftOut = step === 'focus' ? before.extraction.arrows.filter((a) => !afterIds.has(a.id)).length : 0;
  const info = STEP_INFO[step];

  return (
    <div className="mx-auto max-w-[1800px] px-5 py-4">
      <header className="mb-3 flex flex-wrap items-center gap-3">
        {top}
        <span className="flex-1" />
        <button className={chip} aria-pressed={showOriginal} onClick={() => setShowOriginal((v) => !v)}>{showOriginal ? 'Hide original' : 'Original'}</button>
        <div className="relative" ref={changesBox}>
          <button className={chip} onClick={() => setShowChanges((v) => !v)}>{simplifications} change{simplifications === 1 ? '' : 's'} ▾</button>
          {showChanges && (
            <div className="absolute right-0 z-20 mt-1 max-h-[60vh] w-96 overflow-y-auto rounded-xl border border-slate-300 bg-white p-3 text-sm shadow-xl dark:border-slate-600 dark:bg-slate-800">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Built on {corrections} correction{corrections === 1 ? '' : 's'} made in Check. <button className="underline" onClick={backToCheck}>Back to Check</button>
              </p>
              {simplifications === 0 && <p className="mt-2 text-slate-500 dark:text-slate-400">No simplifications yet. The figure is exactly the corrected reconstruction.</p>}
              {STEPS.map((k) => {
                const list = described.filter((d) => stepOf(d.e.source) === k);
                if (!list.length) return null;
                return (
                  <section key={k} className="mt-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{stepTitle(k)}</h3>
                    <ul className="mt-1 space-y-1">
                      {list.map(({ e, text }) => (
                        <li key={e.key} className="flex items-start justify-between gap-2 rounded-lg border border-slate-200 p-2 dark:border-slate-700"
                          onMouseEnter={() => setHoverIds([e.id])} onMouseLeave={() => setHoverIds(null)}>
                          <div>
                            <div className={failed.has(e.key) ? 'text-slate-400 line-through' : ''}>{text}</div>
                            {failed.has(e.key) && <div className="text-xs text-slate-500 dark:text-slate-400">could not be applied: {failed.get(e.key)}</div>}
                          </div>
                          <button className="shrink-0 text-xs underline" onClick={() => undo(e)}>Undo</button>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </header>
      {notices}
      {openQuestions > 0 && (
        <div className="mb-2 flex items-center justify-between rounded-lg bg-amber-50 px-3 py-1.5 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          <span>{openQuestions} question{openQuestions === 1 ? ' is' : 's are'} still open in Check. You can carry on: answers given there will show up here.</span>
          <button className="ml-3 shrink-0 underline" onClick={backToCheck}>Back to Check</button>
        </div>
      )}

      <StepBar current={step} status={s.steps} choices={choices} onJump={go} onBack={() => go(at > 0 ? STEPS[at - 1] : 'check')}
        onSkip={() => { clearStep(step, 'skipped'); if (at < STEPS.length - 1) go(STEPS[at + 1]); }} onNext={next} onReset={() => clearStep(step, null)} />

      <div className="mt-3 flex flex-col gap-4 lg:flex-row">
        <aside className="w-full shrink-0 lg:max-h-[78vh] lg:w-[340px] lg:overflow-y-auto lg:pr-1">
          <h2 className="text-base font-semibold">{stepTitle(step)}</h2>
          <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">{info.what}</p>
          {stepFailures.length > 0 && (
            <div className="mb-3 rounded-lg bg-amber-50 p-2.5 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
              {stepFailures.length} choice{stepFailures.length === 1 ? '' : 's'} in this step no longer appl{stepFailures.length === 1 ? 'ies' : 'y'}, usually because something changed in Check:
              <ul className="mt-1 list-disc pl-5">{stepFailures.map((e) => <li key={e.key}>{described.find((d) => d.e.key === e.key)?.text}: {failed.get(e.key)}</li>)}</ul>
            </div>
          )}
          {step === 'issues' && (
            <IssuesStep x={before.extraction} issues={issues} edits={stepEdits} decisions={s.issues} names={names} active={activeIssue}
              onSettle={settleIssue} onHover={setHoverIds} onShow={(id) => show([id])} />
          )}
          {step === 'focus' && focusStale && (
            <div className="mb-3 rounded-lg bg-amber-50 p-2.5 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
              The figure changed since these choices were made (in Check, or in an earlier step). They now leave out {hidden.size} shape{hidden.size === 1 ? '' : 's'}; the picture still shows the {focusEdits.length} left out before.
              <button className="ml-1 font-semibold underline" onClick={() => setFocus(s.focus)}>Update</button>
            </div>
          )}
          {step === 'focus' && (
            <FocusStep x={before.extraction} tracing={tracing} focus={s.focus} hidden={hidden} arrowsLeftOut={arrowsLeftOut}
              onItem={(key, on) => setFocus(setItem(s.focus, tracing, key, on))}
              onOnly={(key) => setFocus({ off: items(tracing).map((i) => i.key).filter((k) => k !== key), keep: [], drop: [] })}
              onAll={() => setFocus(EMPTY_SIMPLIFY.focus)}
              onRestore={(id) => setFocus(toggleShape(s.focus, tracing, id, false))}
              onHover={setHoverIds} onShow={show} />
          )}
          {!BUILT.includes(step) && <p className="text-sm text-slate-600 dark:text-slate-300">This step comes in a later update. Skip it, or press Next: nothing changes.</p>}
        </aside>
        <div className="min-w-0 flex-1">
          <PairedViewer
            ref={viewer}
            width={W}
            height={H}
            leftTitle="Before this step"
            rightTitle={`After ${stepTitle(step)}`}
            hint={hint}
            help={step === 'focus' ? 'Scroll to zoom · drag to pan · click a shape to leave it out or bring it back' : 'Scroll to zoom · drag to pan · faded = left out by this step'}
            left={(unit) => <><MarkerDefs /><SceneSvg scene={beforeScene} ui={ui(unit)} /></>}
            right={(unit) => <><MarkerDefs /><SceneSvg scene={right.scene} ui={ui(unit, right.ghosts)} /></>}
          />
        </div>
      </div>
      {showOriginal && <FloatingOriginal src={imageUrl} onClose={() => setShowOriginal(false)} />}
    </div>
  );
}
