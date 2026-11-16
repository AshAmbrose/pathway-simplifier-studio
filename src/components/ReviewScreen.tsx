/**
 * Side by side: the uploaded image and the reconstruction, aligned, with the review on the canvas.
 *
 *  - The model's questions are numbered pins on both views. Opening one moves both views to the shapes it
 *    concerns and offers the answers beside them. Answers are the main route; fixing by hand is the other.
 *  - Clicking any shape or arrow opens a small form to fix it. Dragging is a shortcut for the same fixes.
 *  - The extraction is never altered. Each answer or fix adds to a list of changes saved with the run;
 *    what is drawn is the extraction with that list applied, and any change can be undone.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { saveReview, type RunRecord } from '../api.ts';
import { applyEdits, optionState } from '../edit/applyEdits.ts';
import { describeEdit, nameOf } from '../edit/describe.ts';
import type { BoxPx } from '../render/edgePorts.ts';
import { anchorOf, boxOf, toScene, union } from '../render/toScene.ts';
import { EMPTY_REVIEW, type AppliedEdit, type Edit, type Review } from '../types/extraction.ts';
import { EditPopover, type PickRequest } from './EditPopover.tsx';
import { PairedViewer, type ViewerHandle } from './PairedViewer.tsx';
import { Popover } from './Popover.tsx';
import { QuestionPopover, type Choice } from './QuestionPopover.tsx';
import { ImageLayer, MarkerDefs, SceneSvg, type Mark, type Pin, type SceneUi } from './SceneSvg.tsx';

type Active = { kind: 'q'; i: number } | { kind: 'sel'; id: string } | null;

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

  // What is drawn: the extraction plus the changes; while an answer is hovered, a preview of that answer.
  const editsNow = useMemo<(Edit & { key?: string })[]>(() => {
    if (asExtracted) return [];
    if (question && qi !== null && hoverOpt !== null) return withAnswer(review.edits, qi, question.options[hoverOpt].edits);
    return inOrder(review.edits);
  }, [asExtracted, question, qi, hoverOpt, review.edits]);
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

  const answered = (i: number) => String(i) in review.answers;
  const nAnswered = base.clarify.filter((_, i) => answered(i)).length;
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
  const boxFor = (ids: string[], s = scene): BoxPx | null => {
    const boxes = ids.map((id) => boxOf(s, id)).filter((b): b is BoxPx => !!b);
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
    const b = boxOf(scene, active.id);
    if (b && Math.max(b.width, b.height) / viewer.current.unit() < 90) viewer.current.focus(b, { fill: 0.24, anchorX: 0.33 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (pick) setPick(null); else if (showChanges) setShowChanges(false); else setActive(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pick, showChanges]);

  const openQuestion = (i: number) => { setPick(null); setHoverOpt(null); setShowChanges(false); setActive({ kind: 'q', i }); };
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

  const fixByHand = (i: number, shape: string | null) => {
    setReview((r) => ({ edits: r.edits.filter((e) => e.source !== src(i)), answers: { ...r.answers, [String(i)]: -1 } }));
    setHoverOpt(null);
    const target = shape ?? base.clarify[i].about.find((id) => boxOf(scene, id)) ?? null;
    setActive(target ? { kind: 'sel', id: target } : null);
  };

  const choose = (i: number, oi: number) => {
    const c = base.clarify[i], o = c.options[oi];
    const others = review.edits.filter((e) => e.source !== src(i));
    if (optionState(applyEdits(base, inOrder(others.filter((e) => e.source !== 'manual'))).extraction, o) === 'manual') return fixByHand(i, o.shape);
    setReview({ edits: [...others, ...o.edits.map(stamp(src(i)))], answers: { ...review.answers, [String(i)]: oi } });
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
    if (asExtracted) return;
    if (pick) {
      const ok = x.elements.some((v) => v.id === id) || (pick.groups && x.groups.some((v) => v.id === id));
      if (ok) { pick.accept(id); setPick(null); }
      return;
    }
    setHoverOpt(null); setShowChanges(false);
    setActive({ kind: 'sel', id });
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
    return id ? [{ n: i + 1, id, done: answered(i), active: qi === i }] : [];
  });
  const selId = active?.kind === 'sel' && boxOf(scene, active.id) ? active.id : null;
  const toPercent = (b: BoxPx) => [b.x / W * 100, b.y / H * 100, b.width / W * 100, b.height / H * 100].map((v) => Math.round(v * 100) / 100).join(',');
  const ui = (unit: number): SceneUi => ({
    unit, hot, onHover: setHot, marks, selected: pick ? null : selId, touched: asExtracted ? new Set() : applied.touched, pins,
    quiet: !!question || !!pick, picking: !!pick, editable: !asExtracted,
    onSelect: select, onPin: (n) => openQuestion(n - 1),
    onMoveBadge: (from, badge, to) => add({ op: 'move_badge', id: from, to, value: badge }),
    onArrowEnd: (arrow, end, to) => add({ op: end === 'from' ? 'set_arrow_from' : 'set_arrow_to', id: arrow, to, value: null }),
    onMoveNode: (id, box) => add({ op: 'set_box', id, to: null, value: toPercent(box) }),
  });

  // The answers, in the order their shapes sit in the figure (top to bottom, then left to right). No answer is put first on merit.
  const choices: Choice[] = useMemo(() => {
    if (!question || qi === null) return [];
    // Answers are judged against the model's reading plus the other answers, never against hand fixes.
    const answersOnly = applyEdits(base, inOrder(review.edits.filter((e) => e.source !== 'manual' && e.source !== src(qi)))).extraction;
    // "Shown now" is a fact about the screen: giving this answer would leave the picture exactly as it is.
    const now = JSON.stringify(applyEdits(base, inOrder(review.edits)).extraction);
    const same = question.options.map((o) => JSON.stringify(applyEdits(base, withAnswer(review.edits, qi, o.edits)).extraction) === now);
    const several = same.filter(Boolean).length > 1;
    const pos = (shape: string | null) => { const b = shape ? boxOf(baseScene, shape) : null; return b ? [Math.round(b.y / (H / 40)), b.x] : [Infinity, Infinity]; };
    return question.options
      .map((o, index) => ({ index, label: o.label, byHand: optionState(answersOnly, o) === 'manual', shownNow: same[index] && !(several && o.asRead), at: pos(o.shape) }))
      .sort((a, b) => a.at[0] - b.at[0] || a.at[1] - b.at[1]);
  }, [question, qi, base, baseScene, review, H]);

  const anchorBox = question && qi !== null ? boxFor(involved(qi)) : selId ? boxOf(scene, selId) : null;
  const counts: [string, number][] = [
    ['elements', base.elements.length], ['groups', base.groups.length], ['contacts', base.contacts.length], ['arrows', base.arrows.length],
    ['regions', base.regions.length], ['flags', base.flags.length], ['clarification questions', base.clarify.length],
  ];
  const openCount = base.clarify.length - nAnswered;
  const chip = 'rounded-lg border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800';

  return (
    <div className="px-4 py-4">
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <button className={chip} onClick={onBack}>← Upload another</button>
        <h1 className="text-lg font-semibold">{run.name}</h1>
        <span className="text-sm text-slate-500 dark:text-slate-400">
          {run.model} · prompt {run.promptVersion} · {run.seconds.toFixed(1)}s{run.priceKnown ? ` · $${run.costUsd.toFixed(4)}` : ''}
        </span>
        <span className="flex-1" />
        {base.clarify.length > 0 && <span className="text-sm">{nAnswered} of {base.clarify.length} questions answered</span>}
        {openCount > 0 && !asExtracted && (
          <button className="rounded-lg bg-orange-500 px-3 py-1 text-sm font-semibold text-white hover:bg-orange-600" onClick={() => { const j = nextOpen(qi ?? -1); if (j !== null) openQuestion(j); }}>
            {qi === null ? (nAnswered === 0 ? 'Start with question 1 →' : 'Next question →') : 'Next question →'}
          </button>
        )}
        <div className="relative">
          <button className={chip} onClick={() => setShowChanges((v) => !v)}>{review.edits.length} change{review.edits.length === 1 ? '' : 's'} ▾</button>
          {showChanges && (
            <div className="absolute right-0 z-20 mt-1 max-h-[60vh] w-96 overflow-y-auto rounded-xl border border-slate-300 bg-white p-3 text-sm shadow-xl dark:border-slate-600 dark:bg-slate-800">
              <label className="flex items-center gap-2"><input type="checkbox" checked={asExtracted} onChange={(e) => { setAsExtracted(e.target.checked); close(); setPick(null); }} /> Show as extracted (hide my changes)</label>
              {changeList.length === 0 ? <p className="mt-2 text-slate-500 dark:text-slate-400">No changes yet. The reconstruction is exactly what the model read.</p> : (
                <ul className="mt-2 space-y-1.5">
                  {changeList.map(({ edit, text, failed }) => (
                    <li key={edit.key} className="flex items-start justify-between gap-2 rounded border border-slate-200 p-2 dark:border-slate-700">
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
      </div>
      {saveError && <div className="mb-2 rounded bg-red-50 px-3 py-1.5 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">Your last change was not saved: {saveError}</div>}

      <PairedViewer
        ref={viewer}
        width={W}
        height={H}
        leftTitle="Uploaded figure"
        rightTitle={asExtracted ? 'Reconstruction: as the model read it' : review.edits.length ? 'Reconstruction: with your changes' : 'Reconstruction'}
        onBackgroundClick={() => { if (!pick) close(); setShowChanges(false); }}
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
          if (question && qi !== null) return (
            <Popover anchor={anchorBox} place={place} width={300}>
              <QuestionPopover n={qi + 1} total={base.clarify.length} question={question.question} choices={choices} answered={answered(qi)}
                onHover={setHoverOpt} onChoose={(oi) => choose(qi, oi)} onManual={() => fixByHand(qi, null)} onClear={() => clearAnswer(qi)} onClose={close} />
            </Popover>
          );
          if (selId) return (
            <Popover anchor={anchorBox} place={place} width={310}>
              <EditPopover key={selId} x={x} scene={scene} id={selId} add={add} startPick={setPick} onClose={close} />
            </Popover>
          );
          return null;
        }}
      />
      <div className="mt-1 h-5 text-sm text-slate-700 dark:text-slate-200">{hot ? nameOf(x, hot) : ''}</div>

      <div className="mt-3 grid gap-6 lg:grid-cols-3">
        <section>
          <h2 className="font-semibold">What was extracted</h2>
          <ul className="mt-1 text-sm">{counts.map(([k, v]) => <li key={k}>{v} {k}</li>)}</ul>
          {base.structure && <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{base.structure}</p>}
          {(run.problems.length > 0 || scene.skipped.length > 0) && (
            <>
              <h3 className="mt-3 text-sm font-semibold">Could not be placed or used</h3>
              <ul className="mt-1 list-disc pl-5 text-sm text-slate-600 dark:text-slate-300">
                {[...run.problems, ...scene.skipped].map((p, i) => <li key={i}>{p}</li>)}
              </ul>
            </>
          )}
        </section>
        <section>
          <h2 className="font-semibold">Clarification questions</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Where the model found the drawing ambiguous. Click one to answer it on the picture.</p>
          {base.clarify.length === 0 ? <p className="mt-1 text-sm">None.</p> : (
            <ul className="mt-1 space-y-2 text-sm">
              {base.clarify.map((c, i) => {
                const a = review.answers[String(i)];
                return (
                  <li key={i}>
                    <button className="w-full rounded border border-slate-200 p-2 text-left hover:border-orange-500 dark:border-slate-700" onClick={() => openQuestion(i)}>
                      <div><span className="font-semibold">{i + 1}.</span> {c.question}</div>
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {a === undefined ? 'Not answered yet' : a === -1 ? 'Answered: fixed by hand' : `Answered: ${c.options[a]?.label ?? '—'}`}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <section>
          <h2 className="font-semibold">Flags</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Drawing-level problems the model noticed. Not corrections.</p>
          {base.flags.length === 0 ? <p className="mt-1 text-sm">None.</p> : (
            <ul className="mt-1 space-y-2 text-sm">
              {base.flags.map((f, i) => (
                <li key={i} className="rounded border border-slate-200 p-2 dark:border-slate-700" onMouseEnter={() => setHot(f.on)} onMouseLeave={() => setHot(null)}>
                  <div><span className="font-medium">{f.type}</span> on {nameOf(base, f.on)} <span className="text-slate-500 dark:text-slate-400">({f.confidence})</span></div>
                  {f.asWritten && <div className="text-slate-600 dark:text-slate-300">Written "{f.asWritten}"{f.suggestion ? `, suggest "${f.suggestion}"` : ''}</div>}
                  <div className="text-slate-600 dark:text-slate-300">{f.basis}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
