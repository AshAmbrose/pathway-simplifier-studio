/**
 * Two panes with one shared viewport (zoom + pan), so the original and the render stay aligned.
 * Wheel to zoom about the cursor, drag to pan, double-click to reset.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';

interface View { x: number; y: number; w: number; h: number }

export function PairedViewer({ width, height, left, right, leftTitle, rightTitle }: {
  width: number; height: number; left: ReactNode; right: ReactNode; leftTitle: string; rightTitle: string;
}) {
  const full: View = { x: 0, y: 0, w: width, h: height };
  const [view, setView] = useState<View>(full);
  const drag = useRef<{ sx: number; sy: number; v: View; scale: number } | null>(null);
  const svgs = useRef<(SVGSVGElement | null)[]>([]);

  // Native, non-passive wheel listener, so zooming doesn't also scroll the page.
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
      const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
      setView((v) => {
        const f = e.deltaY < 0 ? 0.88 : 1 / 0.88;
        const w = Math.min(width * 1.5, Math.max(width / 20, v.w * f)), h = (w / v.w) * v.h;
        return { x: v.x + (v.w - w) * fx, y: v.y + (v.h - h) * fy, w, h };
      });
    };
    const els = svgs.current.filter((s): s is SVGSVGElement => !!s);
    els.forEach((s) => s.addEventListener('wheel', onWheel, { passive: false }));
    return () => els.forEach((s) => s.removeEventListener('wheel', onWheel));
  }, [width]);

  useEffect(() => setView({ x: 0, y: 0, w: width, h: height }), [width, height]);

  const pane = (i: number, content: ReactNode, title: string) => (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</div>
      <svg
        ref={(el) => { svgs.current[i] = el; }}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        preserveAspectRatio="xMidYMid meet"
        className="h-[62vh] w-full cursor-grab touch-none select-none rounded-lg border border-slate-200 bg-white active:cursor-grabbing dark:border-slate-700"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          const r = e.currentTarget.getBoundingClientRect();
          drag.current = { sx: e.clientX, sy: e.clientY, v: view, scale: Math.max(view.w / r.width, view.h / r.height) };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || !(e.buttons & 1)) return;
          setView({ ...d.v, x: d.v.x - (e.clientX - d.sx) * d.scale, y: d.v.y - (e.clientY - d.sy) * d.scale });
        }}
        onPointerUp={() => { drag.current = null; }}
        onPointerLeave={() => { drag.current = null; }}
        onDoubleClick={() => setView(full)}
      >
        {content}
      </svg>
    </div>
  );

  return (
    <div>
      <div className="flex flex-col gap-3 lg:flex-row">
        {pane(0, left, leftTitle)}
        {pane(1, right, rightTitle)}
      </div>
      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Scroll to zoom, drag to pan (both views move together), double-click to reset. Hover a shape or arrow on either side to find it on the other.
        <button className="ml-2 underline" onClick={() => setView(full)}>Reset view</button>
      </div>
    </div>
  );
}
