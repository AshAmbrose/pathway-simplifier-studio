/**
 * Fixing one shape, arrow or group by hand. Every fix can be done by clicking: a target is chosen from the
 * shapes drawn nearest (by position only) or by clicking any other shape on the picture.
 */
import { useState, type ReactNode } from 'react';
import { badgeText } from '../edit/applyEdits.ts';
import { nameOf } from '../edit/describe.ts';
import { boxOf, nearest, type Scene } from '../render/toScene.ts';
import { HEADS, LINES, MEANINGS, type Edit, type Extraction } from '../types/extraction.ts';
import { CloseButton } from './Popover.tsx';

const btn = 'rounded-md border border-slate-300 px-2 py-1 text-xs hover:border-blue-500 hover:bg-blue-50 dark:border-slate-600 dark:hover:bg-slate-700';
const input = 'w-full rounded-md border border-slate-300 bg-transparent px-2 py-1 text-sm dark:border-slate-600';
const lab = 'text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400';

export interface PickRequest { prompt: string; groups: boolean; accept: (id: string) => void }

function Row({ label, children }: { label: string; children: ReactNode }) {
  return <div className="mt-2"><div className={lab}>{label}</div><div className="mt-1">{children}</div></div>;
}

/** A text box that saves when you leave it or press Enter. */
function TextCommit({ value, placeholder, onCommit }: { value: string; placeholder?: string; onCommit: (v: string) => void }) {
  return (
    <input key={value} defaultValue={value} placeholder={placeholder} className={input}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); e.stopPropagation(); }}
      onBlur={(e) => { if (e.currentTarget.value.trim() !== value) onCommit(e.currentTarget.value.trim()); }} />
  );
}

/** Choose a target: the nearest shapes as buttons, or any other shape by clicking it on the picture. */
function Targets({ x, scene, from, exclude, groups, prompt, onPick, startPick }: {
  x: Extraction; scene: Scene; from: string; exclude: string[]; groups: boolean; prompt: string;
  onPick: (id: string) => void; startPick: (p: PickRequest) => void;
}) {
  const box = boxOf(scene, from);
  const near = box ? nearest(scene, box, { exclude, groups, count: 4 }) : [];
  return (
    <div className="mt-1 rounded-lg bg-slate-50 p-2 dark:bg-slate-900/60">
      <div className="text-xs text-slate-500 dark:text-slate-400">Nearest shapes:</div>
      <div className="mt-1 flex flex-wrap gap-1">
        {near.map((id) => <button key={id} className={btn} onClick={() => onPick(id)}>{nameOf(x, id)}</button>)}
      </div>
      <button className="mt-1.5 text-xs underline text-slate-600 dark:text-slate-300" onClick={() => startPick({ prompt, groups, accept: onPick })}>Another shape: click it on the picture</button>
    </div>
  );
}

export function EditPopover({ x, scene, id, add, startPick, onClose }: {
  x: Extraction; scene: Scene; id: string; add: (e: Edit) => void; startPick: (p: PickRequest) => void; onClose: () => void;
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
  if (el) {
    const inGroups = x.groups.filter((g) => g.members.includes(el.id));
    const otherGroups = x.groups.filter((g) => !g.members.includes(el.id));
    return (
      <div>
        {header(nameOf(x, id), el.kind)}
        <Row label="Name as written"><TextCommit value={el.label ?? ''} placeholder="(no label)" onCommit={(v) => add(E('set_label', id, null, v || null))} /></Row>
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
          {(open === 'arrow' || open === 'bar') && <Targets x={x} scene={scene} from={id} exclude={[id]} groups prompt="Click the shape the new arrow points to"
            onPick={(to) => { add(E('add_arrow', id, to, open === 'bar' ? 'bar' : 'arrow')); setOpen(null); }} startPick={startPick} />}
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
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Shortcut: drag a badge onto another shape, or drag this shape to move it.</p>
      </div>
    );
  }

  const ar = x.arrows.find((v) => v.id === id);
  if (ar) {
    const end = (which: 'from' | 'to') => (
      <div className="mb-1">
        <div className="flex items-center justify-between gap-2">
          <span><span className="text-slate-500 dark:text-slate-400">{which === 'from' ? 'Starts at' : 'Ends at'}</span> <b>{nameOf(x, ar[which])}</b></span>
          <button className={btn} onClick={() => toggle(which)}>Change…</button>
        </div>
        {open === which && <Targets x={x} scene={scene} from={ar[which]} exclude={[ar[which]]} groups prompt={`Click the shape the arrow ${which === 'from' ? 'starts at' : 'ends at'}`}
          onPick={(to) => { add(E(which === 'from' ? 'set_arrow_from' : 'set_arrow_to', id, to)); setOpen(null); }} startPick={startPick} />}
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
