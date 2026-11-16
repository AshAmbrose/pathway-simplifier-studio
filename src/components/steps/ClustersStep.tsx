/**
 * Step 4 panel: every cluster drawn in the figure, as a card. Nothing is ticked: being drawn together doesn't
 * prove the members belong together, so you choose.
 *  - Click a card to open it: tick two or more members (or click shapes on either picture, including shapes
 *    from outside the cluster), give the new shape a name, and Collapse.
 *  - The new shape covers the members' area; arrows to any member point at it; arrows between members go.
 *    With a name of its own, the members' names are kept as a small sub-label under it.
 *  - A collapsed cluster shows what it became, with Undo.
 */
import { nameOf } from '../../edit/describe.ts';
import { collapsed, joinNames, type ClusterItem } from '../../simplify/clusters.ts';
import type { AppliedEdit, Extraction } from '../../types/extraction.ts';
import { NameField } from '../EditPopover.tsx';

/** The card being edited: which cluster, which shapes are ticked, and the name typed (null = the default). */
export interface ClusterDraft { cluster: string; ticked: string[]; name: string | null }

const small = 'text-xs text-slate-600 dark:text-slate-300';

export function ClustersStep({ x, clusters, edits, draft, names, onDraft, onCollapse, onUndo, onHover, onShow }: {
  /** The figure before this step. */
  x: Extraction;
  clusters: ClusterItem[];
  /** This step's changes (collapse). */
  edits: AppliedEdit[];
  draft: ClusterDraft | null;
  names: string[];
  onDraft: (d: ClusterDraft | null) => void;
  onCollapse: (d: ClusterDraft) => void;
  onUndo: (e: AppliedEdit) => void;
  onHover: (ids: string[] | null) => void;
  onShow: (ids: string[]) => void;
}) {
  if (!clusters.length) return <p className="text-sm text-slate-600 dark:text-slate-300">No clusters are drawn in this figure. Go on to the next step.</p>;
  /** The collapse that took in any of this cluster's members, if there is one. */
  const doneFor = (c: ClusterItem) => edits.find((e) => collapsed(e).some((m) => c.members.includes(m)));
  return (
    <div className="space-y-2">
      <p className="text-sm text-slate-600 dark:text-slate-300">Open a cluster to choose which of its shapes become one. You can add other shapes by clicking them on either picture.</p>
      <p className={small}>Later: suggestions from known biology for which shapes belong together, always with their source.</p>
      <ul className="space-y-2">
        {clusters.map((c) => {
          const done = doneFor(c);
          const open = draft?.cluster === c.id;
          const spec = done ? JSON.parse(done.value ?? '{}') as { label?: string; members?: string[] } : null;
          const look = open ? 'border-orange-500 ring-2 ring-orange-500/40 bg-orange-50 dark:bg-orange-950/40'
            : done ? 'border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950/30' : 'border-slate-300 bg-white shadow-sm dark:border-slate-600 dark:bg-slate-800';
          const ticked = open ? draft!.ticked : [];
          const extra = open ? ticked.filter((m) => !c.members.includes(m)) : [];
          const chip = (m: string) => {
            const on = ticked.includes(m);
            return (
              <label key={m} onMouseEnter={(e) => { e.stopPropagation(); onHover([m]); }}
                className={`flex cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${on ? 'border-blue-400 bg-blue-100 text-blue-900 dark:border-blue-600 dark:bg-blue-900/50 dark:text-blue-100' : 'border-slate-300 bg-white text-slate-800 dark:border-slate-500 dark:bg-slate-900 dark:text-slate-100'}`}>
                <input type="checkbox" className="h-3 w-3" checked={on} onChange={() => onDraft({ ...draft!, ticked: on ? ticked.filter((v) => v !== m) : [...ticked, m] })} />
                {nameOf(x, m)}{!c.members.includes(m) && <span className="text-[10px] opacity-70">(added)</span>}
              </label>
            );
          };
          return (
            <li key={c.id} data-cluster={c.id} className={`cursor-pointer rounded-lg border p-2.5 text-sm ${look}`}
              onMouseEnter={() => onHover(c.members)} onMouseLeave={() => onHover(null)}
              onClick={() => { if (!open && !done) onDraft({ cluster: c.id, ticked: [], name: null }); onShow(c.members); }}>
              <div className="font-semibold text-slate-900 dark:text-white">{c.name} <span className="font-normal text-slate-500 dark:text-slate-400">· {c.members.length} shapes</span></div>
              {done ? (
                <div className="mt-1.5 flex items-start justify-between gap-2 font-medium text-green-800 dark:text-green-300">
                  <span>✓ {joinNames(x, spec?.members ?? [])} collapsed into "{spec?.label}"</span>
                  <button className="shrink-0 text-xs font-normal text-slate-600 underline dark:text-slate-300" onClick={(e) => { e.stopPropagation(); onUndo(done); }}>Undo</button>
                </div>
              ) : open ? (
                <div className="mt-1.5 space-y-2" onClick={(e) => e.stopPropagation()}>
                  <div className="flex flex-wrap gap-1">{[...c.members, ...extra].map(chip)}</div>
                  <div>
                    <div className={small}>Name of the new shape</div>
                    <NameField key={ticked.join()} value={draft!.name ?? joinNames(x, ticked)} placeholder="Tick two or more shapes first" names={names}
                      onCommit={(v) => onDraft({ ...draft!, name: v || null })} />
                    {draft!.name && ticked.length > 1 && draft!.name !== joinNames(x, ticked) && <div className={`mt-0.5 ${small}`}>Shown under the name: {joinNames(x, ticked)}</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    <button disabled={ticked.length < 2} onClick={() => onCollapse(draft!)}
                      className="rounded-md bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-40">Collapse {ticked.length > 1 ? `${ticked.length} shapes` : ''}</button>
                    <button className="text-xs text-slate-600 underline dark:text-slate-300" onClick={() => onDraft(null)}>Cancel</button>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
