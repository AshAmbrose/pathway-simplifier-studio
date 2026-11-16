/**
 * Step 2 panel: the routes traced from the drawing, as ticks grouped the way the figure groups them, with the
 * regulators that sit with them. Everything starts ticked, so skipping the step changes nothing.
 * Hover a route to outline its shapes on both views. Clicking a shape on either view adds or drops it (with
 * whatever it touches); arrows between kept shapes stay by themselves. What is left out is listed, each with Restore.
 */
import { nameOf } from '../../edit/describe.ts';
import { items, OTHERS, type Tracing } from '../../simplify/routes.ts';
import type { Extraction, Simplify } from '../../types/extraction.ts';

const small = 'text-xs text-slate-500 dark:text-slate-400';
const link = 'text-xs text-slate-600 underline hover:text-slate-900 dark:text-slate-300 dark:hover:text-white';

export function FocusStep({ x, tracing, focus, hidden, arrowsLeftOut, onItem, onOnly, onAll, onRestore, onHover, onShow }: {
  /** The figure before this step. */
  x: Extraction;
  tracing: Tracing;
  focus: Simplify['focus'];
  /** The shapes left out, with the reason for each. */
  hidden: Map<string, string>;
  arrowsLeftOut: number;
  onItem: (key: string, on: boolean) => void;
  /** Keep only this route (and nothing else ticked). */
  onOnly: (key: string) => void;
  /** Tick everything again and forget clicks. */
  onAll: () => void;
  onRestore: (id: string) => void;
  onHover: (ids: string[] | null) => void;
  onShow: (ids: string[]) => void;
}) {
  const off = new Set(focus.off);
  // What each ticked item keeps, so a shape kept only because another ticked route shares it isn't counted as a click.
  const keptBy = new Map<string, number>();
  for (const it of items(tracing)) if (!off.has(it.key)) for (const m of it.members) keptBy.set(m, (keptBy.get(m) ?? 0) + 1);
  /** Ticked, but with some of its shapes clicked out; or unticked, with some of its own shapes clicked back in. */
  const mixed = (key: string, members: string[]) => (off.has(key) ? members.some((m) => !hidden.has(m) && !keptBy.has(m)) : members.some((m) => hidden.has(m)));
  const tick = (key: string, members: string[], label: string, extra: string | null, only: boolean) => (
    <li key={key} className="group rounded-md px-1.5 py-1 hover:bg-slate-100 dark:hover:bg-slate-800" onMouseEnter={() => onHover(members)} onMouseLeave={() => onHover(null)}>
      <div className="flex items-start gap-2">
        <input type="checkbox" className="mt-1 shrink-0" checked={!off.has(key)} aria-label={label}
          ref={(el) => { if (el) el.indeterminate = mixed(key, members); }} onChange={(e) => onItem(key, e.target.checked)} />
        <div className="min-w-0 flex-1">
          <button className="line-clamp-2 text-left text-sm leading-snug hover:underline" onClick={() => onShow(members)} title={`${label}\n(click to show it on the pictures)`}>{label}</button>
          <div className={small}>{extra}{mixed(key, members) ? ' · changed by clicking' : ''}</div>
        </div>
        {only && <button className={`${link} invisible shrink-0 group-hover:visible focus:visible`} onClick={() => onOnly(key)} title="Keep only this route">only</button>}
      </div>
    </li>
  );
  const nothing = tracing.groups.length === 0;
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Untick what you don't want to show, or click any shape on either picture to add or drop it. Arrows between kept shapes stay.
        Routes are traced from the figure's arrows; nothing is added from outside it.
      </p>
      {nothing && <p className="text-sm text-slate-600 dark:text-slate-300">No routes found: the figure's arrows don't form a chain from a start to an end. You can still click shapes to leave them out.</p>}
      {tracing.groups.map((g) => (
        <section key={g.key}>
          {/* The figure's own words, as written (so Yu's branch labels stay "a"–"d"). */}
          <h3 className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">{g.label}</h3>
          <ul className="space-y-0.5">
            {g.routes.map((r) => tick(r.key, r.members, r.name, `${r.members.length} shape${r.members.length === 1 ? '' : 's'}${r.shared.length ? ` · ${r.shared.length} shared with other routes` : ''}`, true))}
          </ul>
          {g.regulators.length > 0 && (
            <>
              <div className="mb-0.5 mt-2 pl-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Regulators</div>
              <ul className="space-y-0.5">{g.regulators.map((r) => tick(r.key, r.members, r.name, `acts on ${r.actsOn.join(', ')}`, false))}</ul>
            </>
          )}
        </section>
      ))}
      {tracing.others.length > 0 && (
        <section>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">On no route</h3>
          <ul>{tick(OTHERS, tracing.others, `${tracing.others.length} shape${tracing.others.length === 1 ? '' : 's'} with no arrows to follow`, tracing.others.map((id) => nameOf(x, id)).join(', '), false)}</ul>
        </section>
      )}
      <section className="rounded-lg bg-slate-50 p-2.5 dark:bg-slate-800/60">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Left out</h3>
          {(focus.off.length > 0 || focus.keep.length > 0 || focus.drop.length > 0) && <button className={link} onClick={onAll}>Keep everything</button>}
        </div>
        {hidden.size === 0 ? <p className={`mt-1 ${small}`}>Nothing yet. Everything in the figure is kept.</p> : (
          <>
            <p className={`mt-1 ${small}`}>{hidden.size} shape{hidden.size === 1 ? '' : 's'} and {arrowsLeftOut} arrow{arrowsLeftOut === 1 ? '' : 's'}. Faded on the right-hand view; click one there to bring it back.</p>
            <ul className="mt-1.5 max-h-56 space-y-0.5 overflow-y-auto">
              {[...hidden].map(([id, why]) => (
                <li key={id} className="flex items-center justify-between gap-2 text-sm" onMouseEnter={() => onHover([id])} onMouseLeave={() => onHover(null)}>
                  <span className="min-w-0 truncate">{nameOf(x, id)} <span className={small}>· {why}</span></span>
                  <button className={`${link} shrink-0`} onClick={() => onRestore(id)}>Restore</button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
