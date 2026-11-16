/**
 * Step 1 panel: each issue as a small card, grouped by kind (each kind has its own colour). Click a card to
 * select it: its item is outlined in orange on both views and brought into view. Once settled, a card shows what was decided, with "Change".
 *  - Typo: use the suggested spelling, type your own, or keep it as written.
 *  - Unlabelled part: type a name (names written in the figure are suggested), keep it unlabelled, or leave it out.
 *  - Colour or styling that carries meaning: "Seen", with an optional note of what it means. No key is drawn.
 */
import { useState } from 'react';
import { cleanText, nameOf } from '../../edit/describe.ts';
import type { Issue } from '../../simplify/issues.ts';
import type { AppliedEdit, Edit, Extraction, Simplify } from '../../types/extraction.ts';
import { NameField } from '../EditPopover.tsx';

type Decision = Simplify['issues'][string];
const btn = 'rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-800 hover:border-blue-500 hover:bg-blue-50 dark:border-slate-500 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600';
const input = 'w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-500 dark:bg-slate-900';

/** The text an issue is about, as it stands before this step: a shape's or cluster's name, or an arrow's text. */
function textOf(x: Extraction, id: string): { exists: boolean; text: string | null } {
  const s = x.elements.find((v) => v.id === id) ?? x.groups.find((v) => v.id === id);
  if (s) return { exists: true, text: s.label };
  const a = x.arrows.find((v) => v.id === id);
  return a ? { exists: true, text: a.text } : { exists: false, text: null };
}

/** What has been decided about an issue, in words, or null if it is still open. */
export function issueStatus(x: Extraction, i: Issue, edits: AppliedEdit[], decisions: Simplify['issues']): string | null {
  const edit = i.kind === 'meaning' ? undefined : edits.find((e) => e.id === i.id);
  const dec = decisions[i.key];
  const now = textOf(x, i.id);
  if (i.kind === 'typo') {
    if (edit) return `Changed to "${edit.value}"`;
    if (dec?.kind === 'kept') return 'Kept as written';
    if (!now.exists) return 'Removed in Check';
    if (i.asWritten && now.text !== i.asWritten) return `Already changed in Check to "${now.text ?? ''}"`;
    return null;
  }
  if (i.kind === 'unlabelled') {
    if (edit?.op === 'hide') return 'Left out of the simplified figure';
    if (edit) return `Named "${edit.value}"`;
    if (dec?.kind === 'kept') return 'Kept unlabelled';
    if (!now.exists) return 'Removed in Check';
    if (now.text) return `Named in Check: "${now.text}"`;
    return null;
  }
  if (dec?.kind === 'seen') return dec.note ? `Seen: ${dec.note}` : 'Seen';
  return null;
}

const TITLES: Record<Issue['kind'], string> = { typo: 'Possible typos', unlabelled: 'Unlabelled parts', meaning: 'Colour and styling with a meaning' };
/** A colour per kind of issue, on the card's left edge and the section heading, so the kinds are easy to tell apart. */
const ACCENT: Record<Issue['kind'], { edge: string; dot: string }> = {
  typo: { edge: 'border-l-amber-500', dot: 'bg-amber-500' },
  unlabelled: { edge: 'border-l-violet-500', dot: 'bg-violet-500' },
  meaning: { edge: 'border-l-sky-500', dot: 'bg-sky-500' },
};

export function IssuesStep({ x, issues, edits, decisions, names, active, onSettle, onHover, onSelect }: {
  /** The figure before this step: the reconstruction with every correction. */
  x: Extraction;
  issues: Issue[];
  /** This step's changes. */
  edits: AppliedEdit[];
  decisions: Simplify['issues'];
  /** Names written in the figure, suggested while typing. */
  names: string[];
  /** The selected issue: outlined in orange here and on both pictures. */
  active: string | null;
  /** Settles an issue with a change, a decision, or neither (to reopen it). */
  onSettle: (i: Issue, edit: Edit | null, decision: Decision | null) => void;
  onHover: (ids: string[] | null) => void;
  /** A click anywhere on a card selects it: its item is outlined on both pictures and brought into view. */
  onSelect: (i: Issue) => void;
}) {
  const open = issues.filter((i) => !issueStatus(x, i, edits, decisions)).length;
  if (issues.length === 0) return <p className="text-sm text-slate-600 dark:text-slate-300">Nothing to check: the model flagged no typos or colour meanings, and every shape has a label. Go on to the next step.</p>;
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600 dark:text-slate-300"><b className="text-slate-900 dark:text-white">{issues.length - open} of {issues.length}</b> dealt with. None has to be: anything left open stays as it is. Click a card to see its item on both pictures.</p>
      {(['typo', 'unlabelled', 'meaning'] as const).map((kind) => {
        const list = issues.filter((i) => i.kind === kind);
        if (!list.length) return null;
        return (
          <section key={kind}>
            <h3 className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
              <span className={`h-2.5 w-2.5 rounded-full ${ACCENT[kind].dot}`} aria-hidden />{TITLES[kind]}
              <span className="rounded-full bg-slate-200 px-1.5 text-xs font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200">{list.length}</span>
            </h3>
            <ul className="space-y-2">
              {list.map((i) => <IssueCard key={i.key} x={x} i={i} status={issueStatus(x, i, edits, decisions)} names={names} active={active === i.key}
                onSettle={onSettle} onHover={onHover} onSelect={onSelect} />)}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function IssueCard({ x, i, status, names, active, onSettle, onHover, onSelect }: {
  x: Extraction; i: Issue; status: string | null; names: string[]; active: boolean;
  onSettle: (i: Issue, edit: Edit | null, decision: Decision | null) => void;
  onHover: (ids: string[] | null) => void; onSelect: (i: Issue) => void;
}) {
  const [note, setNote] = useState('');
  const isArrow = x.arrows.some((a) => a.id === i.id);
  const rename = (v: string): Edit => ({ op: isArrow ? 'set_arrow_text' : 'set_label', id: i.id, to: null, value: v });
  const el = x.elements.find((e) => e.id === i.id);
  const title = i.kind === 'typo' ? `"${i.asWritten ?? textOf(x, i.id).text ?? ''}"`
    : i.kind === 'unlabelled' ? `Unlabelled ${el?.kind ?? 'part'}`
      : `${i.flag === 'colour carries meaning' ? 'Colour' : 'Styling'} on ${nameOf(x, i.id)}`;
  // Open cards stand out (white, shadow); settled ones sit back (green tint); the selected one is ringed in the
  // same orange as its outline on the pictures.
  const look = active ? 'border-orange-500 ring-2 ring-orange-500/40 bg-orange-50 dark:bg-orange-950/40'
    : status ? 'border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950/30'
      : 'border-slate-300 bg-white shadow-sm dark:border-slate-600 dark:bg-slate-800';
  return (
    <li data-issue={i.key} className={`cursor-pointer rounded-lg border border-l-4 p-2.5 text-sm ${ACCENT[i.kind].edge} ${look}`}
      onClick={() => onSelect(i)} onMouseEnter={() => onHover([i.id])} onMouseLeave={() => onHover(null)}>
      <div className="font-semibold text-slate-900 dark:text-white">{title}</div>
      {i.basis && <div className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">{cleanText(x, i.basis)}</div>}
      {status ? (
        <div className="mt-1.5 flex items-start justify-between gap-2 text-sm font-medium text-green-800 dark:text-green-300">
          <span>✓ {status}</span>
          <button className="shrink-0 text-xs font-normal text-slate-600 underline dark:text-slate-300" onClick={() => onSettle(i, null, null)}>Change</button>
        </div>
      ) : i.kind === 'typo' ? (
        <div className="mt-2 space-y-1.5">
          <div className="flex flex-wrap gap-1">
            {i.suggestion && <button className={btn} onClick={() => onSettle(i, rename(i.suggestion!), null)}>Use "{i.suggestion}"</button>}
            <button className={btn} onClick={() => onSettle(i, null, { kind: 'kept', note: null })}>Keep as written</button>
          </div>
          <NameField value="" placeholder="Or type the right spelling…" names={names} onCommit={(v) => v && onSettle(i, rename(v), null)} />
        </div>
      ) : i.kind === 'unlabelled' ? (
        <div className="mt-2 space-y-1.5">
          <NameField value="" placeholder="Type a name…" names={names} onCommit={(v) => v && onSettle(i, rename(v), null)} />
          <div className="flex flex-wrap gap-1">
            <button className={btn} onClick={() => onSettle(i, null, { kind: 'kept', note: null })}>Keep unlabelled</button>
            <button className={btn} onClick={() => onSettle(i, { op: 'hide', id: i.id, to: null, value: 'unlabelled part left out' }, null)}>Leave out</button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex gap-1">
          <input className={input} value={note} placeholder="What it means (optional)" onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') onSettle(i, null, { kind: 'seen', note: note.trim() || null }); }} />
          <button className={btn} onClick={() => onSettle(i, null, { kind: 'seen', note: note.trim() || null })}>Seen</button>
        </div>
      )}
    </li>
  );
}
