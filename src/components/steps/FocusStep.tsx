/**
 * Step 2 panel: the routes traced from the drawing, as ticks grouped the way the figure groups them, with the
 * regulators that sit with them. Everything starts ticked, so skipping the step changes nothing.
 * Each route opens to show its shapes as small tick chips (one per set of shapes that travel together), so every
 * component can be ticked without a box per item.
 * Hover a route to outline its shapes on both views. Clicking a shape on either view adds or drops it (with
 * whatever it touches); arrows between kept shapes stay by themselves. What is left out is listed, each with Restore.
 */
import { useState } from 'react';
import { nameOf } from '../../edit/describe.ts';
import { items, OTHERS, type Tracing } from '../../simplify/routes.ts';
import type { Extraction, Simplify } from '../../types/extraction.ts';
import { ChevronDown, Repeat2 } from 'lucide-react';
import { body, meta, quiet, section, sectionTitle } from '../ui.ts';

const small = meta;
/** Each group of routes, and "On no route", as a card that stands out from the page in light and dark. */
const card = section;
const link = `${quiet} text-meta`;

export function FocusStep({ x, tracing, focus, hidden, arrowsLeftOut, onItem, onOnly, onAll, onRestore, onShape, onHover, onShow }: {
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
  /** A component's tick: keep it (and what travels with it) or leave it out. */
  onShape: (id: string, keptNow: boolean) => void;
  onHover: (ids: string[] | null) => void;
  onShow: (ids: string[]) => void;
}) {
  const off = new Set(focus.off);
  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set());
  const toggleOpen = (key: string) => setOpenKeys((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  /** A route's shapes as units (shapes drawn touching or in one cluster travel together), in order, once each. */
  const unitsOf = (members: string[]) => {
    const seen = new Set<string>();
    return members.map((m) => tracing.unitOf.get(m) ?? [m]).filter((u) => (seen.has(u[0]) ? false : (seen.add(u[0]), true)));
  };
  const sharedIds = new Set(tracing.groups.flatMap((g) => g.routes.flatMap((r) => r.shared)));
  const chips = (members: string[]) => (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {unitsOf(members).map((u) => {
        const kept = u.some((m) => !hidden.has(m));
        const short = (m: string) => { const e = x.elements.find((v) => v.id === m); return e?.label ?? `unlabelled ${e?.kind ?? 'shape'}`; };
        const names = [...new Set(u.map(short))];
        const label = names.length > 3 ? `${names.slice(0, 2).join(' + ')} + ${names.length - 2} more` : names.join(' + ');
        return (
          <label key={u[0]} title={`${names.join(', ')}${sharedIds.has(u[0]) ? ' (shared with other routes)' : ''}`}
            onMouseEnter={() => onHover(u)} onMouseLeave={() => onHover(null)}
            className={`flex cursor-pointer items-center gap-1.5 rounded border px-2 py-0.5 text-meta ${kept ? 'border-line-2 bg-panel text-ink' : 'border-line bg-sunk text-ink-3 line-through'}`}>
            <input type="checkbox" className="h-3 w-3" checked={kept} onChange={() => onShape(u[0], kept)} />
            {label}{sharedIds.has(u[0]) && <Repeat2 size={12} className="text-ink-3" aria-label="shared with other routes" />}
          </label>
        );
      })}
    </div>
  );
  // What each ticked item keeps, so a shape kept only because another ticked route shares it isn't counted as a click.
  const keptBy = new Map<string, number>();
  for (const it of items(tracing)) if (!off.has(it.key)) for (const m of it.members) keptBy.set(m, (keptBy.get(m) ?? 0) + 1);
  /** Ticked, but with some of its shapes clicked out; or unticked, with some of its own shapes clicked back in. */
  const mixed = (key: string, members: string[]) => (off.has(key) ? members.some((m) => !hidden.has(m) && !keptBy.has(m)) : members.some((m) => hidden.has(m)));
  const tick = (key: string, members: string[], label: string, extra: string | null, only: boolean) => (
    <li key={key} className="group rounded px-1.5 py-1.5 hover:bg-sunk">
      <div className="flex items-start gap-2" onMouseEnter={() => onHover(members)} onMouseLeave={() => onHover(null)}>
        <input type="checkbox" className="mt-1 shrink-0" checked={!off.has(key)} aria-label={label}
          ref={(el) => { if (el) el.indeterminate = mixed(key, members); }} onChange={(e) => onItem(key, e.target.checked)} />
        <div className="min-w-0 flex-1">
          <button className="line-clamp-2 text-left text-body text-ink hover:underline" onClick={() => onShow(members)} title={`${label}\n(click to show it on the pictures)`}>{label}</button>
          <div className={small}>
            {extra}{mixed(key, members) ? ' · changed by clicking' : ''}
            {unitsOf(members).length > 1 && <button className="ml-1 inline-flex items-center gap-0.5 text-ink hover:underline" aria-expanded={openKeys.has(key)} onClick={() => toggleOpen(key)}>{openKeys.has(key) ? 'hide' : 'show'}<ChevronDown size={12} className={openKeys.has(key) ? 'rotate-180' : ''} /></button>}
          </div>
        </div>
        {only && <button className={`${link} invisible shrink-0 group-hover:visible focus:visible`} onClick={() => onOnly(key)} title="Keep only this route">only</button>}
      </div>
      {openKeys.has(key) && <div className="pl-5">{chips(members)}</div>}
    </li>
  );
  const nothing = tracing.groups.length === 0;
  return (
    <div>
      <p className={`${body} mb-4`}>
        Untick what you don't want to show, or click any shape on either picture to add or drop it. Arrows between kept shapes stay.
        Routes are traced from the figure's arrows; nothing is added from outside it.
      </p>
      {nothing && <p className={`${body} mb-4`}>No routes found: the figure's arrows don't form a chain from a start to an end. You can still click shapes to leave them out.</p>}
      {tracing.groups.map((g) => (
        <section key={g.key} className={card}>
          {/* The figure's own words, as written (so Yu's branch labels stay "a"–"d"). */}
          <h3 className={`${sectionTitle} mb-1`}>{g.label}</h3>
          <ul className="space-y-0.5">
            {g.routes.map((r) => tick(r.key, r.members, r.name, `${r.members.length} shape${r.members.length === 1 ? '' : 's'}${r.shared.length ? ` · ${r.shared.length} shared with other routes` : ''}`, true))}
          </ul>
          {g.regulators.length > 0 && (
            <>
              <div className="mb-0.5 mt-3 pl-1.5 font-semibold text-ink-2">Regulators</div>
              <ul className="space-y-0.5">{g.regulators.map((r) => tick(r.key, r.members, r.name, `acts on ${r.actsOn.join(', ')}`, false))}</ul>
            </>
          )}
        </section>
      ))}
      {tracing.others.length > 0 && (
        <section className={card}>
          <h3 className={`${sectionTitle} mb-1`}>On no route</h3>
          <ul>{tick(OTHERS, tracing.others, `${tracing.others.length} shape${tracing.others.length === 1 ? '' : 's'} with no arrows to follow`, tracing.others.map((id) => nameOf(x, id)).join(', '), false)}</ul>
        </section>
      )}
      <section className={section}>
        <div className="flex items-center justify-between">
          <h3 className={sectionTitle}>Left out</h3>
          {(focus.off.length > 0 || focus.keep.length > 0 || focus.drop.length > 0) && <button className={link} onClick={onAll}>Keep everything</button>}
        </div>
        {hidden.size === 0 ? <p className={`mt-1 ${small}`}>Nothing yet. Everything in the figure is kept.</p> : (
          <>
            <p className={`mt-1 ${small} num`}>{hidden.size} shape{hidden.size === 1 ? '' : 's'} and {arrowsLeftOut} arrow{arrowsLeftOut === 1 ? '' : 's'}. Faded on the right-hand view; click one there to bring it back.</p>
            <ul className="mt-1.5 max-h-56 space-y-0.5 overflow-y-auto">
              {[...hidden].map(([id, why]) => (
                <li key={id} className="flex items-center justify-between gap-2 text-body" onMouseEnter={() => onHover([id])} onMouseLeave={() => onHover(null)}>
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
