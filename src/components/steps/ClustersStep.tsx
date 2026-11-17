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
import { Check } from 'lucide-react';
import { NameField } from '../EditPopover.tsx';
import { body, ICON, meta, primary, quiet, row } from '../ui.ts';

/** The card being edited: which cluster, which shapes are ticked, and the name typed (null = the default). */
export interface ClusterDraft { cluster: string; ticked: string[]; name: string | null }

const small = meta;

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
  if (!clusters.length) return <p className={body}>No clusters are drawn in this figure. Go on to the next step.</p>;
  /** The collapse that took in any of this cluster's members, if there is one. */
  const doneFor = (c: ClusterItem) => edits.find((e) => collapsed(e).some((m) => c.members.includes(m)));
  return (
    <div>
      <p className={`${body} mb-1`}>Open a cluster to choose which of its shapes become one. You can add other shapes by clicking them on either picture.</p>
      <p className={`${small} mb-4`}>Later: suggestions from known biology for which shapes belong together, always with their source.</p>
      <ul className="divide-y divide-line border-y border-line">
        {clusters.map((c) => {
          const done = doneFor(c);
          const open = draft?.cluster === c.id;
          const spec = done ? JSON.parse(done.value ?? '{}') as { label?: string; members?: string[] } : null;
          const ticked = open ? draft!.ticked : [];
          const extra = open ? ticked.filter((m) => !c.members.includes(m)) : [];
          const chip = (m: string) => {
            const on = ticked.includes(m);
            return (
              <label key={m} onMouseEnter={(e) => { e.stopPropagation(); onHover([m]); }}
                className={`flex cursor-pointer items-center gap-1.5 rounded border px-2 py-0.5 text-meta ${on ? 'border-ink bg-panel font-medium text-ink' : 'border-line-2 bg-panel text-ink-2'}`}>
                <input type="checkbox" className="h-3 w-3" checked={on} onChange={() => onDraft({ ...draft!, ticked: on ? ticked.filter((v) => v !== m) : [...ticked, m] })} />
                {nameOf(x, m)}{!c.members.includes(m) && <span className="text-ink-3">(added)</span>}
              </label>
            );
          };
          return (
            <li key={c.id} data-cluster={c.id} className={row(open, !!done)}
              onMouseEnter={() => onHover(c.members)} onMouseLeave={() => onHover(null)}
              onClick={() => { if (!open && !done) onDraft({ cluster: c.id, ticked: [], name: null }); onShow(c.members); }}>
              <div className="font-semibold text-ink">{c.name} <span className="num font-normal text-ink-3">· {c.members.length} shapes</span></div>
              {done ? (
                <div className="mt-1.5 flex items-start justify-between gap-2 text-ok">
                  <span className="flex items-start gap-1.5"><Check size={ICON} className="mt-0.5 shrink-0" />{joinNames(x, spec?.members ?? [])} collapsed into "{spec?.label}"</span>
                  <button className={`${quiet} shrink-0`} onClick={(e) => { e.stopPropagation(); onUndo(done); }}>Undo</button>
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
                    <button disabled={ticked.length < 2} onClick={() => onCollapse(draft!)} className={primary}>Collapse {ticked.length > 1 ? `${ticked.length} shapes` : ''}</button>
                    <button className={quiet} onClick={() => onDraft(null)}>Cancel</button>
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
