/**
 * Side by side: the uploaded image and the reconstruction, aligned, with the review on the canvas.
 *
 *  - The model's questions are numbered pins on both views. Opening one moves both views to the shapes it
 *    concerns and offers the answers beside them. Choosing an answer always moves on to the next question.
 *  - Clicking any shape or arrow opens a small form to fix it. Dragging is a shortcut for the same fixes.
 *  - The extraction is never altered. Each answer or fix adds to a list of changes saved with the run;
 *    what is drawn is the extraction with that list applied, and any change can be undone.
 *  - Everything else (question list, flags, run details) sits in one closed panel under the picture.
 *  - This is the Check step. It shows and edits only the corrections (answers and fixes by hand). Simplification
 *    changes in the same list are left as they are; they are shown in the simplification steps.
 */
import { ArrowRight, ChevronDown, ListChecks, Spline, SquarePlus } from 'lucide-react';
import { button, cta, ICON, meta, note, primary, quiet } from './ui.ts';
import { useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import type { RunRecord } from '../api.ts';
import { applyEdits, dependents, optionState } from '../edit/applyEdits.ts';
import { inOrder, isAnswer, isCorrection, newKey } from '../edit/order.ts';
import { cleanText, describeEdit, nameOf, regionName } from '../edit/describe.ts';
import type { BoxPx } from '../render/edgePorts.ts';
import { anchorOf, boxOf, nearest, regionAt, toScene, union } from '../render/toScene.ts';
import type { AppliedEdit, Edit, Review } from '../types/extraction.ts';
import { CheckPopover } from './CheckPopover.tsx';
import { EditPopover, type PickRequest } from './EditPopover.tsx';
import { PairedViewer, type ViewerHandle } from './PairedViewer.tsx';
import { Popover } from './Popover.tsx';
import { QuestionPopover, type Choice } from './QuestionPopover.tsx';
import { ReviewPanel, type QuestionStatus } from './ReviewPanel.tsx';
import { ImageLayer, MarkerDefs, SceneSvg, type Mark, type Pin, type SceneUi } from './SceneSvg.tsx';

type Active = { kind: 'q'; i: number } | { kind: 'sel'; id: string } | null;
/**
 * An arrow end waiting for the "there is no shape here" check, in picture coordinates: an existing arrow's end
 * (`arrow`), or the end of a new arrow being drawn from shape `from`.
 */
type FreeEnd = { x: number; y: number } & ({ arrow: string; end: 'from' | 'to'; from?: undefined } | { arrow: null; end: 'to'; from: string });
type Mode = 'place' | 'draw' | null;

/**
 * The colour of the uploaded image inside a box: the most common colour among a grid of samples, so a label's
 * text doesn't win. Null if the image can't be read.
 */
function sampleColour(img: HTMLImageElement | null, b: BoxPx): string | null {
  if (!img || !img.naturalWidth) return null;
  try {
    const c = document.createElement('canvas');
    const w = Math.max(1, Math.round(b.width)), h = Math.max(1, Math.round(b.height));
    c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(img, b.x, b.y, b.width, b.height, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data;
    const count = new Map<string, { n: number; r: number; g: number; b: number }>();
    const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 400)));
    for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4;
      if (d[i + 3] < 128) continue;
      const k = `${d[i] >> 4},${d[i + 1] >> 4},${d[i + 2] >> 4}`;
      const v = count.get(k) ?? { n: 0, r: 0, g: 0, b: 0 };
      v.n++; v.r += d[i]; v.g += d[i + 1]; v.b += d[i + 2];
      count.set(k, v);
    }
    const best = [...count.values()].sort((a, z) => z.n - a.n)[0];
    if (!best) return null;
    const hex = (v: number) => Math.round(v / best.n).toString(16).padStart(2, '0');
    return `#${hex(best.r)}${hex(best.g)}${hex(best.b)}`;
  } catch {
    return null;
  }
}

const src = (i: number) => `q${i}`;

/** The two arrow heads of pathway notation, drawn: an arrowhead (activates) and a bar (inhibits). */
function HeadIcon({ head }: { head: 'arrow' | 'bar' }) {
  return (
    <svg width="16" height="10" viewBox="0 0 16 10" aria-hidden className="shrink-0">
      <line x1="1" y1="5" x2={head === 'arrow' ? 11 : 13} y2="5" stroke="currentColor" strokeWidth="1.6" />
      {head === 'arrow' ? <path d="M10 1.5 L15 5 L10 8.5 Z" fill="currentColor" /> : <line x1="14" y1="1" x2="14" y2="9" stroke="currentColor" strokeWidth="2" />}
    </svg>
  );
}

export function ReviewScreen({ run, imageUrl, review: fullReview, setReview, top, notices }: {
  run: RunRecord; imageUrl: string;
  /** The whole review (corrections and simplification); held and saved by RunScreen. */
  review: Review; setReview: Dispatch<SetStateAction<Review>>;
  /** The header's start (back, title, stage switch) and any save notices, from RunScreen. */
  top: ReactNode; notices: ReactNode;
}) {
  const base = run.extraction;
  const W = run.image.width, H = run.image.height;
  // Only the corrections are shown and changed here. Answers are applied first (they are written against the
  // model's own reading), then fixes by hand; so if the two disagree, the hand fix is the one reported.
  const review = useMemo(() => ({ ...fullReview, edits: fullReview.edits.filter((e) => isCorrection(e.source)) }), [fullReview]);
  const [asExtracted, setAsExtracted] = useState(false);
  const [active, setActive] = useState<Active>(null);
  const [hoverOpt, setHoverOpt] = useState<number | null>(null);
  const [pick, setPick] = useState<PickRequest | null>(null);
  const [check, setCheck] = useState<FreeEnd | null>(null);
  const [mode, setMode] = useState<Mode>(null);
  /** The head drawn in "+ Arrow" mode, chosen in the banner. */
  const [drawHead, setDrawHead] = useState<'arrow' | 'bar'>('arrow');
  const [focusName, setFocusName] = useState<string | null>(null);
  // The uploaded image, read once, for taking a new shape's colour from the figure.
  const img = useRef<HTMLImageElement | null>(null);
  useEffect(() => { const i = new Image(); i.src = imageUrl; img.current = i; }, [imageUrl]);
  const [showChanges, setShowChanges] = useState(false);
  const [hot, setHot] = useState<string | null>(null);
  const viewer = useRef<ViewerHandle>(null);

  /** The change list as it would be with this answer given to question i (in place of any answer it has now). */
  const withAnswer = (edits: AppliedEdit[], i: number, answer: Edit[]): (Edit & { key?: string; source: string })[] =>
    inOrder([...edits.filter((e) => e.source !== src(i)), ...answer.map((e, k) => ({ ...e, key: `pv${k}`, source: src(i) }))]);

  const qi = active?.kind === 'q' ? active.i : null;
  const question = qi !== null ? base.clarify[qi] : null;

  // The picture as it stands: the extraction plus every answer and fix. Pop-ups are placed against this one,
  // so a preview can never move a pop-up out from under the pointer.
  const settled = useMemo(() => applyEdits(base, inOrder(review.edits)), [base, review.edits]);
  const settledScene = useMemo(() => toScene(settled.extraction, W, H), [settled, W, H]);

  /**
   * The changes that put an arrow's end at a point with no shape (in the compartment there, or in open space).
   * For a new arrow: add it, then move its end to the point. `key` names the new arrow.
   */
  const freeEdits = (c: FreeEnd, key: string): (Edit & { key: string })[] => {
    const point = { to: regionAt(settledScene, c.x, c.y)?.id ?? null, value: `${Math.round((c.x / W) * 1e4) / 100},${Math.round((c.y / H) * 1e4) / 100}` };
    if (c.arrow) return [{ op: c.end === 'from' ? 'set_arrow_from' : 'set_arrow_to', id: c.arrow, ...point, key }];
    const from = c.from!;
    return [{ op: 'add_arrow', id: from, to: from, value: mode === 'draw' ? drawHead : 'arrow', key }, { op: 'set_arrow_to', id: `new-${key}`, ...point, key: key + 'e' }];
  };

  // What is drawn: the model's own reading, or the settled picture, or a preview of a hovered answer / a pending check.
  const editsNow = useMemo<(Edit & { key?: string })[]>(() => {
    if (asExtracted) return [];
    if (check) return [...inOrder(review.edits), ...freeEdits(check, 'preview')];
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
    const list = inOrder(review.edits);
    return list.map((e, i) => {
      // A new arrow drawn into open space is two changes (add it, then place its end); list it as one.
      const next = list[i + 1];
      const joined = e.op === 'add_arrow' && next?.op === 'set_arrow_to' && next.id === `new-${e.key}` && /,/.test(next.value ?? '');
      const text = joined ? `Arrow added: ${nameOf(cur, e.id)} → ${nameOf(applyEdits(cur, [e, next]).extraction, next.to ?? 'open')}` : describeEdit(cur, e);
      const hidden = i > 0 && e.op === 'set_arrow_to' && e.id === `new-${list[i - 1].key}` && list[i - 1].op === 'add_arrow' && /,/.test(e.value ?? '');
      const r = applyEdits(cur, [e]);
      // Reasons name things by id; show the name as written instead.
      const before = cur;
      const failed = r.failed[0]?.reason.replace(/"([^"]+)"/g, (m, id: string) => (nameOf(before, id) !== id ? `"${nameOf(before, id)}"` : m)) ?? null;
      cur = r.extraction;
      return { edit: e, text, failed, hidden };
    }).filter((c) => !c.hidden);
  }, [base, review.edits]);

  // Where each question stands. An answer the model gave no usable changes for is recorded, but still needs a fix by hand.
  const statuses: QuestionStatus[] = useMemo(() => base.clarify.map((c, i) => {
    const a = review.answers[String(i)];
    if (a === undefined) return { state: 'open', answer: null };
    if (a === -1) return { state: 'byHand', answer: null };
    const o = c.options[a];
    const answersOnly = applyEdits(base, inOrder(review.edits.filter((e) => isAnswer(e.source) && e.source !== src(i)))).extraction;
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
      if (check) setCheck(null); else if (pick) setPick(null); else if (mode) setMode(null); else if (showChanges) setShowChanges(false); else setActive(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pick, showChanges, check, mode]);

  const toggleMode = (m: Exclude<Mode, null>) => { setMode((cur) => (cur === m ? null : m)); setActive(null); setHoverOpt(null); setPick(null); setCheck(null); setShowChanges(false); };

  const openQuestion = (i: number) => { setPick(null); setCheck(null); setMode(null); setHoverOpt(null); setShowChanges(false); setActive({ kind: 'q', i }); };
  const close = () => { setActive(null); setHoverOpt(null); };
  // On arrival, the first open question is already up and its item in view: the work starts where it is needed.
  useEffect(() => {
    const j = nextOpen(-1);
    if (j !== null) openQuestion(j);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stamp = (source: string) => (e: Edit): AppliedEdit => ({ ...e, key: newKey(), source, at: new Date().toISOString() });

  /** A fix made by hand. Retyping a name or moving a shape again replaces the previous step instead of piling up. */
  const add = (e: Edit) => setReview((r) => {
    const last = r.edits[r.edits.length - 1];
    const merge = last && last.source === 'manual' && last.op === e.op && last.id === e.id && ['set_box', 'set_label', 'set_arrow_text'].includes(e.op);
    return { ...r, edits: [...(merge ? r.edits.slice(0, -1) : r.edits), stamp('manual')(e)] };
  });
  /** Several changes that make one action (a new arrow ending in open space), with their keys already chosen. */
  const addAll = (es: (Edit & { key: string })[]) => setReview((r) => ({ ...r, edits: [...r.edits, ...es.map((e) => ({ ...e, source: 'manual', at: new Date().toISOString() }))] }));

  /** "+ Shape": a click places a shape of typical size centred there; a dragged-out box places it at that size. */
  const typical = useMemo(() => {
    const sizes = baseScene.nodes.filter((n) => n.outline !== 'text only' && n.kind !== 'dna' && n.kind !== 'heading');
    const med = (v: number[]) => v.sort((a, b) => a - b)[Math.floor(v.length / 2)] ?? 0;
    return { width: med(sizes.map((n) => n.width)) || W * 0.08, height: med(sizes.map((n) => n.height)) || H * 0.05 };
  }, [baseScene, W, H]);
  const place = (p: BoxPx | { x: number; y: number }) => {
    const sized = 'width' in p && p.width > typical.width * 0.3 && p.height > typical.height * 0.3;
    const b: BoxPx = sized ? (p as BoxPx) : { x: p.x - typical.width / 2, y: p.y - typical.height / 2, ...typical };
    const id = `new-${newKey()}`;
    const pct = [b.x / W * 100, b.y / H * 100, b.width / W * 100, b.height / H * 100].map((v) => Math.round(v * 100) / 100);
    add({ op: 'add_element', id, to: regionAt(settledScene, b.x + b.width / 2, b.y + b.height / 2)?.id ?? null, value: JSON.stringify({ box: pct, fill: sampleColour(img.current, b) }) });
    setMode(null);
    setFocusName(id);
    setActive({ kind: 'sel', id });
  };

  /** A new arrow drawn from a shape. Onto a shape or cluster it is added; onto an empty spot it goes to the check. */
  /** A new arrow drawn from a shape. In "+ Arrow" mode it gets the head chosen in the banner; from a connector dot, an ordinary arrow. */
  const newArrow = (from: string, to: string | null, at: { x: number; y: number }) => {
    const head = mode === 'draw' ? drawHead : 'arrow';
    if (to) { add({ op: 'add_arrow', id: from, to, value: head }); return; }
    setCheck({ arrow: null, end: 'to', from, ...at });
  };

  const clearAnswer = (i: number) => setReview((r) => {
    const answers = { ...r.answers }; delete answers[String(i)];
    return { ...r, edits: r.edits.filter((e) => e.source !== src(i)), answers };
  });

  /** "None of these: fix it myself": the one route that opens the fix form from a question. */
  const fixByHand = (i: number) => {
    setReview((r) => ({ ...r, edits: r.edits.filter((e) => e.source !== src(i)), answers: { ...r.answers, [String(i)]: -1 } }));
    setHoverOpt(null);
    const target = base.clarify[i].about.find((id) => boxOf(settledScene, id)) ?? null;
    setActive(target ? { kind: 'sel', id: target } : null);
  };

  /** Choosing an answer records it, applies its changes if it has any, and always moves on to the next question. */
  const choose = (i: number, oi: number) => {
    const o = base.clarify[i].options[oi];
    const others = review.edits.filter((e) => e.source !== src(i));
    const usable = optionState(applyEdits(base, inOrder(others.filter((e) => isAnswer(e.source)))).extraction, o) === 'ready';
    setReview((r) => ({ ...r, edits: [...r.edits.filter((e) => e.source !== src(i)), ...(usable ? o.edits.map(stamp(src(i))) : [])], answers: { ...r.answers, [String(i)]: oi } }));
    setHoverOpt(null);
    const n = base.clarify.length;
    let next: number | null = null;
    for (let k = 1; k < n; k++) { const j = (i + k) % n; if (!answered(j)) { next = j; break; } }
    if (next !== null) setActive({ kind: 'q', i: next }); else { setActive(null); viewer.current?.reset(); }
  };

  /** Undoing a change also undoes the later changes that only exist because of it (an added shape's name, arrows, moves). */
  const undo = (e: AppliedEdit) => {
    if (isAnswer(e.source)) return clearAnswer(Number(e.source.slice(1)));
    setReview((r) => {
      const gone = new Set([e.key, ...dependents(r.edits, e.key).map((d) => d.key)]);
      return { ...r, edits: r.edits.filter((v) => !gone.has(v.key)) };
    });
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
  const selId = check ? (check.arrow ?? check.from) : active?.kind === 'sel' && boxOf(scene, active.id) ? active.id : null;
  const toPercent = (b: BoxPx) => [b.x / W * 100, b.y / H * 100, b.width / W * 100, b.height / H * 100].map((v) => Math.round(v * 100) / 100).join(',');
  const ui = (unit: number): SceneUi => ({
    unit, hot, onHover: setHot, marks, selected: pick ? null : selId, touched: asExtracted ? new Set() : applied.touched, pins,
    quiet: !!question || !!pick || !!check || !!mode, picking: !!pick, editable: !asExtracted && !check,
    drawing: mode === 'draw' && !check, drawHead, placing: mode === 'place', onPlace: place, onNewArrow: newArrow,
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
    const answersOnly = applyEdits(base, inOrder(review.edits.filter((e) => isAnswer(e.source) && e.source !== src(qi)))).extraction;
    // "Shown now" is a fact about the screen: giving this answer would leave the picture exactly as it is.
    const now = JSON.stringify(settled.extraction);
    const same = question.options.map((o) => JSON.stringify(applyEdits(base, withAnswer(review.edits, qi, o.edits)).extraction) === now);
    const several = same.filter(Boolean).length > 1;
    const pos = (shape: string | null) => { const b = shape ? boxOf(baseScene, shape) : null; return b ? [Math.round(b.y / (H / 40)), b.x] : [Infinity, Infinity]; };
    return question.options
      .map((o, index) => ({ index, label: cleanText(base, o.label), byHand: optionState(answersOnly, o) === 'manual', shownNow: same[index] && !(several && o.asRead), at: pos(o.shape) }))
      .sort((a, b) => a.at[0] - b.at[0] || a.at[1] - b.at[1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question, qi, base, baseScene, review, settled, H]);

  const point = (c: { x: number; y: number }): BoxPx => ({ x: c.x, y: c.y, width: 0, height: 0 });
  const anchorBox = check ? point(check) : question && qi !== null ? boxFor(involved(qi)) : selId ? boxOf(settledScene, selId) ?? boxOf(scene, selId) : null;
  const openCount = base.clarify.length - nAnswered;
  const chip = button;
  const nSteps = fullReview.edits.length - review.edits.length;
  const checkRegion = check ? regionAt(settledScene, check.x, check.y) : null;

  return (
    <div className="mx-auto max-w-[1800px] px-5 py-3">
      <header className="mb-2 flex flex-wrap items-center gap-3">
        {top}
        <span className="flex-1" />
        {!asExtracted && (
          <div className="flex items-center gap-0.5 rounded bg-sunk p-0.5" role="group" aria-label="Add to the reconstruction">
            {([['place', 'Shape', 'Add a shape the model missed', SquarePlus], ['draw', 'Arrow', 'Draw an arrow from a shape', Spline]] as const).map(([m, label, title, Icon]) => (
              <button key={m} title={title} aria-pressed={mode === m} onClick={() => toggleMode(m)}
                className={`inline-flex items-center gap-1.5 rounded-[3px] px-3 py-1 text-body ${mode === m ? 'bg-ink font-medium text-on-ink' : 'text-ink hover:bg-panel'}`}><Icon size={ICON} />Add {label.toLowerCase()}</button>
            ))}
          </div>
        )}
        {base.clarify.length > 0 && (
          <div className="num flex items-center gap-2 text-body text-ink-2" title="Questions the model asked about this figure">
            <div className="h-1 w-20 overflow-hidden rounded-full bg-sunk"><div className="h-full rounded-full bg-ink transition-all" style={{ width: `${(nAnswered / base.clarify.length) * 100}%` }} /></div>
            {nAnswered} of {base.clarify.length} questions answered
          </div>
        )}
        {openCount > 0 && !asExtracted && (
          <button className={cta} onClick={() => { const j = nextOpen(qi ?? -1); if (j !== null) openQuestion(j); }}>
            {qi === null && nAnswered === 0 ? 'Start the questions' : 'Next question'}<ArrowRight size={ICON} />
          </button>
        )}
        <div className="relative">
          <button className={chip} aria-expanded={showChanges} onClick={() => setShowChanges((v) => !v)}><ListChecks size={ICON} /><span className="num">{changeList.length}</span> change{changeList.length === 1 ? '' : 's'}<ChevronDown size={ICON} className="text-ink-3" /></button>
          {showChanges && (
            <div className="absolute right-0 z-20 mt-1 max-h-[60vh] w-[26rem] overflow-y-auto rounded border border-line-2 bg-panel p-4 text-body shadow-[0_8px_24px_rgb(0_0_0/0.14)]">
              <label className="flex items-center gap-2"><input type="checkbox" checked={asExtracted} onChange={(e) => { setAsExtracted(e.target.checked); close(); setPick(null); setCheck(null); }} /> Show as extracted (hide my changes)</label>
              {changeList.length === 0 ? <p className="mt-2 text-ink-3">No changes yet. The reconstruction is exactly what the model read.</p> : (
                <ul className="mt-3 divide-y divide-line border-y border-line">
                  {changeList.map(({ edit, text, failed }) => { const deps = !isAnswer(edit.source) ? dependents(review.edits, edit.key).length : 0; return (
                    <li key={edit.key} className="flex items-start justify-between gap-3 py-2">
                      <div>
                        <div className={failed ? 'text-ink-3 line-through' : ''}>{text}</div>
                        <div className={meta}>{!isAnswer(edit.source) ? 'by hand' : `answer to question ${Number(edit.source.slice(1)) + 1}`}{failed ? ` · could not be applied: ${failed}` : ''}</div>
                      </div>
                      <button className={`${quiet} shrink-0`} title={deps ? `Also undoes ${deps} later change${deps === 1 ? '' : 's'} that depend on it` : !isAnswer(edit.source) ? 'Undo this change' : 'Clear this answer'} onClick={() => undo(edit)}>{deps ? `Undo (+${deps})` : 'Undo'}</button>
                    </li>
                  ); })}
                </ul>
              )}
              {changeList.length > 1 && <button className={`${quiet} mt-3 text-bad`} onClick={() => { setReview((r) => ({ ...r, edits: r.edits.filter((e) => !isCorrection(e.source)), answers: {} })); close(); }}>Undo every correction</button>}
              {nSteps > 0 && <p className={`${meta} mt-2`}>Plus {nSteps} simplification change{nSteps === 1 ? '' : 's'}, listed in the simplification steps.</p>}
            </div>
          )}
        </div>
      </header>
      {notices}

      <PairedViewer
        ref={viewer}
        width={W}
        height={H}
        leftTitle="Original"
        rightTitle={asExtracted ? 'Reconstruction · as the model read it' : review.edits.length ? 'Reconstruction · with your changes' : 'Reconstruction'}
        hint={hot ? nameOf(x, hot) : null}
        onBackgroundClick={(at) => {
          setShowChanges(false);
          if (check || mode) return;
          if (pick) { if (pick.acceptPoint) { pick.acceptPoint(at); setPick(null); } return; }
          close();
        }}
        banner={mode && !check ? (
          <div className="mb-2 flex items-center justify-between rounded bg-ink px-3 py-2 text-body text-on-ink">
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {mode === 'place' ? 'Click where the new shape goes, on either picture (or drag out a box to size it).' : <>
                <span className="flex items-center gap-1" role="group" aria-label="Head of the arrows you draw">
                  {([['arrow', 'Arrow', 'Activates, leads to'], ['bar', 'Bar', 'Inhibits']] as const).map(([h, label, title]) => (
                    <button key={h} title={title} aria-pressed={drawHead === h} onClick={() => setDrawHead(h)}
                      className={`inline-flex items-center gap-1.5 rounded-[3px] px-2 py-0.5 text-body ${drawHead === h ? 'bg-panel font-semibold text-ink' : 'text-on-ink hover:bg-on-ink/15'}`}><HeadIcon head={h} />{label}</button>
                  ))}
                </span>
                Drag from the shape where it starts to where it ends (a shape, or an empty spot). For a whole cluster, hover it and drag from its grey “cluster” tab.
              </>}
            </span>
            <button className="underline underline-offset-4" onClick={() => setMode(null)}>{mode === 'draw' ? 'Done (Esc)' : 'Cancel (Esc)'}</button>
          </div>
        ) : pick ? (
          <div className="mb-2 flex items-center justify-between rounded bg-ink px-3 py-2 text-body text-on-ink">
            <span>{pick.prompt}</span><button className="underline underline-offset-4" onClick={() => setPick(null)}>Cancel (Esc)</button>
          </div>
        ) : asExtracted ? (
          <div className={`${note} mb-2`}>Showing the model's own reading. Your changes are hidden, not lost.
            <button className={`${quiet} ml-2`} onClick={() => setAsExtracted(false)}>Show my changes</button></div>
        ) : null}
        left={(unit) => <ImageLayer scene={scene} src={imageUrl} ui={ui(unit)} />}
        right={(unit) => <><MarkerDefs /><SceneSvg scene={scene} ui={ui(unit)} /></>}
        overlay={(place) => {
          if (pick || !anchorBox) return null;
          if (check) return (
            <Popover anchor={anchorBox} place={place} width={290}>
              <CheckPopover end={check.end} isNew={!check.arrow} where={checkRegion ? `open space in the ${regionName(checkRegion)}` : 'open space'}
                near={nearest(settledScene, point(check), { exclude: [], groups: true, count: 2 }).map((id) => ({ id, name: nameOf(settled.extraction, id) }))}
                onAccept={() => { addAll(freeEdits(check, newKey())); setCheck(null); }}
                onNear={(id) => {
                  if (check.arrow) add({ op: check.end === 'from' ? 'set_arrow_from' : 'set_arrow_to', id: check.arrow, to: id, value: null });
                  else add({ op: 'add_arrow', id: check.from!, to: id, value: mode === 'draw' ? drawHead : 'arrow' });
                  setCheck(null);
                }}
                onCancel={() => setCheck(null)} />
            </Popover>
          );
          if (question && qi !== null) return (
            <Popover anchor={anchorBox} place={place} width={380}>
              <QuestionPopover n={qi + 1} total={base.clarify.length} question={cleanText(base, question.question)} choices={choices} answered={answered(qi)}
                onHover={setHoverOpt} onChoose={(oi) => choose(qi, oi)} onManual={() => fixByHand(qi)} onClear={() => clearAnswer(qi)} onClose={close} />
            </Popover>
          );
          if (selId) return (
            <Popover anchor={anchorBox} place={place} width={310}>
              <EditPopover key={selId} x={x} scene={scene} id={selId} add={add} startPick={setPick} focusName={focusName === selId}
                onFreeEnd={(arrow, end, at) => setCheck({ arrow, end, ...at })} onFreeArrow={(from, at) => setCheck({ arrow: null, end: 'to', from, ...at })} onClose={close} />
            </Popover>
          );
          return null;
        }}
      />

      <ReviewPanel run={run} base={base} statuses={statuses} problems={[...run.problems, ...scene.skipped]} onOpenQuestion={openQuestion} onShow={show} onHover={setHot} />
    </div>
  );
}
