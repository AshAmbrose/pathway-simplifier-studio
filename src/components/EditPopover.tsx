/**
 * Fixing one shape, arrow or group by hand. Every fix can be done by clicking: a target is chosen from the
 * shapes drawn nearest (by position only) or by clicking any other shape on the picture.
 */
import { useRef, useState, type ReactNode } from 'react';
import { badgeText } from '../edit/applyEdits.ts';
import { nameOf } from '../edit/describe.ts';
import { boxOf, nearest, type Scene } from '../render/toScene.ts';
import { HEADS, LINES, MEANINGS, type Edit, type Extraction } from '../types/extraction.ts';
import { CloseButton } from './Popover.tsx';

const btn = 'rounded-md border border-slate-300 px-2 py-1 text-xs hover:border-blue-500 hover:bg-blue-50 dark:border-slate-600 dark:hover:bg-slate-700';
const input = 'w-full rounded-md border border-slate-300 bg-transparent px-2 py-1 text-sm dark:border-slate-600';
const lab = 'text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400';

export interface PickRequest {
  prompt: string; groups: boolean; accept: (id: string) => void;
  /** If set, clicking an empty spot is allowed too (an arrow end in open space); the screen checks before accepting. */
  acceptPoint?: (at: { x: number; y: number }) => void;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return <div className="mt-2"><div className={lab}>{label}</div><div className="mt-1">{children}</div></div>;
}

/** A text box that saves when you leave it or press Enter. */
function TextCommit({ value, placeholder, onCommit, autoFocus }: { value: string; placeholder?: string; onCommit: (v: string) => void; autoFocus?: boolean }) {
  return (
    <input key={value} defaultValue={value} placeholder={placeholder} className={input} autoFocus={autoFocus}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); e.stopPropagation(); }}
      onBlur={(e) => { if (e.currentTarget.value.trim() !== value) onCommit(e.currentTarget.value.trim()); }} />
  );
}

/** Greek letters as the Latin letter people type for them, and no case or spacing: "B-Catenin" finds "β-catenin". */
const GREEK: Record<string, string> = { α: 'a', β: 'b', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'h', θ: 'th', ι: 'i', κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'x', π: 'p', ρ: 'r', σ: 's', τ: 't', φ: 'ph', χ: 'ch', ψ: 'ps', ω: 'o' };
const fold = (t: string) => t.toLowerCase().replace(/[α-ω]/g, (c) => GREEK[c] ?? c).replace(/[\s\-_/]+/g, '');

/**
 * The name box for a shape. While you type, it suggests names already written in this figure that match
 * (Greek letters can be typed as Latin ones). Suggestions are only text from the figure itself, so a name
 * can be copied exactly as written; anything else can still be typed in full.
 */
function NameField({ value, placeholder, autoFocus, names, onCommit }: {
  value: string; placeholder: string; autoFocus?: boolean; names: string[]; onCommit: (v: string) => void;
}) {
  const [text, setText] = useState(value);
  const [hi, setHi] = useState(0);
  const [open, setOpen] = useState(false);
  const q = fold(text);
  const matches = q ? names.filter((n) => fold(n).includes(q) && n !== text).slice(0, 5) : [];
  // The last name saved, so the blur that follows Enter or a click on a suggestion doesn't save the typed text over it.
  const saved = useRef(value);
  const justChose = useRef(false);
  const commit = (v: string) => {
    setText(v); setOpen(false);
    justChose.current = true;
    setTimeout(() => { justChose.current = false; }, 0);
    if (v.trim() !== saved.current) { saved.current = v.trim(); onCommit(v.trim()); }
  };
  return (
    <div className="relative">
      <input value={text} placeholder={placeholder} autoFocus={autoFocus} className={input} role="combobox" aria-expanded={open && matches.length > 0} aria-autocomplete="list"
        onChange={(e) => { setText(e.target.value); setHi(0); setOpen(true); }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (open && matches.length && e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, matches.length - 1)); }
          else if (open && matches.length && e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
          else if (e.key === 'Enter') { e.preventDefault(); commit(open && matches.length ? matches[hi] : text); e.currentTarget.blur(); }
          else if (e.key === 'Escape') { setOpen(false); }
        }}
        onBlur={() => { setTimeout(() => setOpen(false), 120); if (!justChose.current && text.trim() !== saved.current) commit(text); }} />
      {open && matches.length > 0 && (
        <ul role="listbox" className="absolute left-0 right-0 z-10 mt-1 overflow-hidden rounded-md border border-slate-300 bg-white text-sm shadow-lg dark:border-slate-600 dark:bg-slate-800">
          <li className="px-2 pt-1 text-[11px] uppercase tracking-wide text-slate-400">Written in this figure</li>
          {matches.map((m, i) => (
            <li key={m} role="option" aria-selected={i === hi}>
              <button type="button" className={`w-full px-2 py-1 text-left ${i === hi ? 'bg-blue-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                onMouseDown={(e) => { e.preventDefault(); commit(m); }} onMouseEnter={() => setHi(i)}>{m}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Choose a target: the nearest shapes as buttons, or any other shape by clicking it on the picture. */
function Targets({ x, scene, from, at, exclude, groups, prompt, onPick, onPoint, startPick }: {
  /** Nearest to this shape's box, or to the point `at` if given (an arrow's end). */
  x: Extraction; scene: Scene; from: string; at?: { x: number; y: number }; exclude: string[]; groups: boolean; prompt: string;
  onPick: (id: string) => void; onPoint?: (at: { x: number; y: number }) => void; startPick: (p: PickRequest) => void;
}) {
  const box = at ? { x: at.x, y: at.y, width: 0, height: 0 } : boxOf(scene, from);
  const near = box ? nearest(scene, box, { exclude, groups, count: 4 }) : [];
  return (
    <div className="mt-1 rounded-lg bg-slate-50 p-2 dark:bg-slate-900/60">
      <div className="text-xs text-slate-500 dark:text-slate-400">Nearest shapes:</div>
      <div className="mt-1 flex flex-wrap gap-1">
        {near.map((id) => <button key={id} className={btn} onClick={() => onPick(id)}>{nameOf(x, id)}</button>)}
      </div>
      <button className="mt-1.5 text-left text-xs underline text-slate-600 dark:text-slate-300" onClick={() => startPick({ prompt, groups, accept: onPick, acceptPoint: onPoint })}>
        {onPoint ? 'Somewhere else: click a shape, or an empty spot, on the picture' : 'Another shape: click it on the picture'}
      </button>
    </div>
  );
}

export function EditPopover({ x, scene, id, add, startPick, onFreeEnd, onFreeArrow, focusName, onClose }: {
  x: Extraction; scene: Scene; id: string; add: (e: Edit) => void; startPick: (p: PickRequest) => void;
  /** A new arrow from this shape to an empty spot: the screen checks before adding it. */
  onFreeArrow: (from: string, at: { x: number; y: number }) => void;
  /** Put the cursor in the name box (a shape that was just added). */
  focusName?: boolean;
  /** An arrow end was put where there is no shape: the screen checks before accepting. */
  onFreeEnd: (arrow: string, end: 'from' | 'to', at: { x: number; y: number }) => void; onClose: () => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [badge, setBadge] = useState('');
  const E = (op: Edit['op'], eid: string, to: string | null = null, value: string | null = null): Edit => ({ op, id: eid, to, value });
  const toggle = (k: string) => setOpen((o) => (o === k ? null : k));
  const header = (title: string, kind: string) => (
    <div className="flex items-start justify-between gap-2">
      <div><div className="font-semibold leading-snug">{title}</div><div className="text-xs text-slate-500 dark:text-slate-400">{kind}</div></div>
      <CloseButton onClose={onClose} />
    </div>
  );

  const el = x.elements.find((v) => v.id === id);
  // Every name written in the figure, once each, for the name box's suggestions.
  const figureNames = [...new Set([...x.elements, ...x.groups].map((v) => v.label).filter((l): l is string => !!l && l.length > 1))].sort((a, b) => a.localeCompare(b));
  if (el) {
    const inGroups = x.groups.filter((g) => g.members.includes(el.id));
    const otherGroups = x.groups.filter((g) => !g.members.includes(el.id));
    return (
      <div>
        {header(nameOf(x, id), el.kind)}
        <Row label="Name as written"><NameField value={el.label ?? ''} placeholder={focusName ? 'Type the name as written…' : '(no label)'} autoFocus={focusName} names={figureNames}
          onCommit={(v) => add(E('set_label', id, null, v || null))} /></Row>
        <Row label="Badges">
          {el.modifications.length === 0 && <span className="text-xs text-slate-500 dark:text-slate-400">None.</span>}
          {el.modifications.map((m, i) => {
            const t = badgeText(m);
            return (
              <div key={i} className="mb-1">
                <div className="flex items-center gap-1.5">
                  <span className="rounded-full border border-slate-400 px-2 text-xs font-bold">{t}</span>
                  <button className={btn} onClick={() => toggle('b' + i)}>Move to…</button>
                  <button className={btn} onClick={() => add(E('remove_badge', id, null, t))}>Remove</button>
                </div>
                {open === 'b' + i && <Targets x={x} scene={scene} from={id} exclude={[id]} groups={false} prompt={`Click the shape that ${t} belongs to`}
                  onPick={(to) => { add(E('move_badge', id, to, t)); setOpen(null); }} startPick={startPick} />}
              </div>
            );
          })}
          <div className="mt-1 flex gap-1.5">
            <input value={badge} onChange={(e) => setBadge(e.target.value)} onKeyDown={(e) => e.stopPropagation()} placeholder="P, Ub×3…" className={input + ' w-24'} />
            <button className={btn} disabled={!badge.trim()} onClick={() => { add(E('add_badge', id, null, badge.trim())); setBadge(''); }}>Add badge</button>
          </div>
        </Row>
        <Row label="Arrows">
          <div className="flex gap-1.5">
            <button className={btn} onClick={() => toggle('arrow')}>Arrow from here to…</button>
            <button className={btn} onClick={() => toggle('bar')}>Bar from here to…</button>
          </div>
          {(open === 'arrow' || open === 'bar') && <Targets x={x} scene={scene} from={id} exclude={[id]} groups prompt="Click where the new arrow ends: a shape, or an empty spot"
            onPick={(to) => { add(E('add_arrow', id, to, open === 'bar' ? 'bar' : 'arrow')); setOpen(null); }} onPoint={(at) => onFreeArrow(id, at)} startPick={startPick} />}
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Or drag from one of the blue dots on the shape.</p>
        </Row>
        {x.groups.length > 0 && (
          <Row label="Cluster">
            {inGroups.map((g) => (
              <div key={g.id} className="mb-1 flex items-center gap-1.5 text-xs">
                <span>In {nameOf(x, g.id)}</span>
                {g.members.length > 1 && <button className={btn} onClick={() => add(E('remove_from_group', id, g.id))}>Take out</button>}
              </div>
            ))}
            {otherGroups.length > 0 && <button className={btn} onClick={() => toggle('group')}>Add to a cluster…</button>}
            {open === 'group' && (
              <div className="mt-1 flex flex-wrap gap-1 rounded-lg bg-slate-50 p-2 dark:bg-slate-900/60">
                {otherGroups.map((g) => <button key={g.id} className={btn} onClick={() => { add(E('add_to_group', id, g.id)); setOpen(null); }}>{nameOf(x, g.id)}</button>)}
              </div>
            )}
          </Row>
        )}
        <div className="mt-3 border-t border-slate-200 pt-2 dark:border-slate-700">
          <button className="text-xs text-red-700 underline dark:text-red-400" onClick={() => { add(E('remove_element', id)); onClose(); }}>Remove this shape (it isn't in the figure)</button>
        </div>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Drag the shape to move it, its corner to resize it, or a badge onto another shape.</p>
      </div>
    );
  }

  const ar = x.arrows.find((v) => v.id === id);
  if (ar) {
    const drawn = scene.arrows.find((v) => v.id === id);
    const endAt = (which: 'from' | 'to') => (drawn ? (which === 'from' ? { x: drawn.x1, y: drawn.y1 } : { x: drawn.x2, y: drawn.y2 }) : undefined);
    const end = (which: 'from' | 'to') => (
      <div className="mb-1">
        <div className="flex items-center justify-between gap-2">
          <span><span className="text-slate-500 dark:text-slate-400">{which === 'from' ? 'Starts at' : 'Ends at'}</span> <b>{nameOf(x, ar[which])}</b></span>
          <button className={btn} onClick={() => toggle(which)}>Change…</button>
        </div>
        {open === which && <Targets x={x} scene={scene} from={id} at={endAt(which)} exclude={[ar[which]]} groups prompt={`Click where the arrow ${which === 'from' ? 'starts' : 'ends'}: a shape, or an empty spot`}
          onPick={(to) => { add(E(which === 'from' ? 'set_arrow_from' : 'set_arrow_to', id, to)); setOpen(null); }} onPoint={(at) => onFreeEnd(id, which, at)} startPick={startPick} />}
      </div>
    );
    const seg = (v: string, on: boolean, click: () => void) => <button key={v} onClick={click} className={`${btn} ${on ? 'border-blue-600 bg-blue-600 text-white hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-600' : ''}`}>{v}</button>;
    return (
      <div>
        {header(nameOf(x, id), 'arrow')}
        <Row label="Ends">{end('from')}{end('to')}</Row>
        <Row label="Head"><div className="flex gap-1">{HEADS.filter((h) => h !== 'other' || ar.head === 'other').map((h) => seg(h, ar.head === h, () => ar.head !== h && add(E('set_arrow_head', id, null, h))))}</div></Row>
        <div className="grid grid-cols-2 gap-2">
          <Row label="Line"><select className={input} value={ar.line} onChange={(e) => add(E('set_arrow_line', id, null, e.target.value))}>{LINES.map((l) => <option key={l}>{l}</option>)}</select></Row>
          <Row label="Meaning"><select className={input} value={ar.meaning} onChange={(e) => add(E('set_arrow_meaning', id, null, e.target.value))}>{MEANINGS.map((l) => <option key={l}>{l}</option>)}</select></Row>
        </div>
        <Row label="Text beside it"><TextCommit value={ar.text ?? ''} placeholder="(none)" onCommit={(v) => add(E('set_arrow_text', id, null, v || null))} /></Row>
        <div className="mt-3 border-t border-slate-200 pt-2 dark:border-slate-700">
          <button className="text-xs text-red-700 underline dark:text-red-400" onClick={() => { add(E('remove_arrow', id)); onClose(); }}>Remove this arrow (it isn't drawn)</button>
        </div>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Shortcut: drag either end of the arrow onto another shape.</p>
      </div>
    );
  }

  const gr = x.groups.find((v) => v.id === id);
  if (gr) {
    return (
      <div>
        {header(nameOf(x, id), 'cluster of touching shapes')}
        <Row label="Name as written"><TextCommit value={gr.label ?? ''} placeholder="(the figure gives it no name)" onCommit={(v) => add(E('set_label', id, null, v || null))} /></Row>
        <Row label="Shapes in it"><span className="text-sm">{gr.members.map((m) => nameOf(x, m)).join(', ')}</span></Row>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">To add or take out a shape, click that shape.</p>
      </div>
    );
  }
  return <div>{header('No longer there', '')}</div>;
}
