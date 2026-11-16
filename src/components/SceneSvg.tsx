/**
 * Draws a Scene: only what was extracted (plus the user's changes), at its position and with its look.
 * Arrowheads take their line's colour (context-stroke); badges show the modification text as written.
 *
 * Review marks sit on top, sized in screen pixels (`unit` = picture units per pixel) so they stay small at any zoom:
 * numbered pins for the model's questions, outlines for the shapes a question concerns, a dot on changed items.
 * Dragging is a shortcut, never the only route: a badge onto another shape, an arrow's end onto another shape,
 * or the selected shape to move it.
 */
import { useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import type { Scene, SceneNode } from '../render/toScene.ts';
import { anchorOf, boxOf, colour, hitTest, wrapLabel } from '../render/toScene.ts';
import type { BoxPx } from '../render/edgePorts.ts';
import { readableTextColors } from '../render/textContrast.ts';

const HL = '#f97316';
const SEL = '#2563eb';
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export type Mark = 'about' | 'candidate' | 'hover';
/** `warn`: answered, but the answer could not be applied by itself and still needs a fix by hand. */
export interface Pin { n: number; id: string; done: boolean; active: boolean; warn?: boolean }

/** Everything the review screen layers over the two views. Both views get the same object. */
export interface SceneUi {
  unit: number;
  hot: string | null;
  onHover: (id: string | null) => void;
  marks: Map<string, Mark>;
  selected: string | null;
  touched: Set<string>;
  pins: Pin[];
  /** A question or a "click the target" step is open: pins and change dots fade back. */
  quiet: boolean;
  picking: boolean;
  editable: boolean;
  /** "+ Arrow" mode: pressing any shape starts a new arrow. */
  drawing: boolean;
  /** "+ Shape" mode: a click (or a dragged-out box) on either view places a new shape there. */
  placing: boolean;
  onPlace: (box: BoxPx | { x: number; y: number }) => void;
  /** A new arrow drawn from a shape: to another shape or cluster, or (to = null) to an empty spot. */
  onNewArrow: (from: string, to: string | null, at: { x: number; y: number }) => void;
  onSelect: (id: string) => void;
  onPin: (n: number) => void;
  onMoveBadge: (from: string, badge: string, to: string) => void;
  onArrowEnd: (arrow: string, end: 'from' | 'to', to: string) => void;
  /** An arrow's end was dropped where there is no shape: open space or a compartment. The screen asks before accepting. */
  onArrowEndFree: (arrow: string, end: 'from' | 'to', at: { x: number; y: number }) => void;
  onMoveNode: (id: string, box: BoxPx) => void;
}

export function MarkerDefs() {
  return (
    <defs>
      {/* Marker shapes from BioPathway Studio (SvgReactionMarkerDefs), coloured by the line. */}
      <marker id="m-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1 L 9 5 L 0 9 z" fill="context-stroke" />
      </marker>
      <marker id="m-bar" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <line x1="8" y1="0" x2="8" y2="10" stroke="context-stroke" strokeWidth="2.8" strokeLinecap="round" />
      </marker>
      <marker id="m-other" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 1 2 L 8 5 L 1 8" stroke="context-stroke" strokeWidth="2" fill="none" strokeLinecap="round" />
      </marker>
    </defs>
  );
}

const REGION_FILL: Record<string, string> = {
  extracellular: '#f8fafc', plasma_membrane: '#e2e8f0', cytoplasm: '#f1f5f9', nucleus: '#eef2ff',
  endosome: '#ecfdf5', mitochondrion: '#fff7ed', ER: '#fdf4ff', other: '#f8fafc',
};
const dashFor = (s: string | null) => (s && /dash|broken|dott/i.test(s) ? '10 6' : undefined);

function NodeShape({ n, hot }: { n: SceneNode; hot: boolean }) {
  const fill = colour(n.fill, n.outline === 'text only' ? 'none' : '#f1f5f9');
  const stroke = hot ? HL : n.outline === 'text only' ? 'none' : '#475569';
  const sw = hot ? 3 : 1;
  const { width: w, height: h } = n;
  if (n.kind === 'dna') {
    const waves = Math.max(2, Math.round(w / Math.max(12, h)));
    const pts = Array.from({ length: waves * 8 + 1 }, (_, i) => `${(i / (waves * 8)) * w},${h / 2 + Math.sin((i / 8) * Math.PI * 2) * h * 0.35}`);
    return <g><rect width={w} height={h} fill="transparent" stroke={hot ? HL : 'none'} strokeWidth={sw} /><polyline points={pts.join(' ')} fill="none" stroke={colour(n.fill, '#7c3aed')} strokeWidth={Math.max(1.5, h * 0.08)} /></g>;
  }
  if (n.outline === 'oval' || n.outline === 'circle')
    return <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} fill={fill} stroke={stroke} strokeWidth={sw} />;
  const rx = n.outline === 'rounded box' ? Math.min(h / 2.5, 12) : n.outline === 'box' ? 2 : 4;
  // A text-only shape still needs something to click.
  return <rect width={w} height={h} rx={rx} fill={fill === 'none' ? 'transparent' : fill} stroke={stroke} strokeWidth={sw} strokeDasharray={n.outline === 'other' ? '3 2' : undefined} />;
}

function NodeLabel({ n, maxFs }: { n: SceneNode; maxFs: number }) {
  if (!n.label) return null;
  // Size from the box height, but never wider than the box (longest word) and never large relative to the figure.
  const longest = Math.max(...n.label.split(/\s+/).map((w) => w.length), 1);
  let fs = clamp(Math.min(n.height * 0.42, n.width / (longest * 0.62)), 6, maxFs);
  let lines = wrapLabel(n.label, n.width, fs);
  while (lines.length * fs * 1.15 > n.height * 1.05 && fs > 6) { fs -= 0.5; lines = wrapLabel(n.label, n.width, fs); }
  const fill = colour(n.fill, '#ffffff');
  const c = n.outline === 'text only' ? { text: colour(n.textColour, '#0f172a'), halo: 'rgba(255,255,255,0.85)' } : readableTextColors(fill, n.textColour ?? undefined);
  const top = n.height / 2 - ((lines.length - 1) * fs * 1.15) / 2;
  return (
    <text x={n.width / 2} textAnchor="middle" fontSize={fs} fontFamily="ui-sans-serif, system-ui, sans-serif" fontWeight={600}
      fill={c.text} stroke={c.halo} strokeWidth={fs * 0.18} paintOrder="stroke" style={{ pointerEvents: 'none' }}>
      {lines.map((l, i) => <tspan key={i} x={n.width / 2} y={top + i * fs * 1.15 + fs * 0.35}>{l}</tspan>)}
    </text>
  );
}

/** Where a shape's badges sit, relative to the shape. Shared by the drawing and the drag ghost. */
function badgeLayout(n: SceneNode) {
  const r = clamp(n.height * 0.22, 5, 10);
  // Laid out right to left along the top edge, each as wide as its text, so a long badge doesn't cover its neighbours.
  let right = n.width + r * 0.4;
  return n.mods.map((m) => {
    const fs = clamp(r * (m.text.length > 2 ? 0.75 : 1.05), 5, 11);
    const wide = Math.max(r * 2, m.text.length * fs * 0.62 + 4);
    const cx = right - wide / 2;
    right -= wide + r * 0.1;
    return { text: m.text, r, fs, cx, cy: -r * 0.3, wide };
  });
}

function BadgePill({ b, stroke = '#334155', opacity = 1 }: { b: ReturnType<typeof badgeLayout>[number]; stroke?: string; opacity?: number }) {
  return (
    <g opacity={opacity}>
      <rect x={-b.wide / 2} y={-b.r} width={b.wide} height={b.r * 2} rx={b.r} fill="#ffffff" stroke={stroke} strokeWidth={stroke === '#334155' ? 1 : 2} />
      <text y={b.fs * 0.35} textAnchor="middle" fontSize={b.fs} fontWeight={700} fontFamily="ui-sans-serif, system-ui" fill="#0f172a" style={{ pointerEvents: 'none' }}>{b.text}</text>
    </g>
  );
}

/** Outlines for the shapes a question concerns, the answers on offer, and the selected item. */
function Marks({ scene, ui, arrows }: { scene: Scene; ui: SceneUi; arrows: 'path' | 'ends' }) {
  const u = ui.unit;
  const out: React.ReactNode[] = [];
  const outline = (id: string, key: string, stroke: string, width: number, dash?: string, fill?: string) => {
    const a = scene.arrows.find((v) => v.id === id);
    if (a && arrows === 'path') {
      out.push(<path key={key} d={a.d} fill="none" stroke={stroke} strokeWidth={width * u * 1.6} strokeOpacity={0.45} strokeLinecap="round" style={{ pointerEvents: 'none' }} />);
      return;
    }
    if (a) {
      // On the original there is no drawn path to trace: show the reconstruction's route, dashed.
      out.push(<path key={key} d={a.d} fill="none" stroke={stroke} strokeWidth={width * u} strokeDasharray={`${6 * u} ${5 * u}`} strokeLinecap="round" style={{ pointerEvents: 'none' }} />);
      return;
    }
    const b = boxOf(scene, id);
    if (!b) return;
    const pad = 3 * u;
    out.push(<rect key={key} x={b.x - pad} y={b.y - pad} width={b.width + pad * 2} height={b.height + pad * 2} rx={5 * u} fill={fill ?? 'none'} stroke={stroke} strokeWidth={width * u}
      strokeDasharray={dash ? dash.split(' ').map((v) => Number(v) * u).join(' ') : undefined} style={{ pointerEvents: 'none' }} />);
  };
  for (const [id, m] of ui.marks) {
    if (m === 'about') outline(id, 'm-' + id, HL, 2.5);
    else if (m === 'candidate') outline(id, 'm-' + id, HL, 2, '5 4');
    else outline(id, 'm-' + id, HL, 4, undefined, 'rgba(249,115,22,0.14)');
  }
  if (ui.selected) outline(ui.selected, 'sel', SEL, 2.5);
  return <>{out}</>;
}

/** Numbered pins for open questions (a small tick once answered), and a dot on each changed item. */
function PinsAndDots({ scene, ui, dots }: { scene: Scene; ui: SceneUi; dots: boolean }) {
  const u = ui.unit;
  const seen = new Map<string, number>();
  return (
    <>
      {dots && [...ui.touched].map((id) => {
        const a = scene.arrows.find((v) => v.id === id);
        const b = a ? null : boxOf(scene, id);
        const p = a ? { x: a.midX, y: a.midY } : b ? { x: b.x, y: b.y + b.height } : null;
        return p && <circle key={'d-' + id} cx={p.x} cy={p.y} r={3.5 * u} fill={SEL} stroke="#ffffff" strokeWidth={1.2 * u} opacity={ui.quiet ? 0.25 : 1} style={{ pointerEvents: 'none' }}><title>Changed from the model's reading</title></circle>;
      })}
      {ui.pins.map((p) => {
        const at = anchorOf(scene, p.id);
        if (!at) return null;
        const k = seen.get(p.id) ?? 0; seen.set(p.id, k + 1);
        const r = (p.done ? 6.5 : 9) * u;
        return (
          <g key={'p-' + p.n} transform={`translate(${at.x + (k * 20 + (at.onArrow ? 15 : 0)) * u},${at.y})`} opacity={ui.quiet && !p.active ? 0.3 : 1} style={{ cursor: 'pointer' }}
            onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); ui.onPin(p.n); }}>
            <title>{p.warn ? `Question ${p.n}: answered, but still needs a fix by hand` : p.done ? `Question ${p.n}: answered (click to change)` : `Question ${p.n}`}</title>
            <circle r={r} fill={p.warn ? '#d97706' : p.done ? '#16a34a' : HL} stroke="#ffffff" strokeWidth={(p.active ? 2.5 : 1.5) * u} />
            <text y={(p.done ? 2.4 : 3.6) * u} textAnchor="middle" fontSize={(p.done ? 7 : 10.5) * u} fontWeight={700} fill="#ffffff" fontFamily="ui-sans-serif, system-ui" style={{ pointerEvents: 'none' }}>{p.warn ? '!' : p.done ? '✓' : p.n}</text>
          </g>
        );
      })}
    </>
  );
}

type Drag =
  | { kind: 'badge'; node: string; index: number; x: number; y: number }
  | { kind: 'end'; arrow: string; end: 'from' | 'to'; x: number; y: number }
  | { kind: 'node'; id: string; dx: number; dy: number }
  | { kind: 'resize'; id: string; x: number; y: number }
  | { kind: 'new'; from: string; sx: number; sy: number; x: number; y: number };

/** Pointer helpers shared by every drag on the picture: press, move past a small threshold, release. */
function usePointerDrag<D>() {
  const [drag, setDrag] = useState<D | null>(null);
  const start = useRef<{ cx: number; cy: number; px: number; py: number; moved: boolean } | null>(null);

  /** Pointer position in picture coordinates. */
  const at = (e: RPointerEvent<SVGElement>) => {
    const svg = e.currentTarget.ownerSVGElement!;
    return new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM()!.inverse());
  };
  const begin = (e: RPointerEvent<SVGElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = at(e);
    start.current = { cx: e.clientX, cy: e.clientY, px: p.x, py: p.y, moved: false };
  };
  const moving = (e: RPointerEvent<SVGElement>) => {
    const s = start.current;
    if (!s || !(e.buttons & 1)) return null;
    if (!s.moved && Math.hypot(e.clientX - s.cx, e.clientY - s.cy) < 4) return null;
    s.moved = true;
    return at(e);
  };
  /** Ends a drag. Returns where it was dropped, or null if the pointer never really moved (a click). */
  const finish = (e: RPointerEvent<SVGElement>) => {
    const s = start.current;
    start.current = null;
    setDrag(null);
    if (!s?.moved) return null;
    // After a drag the browser may still send a click (to whatever is under the pointer); it must not select
    // or close anything. Catch it before anything else sees it, and stop waiting if none comes.
    const stop = (ev: Event) => ev.stopPropagation();
    window.addEventListener('click', stop, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 80);
    return at(e);
  };
  return { drag, setDrag, start, at, begin, moving, finish };
}

/**
 * "+ Shape" mode: a layer over the whole picture. A click places a shape of typical size centred there;
 * dragging out a box places it at that size. Used on both views, so a shape can be placed on the original too.
 */
function PlaceLayer({ scene, ui }: { scene: Scene; ui: SceneUi }) {
  const { drag, setDrag, start, at, begin, moving, finish } = usePointerDrag<{ x0: number; y0: number; x: number; y: number }>();
  if (!ui.placing) return null;
  const u = ui.unit;
  const r = drag && { x: Math.min(drag.x0, drag.x), y: Math.min(drag.y0, drag.y), width: Math.abs(drag.x - drag.x0), height: Math.abs(drag.y - drag.y0) };
  return (
    <g>
      <rect x={-scene.width} y={-scene.height} width={scene.width * 3} height={scene.height * 3} fill="transparent" style={{ cursor: 'crosshair' }}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={begin}
        onPointerMove={(e) => { const p = moving(e); if (p && start.current) setDrag({ x0: start.current.px, y0: start.current.py, x: p.x, y: p.y }); }}
        onPointerUp={(e) => {
          const s = start.current;
          const p = finish(e);
          if (p && s) ui.onPlace({ x: Math.min(s.px, p.x), y: Math.min(s.py, p.y), width: Math.abs(p.x - s.px), height: Math.abs(p.y - s.py) });
          else ui.onPlace(at(e));
        }} />
      {r && <rect x={r.x} y={r.y} width={r.width} height={r.height} rx={4 * u} fill="rgba(37,99,235,0.1)" stroke={SEL} strokeWidth={2 * u} strokeDasharray={`${5 * u} ${4 * u}`} style={{ pointerEvents: 'none' }} />}
    </g>
  );
}

export function SceneSvg({ scene, ui }: { scene: Scene; ui: SceneUi }) {
  const sw = Math.max(1.2, scene.width / 650);
  const u = ui.unit;
  const { drag, setDrag, start, begin, moving, finish } = usePointerDrag<Drag>();
  const hotArrow = (a: { id: string; from: string; to: string }) => ui.hot === a.id || ui.hot === a.from || ui.hot === a.to;

  /** Starts a new arrow from shape `from` (from "+ Arrow" mode, or a connector dot on the selected shape). */
  const newArrowHandlers = (from: string) => ({
    onPointerDown: begin,
    onPointerMove: (e: RPointerEvent<SVGElement>) => { const p = moving(e); if (p && start.current) setDrag({ kind: 'new', from, sx: start.current.px, sy: start.current.py, x: p.x, y: p.y }); },
    onPointerUp: (e: RPointerEvent<SVGElement>) => {
      const p = finish(e);
      if (!p) return;
      const to = hitTest(scene, p.x, p.y, true);
      if (to !== from) ui.onNewArrow(from, to, { x: p.x, y: p.y });
    },
  });

  const dropTarget = drag && (drag.kind === 'badge' || drag.kind === 'end' || drag.kind === 'new')
    ? (() => { const t = hitTest(scene, drag.x, drag.y, drag.kind !== 'badge'); return drag.kind === 'new' && t === drag.from ? null : t; })() : null;
  const selArrow = ui.editable ? scene.arrows.find((a) => a.id === ui.selected) : undefined;
  const selNode = ui.editable && !ui.drawing && !ui.picking ? scene.nodes.find((n) => n.id === ui.selected) : undefined;

  return (
    <g style={ui.picking ? { cursor: 'crosshair' } : undefined}>
      {scene.regions.map((r) => (
        <g key={r.id} style={{ pointerEvents: 'none' }}>
          <rect x={r.x} y={r.y} width={r.width} height={r.height} rx={r.kind === 'nucleus' ? 24 : 6}
            fill={REGION_FILL[r.kind] ?? '#f8fafc'} fillOpacity={0.7} stroke="#94a3b8" strokeWidth={r.kind === 'plasma_membrane' ? 2.5 : 1.2} strokeDasharray={dashFor(r.boundary)} />
          {r.label && <text x={r.x + 8} y={r.y + 16} fontSize={clamp(scene.width / 70, 10, 20)} fill="#475569" fontFamily="ui-sans-serif, system-ui">{r.label}</text>}
        </g>
      ))}
      {scene.panels.map((p) => <rect key={p.id} x={p.x} y={p.y} width={p.width} height={p.height} fill="none" stroke="#cbd5e1" strokeDasharray="2 4" style={{ pointerEvents: 'none' }} />)}
      {scene.groups.map((g) => (
        <g key={g.id} onMouseEnter={() => ui.onHover(g.id)} onMouseLeave={() => ui.onHover(null)} onClick={(e) => { e.stopPropagation(); ui.onSelect(g.id); }} style={{ cursor: 'pointer' }}>
          {/* Only the outline is clickable, so the shapes inside stay reachable. */}
          <rect x={g.x} y={g.y} width={g.width} height={g.height} rx={8} fill="none" stroke="transparent" strokeWidth={10 * u} pointerEvents="stroke" />
          <rect x={g.x} y={g.y} width={g.width} height={g.height} rx={8} fill="none" stroke={ui.hot === g.id ? HL : '#64748b'} strokeOpacity={ui.hot === g.id ? 1 : 0.55}
            strokeWidth={ui.hot === g.id ? 3 : 1} strokeDasharray="5 4" style={{ pointerEvents: 'none' }} />
          {g.label && <text x={g.x} y={g.y - 4} fontSize={clamp(scene.width / 80, 9, 16)} fill="#334155" fontFamily="ui-sans-serif, system-ui">{g.label}</text>}
        </g>
      ))}
      {scene.arrows.map((a) => {
        const h = hotArrow(a);
        const dash = a.line === 'dashed' ? '7 5' : a.line === 'dotted' ? '1.5 4' : a.line === 'mixed' ? '8 3 2 3' : undefined;
        const marker = a.head === 'arrow' ? 'url(#m-arrow)' : a.head === 'bar' ? 'url(#m-bar)' : a.head === 'other' ? 'url(#m-other)' : undefined;
        return (
          <g key={a.id} onMouseEnter={() => ui.onHover(a.id)} onMouseLeave={() => ui.onHover(null)} onClick={(e) => { e.stopPropagation(); ui.onSelect(a.id); }} style={{ cursor: 'pointer' }}>
            <path d={a.d} fill="none" stroke="transparent" strokeWidth={Math.max(14, 14 * u)} />
            <path d={a.d} fill="none" stroke={h ? HL : a.colour} strokeWidth={h ? sw * 2 : sw} strokeDasharray={dash} strokeLinecap="round"
              opacity={a.line === 'faint' && !h ? 0.45 : 1} markerEnd={marker} />
            {/* An end that is not on a shape gets a small ring, so "ends in open space" is visible. */}
            {a.freeFrom && <circle cx={a.x1} cy={a.y1} r={sw * 2.4} fill="#ffffff" stroke={h ? HL : a.colour} strokeWidth={sw} />}
            {a.freeTo && <circle cx={a.x2} cy={a.y2} r={sw * 4} fill="none" stroke={h ? HL : a.colour} strokeWidth={sw * 0.8} strokeDasharray={`${sw * 1.6} ${sw * 1.6}`} />}
            {a.text && <text x={a.midX} y={a.midY} textAnchor="middle" fontSize={clamp(scene.width / 90, 8, 14)} fill="#0f172a" stroke="#ffffff" strokeWidth={3} paintOrder="stroke" fontFamily="ui-sans-serif, system-ui">{a.text}</text>}
          </g>
        );
      })}
      {scene.nodes.map((n) => {
        const drawFrom = ui.drawing && !ui.picking;
        const movable = !drawFrom && ui.editable && !ui.picking && ui.selected === n.id;
        const off = drag?.kind === 'node' && drag.id === n.id ? drag : { dx: 0, dy: 0 };
        return (
          <g key={n.id} transform={`translate(${n.x + off.dx},${n.y + off.dy})`} style={{ cursor: drawFrom ? 'crosshair' : movable ? 'move' : 'pointer' }}
            onMouseEnter={() => ui.onHover(n.id)} onMouseLeave={() => ui.onHover(null)}
            onClick={(e) => { e.stopPropagation(); if (!drawFrom) ui.onSelect(n.id); }}
            {...(drawFrom ? newArrowHandlers(n.id) : movable ? {
              onPointerDown: begin,
              onPointerMove: (e: RPointerEvent<SVGElement>) => { const p = moving(e); if (p && start.current) setDrag({ kind: 'node', id: n.id, dx: p.x - start.current.px, dy: p.y - start.current.py }); },
              onPointerUp: (e: RPointerEvent<SVGElement>) => { const s = start.current; const p = finish(e); if (p && s) ui.onMoveNode(n.id, { x: n.x + p.x - s.px, y: n.y + p.y - s.py, width: n.width, height: n.height }); },
            } : {})}>
            <NodeShape n={n} hot={ui.hot === n.id} />
            <NodeLabel n={n} maxFs={Math.max(9, scene.width / 55)} />
            {badgeLayout(n).map((b, i) => {
              const lifted = drag?.kind === 'badge' && drag.node === n.id && drag.index === i;
              const can = ui.editable && !ui.picking && !ui.drawing;
              return (
                <g key={i} transform={`translate(${b.cx},${b.cy})`} style={{ cursor: can ? 'grab' : 'pointer' }}
                  onPointerDown={can ? begin : undefined}
                  onPointerMove={can ? (e) => { const p = moving(e); if (p) setDrag({ kind: 'badge', node: n.id, index: i, x: p.x, y: p.y }); } : undefined}
                  onPointerUp={can ? (e) => { const p = finish(e); const to = p && hitTest(scene, p.x, p.y, false); if (to && to !== n.id) ui.onMoveBadge(n.id, b.text, to); } : undefined}>
                  <title>{can ? `${b.text}: drag onto another shape, or click the shape for more` : b.text}</title>
                  <BadgePill b={b} opacity={lifted ? 0.3 : 1} />
                </g>
              );
            })}
          </g>
        );
      })}

      <Marks scene={scene} ui={ui} arrows="path" />
      {dropTarget && (() => { const b = boxOf(scene, dropTarget)!; return <rect x={b.x - 3 * u} y={b.y - 3 * u} width={b.width + 6 * u} height={b.height + 6 * u} rx={5 * u} fill="rgba(37,99,235,0.12)" stroke={SEL} strokeWidth={3 * u} style={{ pointerEvents: 'none' }} />; })()}
      {drag?.kind === 'badge' && (() => {
        const n = scene.nodes.find((v) => v.id === drag.node);
        const b = n && badgeLayout(n)[drag.index];
        return b && <g transform={`translate(${drag.x},${drag.y})`} style={{ pointerEvents: 'none' }}><BadgePill b={b} stroke={SEL} /></g>;
      })()}
      {drag?.kind === 'new' && <line x1={drag.sx} y1={drag.sy} x2={drag.x} y2={drag.y} stroke={SEL} strokeWidth={2 * u} strokeDasharray={`${5 * u} ${4 * u}`} markerEnd="url(#m-arrow)" style={{ pointerEvents: 'none' }} />}
      {selNode && (() => {
        // The selected shape's tools: four connector dots to draw an arrow from, and a corner handle to resize.
        const r = drag?.kind === 'resize' && drag.id === selNode.id
          ? { ...selNode, width: Math.max(8 * u, drag.x - selNode.x), height: Math.max(6 * u, drag.y - selNode.y) } : selNode;
        const dots = [[r.x + r.width / 2, r.y], [r.x + r.width, r.y + r.height / 2], [r.x + r.width / 2, r.y + r.height], [r.x, r.y + r.height / 2]];
        return (
          <g>
            {r !== selNode && <rect x={r.x} y={r.y} width={r.width} height={r.height} rx={4 * u} fill="none" stroke={SEL} strokeWidth={2 * u} strokeDasharray={`${5 * u} ${4 * u}`} style={{ pointerEvents: 'none' }} />}
            {dots.map(([cx, cy], i) => (
              <circle key={i} cx={cx} cy={cy} r={5 * u} fill={SEL} stroke="#ffffff" strokeWidth={1.5 * u} style={{ cursor: 'crosshair' }} onClick={(e) => e.stopPropagation()} {...newArrowHandlers(selNode.id)}>
                <title>Drag from here to draw a new arrow</title>
              </circle>
            ))}
            <rect x={r.x + r.width - 4.5 * u} y={r.y + r.height - 4.5 * u} width={9 * u} height={9 * u} rx={2 * u} fill="#ffffff" stroke={SEL} strokeWidth={2 * u} style={{ cursor: 'nwse-resize' }}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={begin}
              onPointerMove={(e) => { const p = moving(e); if (p) setDrag({ kind: 'resize', id: selNode.id, x: p.x, y: p.y }); }}
              onPointerUp={(e) => { const p = finish(e); if (p) ui.onMoveNode(selNode.id, { x: selNode.x, y: selNode.y, width: Math.max(8 * u, p.x - selNode.x), height: Math.max(6 * u, p.y - selNode.y) }); }}>
              <title>Drag to resize</title>
            </rect>
          </g>
        );
      })()}
      {selArrow && (['from', 'to'] as const).map((end) => {
        const fixed = end === 'from' ? { x: selArrow.x2, y: selArrow.y2 } : { x: selArrow.x1, y: selArrow.y1 };
        const here = drag?.kind === 'end' && drag.arrow === selArrow.id && drag.end === end ? drag : end === 'from' ? { x: selArrow.x1, y: selArrow.y1 } : { x: selArrow.x2, y: selArrow.y2 };
        return (
          <g key={end}>
            {drag?.kind === 'end' && drag.end === end && <line x1={fixed.x} y1={fixed.y} x2={here.x} y2={here.y} stroke={SEL} strokeWidth={2 * u} strokeDasharray={`${5 * u} ${4 * u}`} style={{ pointerEvents: 'none' }} />}
            <circle cx={here.x} cy={here.y} r={6.5 * u} fill="#ffffff" stroke={SEL} strokeWidth={2.5 * u} style={{ cursor: 'grab' }}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={begin}
              onPointerMove={(e) => { const p = moving(e); if (p) setDrag({ kind: 'end', arrow: selArrow.id, end, x: p.x, y: p.y }); }}
              onPointerUp={(e) => { const p = finish(e); if (!p) return; const to = hitTest(scene, p.x, p.y, true); if (to) ui.onArrowEnd(selArrow.id, end, to); else ui.onArrowEndFree(selArrow.id, end, { x: p.x, y: p.y }); }}>
              <title>{end === 'from' ? 'Start of the arrow: drag onto another shape' : 'End of the arrow: drag onto another shape'}</title>
            </circle>
          </g>
        );
      })}
      <PinsAndDots scene={scene} ui={ui} dots />
      <PlaceLayer scene={scene} ui={ui} />
    </g>
  );
}

/** The uploaded image, with invisible hit areas over each extracted box, and the same pins and outlines as the reconstruction. */
export function ImageLayer({ scene, src, ui }: { scene: Scene; src: string; ui: SceneUi }) {
  const boxes = [...scene.nodes, ...scene.groups].sort((a, b) => b.width * b.height - a.width * a.height);
  const u = ui.unit;
  const hotBox = boxes.find((b) => b.id === ui.hot);
  const hotArrow = scene.arrows.find((a) => a.id === ui.hot);
  const ends = hotArrow ? boxes.filter((b) => b.id === hotArrow.from || b.id === hotArrow.to) : [];
  return (
    <g style={ui.picking ? { cursor: 'crosshair' } : undefined}>
      <image href={src} x={0} y={0} width={scene.width} height={scene.height} />
      {boxes.map((b) => (
        <rect key={b.id} x={b.x} y={b.y} width={b.width} height={b.height} fill="transparent" style={{ cursor: 'pointer' }}
          onMouseEnter={() => ui.onHover(b.id)} onMouseLeave={() => ui.onHover(null)} onClick={(e) => { e.stopPropagation(); ui.onSelect(b.id); }} />
      ))}
      {[...(hotBox ? [hotBox] : []), ...ends].map((b) => (
        <rect key={'hl-' + b.id} x={b.x - 2 * u} y={b.y - 2 * u} width={b.width + 4 * u} height={b.height + 4 * u} rx={4 * u} fill="none" stroke={HL} strokeWidth={2 * u} strokeOpacity={0.8} style={{ pointerEvents: 'none' }} />
      ))}
      <Marks scene={scene} ui={ui} arrows="ends" />
      <PinsAndDots scene={scene} ui={ui} dots={false} />
      <PlaceLayer scene={scene} ui={ui} />
    </g>
  );
}
