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

const card = 'rounded-lg border p-2.5 text-sm';
const btn = 'rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-800 hover:border-blue-500 hover:bg-blue-50 dark:border-slate-500 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600';
const small = 'text-xs text-slate-600 dark:text-slate-300';

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
    <div className="space-y-4">
      {many && (
        <section className="rounded-lg border-2 border-amber-400 bg-amber-50 p-2.5 text-sm dark:border-amber-600 dark:bg-amber-950/40">
          <div className="font-semibold text-slate-900 dark:text-white">The figure has parts: {tracing.parts.map((p) => p.label).join(', ')}.</div>
          <p className={`mt-0.5 ${small}`}>Are they different conditions (copies in different parts stay apart), or parts of one picture (copies can merge across them)?</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {([['conditions', 'Different conditions'], ['one', 'Parts of one picture']] as const).map(([v, label]) => (
              <button key={v} aria-pressed={panels === v} onClick={() => panels !== v && onPanels(v)}
                className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${panels === v ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-slate-800 hover:border-blue-500 dark:border-slate-500 dark:bg-slate-700 dark:text-slate-100'}`}>{label}</button>
            ))}
          </div>
          {!panels && <p className={`mt-1.5 ${small}`}>Until you answer, copies in different parts are kept apart.</p>}
          {panels && edits.length > 0 && <p className={`mt-1.5 ${small}`}>Changing the answer clears this step's {edits.length} merge{edits.length === 1 ? '' : 's'}.</p>}
        </section>
      )}
      {groups.length === 0 ? <p className="text-sm text-slate-600 dark:text-slate-300">No plain repeats: no molecule is drawn twice in the same place and state{many && panels !== 'one' ? ' within one part' : ''}.</p> : (
        <section>
          <div className="mb-1.5 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Drawn more than once ({groups.length})</h3>
            <span className="flex gap-2">
              <button className="text-xs font-medium text-blue-700 hover:underline dark:text-blue-300" onClick={onAll}>Merge all</button>
              {edits.length > 0 && <button className="text-xs text-slate-600 underline dark:text-slate-300" onClick={onNone}>Keep all apart</button>}
            </span>
          </div>
          <ul className="space-y-2">
            {groups.map((g) => {
              const mine = edits.filter((e) => g.copies.includes(e.id));
              const keeper = mine[0]?.to ?? g.keeper;
              const merged = mine.map((e) => e.id);
              const others = g.copies.filter((c) => c !== keeper);
              const done = merged.length > 0;
              const look = active === g.key ? 'border-orange-500 ring-2 ring-orange-500/40 bg-orange-50 dark:bg-orange-950/40'
                : done ? 'border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950/30' : 'border-slate-300 bg-white shadow-sm dark:border-slate-600 dark:bg-slate-800';
              return (
                <li key={g.key} data-repeat={g.key} className={`${card} cursor-pointer ${look}`} onClick={() => onSelect(g)}
                  onMouseEnter={() => onHover(g.copies)} onMouseLeave={() => onHover(null)}>
                  <div className="font-semibold text-slate-900 dark:text-white">{g.name} <span className="font-normal text-slate-500 dark:text-slate-400">· {g.copies.length} copies</span></div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <span className="rounded-full border border-blue-600 bg-blue-600 px-2 py-0.5 text-xs font-medium text-white" onMouseEnter={(e) => { e.stopPropagation(); onHover([keeper]); }}>
                      kept · {arrowsOf(keeper)} arrow{arrowsOf(keeper) === 1 ? '' : 's'}{partOf(keeper) ? ` · ${partOf(keeper)}` : ''}
                    </span>
                    {others.map((c) => {
                      const on = merged.includes(c);
                      return (
                        <span key={c} onMouseEnter={(e) => { e.stopPropagation(); onHover([c]); }}
                          className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${on ? 'border-green-400 bg-green-100 text-green-900 dark:border-green-700 dark:bg-green-900/50 dark:text-green-100' : 'border-slate-300 bg-white text-slate-800 dark:border-slate-500 dark:bg-slate-900 dark:text-slate-100'}`}>
                          <label className="flex cursor-pointer items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <input type="checkbox" className="h-3 w-3" checked={on} onChange={() => onSet(g, keeper, on ? merged.filter((m) => m !== c) : [...merged, c])} />
                            {on ? 'merged' : 'merge'} · {arrowsOf(c)} arrow{arrowsOf(c) === 1 ? '' : 's'}{partOf(c) ? ` · ${partOf(c)}` : ''}
                          </label>
                          <button className="ml-0.5 text-[10px] text-blue-700 underline dark:text-blue-300" title="Keep this copy instead"
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
        <details className="rounded-lg border border-dashed border-slate-400 bg-slate-100 p-2.5 text-sm dark:border-slate-500 dark:bg-slate-900">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">Left apart ({apart.length})</summary>
          <ul className="mt-1.5 space-y-1">
            {apart.map((a) => (
              <li key={a.key} onMouseEnter={() => onHover(a.ids)} onMouseLeave={() => onHover(null)}>
                <span className="font-medium">{a.name}</span> <span className={small}>· {a.ids.length} copies: {a.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
