/**
 * Two panes with one shared viewport (zoom + pan), so the original and the reconstruction stay aligned.
 * Wheel to zoom about the cursor, drag to pan, double-click to reset. `focus` moves both panes to a box.
 * Pop-ups are plain HTML laid over the right pane; `overlay` receives what it needs to place them.
 */
import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import type { BoxPx } from '../render/edgePorts.ts';

interface View { x: number; y: number; w: number; h: number }

export interface Placement {
  /** Picture coordinates → pixels inside the right pane. */
  toScreen: (x: number, y: number) => { left: number; top: number };
  paneW: number;
  paneH: number;
}

export interface ViewerHandle {
  /**
   * Moves both panes so `box` sits comfortably in view. `fill` is the share of the pane the box may take;
   * `anchorX` is where its centre lands across the pane (0.5 = middle), leaving room beside it for a pop-up.
   */
  focus: (box: BoxPx, opts?: { fill?: number; anchorX?: number }) => void;
  reset: () => void;
  /** Picture units per screen pixel at the current zoom. */
  unit: () => number;
}

const ease = (t: number) => 1 - Math.pow(1 - t, 3);

export function PairedViewer({ ref, width, height, left, right, leftTitle, rightTitle, overlay, banner, hint, help, onBackgroundClick }: {
  ref?: Ref<ViewerHandle>;
  width: number; height: number;
  left: (unit: number) => ReactNode; right: (unit: number) => ReactNode;
  leftTitle: string; rightTitle: string;
  overlay?: (p: Placement) => ReactNode;
  banner?: ReactNode;
  /** The name of whatever is under the pointer; shown in the one line under the views in place of the help text. */
  hint?: string | null;
  /** The help text under the views when nothing is hovered. */
  help?: string;
  /** A click on the picture that hit no shape, with where it landed in picture coordinates. */
  onBackgroundClick?: (at: { x: number; y: number }) => void;
}) {
  const full: View = { x: 0, y: 0, w: width, h: height };
  const [view, setView] = useState<View>(full);
  const [pane, setPane] = useState({ w: 600, h: 400 });
  const viewRef = useRef(view); viewRef.current = view;
  const paneRef = useRef(pane); paneRef.current = pane;
  const drag = useRef<{ sx: number; sy: number; v: View; scale: number; moved: boolean } | null>(null);
  const moved = useRef(false);
  const svgs = useRef<(SVGSVGElement | null)[]>([]);
  const anim = useRef(0);

  const tweenTo = (to: View) => {
    cancelAnimationFrame(anim.current);
    const from = viewRef.current, t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / 320), k = ease(t);
      setView({ x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k, w: from.w + (to.w - from.w) * k, h: from.h + (to.h - from.h) * k });
      if (t < 1) anim.current = requestAnimationFrame(step);
    };
    anim.current = requestAnimationFrame(step);
  };

  const scaleOf = (v: View, p = paneRef.current) => Math.min(p.w / v.w, p.h / v.h);

  useImperativeHandle(ref, () => ({
    focus(box, opts) {
      const fill = opts?.fill ?? 0.4, anchorX = opts?.anchorX ?? 0.5;
      const p = paneRef.current, aspect = p.w / p.h;
      // Wide enough for the box at `fill` of the pane; never closer than about a third of the picture, so the
      // surroundings stay in view; never wider than all of it.
      const w = Math.min(Math.max(width, height * aspect), Math.max(box.width / fill, (box.height / fill) * aspect, width / 2.8));
      const h = w / aspect;
      tweenTo({ x: box.x + box.width / 2 - w * anchorX, y: box.y + box.height / 2 - h / 2, w, h });
    },
    reset: () => tweenTo({ x: 0, y: 0, w: width, h: height }),
    unit: () => 1 / scaleOf(viewRef.current),
  }), [width, height]);

  // Native, non-passive wheel listener, so zooming doesn't also scroll the page.
  // The step follows how far the wheel or pinch moved, not one fixed step per event: a trackpad pinch sends many
  // small events (with ctrlKey set), which a fixed step made far too fast.
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      cancelAnimationFrame(anim.current);
      const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
      const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);
      const f = Math.min(1.2, Math.max(1 / 1.2, Math.exp(dy * (e.ctrlKey ? 0.006 : 0.0015))));
      setView((v) => {
        const w = Math.min(width * 1.5, Math.max(width / 20, v.w * f)), h = (w / v.w) * v.h;
        return { x: v.x + (v.w - w) * fx, y: v.y + (v.h - h) * fy, w, h };
      });
    };
    const els = svgs.current.filter((s): s is SVGSVGElement => !!s);
    els.forEach((s) => s.addEventListener('wheel', onWheel, { passive: false }));
    return () => els.forEach((s) => s.removeEventListener('wheel', onWheel));
  }, [width]);

  useEffect(() => setView({ x: 0, y: 0, w: width, h: height }), [width, height]);
  useEffect(() => () => cancelAnimationFrame(anim.current), []);

  // The right pane's size, for placing pop-ups and for zooming to a box.
  useLayoutEffect(() => {
    const el = svgs.current[1];
    if (!el) return;
    const measure = () => { const r = el.getBoundingClientRect(); if (r.width && r.height) setPane({ w: r.width, h: r.height }); };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** Zoom to a level (1 = the whole picture fits), keeping the middle of the view where it is. */
  const zoomTo = (level: number) => {
    const fit = { w: Math.max(width, height * (pane.w / pane.h)), h: Math.max(height, width * (pane.h / pane.w)) };
    const w = fit.w / level, h = fit.h / level, cx = view.x + view.w / 2, cy = view.y + view.h / 2;
    tweenTo(level === 1 ? { x: (width - fit.w) / 2, y: (height - fit.h) / 2, w: fit.w, h: fit.h } : { x: cx - w / 2, y: cy - h / 2, w, h });
  };
  const fitW = Math.max(width, height * (pane.w / pane.h));
  const level = fitW / view.w;

  const s = scaleOf(view, pane), unit = 1 / s;
  const ox = (pane.w - view.w * s) / 2, oy = (pane.h - view.h * s) / 2;
  const placement: Placement = { toScreen: (x, y) => ({ left: ox + (x - view.x) * s, top: oy + (y - view.y) * s }), paneW: pane.w, paneH: pane.h };

  const pane_ = (i: number, content: ReactNode, title: string) => (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{title}</div>
      <div className="relative">
        <svg
          ref={(el) => { svgs.current[i] = el; }}
          viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
          preserveAspectRatio="xMidYMid meet"
          className="block h-[70vh] w-full cursor-grab touch-none select-none rounded-xl border border-slate-200 bg-white shadow-sm active:cursor-grabbing dark:border-slate-700"
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            cancelAnimationFrame(anim.current);
            moved.current = false;
            const r = e.currentTarget.getBoundingClientRect();
            drag.current = { sx: e.clientX, sy: e.clientY, v: view, scale: Math.max(view.w / r.width, view.h / r.height), moved: false };
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d || !(e.buttons & 1)) return;
            if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 4) return;
            d.moved = true; moved.current = true;
            setView({ ...d.v, x: d.v.x - (e.clientX - d.sx) * d.scale, y: d.v.y - (e.clientY - d.sy) * d.scale });
          }}
          onPointerUp={() => { drag.current = null; }}
          onPointerLeave={() => { drag.current = null; }}
          // A pan must not also count as a click on whatever was under the pointer.
          onClickCapture={(e) => { if (moved.current) { e.stopPropagation(); moved.current = false; } }}
          onClick={(e) => {
            const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(e.currentTarget.getScreenCTM()!.inverse());
            onBackgroundClick?.({ x: p.x, y: p.y });
          }}
          onDoubleClick={() => tweenTo(full)}
        >
          {content}
        </svg>
        {i === 1 && overlay && <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl">{overlay(placement)}</div>}
      </div>
    </div>
  );

  return (
    <div>
      {banner}
      <div className="flex flex-col gap-3 lg:flex-row">
        {pane_(0, left(unit), leftTitle)}
        {pane_(1, right(unit), rightTitle)}
      </div>
      <div className="mt-1.5 flex h-5 items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
        {hint ? <span className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{hint}</span>
          : <span className="truncate">{help ?? 'Scroll to zoom · drag to pan · click a shape or arrow to fix it'}</span>}
        <span className="flex shrink-0 items-center gap-2">
          <select aria-label="Zoom" value="" onChange={(e) => e.target.value && zoomTo(Number(e.target.value))}
            className="rounded-md border border-slate-300 bg-white px-1.5 py-0.5 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">
            <option value="" disabled>Zoom {Math.round(level * 100)}%</option>
            {[[1, 'Fit (100%)'], [1.5, '150%'], [2, '200%'], [3, '300%'], [4, '400%']].map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
          <button className="underline hover:text-slate-800 dark:hover:text-slate-200" onClick={() => tweenTo(full)}>Reset view</button>
        </span>
      </div>
    </div>
  );
}
