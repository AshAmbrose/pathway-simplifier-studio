/**
 * Side by side: the uploaded image and the reconstruction, aligned, with the review on the canvas.
 *
 *  - The model's questions are numbered pins on both views. Opening one moves both views to the shapes it
 *    concerns and offers the answers beside them. Choosing an answer always moves on to the next question.
 *  - Clicking any shape or arrow opens a small form to fix it. Dragging is a shortcut for the same fixes.
 *  - The extraction is never altered. Each answer or fix adds to a list of changes saved with the run;
 *    what is drawn is the extraction with that list applied, and any change can be undone.
 *  - Everything else (question list, flags, run details) sits in one closed panel under the picture.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { saveReview, type RunRecord } from '../api.ts';
import { applyEdits, optionState } from '../edit/applyEdits.ts';
import { describeEdit, nameOf, regionName } from '../edit/describe.ts';
import type { BoxPx } from '../render/edgePorts.ts';
import { anchorOf, boxOf, nearest, regionAt, toScene, union } from '../render/toScene.ts';
import { EMPTY_REVIEW, type AppliedEdit, type Edit, type Review } from '../types/extraction.ts';
import { CheckPopover } from './CheckPopover.tsx';
import { EditPopover, type PickRequest } from './EditPopover.tsx';
import { PairedViewer, type ViewerHandle } from './PairedViewer.tsx';
import { Popover } from './Popover.tsx';
import { QuestionPopover, type Choice } from './QuestionPopover.tsx';
import { ReviewPanel, type QuestionStatus } from './ReviewPanel.tsx';
import { ImageLayer, MarkerDefs, SceneSvg, type Mark, type Pin, type SceneUi } from './SceneSvg.tsx';

type Active = { kind: 'q'; i: number } | { kind: 'sel'; id: string } | null;
/** An arrow end waiting for the "there is no shape here" check, in picture coordinates. */
interface FreeEnd { arrow: string; end: 'from' | 'to'; x: number; y: number }

let counter = 0;
const newKey = () => `${Date.now().toString(36)}${(counter++).toString(36)}`;
const src = (i: number) => `q${i}`;
/**
 * The order changes are applied in: answers first (they are written against the model's own reading), in
 * question order, then fixes made by hand. So an answer still applies after a hand fix to the same item;
 * if the two disagree, the hand fix is the one reported as no longer applicable.
 */
function inOrder<T extends { source: string }>(edits: T[]): T[] {
  const n = (e: T) => Number(e.source.slice(1));
  return [...edits.filter((e) => e.source !== 'manual').sort((a, b) => n(a) - n(b)), ...edits.filter((e) => e.source === 'manual')];
}

export function ReviewScreen({ run, imageUrl, onBack }: { run: RunRecord; imageUrl: string; onBack: () => void }) {
  const base = run.extraction;
  const W = run.image.width, H = run.image.height;
  const [review, setReview] = useState<Review>(run.review ?? EMPTY_REVIEW);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [asExtracted, setAsExtracted] = useState(false);
  const [active, setActive] = useState<Active>(null);
  const [hoverOpt, setHoverOpt] = useState<number | null>(null);
  const [pick, setPick] = useState<PickRequest | null>(null);
  const [check, setCheck] = useState<FreeEnd | null>(null);
  const [showChanges, setShowChanges] = useState(false);
  const [hot, setHot] = useState<string | null>(null);
  const viewer = useRef<ViewerHandle>(null);

  // Save after every change (not on first show).
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    saveReview(run.id, review).then(() => setSaveError(null)).catch((e) => setSaveError((e as Error).message));
  }, [review, run.id]);

  /** The change list as it would be with this answer given to question i (in place of any answer it has now). */
  const withAnswer = (edits: AppliedEdit[], i: number, answer: Edit[]): (Edit & { key?: string; source: string })[] =>
    inOrder([...edits.filter((e) => e.source !== src(i)), ...answer.map((e, k) => ({ ...e, key: `pv${k}`, source: src(i) }))]);

  const qi = active?.kind === 'q' ? active.i : null;
  const question = qi !== null ? base.clarify[qi] : null;

  // The picture as it stands: the extraction plus every answer and fix. Pop-ups are placed against this one,
  // so a preview can never move a pop-up out from under the pointer.
  const settled = useMemo(() => applyEdits(base, inOrder(review.edits)), [base, review.edits]);
  const settledScene = useMemo(() => toScene(settled.extraction, W, H), [settled, W, H]);

  /** The change that puts an arrow's end at a point with no shape: in the compartment there, or in open space. */
  const freeEdit = (c: FreeEnd): Edit => ({
    op: c.end === 'from' ? 'set_arrow_from' : 'set_arrow_to', id: c.arrow, to: regionAt(settledScene, c.x, c.y)?.id ?? null,
    value: `${Math.round((c.x / W) * 1e4) / 100},${Math.round((c.y / H) * 1e4) / 100}`,
  });

  // What is drawn: the model's own reading, or the settled picture, or a preview of a hovered answer / a pending check.
  const editsNow = useMemo<(Edit & { key?: string })[]>(() => {
    if (asExtracted) return [];
    if (check) return [...inOrder(review.edits), freeEdit(check)];
    if (question && qi !== null && hoverOpt !== null) return withAnswer(review.edits, qi, question.options[hoverOpt].edits);
    return inOrder(review.edits);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asExtracted, check, question, qi, hoverOpt, review.edits]);
  const applied = useMemo(() => applyEdits(base, editsNow), [base, editsNow]);
  const x = applied.extraction;
  const scene = useMemo(() => toScene(x, W, H), [x, W, H]);
  const baseScene = useMemo(() => toScene(base, W, H), [base, W, H]);

  // The change list in plain words, each described against the picture just before it.
  const changeList = useMemo(() => {
    let cur = base;
    return inOrder(review.edits).map((e) => {
      const text = describeEdit(cur, e);
      const r = applyEdits(cur, [e]);
      // Reasons name things by id; show the name as written instead.
      const before = cur;
      const failed = r.failed[0]?.reason.replace(/"([^"]+)"/g, (m, id: string) => (nameOf(before, id) !== id ? `"${nameOf(before, id)}"` : m)) ?? null;
      cur = r.extraction;
      return { edit: e, text, failed };
    });
  }, [base, review.edits]);

  // Where each question stands. An answer the model gave no usable changes for is recorded, but still needs a fix by hand.
  const statuses: QuestionStatus[] = useMemo(() => base.clarify.map((c, i) => {
    const a = review.answers[String(i)];
    if (a === undefined) return { state: 'open', answer: null };
    if (a === -1) return { state: 'byHand', answer: null };
    const o = c.options[a];
    const answersOnly = applyEdits(base, inOrder(review.edits.filter((e) => e.source !== 'manual' && e.source !== src(i)))).extraction;
    return { state: o && optionState(answersOnly, o) === 'manual' ? 'needsHand' : 'done', answer: o?.label ?? null };
  }), [base, review]);
  const answered = (i: number) => statuses[i].state !== 'open';
  const nAnswered = statuses.filter((s) => s.state !== 'open').length;
  const nextOpen = (after: number) => {
    const n = base.clarify.length;
    for (let k = 1; k <= n; k++) { const j = (after + k) % n; if (!answered(j)) return j; }
    return null;
  };

  /** The shapes a question is about, and the shapes its answers point at. */
  const involved = (i: number) => {
    const c = base.clarify[i];
    return [...new Set([...c.about, ...c.options.map((o) => o.shape).filter((s): s is string => !!s)])];
  };
  const boxFor = (ids: string[]): BoxPx | null => {
    const boxes = ids.map((id) => boxOf(settledScene, id)).filter((b): b is BoxPx => !!b);
    return boxes.length ? union(boxes, 0) : null;
  };

  // Both views move to whatever was just opened.
  const activeKey = active ? (active.kind === 'q' ? `q${active.i}` : `s${active.id}`) : '';
  useEffect(() => {
    if (!active || !viewer.current) return;
    if (active.kind === 'q') {
      const b = boxFor(involved(active.i));
      if (b) viewer.current.focus(b, { fill: 0.34, anchorX: 0.33 });
      return;
    }
    // A selected shape is brought closer only if it is small on screen.
    const b = boxOf(settledScene, active.id);
    if (b && Math.max(b.width, b.height) / viewer.current.unit() < 90) viewer.current.focus(b, { fill: 0.24, anchorX: 0.33 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (check) setCheck(null); else if (pick) setPick(null); else if (showChanges) setShowChanges(false); else setActive(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pick, showChanges, check]);

  const openQuestion = (i: number) => { setPick(null); setCheck(null); setHoverOpt(null); setShowChanges(false); setActive({ kind: 'q', i }); };
  const close = () => { setActive(null); setHoverOpt(null); };

  const stamp = (source: string) => (e: Edit): AppliedEdit => ({ ...e, key: newKey(), source, at: new Date().toISOString() });

  /** A fix made by hand. Retyping a name or moving a shape again replaces the previous step instead of piling up. */
  const add = (e: Edit) => setReview((r) => {
    const last = r.edits[r.edits.length - 1];
    const merge = last && last.source === 'manual' && last.op === e.op && last.id === e.id && ['set_box', 'set_label', 'set_arrow_text'].includes(e.op);
    return { ...r, edits: [...(merge ? r.edits.slice(0, -1) : r.edits), stamp('manual')(e)] };
  });

  const clearAnswer = (i: number) => setReview((r) => {
    const answers = { ...r.answers }; delete answers[String(i)];
    return { edits: r.edits.filter((e) => e.source !== src(i)), answers };
  });

  /** "None of these: fix it myself": the one route that opens the fix form from a question. */
  const fixByHand = (i: number) => {
    setReview((r) => ({ edits: r.edits.filter((e) => e.source !== src(i)), answers: { ...r.answers, [String(i)]: -1 } }));
    setHoverOpt(null);
    const target = base.clarify[i].about.find((id) => boxOf(settledScene, id)) ?? null;
    setActive(target ? { kind: 'sel', id: target } : null);
  };

  /** Choosing an answer records it, applies its changes if it has any, and always moves on to the next question. */
  const choose = (i: number, oi: number) => {
    const o = base.clarify[i].options[oi];
    const others = review.edits.filter((e) => e.source !== src(i));
    const usable = optionState(applyEdits(base, inOrder(others.filter((e) => e.source !== 'manual'))).extraction, o) === 'ready';
    setReview({ edits: usable ? [...others, ...o.edits.map(stamp(src(i)))] : others, answers: { ...review.answers, [String(i)]: oi } });
    setHoverOpt(null);
    const n = base.clarify.length;
    let next: number | null = null;
    for (let k = 1; k < n; k++) { const j = (i + k) % n; if (!answered(j)) { next = j; break; } }
    if (next !== null) setActive({ kind: 'q', i: next }); else { setActive(null); viewer.current?.reset(); }
  };

  const undo = (e: AppliedEdit) => {
    if (e.source !== 'manual') return clearAnswer(Number(e.source.slice(1)));
    setReview((r) => ({ ...r, edits: r.edits.filter((v) => v.key !== e.key) }));
  };

  const select = (id: string) => {
    if (asExtracted || check) return;
    if (pick) {
      const ok = x.elements.some((v) => v.id === id) || (pick.groups && x.groups.some((v) => v.id === id));
      if (ok) { pick.accept(id); setPick(null); }
      return;
    }
    setHoverOpt(null); setShowChanges(false);
    setActive({ kind: 'sel', id });
  };

  /** Bring an item into view on both pictures and outline it briefly (from the flag list). */
  const show = (id: string) => {
    const b = boxOf(settledScene, id);
    if (b) viewer.current?.focus(b, { fill: 0.3, anchorX: 0.5 });
    setHot(id);
  };

  // --- what is layered over the two views ---
  const marks = new Map<string, Mark>();
  if (question && qi !== null) {
    for (const id of question.about) marks.set(id, 'about');
    for (const o of question.options) if (o.shape) marks.set(o.shape, 'candidate');
    const h = hoverOpt !== null ? question.options[hoverOpt].shape : null;
    if (h) marks.set(h, 'hover');
  }
  const pins: Pin[] = base.clarify.flatMap((c, i) => {
    const id = involved(i).find((v) => anchorOf(scene, v));
    return id ? [{ n: i + 1, id, done: answered(i), active: qi === i, warn: statuses[i].state === 'needsHand' }] : [];
  });
  const selId = check ? check.arrow : active?.kind === 'sel' && boxOf(scene, active.id) ? active.id : null;
  const toPercent = (b: BoxPx) => [b.x / W * 100, b.y / H * 100, b.width / W * 100, b.height / H * 100].map((v) => Math.round(v * 100) / 100).join(',');
  const ui = (unit: number): SceneUi => ({
    unit, hot, onHover: setHot, marks, selected: pick ? null : selId, touched: asExtracted ? new Set() : applied.touched, pins,
    quiet: !!question || !!pick || !!check, picking: !!pick, editable: !asExtracted && !check,
    onSelect: select, onPin: (n) => openQuestion(n - 1),
    onMoveBadge: (from, badge, to) => add({ op: 'move_badge', id: from, to, value: badge }),
    onArrowEnd: (arrow, end, to) => add({ op: end === 'from' ? 'set_arrow_from' : 'set_arrow_to', id: arrow, to, value: null }),
    onArrowEndFree: (arrow, end, at) => { setActive({ kind: 'sel', id: arrow }); setCheck({ arrow, end, ...at }); },
    onMoveNode: (id, box) => add({ op: 'set_box', id, to: null, value: toPercent(box) }),
  });

  // The answers, in the order their shapes sit in the figure (top to bottom, then left to right). No answer is put first on merit.
  const choices: Choice[] = useMemo(() => {
    if (!question || qi === null) return [];
    // Answers are judged against the model's reading plus the other answers, never against hand fixes.
    const answersOnly = applyEdits(base, inOrder(review.edits.filter((e) => e.source !== 'manual' && e.source !== src(qi)))).extraction;
    // "Shown now" is a fact about the screen: giving this answer would leave the picture exactly as it is.
    const now = JSON.stringify(settled.extraction);
    const same = question.options.map((o) => JSON.stringify(applyEdits(base, withAnswer(review.edits, qi, o.edits)).extraction) === now);
    const several = same.filter(Boolean).length > 1;
    const pos = (shape: string | null) => { const b = shape ? boxOf(baseScene, shape) : null; return b ? [Math.round(b.y / (H / 40)), b.x] : [Infinity, Infinity]; };
    return question.options
      .map((o, index) => ({ index, label: o.label, byHand: optionState(answersOnly, o) === 'manual', shownNow: same[index] && !(several && o.asRead), at: pos(o.shape) }))
      .sort((a, b) => a.at[0] - b.at[0] || a.at[1] - b.at[1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question, qi, base, baseScene, review, settled, H]);

  const point = (c: { x: number; y: number }): BoxPx => ({ x: c.x, y: c.y, width: 0, height: 0 });
  const anchorBox = check ? point(check) : question && qi !== null ? boxFor(involved(qi)) : selId ? boxOf(settledScene, selId) ?? boxOf(scene, selId) : null;
  const openCount = base.clarify.length - nAnswered;
  const chip = 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:hover:bg-slate-800';
  const checkRegion = check ? regionAt(settledScene, check.x, check.y) : null;

  return (
    <div className="mx-auto max-w-[1800px] px-5 py-4">
      <header className="mb-3 flex flex-wrap items-center gap-3">
        <button className={chip} onClick={onBack}>← Back</button>
        <h1 className="text-lg font-semibold tracking-tight">{run.name}</h1>
        <span className="flex-1" />
        {base.clarify.length > 0 && (
          <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300" title="Questions the model asked about this figure">
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"><div className="h-full rounded-full bg-green-600 transition-all" style={{ width: `${(nAnswered / base.clarify.length) * 100}%` }} /></div>
            {nAnswered} of {base.clarify.length} answered
          </div>
        )}
        {openCount > 0 && !asExtracted && (
          <button className="rounded-lg bg-orange-500 px-3.5 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-orange-600" onClick={() => { const j = nextOpen(qi ?? -1); if (j !== null) openQuestion(j); }}>
            {qi === null && nAnswered === 0 ? 'Start the questions →' : 'Next question →'}
          </button>
        )}
        <div className="relative">
          <button className={chip} onClick={() => setShowChanges((v) => !v)}>{review.edits.length} change{review.edits.length === 1 ? '' : 's'} ▾</button>
          {showChanges && (
            <div className="absolute right-0 z-20 mt-1 max-h-[60vh] w-96 overflow-y-auto rounded-xl border border-slate-300 bg-white p-3 text-sm shadow-xl dark:border-slate-600 dark:bg-slate-800">
              <label className="flex items-center gap-2"><input type="checkbox" checked={asExtracted} onChange={(e) => { setAsExtracted(e.target.checked); close(); setPick(null); setCheck(null); }} /> Show as extracted (hide my changes)</label>
              {changeList.length === 0 ? <p className="mt-2 text-slate-500 dark:text-slate-400">No changes yet. The reconstruction is exactly what the model read.</p> : (
                <ul className="mt-2 space-y-1.5">
                  {changeList.map(({ edit, text, failed }) => (
                    <li key={edit.key} className="flex items-start justify-between gap-2 rounded-lg border border-slate-200 p-2 dark:border-slate-700">
                      <div>
                        <div className={failed ? 'text-slate-400 line-through' : ''}>{text}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{edit.source === 'manual' ? 'by hand' : `answer to question ${Number(edit.source.slice(1)) + 1}`}{failed ? ` · could not be applied: ${failed}` : ''}</div>
                      </div>
                      <button className="shrink-0 text-xs underline" title={edit.source === 'manual' ? 'Undo this change' : 'Clear this answer'} onClick={() => undo(edit)}>Undo</button>
                    </li>
                  ))}
                </ul>
              )}
              {changeList.length > 1 && <button className="mt-2 text-xs underline text-red-700 dark:text-red-400" onClick={() => { setReview(EMPTY_REVIEW); close(); }}>Undo everything</button>}
            </div>
          )}
        </div>
      </header>
      {saveError && <div className="mb-2 rounded-lg bg-red-50 px-3 py-1.5 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">Your last change was not saved: {saveError}</div>}

      <PairedViewer
        ref={viewer}
        width={W}
        height={H}
        leftTitle="Original"
        rightTitle={asExtracted ? 'Reconstruction · as the model read it' : review.edits.length ? 'Reconstruction · with your changes' : 'Reconstruction'}
        hint={hot ? nameOf(x, hot) : null}
        onBackgroundClick={(at) => {
          setShowChanges(false);
          if (check) return;
          if (pick) { if (pick.acceptPoint) { pick.acceptPoint(at); setPick(null); } return; }
          close();
        }}
        banner={pick ? (
          <div className="mb-2 flex items-center justify-between rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white">
            <span>{pick.prompt}</span><button className="underline" onClick={() => setPick(null)}>Cancel (Esc)</button>
          </div>
        ) : asExtracted ? (
          <div className="mb-2 rounded-lg bg-slate-200 px-3 py-1.5 text-sm dark:bg-slate-700">Showing the model's own reading. Your changes are hidden, not lost.
            <button className="ml-2 underline" onClick={() => setAsExtracted(false)}>Show my changes</button></div>
        ) : null}
        left={(unit) => <ImageLayer scene={scene} src={imageUrl} ui={ui(unit)} />}
        right={(unit) => <><MarkerDefs /><SceneSvg scene={scene} ui={ui(unit)} /></>}
        overlay={(place) => {
          if (pick || !anchorBox) return null;
          if (check) return (
            <Popover anchor={anchorBox} place={place} width={290}>
              <CheckPopover end={check.end} where={checkRegion ? `open space in the ${regionName(checkRegion)}` : 'open space'}
                near={nearest(settledScene, point(check), { exclude: [], groups: true, count: 2 }).map((id) => ({ id, name: nameOf(settled.extraction, id) }))}
                onAccept={() => { add(freeEdit(check)); setCheck(null); }}
                onNear={(id) => { add({ op: check.end === 'from' ? 'set_arrow_from' : 'set_arrow_to', id: check.arrow, to: id, value: null }); setCheck(null); }}
                onCancel={() => setCheck(null)} />
            </Popover>
          );
          if (question && qi !== null) return (
            <Popover anchor={anchorBox} place={place} width={300}>
              <QuestionPopover n={qi + 1} total={base.clarify.length} question={question.question} choices={choices} answered={answered(qi)}
                onHover={setHoverOpt} onChoose={(oi) => choose(qi, oi)} onManual={() => fixByHand(qi)} onClear={() => clearAnswer(qi)} onClose={close} />
            </Popover>
          );
          if (selId) return (
            <Popover anchor={anchorBox} place={place} width={310}>
              <EditPopover key={selId} x={x} scene={scene} id={selId} add={add} startPick={setPick}
                onFreeEnd={(arrow, end, at) => setCheck({ arrow, end, ...at })} onClose={close} />
            </Popover>
          );
          return null;
        }}
      />

      <ReviewPanel run={run} base={base} statuses={statuses} problems={[...run.problems, ...scene.skipped]} onOpenQuestion={openQuestion} onShow={show} onHover={setHot} />
    </div>
  );
}
