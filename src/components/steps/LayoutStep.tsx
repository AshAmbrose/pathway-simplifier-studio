/**
 * Step 5 panel: lay the figure out again, and see whether it reads better. Five ways (src/layout/):
 *  - "Compact" (the default): the original's rows and columns, re-spaced evenly; compartments fit their contents;
 *    the shape most routes lead into goes in the middle;
 *  - "Tidy as drawn": keeps the authors' arrangement and scale; lines up, closes gaps, crops, moves overlapping
 *    shapes clear, bows arrows around shapes;
 *  - "Squeeze": keeps the original's order exactly and closes the gaps, with a constraint solver (solvers/compaction.ts);
 *  - "Layered (ELK)": a general-purpose layered layout, ranked top to bottom (solvers/elk.ts);
 *  - "Redraw as a cell": BioPathway Studio's Organize Layout, read top to bottom. Made for figures drawn from
 *    scratch, so on a published figure it often reads worse; the numbers say so.
 *  - The main button stores the new positions as one change; nothing moves until it is pressed.
 *  - The numbers show before → after: crossings, arrows behind shapes, arrows pointing up (feedback apart).
 *  - Switches: one consistent style (listing what it replaces), member names under collapsed shapes, and each
 *    layout rule, so a rule that doesn't help this figure can be switched off.
 *  - What the layout couldn't do, or decided without the figure to go on, is listed.
 *  - A link opens the comparison page: every way side by side on this figure, with the same numbers.
 *  - After the layout, a shape can be selected and dragged; laying out again clears those moves.
 */
import { Check, ChevronDown } from 'lucide-react';
import { nameOf } from '../../edit/describe.ts';
import { body, cta, ICON, meta, quiet, section, sectionTitle, warnNote } from '../ui.ts';
import { RULES } from '../../layout/adapt.ts';
import type { Measures } from '../../layout/measures.ts';
import { COMPACT_RULES } from '../../layout/compact.ts';
import { TIDY_RULES } from '../../layout/tidy.ts';
import type { LayoutMode, LayoutNotes, LayoutOptions } from '../../layout/value.ts';
import type { Extraction } from '../../types/extraction.ts';

const small = meta;

/** What the consistent style would replace, for saying so before it is switched on. */
export interface StyleReplaces { fills: number; arrowColours: number; textColours: number; meanings: string[] }

function Row({ label, before, after, hint }: { label: string; before: number; after: number; hint?: string }) {
  const better = after < before, worse = after > before;
  return (
    <tr className="border-t border-line">
      <td className="py-1.5 pr-2 text-ink">{label}{hint && <div className={meta}>{hint}</div>}</td>
      <td className="num py-1.5 text-right align-top text-ink-2">{before}</td>
      <td className={`num py-1.5 text-right align-top font-semibold ${better ? 'text-ok' : worse ? 'text-warn-ink' : 'text-ink'}`}>{after}</td>
    </tr>
  );
}

export function LayoutStep({ x, laidOut, stale, opts, before, after, notes, restyled, replaces, hasSublabels, moves, compareHref, onLayout, onRule, onSublabels, onMode, onRestyle, onUndoMoves, onHover, onShow }: {
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
  /** The comparison page for this figure (src/components/LayoutCompare.tsx). */
  compareHref: string;
  onLayout: () => void;
  onRule: (k: string, on: boolean) => void;
  onSublabels: (on: boolean) => void;
  onMode: (m: LayoutMode) => void;
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
          <button className="text-ink underline decoration-line-2 decoration-dotted underline-offset-4" onMouseEnter={() => onHover([id])} onMouseLeave={() => onHover(null)} onClick={() => onShow([id])}>{nameOf(x, id)}</button>
        </span>
      ))}
    </li>
  );
  const mode: LayoutMode = opts.mode ?? 'compact';
  // Squeeze and Layered have no rules to switch: their constraints are what they are.
  const rules: readonly { key: string; name: string; why: string }[] = mode === 'compact' ? COMPACT_RULES : mode === 'tidy' ? TIDY_RULES : mode === 'cell' ? RULES : [];
  const verb = { compact: 'Compact', tidy: 'Tidy', kept: 'Squeeze', layered: 'Lay out', cell: 'Redraw' }[mode];
  const offHere = opts.off.filter((k) => rules.some((r) => r.key === k)).length;
  const anyNotes = notes.beside.length + notes.emptyRegions.length + notes.behind.length + notes.textClashes.length > 0;
  const lead = {
    compact: "Keeps the figure's arrangement (what sits left of, above or beside what) but re-spaces it on an even grid: empty space goes, compartments fit what is in them, shapes of one kind share one size, and the shape most routes lead into goes in the middle with its routes either side.",
    tidy: 'Keeps the figure as its authors drew it, at the same size, and tidies it: shapes nearly in line are lined up, space left by what earlier steps took out is closed and cropped, overlapping shapes are moved clear, and arrows bow around shapes.',
    kept: "Keeps the original's order exactly (every shape stays left of, right of, above or below the same neighbours) and closes the gaps: shapes take one size per kind, rows stay level and columns straight, and a constraint solver makes the canvas as small as those rules allow. It never reorders, so it can't fix an arrangement that was awkward to begin with.",
    layered: "ELK's layered layout, a general-purpose method for network diagrams: ranks shapes so arrows run down, orders each row to cut crossings, keeps the membrane as one row and compartments in a cell's order. Good at overall structure; it reorders freely, so the result can look little like the original.",
    cell: 'Redraws the figure from scratch as a cell, read top to bottom: compartments as rows, each part of the figure as a column, the main route into the nucleus as a straight line, regulators beside what they act on, outcomes underneath. Made for figures drawn from scratch, so a published figure often reads worse this way: check the numbers.',
  }[mode];
  return (
    <div>
      <section className={section}>
        <div className="grid grid-cols-2 gap-0.5 rounded bg-sunk p-0.5" role="radiogroup" aria-label="How to lay out">
          {([['compact', 'Compact'], ['tidy', 'Tidy as drawn'], ['kept', 'Squeeze'], ['layered', 'Layered (ELK)'], ['cell', 'Redraw as a cell']] as const).map(([m, label]) => (
            <button key={m} role="radio" aria-checked={mode === m} onClick={() => mode !== m && onMode(m)}
              className={`rounded-[3px] px-2 py-1.5 text-body ${mode === m ? 'bg-panel font-semibold text-ink shadow-[0_1px_2px_rgb(0_0_0/0.12)]' : 'text-ink-2 hover:text-ink'}`}>{label}</button>
          ))}
        </div>
        {!laidOut && <p className={`${body} mt-3`}>{lead}</p>}
        {laidOut && !stale && <p className="mt-3 flex items-start gap-2 text-body text-ok"><Check size={ICON} className="mt-0.5 shrink-0" />Laid out. Click a shape on the right, then drag it to fine-tune.</p>}
        {laidOut && stale && <p className={`${warnNote} mt-3`}>The figure or the switches below changed since this layout was made, so it may not match.</p>}
        {(!laidOut || stale) && (
          <button className={`${cta} mt-3`} onClick={onLayout}>
            {laidOut ? `${verb} again` : { compact: 'Compact the figure', tidy: 'Tidy the figure', kept: 'Squeeze the figure', layered: 'Lay out in layers', cell: 'Redraw as a cell' }[mode]}
          </button>
        )}
        <p className={`${meta} mt-2`}><a className={quiet} href={compareHref} target="_blank" rel="noreferrer">Compare every way on this figure</a> (opens a new tab; nothing is saved)</p>
        {moves > 0 && (
          <p className={`${meta} mt-2`}>
            <span className="num">{moves}</span> shape{moves === 1 ? '' : 's'} moved by hand{stale ? '; laying out again clears these moves' : ''}. <button className={quiet} onClick={onUndoMoves}>Undo moves</button>
          </p>
        )}
      </section>

      <section className={section}>
        <h3 className={sectionTitle}>How it reads</h3>
        <table className="mt-1 w-full text-body">
          <thead><tr className={meta}><th className="text-left font-normal" /><th className="pl-3 text-right font-normal">Before</th><th className="pl-3 text-right font-normal">{laidOut ? 'After' : 'If laid out'}</th></tr></thead>
          <tbody>
            <Row label="Arrows crossing" before={before.crossings} after={after.crossings} />
            <Row label="Arrows behind a shape" before={before.behind} after={after.behind} />
            <Row label="Arrows pointing up" before={before.up} after={after.up} hint="against the top-to-bottom reading" />
            <Row label="Feedback pointing up" before={before.feedbackUp} after={after.feedbackUp} hint="returns to where the signal came from; allowed" />
          </tbody>
        </table>
      </section>

      <section className={section}>
        <h3 className={sectionTitle}>Style</h3>
        <label className="mt-2 flex cursor-pointer items-start gap-2.5">
          <input type="checkbox" className="mt-1" checked={restyled} onChange={(e) => onRestyle(e.target.checked)} />
          <span>
            <span className="text-ink">Use one consistent style</span>
            <span className={`block ${small}`}>Fills by kind (at most five colours), black arrows, red for inhibition. Replaces <span className="num">{replaces.fills}</span> fill colour{replaces.fills === 1 ? '' : 's'}{replaces.arrowColours ? `, ${replaces.arrowColours} arrow colour${replaces.arrowColours === 1 ? '' : 's'}` : ''}{replaces.textColours ? ` and ${replaces.textColours} text colour${replaces.textColours === 1 ? '' : 's'}` : ''}.</span>
          </span>
        </label>
        {replaces.meanings.length > 0 && (
          <div className={`${warnNote} mt-2`}>
            Colour or styling you noted in step 1 as carrying meaning would be replaced:
            <ul className="mt-1 list-disc pl-4">{replaces.meanings.map((m, i) => <li key={i}>{m}</li>)}</ul>
          </div>
        )}
        {hasSublabels && (
          <label className="mt-3 flex cursor-pointer items-start gap-2.5">
            <input type="checkbox" className="mt-1" checked={opts.sublabels} onChange={(e) => onSublabels(e.target.checked)} />
            <span><span className="text-ink">Show member names under collapsed shapes</span><span className={`block ${small}`}>The small "A + B + C" line from step 4.</span></span>
          </label>
        )}
      </section>

      {rules.length > 0 && <details className={`${section} group`}>
        <summary className="flex cursor-pointer list-none items-center justify-between">
          <span className={sectionTitle}>{mode === 'cell' ? 'Layout rules' : mode === 'tidy' ? 'Tidying rules' : 'Compacting rules'}</span>
          <span className={`${meta} flex items-center gap-1`}><span className="num">{rules.length - offHere} of {rules.length}</span> on<ChevronDown size={ICON} className="transition-transform group-open:rotate-180" /></span>
        </summary>
        <p className={`mt-1 ${small}`}>{mode !== 'cell' ? "Switch off a rule that doesn't help this figure. Always on: shapes drawn together move together." : "Switch off a rule that doesn't help this figure. Always on: one reading direction, compartments as rows, regulators beside what they act on."}</p>
        <ul className="mt-2 space-y-2">
          {rules.map((r) => (
            <li key={r.key}>
              <label className="flex cursor-pointer items-start gap-2.5">
                <input type="checkbox" className="mt-1" checked={!opts.off.includes(r.key)} onChange={(e) => onRule(r.key, e.target.checked)} />
                <span><span className="text-ink">{r.name}</span><span className={`block ${small}`}>{r.why}</span></span>
              </label>
            </li>
          ))}
        </ul>
      </details>}

      {anyNotes && (
        <section className={section}>
          <h3 className={sectionTitle}>{laidOut ? 'Worth a look' : 'Laying out would leave'}</h3>
          <ul className={`${body} mt-1 list-disc space-y-1 pl-4`}>
            {notes.beside.length > 0 && (
              <li>
                No compartment in the figure, so placed beside its most-connected partner:{' '}
                {notes.beside.map((b, i) => (
                  <span key={b.id}>
                    {i > 0 && ', '}
                    <button className="text-ink underline decoration-line-2 decoration-dotted underline-offset-4" onMouseEnter={() => onHover([b.id])} onMouseLeave={() => onHover(null)} onClick={() => onShow([b.id])}>{nameOf(x, b.id)}</button>
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
