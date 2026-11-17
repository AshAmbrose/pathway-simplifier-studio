/**
 * The simplification steps, after Check: five steps in a fixed order (Issues, Focus, Repeats, Clusters, Layout), each skippable.
 *
 *  - Left view: the figure after every earlier step (and every correction); in step 1, the original figure
 *    instead, since its issues are best judged against what was drawn. Right view: this step's choices applied, with whatever it leaves out drawn faintly so it can be clicked back in.
 *    Zoom and pan are shared; hovering a choice outlines what it affects on both views.
 *  - The original figure opens in a small floating window.
 *  - Every choice is a change in the run's one change list, tagged with its step, applied after the corrections
 *    in step order, listed in plain words and undoable. A choice that no longer applies (say, its shape was
 *    removed in Check) is reported in its step, never dropped silently.
 *  - Step 5 (Layout) lays the figure out again; there the right view shows the new layout, fitted into the same
 *    frame as the original, and a selected shape can be dragged.
 *  - Which step is open is held by RunScreen, so the step bar here and on Check is one journey.
 */
import { useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import type { RunRecord } from '../api.ts';
import { applyEdits, dependents } from '../edit/applyEdits.ts';
import { cleanText, describeEdit, nameOf } from '../edit/describe.ts';
import { layOut } from '../layout/adapt.ts';
import { measure } from '../layout/measures.ts';
import { DEFAULT_LAYOUT, type LayoutOptions, type LayoutValue } from '../layout/value.ts';
import { inOrder, newKey, stepOf, stepSource } from '../edit/order.ts';
import type { BoxPx } from '../render/edgePorts.ts';
import { boxOf, toScene, union, type Scene } from '../render/toScene.ts';
import { findIssues, type Issue } from '../simplify/issues.ts';
import { collapseEdit, listClusters } from '../simplify/clusters.ts';
import { findRepeats, type RepeatGroup } from '../simplify/repeats.ts';
import { focusHidden, items, setItem, toggleShape, traceRoutes } from '../simplify/routes.ts';
import { EMPTY_SIMPLIFY, STEPS, type AppliedEdit, type Edit, type Review, type Simplify, type StepId } from '../types/extraction.ts';
import { Check, ChevronDown, Download, Image as ImageIcon, ListChecks } from 'lucide-react';
import { FloatingOriginal } from './FloatingOriginal.tsx';
import { body, button, ICON, meta, okNote, quiet, warnNote } from './ui.ts';
import { PairedViewer, type ViewerHandle } from './PairedViewer.tsx';
import { ImageLayer, MarkerDefs, SceneSvg, type Mark, type SceneUi } from './SceneSvg.tsx';
import { STEP_INFO, StepBar, stepTitle, type JourneyStep } from './StepBar.tsx';
import { ClustersStep, type ClusterDraft } from './steps/ClustersStep.tsx';
import { FocusStep } from './steps/FocusStep.tsx';
import { RepeatsStep } from './steps/RepeatsStep.tsx';
import { IssuesStep } from './steps/IssuesStep.tsx';
import { LayoutStep, type StyleReplaces } from './steps/LayoutStep.tsx';

const chip = button;
const BUILT: StepId[] = ['issues', 'focus', 'repeats', 'clusters', 'layout'];
const noop = () => {};

/** What resetting a step clears from the step record (its changes are cleared separately). */
const RESET: Partial<Record<StepId, (s: Simplify) => Simplify>> = {
  issues: (s) => ({ ...s, issues: {} }),
  focus: (s) => ({ ...s, focus: EMPTY_SIMPLIFY.focus }),
  repeats: (s) => ({ ...s, panels: null }),
  layout: (s) => ({ ...s, layout: undefined }),
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
  const [activeRepeat, setActiveRepeat] = useState<string | null>(null);
  const [draft, setDraft] = useState<ClusterDraft | null>(null);
  const [layoutSel, setLayoutSel] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [showChanges, setShowChanges] = useState(false);
  const viewer = useRef<ViewerHandle>(null);
  const changesBox = useRef<HTMLDivElement>(null);

  // Escape, or a click anywhere outside it, closes the change list; Escape also lets go of the highlighted issue.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setShowChanges(false); setActiveIssue(null); setActiveRepeat(null); setDraft(null); setLayoutSel(null); } };
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
  // Nothing is left out by the layout, and its picture has its own size, so it shows no faded copies.
  const right = useMemo(() => (afterScene.width === W && afterScene.height === H ? withGhosts(afterScene, beforeScene) : { scene: afterScene, ghosts: new Set<string>() }), [afterScene, beforeScene, W, H]);
  // A laid-out picture (step 5) has its own size: the right view then zooms and pans on its own, fitting it.
  const ownSize = right.scene.width !== W || right.scene.height !== H;
  const fit = { k: 1, ox: 0, oy: 0 };
  const toFrame = (b: BoxPx): BoxPx => ({ x: fit.ox + b.x * fit.k, y: fit.oy + b.y * fit.k, width: b.width * fit.k, height: b.height * fit.k });

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
  // Steps 3 and 4 work on the figure just before them; the parts come from the same tracing as step 2.
  const stepTracing = useMemo(() => (step === 'repeats' ? traceRoutes(before.extraction) : null), [step, before]);
  const repeats = useMemo(() => (stepTracing ? findRepeats(before.extraction, stepTracing, s.panels !== 'one') : null), [stepTracing, before, s.panels]);
  const clusters = useMemo(() => (step === 'clusters' ? listClusters(before.extraction) : []), [step, before]);
  // Step 5: the layout these switches would give, worked out from the figure just before the step. A stored layout
  // that differs from it is out of date (the figure or the switches changed since).
  const lopts: LayoutOptions = s.layout ?? DEFAULT_LAYOUT;
  const layoutTracing = useMemo(() => (step === 'layout' ? traceRoutes(before.extraction) : null), [step, before]);
  const proposal = useMemo(() => (layoutTracing ? JSON.stringify(layOut(before.extraction, W, H, layoutTracing, lopts)) : null), [layoutTracing, before, W, H, lopts]);
  const layoutEdit = stepEdits.find((e) => e.op === 'set_layout');
  const layoutStale = !!layoutEdit && !!proposal && layoutEdit.value !== proposal;
  const layoutMoves = stepEdits.filter((e) => e.op === 'set_box');
  const layoutNumbers = useMemo(() => {
    if (step !== 'layout' || !proposal) return null;
    const laid = layoutEdit ? afterScene : toScene(applyEdits(before.extraction, [{ op: 'set_layout', id: 'layout', to: null, value: proposal }]).extraction, W, H);
    return { before: measure(beforeScene), after: measure(laid) };
  }, [step, proposal, layoutEdit, afterScene, before, beforeScene, W, H]);
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

  /** Step 3: one card's choice. Its merges are rewritten: every merged copy goes into the kept one. */
  const setRepeat = (g: RepeatGroup, keeper: string, merged: string[]) => setReview((r) => ({
    ...r,
    edits: [...r.edits.filter((e) => !(stepOf(e.source) === 'repeats' && g.copies.includes(e.id))),
      ...merged.filter((c) => c !== keeper).map((c) => stamp('repeats')({ op: 'merge_into', id: c, to: keeper, value: null }))],
  }));
  /** Step 3's parts question. A new answer clears the step's merges, which were offered under the old one. */
  const setPanels = (v: 'conditions' | 'one') => setReview((r) => ({
    ...r, edits: r.edits.filter((e) => stepOf(e.source) !== 'repeats'), simplify: { ...(r.simplify ?? EMPTY_SIMPLIFY), panels: v },
  }));
  /** Step 4: collapse the ticked shapes into one, named as typed (or by its members). */
  const collapseNow = (d: ClusterDraft) => {
    if (d.ticked.length < 2) return;
    const key = newKey();
    setReview((r) => ({ ...r, edits: [...r.edits, { ...collapseEdit(before.extraction, key, d.ticked, d.name), key, source: stepSource('clusters'), at: new Date().toISOString() }] }));
    setDraft(null);
  };

  /** Step 5: store the layout (worked out for these switches); moves made by hand on an older layout go with it. */
  const layoutNow = (opts: LayoutOptions) => {
    if (!layoutTracing) return;
    const value = JSON.stringify(layOut(before.extraction, W, H, layoutTracing, opts));
    setReview((r) => ({ ...r, edits: [...r.edits.filter((e) => !(stepOf(e.source) === 'layout' && (e.op === 'set_layout' || e.op === 'set_box'))),
      stamp('layout')({ op: 'set_layout', id: 'layout', to: null, value })] }));
  };
  /** Step 5's switches. With a layout and no hand moves, it is redone straight away; otherwise it is marked out of date. */
  const setLayoutOpts = (o: LayoutOptions) => {
    setSimplify((v) => ({ ...v, layout: o }));
    if (layoutEdit && !layoutMoves.length) layoutNow(o);
  };
  const setRestyle = (on: boolean) => setReview((r) => ({
    ...r, edits: [...r.edits.filter((e) => !(stepOf(e.source) === 'layout' && e.op === 'restyle')), ...(on ? [stamp('layout')({ op: 'restyle', id: 'style', to: null, value: null })] : [])],
  }));
  const undoMoves = () => setReview((r) => ({ ...r, edits: r.edits.filter((e) => !(stepOf(e.source) === 'layout' && e.op === 'set_box')) }));
  /** A box on the laid-out picture, in percent of its canvas. */
  const toPercent = (b: BoxPx) => { const w = right.scene.width, h = right.scene.height; return [b.x / w * 100, b.y / h * 100, b.width / w * 100, b.height / h * 100].map((v) => Math.round(v * 100) / 100).join(','); };
  /** Step 5: a shape dragged on the laid-out view. One move per shape: a new drag replaces its last. */
  const moveNode = (id: string, b: BoxPx) => setReview((r) => ({
    ...r, edits: [...r.edits.filter((e) => !(stepOf(e.source) === 'layout' && e.op === 'set_box' && e.id === id)), stamp('layout')({ op: 'set_box', id, to: null, value: toPercent(b) })],
  }));

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
  const go = (k: JourneyStep) => { onStep(k); setHoverIds(null); setActiveIssue(null); setActiveRepeat(null); setDraft(null); setLayoutSel(null); setShowChanges(false); };
  const next = () => {
    if (BUILT.includes(step)) setSimplify((v) => ({ ...v, steps: { ...v.steps, [step]: 'done' } }));
    if (at < STEPS.length - 1) go(STEPS[at + 1]);
    else setFinished(true);
  };
  /**
   * Saves the simplified figure as an SVG file: the right view's picture, whole, without the on-screen marks.
   * A stopgap until the editing canvas (the next update) takes over Finish.
   */
  const downloadSvg = () => {
    const svg = document.querySelector('[data-pane="right"] svg');
    if (!svg) return;
    const copy = svg.cloneNode(true) as SVGSVGElement;
    const w = right.scene.width, h = right.scene.height;
    copy.setAttribute('viewBox', `0 0 ${w} ${h}`);
    copy.setAttribute('width', String(Math.round(w)));
    copy.setAttribute('height', String(Math.round(h)));
    copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    copy.removeAttribute('class');
    copy.querySelector('[data-scene]')?.parentElement?.setAttribute('transform', '');
    const blob = new Blob([new XMLSerializer().serializeToString(copy)], { type: 'image/svg+xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${run.name.replace(/[^\w-]+/g, '-')}-simplified.svg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  /** Undo one change from the list. A "left out" from step 2 is undone by keeping that shape, so the step's choices stay true. */
  const undo = (e: AppliedEdit) => {
    if (stepOf(e.source) === 'focus') setFocus(toggleShape(s.focus, tracing, e.id, false));
    // Undoing the layout takes the moves made on it too: they only make sense on that layout.
    else if (e.op === 'set_layout') setReview((r) => ({ ...r, edits: r.edits.filter((v) => !(stepOf(v.source) === 'layout' && (v.op === 'set_layout' || v.op === 'set_box'))) }));
    // Anything later that only exists because of this change (a collapsed shape's later changes) goes with it.
    else setReview((r) => { const gone = new Set([e.key, ...dependents(r.edits, e.key).map((d) => d.key)]); return { ...r, edits: r.edits.filter((v) => !gone.has(v.key)) }; });
  };

  // --- on the pictures ---
  const show = (ids: string[]) => {
    const boxes = ids.map((id) => boxOf(right.scene, id)).filter((b): b is BoxPx => !!b).map(toFrame);
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
    } else if (step === 'repeats') {
      const g = repeats?.groups.find((v) => v.copies.includes(id));
      if (!g) return;
      setActiveRepeat(g.key);
      document.querySelector(`[data-repeat="${CSS.escape(g.key)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } else if (step === 'layout') {
      setLayoutSel(layoutEdit && after.extraction.elements.some((v) => v.id === id) ? id : null);
    } else if (step === 'clusters') {
      if (!before.extraction.elements.some((v) => v.id === id)) {
        // A click on a cluster's outline opens its card.
        if (clusters.some((c) => c.id === id) && !draft) setDraft({ cluster: id, ticked: [], name: null });
        return;
      }
      if (draft) setDraft({ ...draft, ticked: draft.ticked.includes(id) ? draft.ticked.filter((v) => v !== id) : [...draft.ticked, id] });
      else {
        const c = clusters.find((v) => v.members.includes(id));
        if (c) { setDraft({ cluster: c.id, ticked: [id], name: null }); document.querySelector(`[data-cluster="${CSS.escape(c.id)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
      }
    }
  };
  const marks = new Map<string, Mark>();
  const activeId = issues.find((i) => i.key === activeIssue)?.id;
  if (step === 'issues' && activeId) marks.set(activeId, 'about');
  if (step === 'repeats') for (const id of repeats?.groups.find((g) => g.key === activeRepeat)?.copies ?? []) marks.set(id, 'about');
  if (step === 'clusters' && draft) {
    for (const id of clusters.find((c) => c.id === draft.cluster)?.members ?? []) marks.set(id, 'candidate');
    for (const id of draft.ticked) marks.set(id, 'about');
  }
  for (const id of hoverIds ?? []) marks.set(id, 'hover');
  // In step 5 the laid-out view (only) lets the selected shape be dragged.
  const ui = (unit: number, faded?: Set<string>, laidOut = false): SceneUi => ({
    unit, hot, onHover: setHot, marks, selected: laidOut ? layoutSel : null, touched: new Set(), pins: [], quiet: false, picking: false, editable: false,
    drawing: false, placing: false, onPlace: noop, onNewArrow: noop, onSelect: select, onPin: noop, onMoveBadge: noop,
    onArrowEnd: noop, onArrowEndFree: noop, onMoveNode: laidOut ? moveNode : noop, faded, movable: laidOut,
  });
  const hint = hot ? (() => {
    const name = after.extraction.elements.some((v) => v.id === hot) || after.extraction.arrows.some((v) => v.id === hot) ? nameOf(after.extraction, hot) : nameOf(before.extraction, hot);
    if (step === 'layout' && layoutEdit && after.extraction.elements.some((v) => v.id === hot)) return `${name} · ${layoutSel === hot ? 'drag it to move it' : 'click, then drag to move it'}`;
    if (step === 'clusters' && draft && before.extraction.elements.some((v) => v.id === hot)) return `${name} · click to ${draft.ticked.includes(hot) ? 'untick' : 'tick'} it`;
    if (step !== 'focus' || !focusBase.elements.some((v) => v.id === hot)) return name;
    return `${name} · ${hidden.has(hot) ? 'left out: click to bring it back' : 'click to leave it out'}`;
  })() : null;

  /** What the consistent style would replace: the figure's own colours, and colour meanings noted in step 1. */
  const styleReplaces = (): StyleReplaces => {
    const x = before.extraction;
    const distinct = (v: (string | null)[]) => new Set(v.filter((c): c is string => !!c).map((c) => c.toLowerCase())).size;
    const meanings = Object.entries(s.issues).filter(([k]) => k.startsWith('meaning:'))
      .map(([k, d]) => d.note || cleanText(issueBase, issues.find((i) => i.key === k)?.basis)).filter(Boolean);
    return { fills: distinct(x.elements.map((e) => e.fill)), arrowColours: distinct(x.arrows.map((a) => a.colour)), textColours: distinct(x.elements.map((e) => e.textColour)), meanings };
  };

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
    <div className="mx-auto max-w-[1800px] px-5 py-3">
      <header className="mb-2 flex flex-wrap items-center gap-3">
        {top}
        <span className="flex-1" />
        <button className={chip} aria-pressed={showOriginal} onClick={() => setShowOriginal((v) => !v)}><ImageIcon size={ICON} />{showOriginal ? 'Hide original' : 'Original'}</button>
        <div className="relative" ref={changesBox}>
          <button className={chip} aria-expanded={showChanges} onClick={() => setShowChanges((v) => !v)}><ListChecks size={ICON} /><span className="num">{simplifications}</span> change{simplifications === 1 ? '' : 's'}<ChevronDown size={ICON} className="text-ink-3" /></button>
          {showChanges && (
            <div className="absolute right-0 z-20 mt-1 max-h-[60vh] w-[26rem] overflow-y-auto rounded border border-line-2 bg-panel p-4 text-body shadow-[0_8px_24px_rgb(0_0_0/0.14)]">
              <p className={meta}>
                Built on {corrections} correction{corrections === 1 ? '' : 's'} made in Check. <button className="underline" onClick={backToCheck}>Back to Check</button>
              </p>
              {simplifications === 0 && <p className="mt-2 text-ink-3">No simplifications yet. The figure is exactly the corrected reconstruction.</p>}
              {STEPS.map((k) => {
                const list = described.filter((d) => stepOf(d.e.source) === k);
                if (!list.length) return null;
                return (
                  <section key={k} className="mt-4">
                    <h3 className="font-semibold text-ink">{stepTitle(k)}</h3>
                    <ul className="mt-1 divide-y divide-line border-y border-line">
                      {list.map(({ e, text }) => (
                        <li key={e.key} className="flex items-start justify-between gap-3 py-2 hover:bg-sunk"
                          onMouseEnter={() => setHoverIds([e.id])} onMouseLeave={() => setHoverIds(null)}>
                          <div>
                            <div className={failed.has(e.key) ? 'text-ink-3 line-through' : ''}>{text}</div>
                            {failed.has(e.key) && <div className={meta}>could not be applied: {failed.get(e.key)}</div>}
                          </div>
                          <button className={`${quiet} shrink-0`} onClick={() => undo(e)}>Undo</button>
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
      {finished && (
        <div className={`${okNote} mb-2 flex flex-wrap items-center justify-between gap-2`}>
          <span className="flex items-center gap-2"><Check size={ICON} />Simplification finished and saved. An editing canvas for final tweaks is planned; for now you can download the figure.</span>
          <span className="flex shrink-0 items-center gap-3">
            <button className={button} onClick={downloadSvg}><Download size={ICON} />Download SVG</button>
            <button className={quiet} onClick={() => setFinished(false)}>Close</button>
          </span>
        </div>
      )}
      {openQuestions > 0 && (
        <div className={`${warnNote} mb-2 flex items-center justify-between`}>
          <span><span className="num">{openQuestions}</span> question{openQuestions === 1 ? ' is' : 's are'} still open in Check. You can carry on: answers given there will show up here.</span>
          <button className={`${quiet} ml-3 shrink-0 text-warn-ink`} onClick={backToCheck}>Back to Check</button>
        </div>
      )}

      <StepBar current={step} status={s.steps} choices={choices} onJump={go} onBack={() => go(at > 0 ? STEPS[at - 1] : 'check')}
        onSkip={() => { clearStep(step, 'skipped'); if (at < STEPS.length - 1) go(STEPS[at + 1]); }} onNext={next} onReset={() => clearStep(step, null)} />

      <div className="mt-4 flex flex-col gap-6 lg:flex-row">
        {/* The step's panel reads as a document: its title, what it does, then its sections divided by hairlines. */}
        <aside className="w-full shrink-0 lg:max-h-[calc(100vh-11rem)] lg:w-[380px] lg:overflow-y-auto lg:pr-2">
          <h2 className="text-title font-semibold text-ink">{stepTitle(step)}</h2>
          <p className={`${body} mb-4 mt-1`}>{info.what}</p>
          {step === 'focus' && <p className={`${meta} -mt-2 mb-4`}>Traced from the figure as it stands after Check and step 1, so your fixes, names and left-out parts are already included.</p>}
          {stepFailures.length > 0 && (
            <div className={`${warnNote} mb-4`}>
              {stepFailures.length} choice{stepFailures.length === 1 ? '' : 's'} in this step no longer appl{stepFailures.length === 1 ? 'ies' : 'y'}, usually because something changed in Check:
              <ul className="mt-1 list-disc pl-5">{stepFailures.map((e) => <li key={e.key}>{described.find((d) => d.e.key === e.key)?.text}: {failed.get(e.key)}</li>)}</ul>
            </div>
          )}
          {step === 'issues' && (
            <IssuesStep x={before.extraction} issues={issues} edits={stepEdits} decisions={s.issues} names={names} active={activeIssue}
              onSettle={settleIssue} onHover={setHoverIds} onSelect={(i) => { setActiveIssue(i.key); show([i.id]); }} />
          )}
          {step === 'focus' && focusStale && (
            <div className={`${warnNote} mb-4`}>
              The figure changed since these choices were made (in Check, or in an earlier step). They now leave out {hidden.size} shape{hidden.size === 1 ? '' : 's'}; the picture still shows the {focusEdits.length} left out before.
              <button className={`${quiet} ml-1 font-semibold text-warn-ink`} onClick={() => setFocus(s.focus)}>Update</button>
            </div>
          )}
          {step === 'focus' && (
            <FocusStep x={before.extraction} tracing={tracing} focus={s.focus} hidden={hidden} arrowsLeftOut={arrowsLeftOut}
              onItem={(key, on) => setFocus(setItem(s.focus, tracing, key, on))}
              onOnly={(key) => setFocus({ off: items(tracing).map((i) => i.key).filter((k) => k !== key), keep: [], drop: [] })}
              onAll={() => setFocus(EMPTY_SIMPLIFY.focus)}
              onRestore={(id) => setFocus(toggleShape(s.focus, tracing, id, false))}
              onShape={(id, keptNow) => setFocus(toggleShape(s.focus, tracing, id, keptNow))}
              onHover={setHoverIds} onShow={show} />
          )}
          {step === 'repeats' && repeats && stepTracing && (
            <RepeatsStep x={before.extraction} tracing={stepTracing} panels={s.panels ?? null} groups={repeats.groups} apart={repeats.apart} edits={stepEdits} active={activeRepeat}
              onPanels={setPanels} onSet={setRepeat}
              onAll={() => setReview((r) => ({ ...r, edits: [...r.edits.filter((e) => stepOf(e.source) !== 'repeats'),
                ...repeats.groups.flatMap((g) => g.copies.filter((c) => c !== g.keeper).map((c) => stamp('repeats')({ op: 'merge_into', id: c, to: g.keeper, value: null })))] }))}
              onNone={() => setReview((r) => ({ ...r, edits: r.edits.filter((e) => stepOf(e.source) !== 'repeats') }))}
              onHover={setHoverIds} onSelect={(g) => { setActiveRepeat(g.key); show(g.copies); }} />
          )}
          {step === 'clusters' && (
            <ClustersStep x={before.extraction} clusters={clusters} edits={stepEdits} draft={draft} names={names}
              onDraft={setDraft} onCollapse={collapseNow} onUndo={undo} onHover={setHoverIds} onShow={show} />
          )}
          {step === 'layout' && layoutNumbers && proposal && (
            <LayoutStep x={before.extraction} laidOut={!!layoutEdit} stale={layoutStale} opts={lopts}
              before={layoutNumbers.before} after={layoutNumbers.after}
              notes={(JSON.parse(layoutEdit?.value ?? proposal) as LayoutValue).notes}
              restyled={stepEdits.some((e) => e.op === 'restyle')} replaces={styleReplaces()} hasSublabels={before.extraction.elements.some((e) => e.sublabel)}
              moves={layoutMoves.length}
              onLayout={() => layoutNow(lopts)}
              onRule={(k, on) => setLayoutOpts({ ...lopts, off: on ? lopts.off.filter((v) => v !== k) : [...lopts.off, k] })}
              onSublabels={(on) => setLayoutOpts({ ...lopts, sublabels: on })}
              onMode={(mode) => setLayoutOpts({ ...lopts, mode, off: [] })}
              onRestyle={setRestyle} onUndoMoves={undoMoves} onHover={setHoverIds} onShow={show} />
          )}
          {!BUILT.includes(step) && <p className={body}>This step comes in a later update. Skip it, or press Next: nothing changes.</p>}
        </aside>
        <div className="min-w-0 flex-1">
          {/* A new step starts with the whole picture in view (keyed by step, so zoom and pan reset). */}
          <PairedViewer
            key={step}
            ref={viewer}
            rightSize={ownSize ? { width: right.scene.width, height: right.scene.height } : undefined}
            width={W}
            height={H}
            leftTitle={step === 'issues' ? 'Original' : 'Before this step'}
            rightTitle={`After ${STEP_INFO[step].name.toLowerCase()}`}
            hint={hint}
            help={step === 'layout' ? 'Scroll to zoom · drag to pan · after laying out, click a shape on the right and drag it to move it' : step === 'focus' ? 'Scroll to zoom · drag to pan · click a shape to leave it out or bring it back' : 'Scroll to zoom · drag to pan · faded = left out by this step'}
            left={(unit) => step === 'issues'
              ? <ImageLayer scene={beforeScene} src={imageUrl} ui={ui(unit)} />
              : <><MarkerDefs /><SceneSvg scene={beforeScene} ui={ui(unit)} /></>}
            right={(unit) => (
              <><MarkerDefs />
                <g transform={`translate(${fit.ox} ${fit.oy}) scale(${fit.k})`}>
                  <SceneSvg scene={right.scene} ui={ui(unit / fit.k, right.ghosts, step === 'layout' && !!layoutEdit)} />
                </g>
              </>)}
          />
        </div>
      </div>
      {showOriginal && <FloatingOriginal src={imageUrl} onClose={() => setShowOriginal(false)} />}
    </div>
  );
}
