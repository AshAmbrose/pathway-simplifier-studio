/**
 * Comparison page (?compare=<run id>, linked from step 5): one figure laid out every way side by side, from the same
 * input, with the same numbers. It records what was tried: our own rules (Compact), two general-purpose network
 * layouts (ELK layered; fCoSE, Cytoscape's compound spring layout, kept here only), and order-kept compaction.
 *  - the figure as it stands before step 5 (every correction and earlier step applied);
 *  - Compact (src/layout/compact.ts);
 *  - ELK layered (src/layout/solvers/elk.ts);
 *  - fCoSE (src/layout/solvers/fcose.ts);
 *  - Squeeze, order-kept compaction (src/layout/solvers/compaction.ts).
 * Under each: crossings and the rest (measures.ts), and how the drawing uses its space (solvers/fit.ts).
 * Nothing is saved; the page only reads the run.
 */
import { useEffect, useMemo, useState } from 'react';
import { getRun, type RunRecord } from '../api.ts';
import { applyEdits } from '../edit/applyEdits.ts';
import { inOrder, stepOf } from '../edit/order.ts';
import { layOut } from '../layout/adapt.ts';
import { measure, type Measures } from '../layout/measures.ts';
import { elkLayout } from '../layout/solvers/elk.ts';
import { compactionLayout } from '../layout/solvers/compaction.ts';
import { fcoseLayout } from '../layout/solvers/fcose.ts';
import { fitMeasures } from '../layout/solvers/fit.ts';
import { DEFAULT_LAYOUT, type LayoutValue } from '../layout/value.ts';
import { toScene, type Scene } from '../render/toScene.ts';
import { traceRoutes } from '../simplify/routes.ts';
import { MarkerDefs, SceneSvg, stillUi } from './SceneSvg.tsx';
import { meta } from './ui.ts';


function Pane({ title, scene, m, note }: { title: string; scene: Scene | null; m: Measures | null; note?: string }) {
  return (
    <section className="flex min-w-0 flex-col">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <h2 className="font-semibold text-ink">{title}</h2>
        {m && <span className={`${meta} num`}>crossings {m.crossings} · behind {m.behind} · up {m.up}</span>}
      </div>
      {scene && (() => { const f = fitMeasures(scene); return <p className={`${meta} num mb-1.5`}>shape on screen {f.onScreen}px · aspect {f.aspect} · filled {Math.round(f.filled * 100)}% · shared ends {f.sharedEnds}</p>; })()}
      <div className="h-[calc(100vh-9rem)] rounded border border-line bg-white">
        {scene ? (
          <svg viewBox={`0 0 ${scene.width} ${scene.height}`} className="h-full w-full" preserveAspectRatio="xMidYMid meet">
            <MarkerDefs /><SceneSvg scene={scene} ui={stillUi(scene.width / 600)} />
          </svg>
        ) : <p className={`${meta} p-4`}>{note ?? 'Working…'}</p>}
      </div>
    </section>
  );
}

export function LayoutCompare({ runId }: { runId: string }) {
  const [run, setRun] = useState<RunRecord | null>(null);
  const [elk, setElk] = useState<LayoutValue | null>(null);
  const [elkError, setElkError] = useState<string | null>(null);
  useEffect(() => { getRun(runId).then(setRun); }, [runId]);
  // The figure just before step 5: corrections and steps 1 to 4.
  const x = useMemo(() => (run ? applyEdits(run.extraction, inOrder(run.review?.edits ?? []).filter((e) => stepOf(e.source) !== 'layout')).extraction : null), [run]);
  const W = run?.image.width ?? 1, H = run?.image.height ?? 1;
  const t = useMemo(() => (x ? traceRoutes(x) : null), [x]);
  const laid = (v: LayoutValue | null) => (x && v ? toScene(applyEdits(x, [{ op: 'set_layout', id: 'l', to: null, value: JSON.stringify(v) }]).extraction, W, H) : null);
  const compact = useMemo(() => (x && t ? layOut(x, W, H, t, DEFAULT_LAYOUT) : null), [x, t, W, H]);
  const fcose = useMemo(() => (x && t ? fcoseLayout(x, W, H, t, DEFAULT_LAYOUT) : null), [x, t, W, H]);
  const squeezed = useMemo(() => (x && t ? compactionLayout(x, W, H, t, DEFAULT_LAYOUT) : null), [x, t, W, H]);
  useEffect(() => { if (x && t) elkLayout(x, W, H, t, DEFAULT_LAYOUT).then(setElk).catch((e) => setElkError((e as Error).message)); }, [x, t, W, H]);
  const panes: [string, Scene | null][] = [
    ['Before step 5', x ? toScene(x, W, H) : null],
    ['Compact (current)', laid(compact)],
    ['ELK layered', laid(elk)],
    ['fCoSE', laid(fcose)],
    ['Squeeze (order kept)', laid(squeezed)],
  ];
  return (
    <div className="px-5 py-3">
      <h1 className="text-title font-semibold text-ink">Layout comparison: {run?.name ?? '…'}</h1>
      <p className={`${meta} mb-3`}>The same figure, laid out every way from the same input. Shape on screen: how tall a typical shape is when the whole figure fits a 1600 × 1000 window. Nothing is saved.</p>
      <div className="grid grid-cols-5 gap-4">
        {panes.map(([title, scene]) => <Pane key={title} title={title} scene={scene} m={scene ? measure(scene) : null} note={title === 'ELK layered' && elkError ? `Failed: ${elkError}` : undefined} />)}
      </div>
    </div>
  );
}
