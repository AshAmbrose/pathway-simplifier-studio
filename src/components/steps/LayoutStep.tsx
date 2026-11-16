/**
 * Step 5 panel: lay the figure out again as a cell, read top to bottom (BioPathway Studio's Organize Layout,
 * src/layout/), and see whether it reads better.
 *  - "Lay out the figure" stores the new positions as one change; nothing moves until it is pressed.
 *  - The numbers show before → after: crossings, arrows behind shapes, arrows pointing up (feedback apart).
 *  - Switches: one consistent style (listing what it replaces), member names under collapsed shapes, and each
 *    layout rule, so a rule that doesn't help this figure can be switched off.
 *  - What the layout couldn't do, or decided without the figure to go on, is listed.
 *  - After the layout, a shape can be selected and dragged; laying out again clears those moves.
 */
import { nameOf } from '../../edit/describe.ts';
import { RULES, type RuleKey } from '../../layout/adapt.ts';
import type { Measures } from '../../layout/measures.ts';
import type { LayoutNotes, LayoutOptions } from '../../layout/value.ts';
import type { Extraction } from '../../types/extraction.ts';

const small = 'text-xs text-slate-600 dark:text-slate-300';
const box = 'rounded-lg border border-slate-300 bg-white p-2.5 text-sm shadow-sm dark:border-slate-600 dark:bg-slate-800';

/** What the consistent style would replace, for saying so before it is switched on. */
export interface StyleReplaces { fills: number; arrowColours: number; textColours: number; meanings: string[] }

function Row({ label, before, after, hint }: { label: string; before: number; after: number; hint?: string }) {
  const better = after < before, worse = after > before;
  return (
    <tr className="border-t border-slate-200 dark:border-slate-700">
      <td className="py-1 pr-2">{label}{hint && <div className="text-[11px] text-slate-500 dark:text-slate-400">{hint}</div>}</td>
      <td className="py-1 text-right tabular-nums">{before}</td>
      <td className={`py-1 text-right font-semibold tabular-nums ${better ? 'text-green-700 dark:text-green-400' : worse ? 'text-amber-700 dark:text-amber-400' : ''}`}>{after}</td>
    </tr>
  );
}

export function LayoutStep({ x, laidOut, stale, opts, before, after, notes, restyled, replaces, hasSublabels, moves, onLayout, onRule, onSublabels, onRestyle, onUndoMoves, onHover, onShow }: {
  /** The figure before this step (for names). */
  x: Extraction;
  laidOut: boolean;
  /** The figure or the switches changed since the layout was worked out. */
  stale: boolean;
  opts: LayoutOptions;
  before: Measures;
  /** The layout's numbers: as laid out, or what laying out would give. */
  after: Measures;
  notes: LayoutNotes;
  restyled: boolean;
  replaces: StyleReplaces;
  hasSublabels: boolean;
  /** Shapes moved by hand since the layout. */
  moves: number;
  onLayout: () => void;
  onRule: (k: RuleKey, on: boolean) => void;
  onSublabels: (on: boolean) => void;
  onRestyle: (on: boolean) => void;
  onUndoMoves: () => void;
  onHover: (ids: string[] | null) => void;
  onShow: (ids: string[]) => void;
}) {
  const listed = (ids: string[], what: string) => ids.length > 0 && (
    <li>
      {what}:{' '}
      {ids.map((id, i) => (
        <span key={id}>
          {i > 0 && ', '}
          <button className="underline decoration-dotted" onMouseEnter={() => onHover([id])} onMouseLeave={() => onHover(null)} onClick={() => onShow([id])}>{nameOf(x, id)}</button>
        </span>
      ))}
    </li>
  );
  const anyNotes = notes.beside.length + notes.emptyRegions.length + notes.behind.length + notes.textClashes.length > 0;
  return (
    <div className="space-y-3">
      <section className={laidOut && !stale ? `${box} border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950/30` : 'rounded-lg border-2 border-blue-400 bg-blue-50 p-2.5 text-sm dark:border-blue-700 dark:bg-blue-950/40'}>
        {!laidOut && <p className="mb-2">Lays the figure out again as a cell, read top to bottom: compartments as rows, each part of the figure as a column, the main routes as straight lines, regulators beside what they act on, outcomes underneath. Where each shape goes comes only from the figure.</p>}
        {laidOut && !stale && <p className="font-medium text-green-800 dark:text-green-300">✓ Laid out. Click a shape on the right, then drag it to fine-tune.</p>}
        {laidOut && stale && <p className="mb-2 text-amber-900 dark:text-amber-200">The figure or the switches below changed since this layout was made, so it may not match.</p>}
        {(!laidOut || stale) && (
          <button className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700" onClick={onLayout}>
            {laidOut ? 'Lay out again' : 'Lay out the figure'}
          </button>
        )}
        {moves > 0 && (
          <p className={`mt-2 ${small}`}>
            {moves} shape{moves === 1 ? '' : 's'} moved by hand{stale ? '; laying out again clears these moves' : ''}. <button className="underline" onClick={onUndoMoves}>Undo moves</button>
          </p>
        )}
      </section>

      <section className={box}>
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">How it reads</h3>
        <table className="mt-1 w-full text-sm">
          <thead><tr className="text-xs text-slate-500 dark:text-slate-400"><th className="text-left font-normal" /><th className="pl-3 text-right font-normal">Before</th><th className="pl-3 text-right font-normal">{laidOut ? 'After' : 'If laid out'}</th></tr></thead>
          <tbody>
            <Row label="Arrows crossing" before={before.crossings} after={after.crossings} />
            <Row label="Arrows behind a shape" before={before.behind} after={after.behind} />
            <Row label="Arrows pointing up" before={before.up} after={after.up} hint="against the top-to-bottom reading" />
            <Row label="Feedback pointing up" before={before.feedbackUp} after={after.feedbackUp} hint="returns to where the signal came from; allowed" />
          </tbody>
        </table>
      </section>

      <section className={box}>
        <label className="flex cursor-pointer items-start gap-2">
          <input type="checkbox" className="mt-0.5" checked={restyled} onChange={(e) => onRestyle(e.target.checked)} />
          <span>
            <span className="font-medium">Use one consistent style</span>
            <span className={`block ${small}`}>Fills by kind (at most five colours), black arrows, red for inhibition. Replaces {replaces.fills} fill colour{replaces.fills === 1 ? '' : 's'}{replaces.arrowColours ? `, ${replaces.arrowColours} arrow colour${replaces.arrowColours === 1 ? '' : 's'}` : ''}{replaces.textColours ? ` and ${replaces.textColours} text colour${replaces.textColours === 1 ? '' : 's'}` : ''}.</span>
            {replaces.meanings.length > 0 && (
              <span className="mt-1 block rounded bg-amber-50 p-1.5 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-100">
                Colour or styling that you noted in step ① carries meaning would be replaced:
                <span className="block">{replaces.meanings.map((m, i) => <span key={i} className="block">· {m}</span>)}</span>
              </span>
            )}
          </span>
        </label>
        {hasSublabels && (
          <label className="mt-2 flex cursor-pointer items-start gap-2">
            <input type="checkbox" className="mt-0.5" checked={opts.sublabels} onChange={(e) => onSublabels(e.target.checked)} />
            <span><span className="font-medium">Show member names under collapsed shapes</span><span className={`block ${small}`}>The small "A + B + C" line from step ④.</span></span>
          </label>
        )}
      </section>

      <details className={box}>
        <summary className="cursor-pointer text-sm font-semibold text-slate-800 dark:text-slate-100">Layout rules ({RULES.length - opts.off.length} of {RULES.length} on)</summary>
        <p className={`mt-1 ${small}`}>Switch off a rule that doesn't help this figure, then lay out again. Always on: one reading direction, compartments as rows, regulators beside what they act on.</p>
        <ul className="mt-1.5 space-y-1.5">
          {RULES.map((r) => (
            <li key={r.key}>
              <label className="flex cursor-pointer items-start gap-2">
                <input type="checkbox" className="mt-0.5" checked={!opts.off.includes(r.key)} onChange={(e) => onRule(r.key, e.target.checked)} />
                <span><span className="font-medium">{r.name}</span><span className={`block ${small}`}>{r.why}</span></span>
              </label>
            </li>
          ))}
        </ul>
      </details>

      {anyNotes && (
        <section className="rounded-lg border border-dashed border-slate-400 bg-slate-100 p-2.5 text-sm dark:border-slate-500 dark:bg-slate-900">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">{laidOut ? 'Worth a look' : 'Laying out would leave'}</h3>
          <ul className="mt-1 list-disc space-y-1 pl-4 text-sm">
            {notes.beside.length > 0 && (
              <li>
                No compartment in the figure, so placed beside its most-connected partner:{' '}
                {notes.beside.map((b, i) => (
                  <span key={b.id}>
                    {i > 0 && ', '}
                    <button className="underline decoration-dotted" onMouseEnter={() => onHover([b.id])} onMouseLeave={() => onHover(null)} onClick={() => onShow([b.id])}>{nameOf(x, b.id)}</button>
                    {b.partner ? ` (beside ${nameOf(x, b.partner)})` : ' (nothing to go by: in the cytoplasm)'}
                  </span>
                ))}
              </li>
            )}
            {notes.emptyRegions.length > 0 && <li>Compartments with nothing in them, not drawn: {notes.emptyRegions.join(', ')}</li>}
            {listed(notes.behind, 'Arrows that still pass behind a shape')}
            {listed(notes.textClashes, 'Arrow text that could not be kept clear')}
          </ul>
        </section>
      )}
    </div>
  );
}
