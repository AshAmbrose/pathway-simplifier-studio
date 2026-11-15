/**
 * Draws a Scene: only what was extracted, at its extracted position and with its extracted look.
 * Arrowheads take their line's colour (context-stroke); badges show the modification text as written.
 */
import type { Scene, SceneNode } from '../render/toScene.ts';
import { colour, wrapLabel } from '../render/toScene.ts';
import { readableTextColors } from '../render/textContrast.ts';

const HL = '#f97316';
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

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
  return <rect width={w} height={h} rx={rx} fill={fill} stroke={stroke} strokeWidth={sw} strokeDasharray={n.outline === 'other' ? '3 2' : undefined} />;
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

function Badges({ n }: { n: SceneNode }) {
  const r = clamp(n.height * 0.22, 5, 10);
  return (
    <>
      {n.mods.map((m, i) => {
        const cx = n.width - r * 0.6 - i * r * 2.1, cy = -r * 0.3;
        const fs = clamp(r * (m.text.length > 2 ? 0.75 : 1.05), 5, 11);
        const wide = Math.max(r * 2, m.text.length * fs * 0.62 + 4);
        return (
          <g key={i} transform={`translate(${cx},${cy})`} style={{ pointerEvents: 'none' }}>
            <rect x={-wide / 2} y={-r} width={wide} height={r * 2} rx={r} fill="#ffffff" stroke="#334155" strokeWidth={1} />
            <text y={fs * 0.35} textAnchor="middle" fontSize={fs} fontWeight={700} fontFamily="ui-sans-serif, system-ui" fill="#0f172a">{m.text}</text>
          </g>
        );
      })}
    </>
  );
}

export function SceneSvg({ scene, hot, onHover }: { scene: Scene; hot: string | null; onHover: (id: string | null) => void }) {
  const sw = Math.max(1.2, scene.width / 650);
  const hotArrow = (a: { id: string; from: string; to: string }) => hot === a.id || hot === a.from || hot === a.to;
  return (
    <g>
      {scene.regions.map((r) => (
        <g key={r.id}>
          <rect x={r.x} y={r.y} width={r.width} height={r.height} rx={r.kind === 'nucleus' ? 24 : 6}
            fill={REGION_FILL[r.kind] ?? '#f8fafc'} fillOpacity={0.7} stroke="#94a3b8" strokeWidth={r.kind === 'plasma_membrane' ? 2.5 : 1.2} strokeDasharray={dashFor(r.boundary)} />
          {r.label && <text x={r.x + 8} y={r.y + 16} fontSize={clamp(scene.width / 70, 10, 20)} fill="#475569" fontFamily="ui-sans-serif, system-ui">{r.label}</text>}
        </g>
      ))}
      {scene.panels.map((p) => <rect key={p.id} x={p.x} y={p.y} width={p.width} height={p.height} fill="none" stroke="#cbd5e1" strokeDasharray="2 4" />)}
      {scene.groups.map((g) => (
        <g key={g.id} onMouseEnter={() => onHover(g.id)} onMouseLeave={() => onHover(null)}>
          <rect x={g.x} y={g.y} width={g.width} height={g.height} rx={8} fill="none" stroke={hot === g.id ? HL : '#64748b'} strokeOpacity={hot === g.id ? 1 : 0.55}
            strokeWidth={hot === g.id ? 3 : 1} strokeDasharray="5 4" />
          {g.label && <text x={g.x} y={g.y - 4} fontSize={clamp(scene.width / 80, 9, 16)} fill="#334155" fontFamily="ui-sans-serif, system-ui">{g.label}</text>}
        </g>
      ))}
      {scene.arrows.map((a) => {
        const h = hotArrow(a);
        const dash = a.line === 'dashed' ? '7 5' : a.line === 'dotted' ? '1.5 4' : a.line === 'mixed' ? '8 3 2 3' : undefined;
        const marker = a.head === 'arrow' ? 'url(#m-arrow)' : a.head === 'bar' ? 'url(#m-bar)' : a.head === 'other' ? 'url(#m-other)' : undefined;
        return (
          <g key={a.id} onMouseEnter={() => onHover(a.id)} onMouseLeave={() => onHover(null)}>
            <path d={a.d} fill="none" stroke="transparent" strokeWidth={14} />
            <path d={a.d} fill="none" stroke={h ? HL : a.colour} strokeWidth={h ? sw * 2 : sw} strokeDasharray={dash} strokeLinecap="round"
              opacity={a.line === 'faint' && !h ? 0.45 : 1} markerEnd={marker} />
            {a.text && <text x={a.midX} y={a.midY} textAnchor="middle" fontSize={clamp(scene.width / 90, 8, 14)} fill="#0f172a" stroke="#ffffff" strokeWidth={3} paintOrder="stroke" fontFamily="ui-sans-serif, system-ui">{a.text}</text>}
          </g>
        );
      })}
      {scene.nodes.map((n) => (
        <g key={n.id} transform={`translate(${n.x},${n.y})`} onMouseEnter={() => onHover(n.id)} onMouseLeave={() => onHover(null)}>
          <NodeShape n={n} hot={hot === n.id} />
          <NodeLabel n={n} maxFs={Math.max(9, scene.width / 55)} />
          <Badges n={n} />
        </g>
      ))}
    </g>
  );
}

/** The uploaded image, with invisible hit areas over each extracted box and an outline on the hovered one. */
export function ImageLayer({ scene, src, hot, onHover }: { scene: Scene; src: string; hot: string | null; onHover: (id: string | null) => void }) {
  const boxes = [...scene.nodes, ...scene.groups].sort((a, b) => b.width * b.height - a.width * a.height);
  const hotBox = boxes.find((b) => b.id === hot);
  const hotArrow = scene.arrows.find((a) => a.id === hot);
  const ends = hotArrow ? boxes.filter((b) => b.id === hotArrow.from || b.id === hotArrow.to) : [];
  return (
    <g>
      <image href={src} x={0} y={0} width={scene.width} height={scene.height} />
      {boxes.map((b) => (
        <rect key={b.id} x={b.x} y={b.y} width={b.width} height={b.height} fill="transparent" onMouseEnter={() => onHover(b.id)} onMouseLeave={() => onHover(null)} />
      ))}
      {[...(hotBox ? [hotBox] : []), ...ends].map((b) => (
        <rect key={'hl-' + b.id} x={b.x - 2} y={b.y - 2} width={b.width + 4} height={b.height + 4} rx={4} fill="none" stroke={HL} strokeWidth={Math.max(2.5, scene.width / 400)} style={{ pointerEvents: 'none' }} />
      ))}
    </g>
  );
}
