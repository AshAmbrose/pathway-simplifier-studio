/**
 * Step 3 panel: copies of the same molecule, one card per set of plain repeats.
 *  - If the figure has parts (panels, or areas under headings), it first asks once whether they are different
 *    conditions (copies in different parts stay apart) or parts of one picture (they can merge).
 *  - Each copy is a chip: tick it to merge it into the kept copy. "keep this" picks another copy to keep.
 *  - Each card says what merging does before you tick, worked out on a copy of the figure.
 *  - Copies with the same name that were not offered are listed under "Left apart", with the reason.
 * Hover a card or a chip to outline the copies on both views; click a card to select it and bring it into view.
 */
import { applyEdits } from '../../edit/applyEdits.ts';
import type { Apart, RepeatGroup } from '../../simplify/repeats.ts';
import type { Tracing } from '../../simplify/routes.ts';
import type { AppliedEdit, Edit, Extraction, Simplify } from '../../types/extraction.ts';
import { body, button, meta, quiet, row, section, sectionTitle, warnNote } from '../ui.ts';

const btn = `${button} px-2 py-1`;
const small = meta;

/** What merging these copies does, in words: "2 shapes fewer, 3 arrows moved, 1 arrow drawn once". */
export function effectOf(x: Extraction, keeper: string, copies: string[]): string {
  if (!copies.length) return '';
  const out = applyEdits(x, copies.map((c): Edit => ({ op: 'merge_into', id: c, to: keeper, value: null }))).extraction;
  const moved = x.arrows.filter((a) => copies.includes(a.from) || copies.includes(a.to)).length;
  const merged = x.arrows.length - out.arrows.length;
  const clusters = x.groups.length - out.groups.length;
  const parts = [`${copies.length} shape${copies.length === 1 ? '' : 's'} fewer`];
  if (moved) parts.push(`${moved} arrow${moved === 1 ? '' : 's'} moved to the kept copy`);
  if (merged) parts.push(`${merged} arrow${merged === 1 ? '' : 's'} now drawn once`);
  if (clusters) parts.push(`${clusters} cluster${clusters === 1 ? '' : 's'} now drawn once`);
  return parts.join(', ');
}

export function RepeatsStep({ x, tracing, panels, groups, apart, edits, active, onPanels, onSet, onAll, onNone, onHover, onSelect }: {
  /** The figure before this step. */
  x: Extraction;
  tracing: Tracing;
  panels: Simplify['panels'];
  groups: RepeatGroup[];
  apart: Apart[];
  /** This step's changes (merge_into). */
  edits: AppliedEdit[];
  active: string | null;
  /** Answer the parts question (this clears the step's merges, which depended on the old answer). */
  onPanels: (v: 'conditions' | 'one') => void;
  /** Set one card's choice: the copy kept and the copies merged into it. */
  onSet: (g: RepeatGroup, keeper: string, merged: string[]) => void;
  onAll: () => void;
  onNone: () => void;
  onHover: (ids: string[] | null) => void;
  onSelect: (g: RepeatGroup) => void;
}) {
  const many = tracing.parts.length > 1;
  const arrowsOf = (id: string) => x.arrows.filter((a) => a.from === id || a.to === id || x.groups.some((g) => g.members.includes(id) && (a.from === g.id || a.to === g.id))).length;
  const partOf = (id: string) => (many ? tracing.parts.find((p) => p.key === tracing.partOf.get(id))?.label : null);
  return (
    <div>
      {many && (
        <section className={`${section} ${warnNote}`}>
          <div className="font-semibold">The figure has parts: {tracing.parts.map((p) => p.label).join(', ')}.</div>
          <p className={`mt-0.5 ${small}`}>Are they different conditions (copies in different parts stay apart), or parts of one picture (copies can merge across them)?</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {([['conditions', 'Different conditions'], ['one', 'Parts of one picture']] as const).map(([v, label]) => (
              <button key={v} aria-pressed={panels === v} onClick={() => panels !== v && onPanels(v)}
                className={`rounded border px-2.5 py-1 text-body ${panels === v ? 'border-ink bg-ink font-medium text-on-ink' : 'border-line-2 bg-panel text-ink hover:bg-sunk'}`}>{label}</button>
            ))}
          </div>
          {!panels && <p className={`mt-1.5 ${small}`}>Until you answer, copies in different parts are kept apart.</p>}
          {panels && edits.length > 0 && <p className={`mt-1.5 ${small}`}>Changing the answer clears this step's {edits.length} merge{edits.length === 1 ? '' : 's'}.</p>}
        </section>
      )}
      {groups.length === 0 ? <p className={`${section} ${body}`}>No plain repeats: no molecule is drawn twice in the same place and state{many && panels !== 'one' ? ' within one part' : ''}.</p> : (
        <section className={section}>
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className={sectionTitle}>Drawn more than once <span className="num font-normal text-ink-3">{groups.length}</span></h3>
            <span className="flex gap-3">
              <button className={quiet} onClick={onAll}>Merge all</button>
              {edits.length > 0 && <button className={quiet} onClick={onNone}>Keep all apart</button>}
            </span>
          </div>
          <ul className="divide-y divide-line border-y border-line">
            {groups.map((g) => {
              const mine = edits.filter((e) => g.copies.includes(e.id));
              const keeper = mine[0]?.to ?? g.keeper;
              const merged = mine.map((e) => e.id);
              const others = g.copies.filter((c) => c !== keeper);
              const done = merged.length > 0;
              return (
                <li key={g.key} data-repeat={g.key} className={row(active === g.key, done)} onClick={() => onSelect(g)}
                  onMouseEnter={() => onHover(g.copies)} onMouseLeave={() => onHover(null)}>
                  <div className="font-semibold text-ink">{g.name} <span className="num font-normal text-ink-3">· {g.copies.length} copies</span></div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <span className="num rounded border border-ink bg-ink px-2 py-0.5 text-meta font-medium text-on-ink" onMouseEnter={(e) => { e.stopPropagation(); onHover([keeper]); }}>
                      kept · {arrowsOf(keeper)} arrow{arrowsOf(keeper) === 1 ? '' : 's'}{partOf(keeper) ? ` · ${partOf(keeper)}` : ''}
                    </span>
                    {others.map((c) => {
                      const on = merged.includes(c);
                      return (
                        <span key={c} onMouseEnter={(e) => { e.stopPropagation(); onHover([c]); }}
                          className={`num flex items-center gap-1 rounded border px-2 py-0.5 text-meta ${on ? 'border-ok/40 bg-ok-wash text-ok' : 'border-line-2 bg-panel text-ink'}`}>
                          <label className="flex cursor-pointer items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <input type="checkbox" className="h-3 w-3" checked={on} onChange={() => onSet(g, keeper, on ? merged.filter((m) => m !== c) : [...merged, c])} />
                            {on ? 'merged' : 'merge'} · {arrowsOf(c)} arrow{arrowsOf(c) === 1 ? '' : 's'}{partOf(c) ? ` · ${partOf(c)}` : ''}
                          </label>
                          <button className="ml-1 text-meta text-ink-2 underline underline-offset-2 hover:text-ink" title="Keep this copy instead"
                            onClick={(e) => { e.stopPropagation(); onSet(g, c, done ? g.copies.filter((v) => v !== c) : []); }}>keep this</button>
                        </span>
                      );
                    })}
                  </div>
                  <div className={`mt-1.5 ${small}`}>{done ? `Done: ${effectOf(x, keeper, merged)}.` : `Merging all would mean ${effectOf(x, keeper, others)}.`}</div>
                  {!done && <button className={`${btn} mt-1.5`} onClick={(e) => { e.stopPropagation(); onSet(g, keeper, others); }}>Merge into one</button>}
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {apart.length > 0 && (
        <details className={section}>
          <summary className={`${sectionTitle} cursor-pointer`}>Left apart <span className="num font-normal text-ink-3">{apart.length}</span></summary>
          <ul className="mt-1.5 space-y-1">
            {apart.map((a) => (
              <li key={a.key} onMouseEnter={() => onHover(a.ids)} onMouseLeave={() => onHover(null)}>
                <span className="font-medium text-ink">{a.name}</span> <span className={small}>· {a.ids.length} copies: {a.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
