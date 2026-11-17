/**
 * Step 1, "What each shape is": every labelled shape matched to a record in a public database (HGNC, UniProt,
 * the Complex Portal, Gene Ontology, ChEBI), found by server/identify.ts and judged by src/identify/candidates.ts.
 *  - A summary line: how many shapes are identified, and how (exact symbol, confirmed, chosen by you), with the
 *    full list behind "show all".
 *  - A card for each shape that needs the user: an alias or synonym to confirm, several records to choose from,
 *    a class word ("Receptor"), nothing found, or a service that couldn't be reached (retry).
 *  - Every option says, in the database's own words, why it matched, and links to the record, so an alias is
 *    never taken for the record's own name. The label as drawn never changes.
 *  - "Other": none of the options is right, so the user says what it is in their own words ("CARMA1", "protein
 *    kinase C") and what kind of thing, and the databases are searched again with that.
 *  - Shapes sharing a label (TRAF6 drawn three times) are one card, answered together.
 *  - Any card can be clicked to work on it; the highlight doesn't have to be followed in order.
 */
import { Check, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { identityOf, identityText, OTHER_CLASSES, type Judged, type OtherClass } from '../../identify/candidates.ts';
import type { Identity } from '../../identify/types.ts';
import type { Issue } from '../../simplify/issues.ts';
import type { AppliedEdit, Edit } from '../../types/extraction.ts';
import { button, ICON, meta, primary, quiet, row, section, sectionTitle, toDecide } from '../ui.ts';

const btn = `${button} px-2 py-1`;

/** The identity a shape has now: chosen in this step, or an exact match taken as found; null while open. */
export function chosenIdentity(i: Issue, edits: AppliedEdit[], judged: Map<string, Judged>): Identity | null {
  const e = edits.find((v) => v.op === 'identify' && v.id === i.id);
  if (e) { try { return JSON.parse(e.value ?? 'null'); } catch { return null; } }
  const j = judged.get(i.id);
  return j?.status === 'exact' ? j.proposal : null;
}

const ASK: Record<Judged['status'], string> = {
  exact: 'Exact match', confirm: 'To confirm', decide: 'To decide', generic: 'To confirm', 'not found': 'To decide', failed: 'Retry',
};

export function IdentitySection({ issues, judged, pending, total, edits, active, onSettle, onHover, onSelect, onRetry, onSearch, searching }: {
  /** One issue per labelled shape that was looked up. */
  issues: Issue[];
  judged: Map<string, Judged>;
  /** Labels still being looked up. */
  pending: number;
  total: number;
  edits: AppliedEdit[];
  active: string | null;
  onSettle: (i: Issue, edit: Edit | null) => void;
  onHover: (ids: string[] | null) => void;
  onSelect: (i: Issue) => void;
  onRetry: (i: Issue) => void;
  /** Search again under the user's own words, as a kind of thing; null goes back to the label as drawn. */
  onSearch: (i: Issue, q: { text: string; cls: OtherClass } | null) => void;
  /** Labels being searched again. */
  searching: Set<string>;
}) {
  const [all, setAll] = useState(false);
  // Exact matches opened again from the list: an approved symbol can still be the wrong molecule (in an NF-κB
  // figure "BCR" is the B-cell receptor; HGNC's BCR is a RhoGEF), so each can be changed.
  const [reopened, setReopened] = useState<Set<string>>(new Set());
  const ids = issues.map((i) => ({ i, id: chosenIdentity(i, edits, judged), j: judged.get(i.id) }));
  const known = ids.filter((v) => v.id && !['unidentified', 'not a molecule'].includes(v.id.kind));
  const shapes = (list: typeof ids) => list.reduce((n, v) => n + (v.i.ids?.length ?? 1), 0);
  const exact = shapes(known.filter((v) => v.id!.by === 'exact match'));
  const cards = ids.filter((v) => v.j && (v.j.status !== 'exact' || reopened.has(v.i.id) || edits.some((e) => e.op === 'identify' && e.id === v.i.id)));
  return (
    <section className={section}>
      <h3 className={`${sectionTitle} mb-1 flex items-baseline justify-between`}>What each shape is<span className={`${meta} num font-normal`}>{cards.length}</span></h3>
      <p className={`${meta} mb-2`}>
        Matched to records in HGNC, UniProt, the Complex Portal, Gene Ontology and ChEBI. Only each label's text is sent to them.
        No AI is used here: a database gives the same answer every time, with a record behind it.
      </p>
      {pending > 0 && <p className={`${meta} num mb-2`}>Looking up {total - pending} of {total} labels…</p>}
      <p className="num mb-2 text-body text-ink-2">
        <b className="font-semibold text-ink">{shapes(known)} of {shapes(ids)}</b> shapes identified · {exact} by exact symbol · {shapes(known) - exact} confirmed or chosen by you
        {' '}<button className={quiet} onClick={() => setAll((v) => !v)}>{all ? 'hide list' : 'show all'}</button>
      </p>
      {all && (
        <ul className="mb-3 divide-y divide-line border-y border-line text-body">
          {ids.map(({ i, id }) => (
            <li key={i.key} className="flex items-baseline justify-between gap-2 py-1.5" onMouseEnter={() => onHover(i.ids ?? [i.id])} onMouseLeave={() => onHover(null)}>
              <span className="text-ink">{i.asWritten}{(i.ids?.length ?? 1) > 1 && <span className={`${meta} num`}> ×{i.ids!.length}</span>}</span>
              <span className={`${id ? 'text-ink-2' : 'text-ink-3'} text-right`}>
                {id ? <Records id={id} /> : 'open'}
                {id?.by === 'exact match' && !reopened.has(i.id) && <> · <button className={quiet} onClick={() => { setReopened((s) => new Set(s).add(i.id)); onSelect(i); }}>Change</button></>}
              </span>
            </li>
          ))}
        </ul>
      )}
      <ul className="divide-y divide-line border-y border-line">
        {/* Keyed by what was searched, so a new search starts the card's choices afresh. */}
        {cards.map(({ i, j }) => <IdentityCard key={`${i.key}|${j!.searchedAs?.text ?? ''}`} i={i} j={j!} chosen={reopened.has(i.id) && !edits.some((e) => e.op === 'identify' && e.id === i.id) ? null : chosenIdentity(i, edits, judged)} active={active === i.key}
          onSettle={onSettle} onHover={onHover} onSelect={onSelect} onRetry={onRetry} onSearch={onSearch} searching={searching.has(i.asWritten ?? '')} />)}
      </ul>
    </section>
  );
}

/** A shape's records as links, with what kind of identity it is. */
function Records({ id }: { id: Identity }) {
  if (!id.records.length) return <>{identityText(id)}</>;
  return (
    <>
      {id.kind === 'generic' ? 'a class: ' : id.kind === 'family' ? 'family: ' : ''}
      {id.records.map((r, k) => (
        <span key={r.db + r.id}>{k > 0 && ' + '}
          <a className="underline decoration-line-2 underline-offset-2 hover:text-ink" href={r.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{r.name}</a>
        </span>
      ))}
    </>
  );
}

function IdentityCard({ i, j, chosen, active, onSettle, onHover, onSelect, onRetry, onSearch, searching }: {
  i: Issue; j: Judged; chosen: Identity | null; active: boolean;
  onSettle: (i: Issue, edit: Edit | null) => void; onHover: (ids: string[] | null) => void; onSelect: (i: Issue) => void; onRetry: (i: Issue) => void;
  onSearch: (i: Issue, q: { text: string; cls: OtherClass } | null) => void; searching: boolean;
}) {
  // "Other": the user's own words and kind, searched again. Open from the start when nothing was found.
  const [other, setOther] = useState(false);
  const [text, setText] = useState(j.searchedAs?.text ?? i.asWritten ?? '');
  const [cls, setCls] = useState<OtherClass>(j.searchedAs?.cls ?? 'molecule');
  const many = (i.ids?.length ?? 1) > 1;
  // A part with one option starts on it; a part with a real choice starts with nothing ticked, so a quick click
  // can't take the first of several (HGNC lists "TAK1" for both NR2C2 and MAP3K7).
  const [pick, setPick] = useState<number[]>(() => j.parts.map((p) => (p.options.length === 1 ? 0 : -1)));
  const store = (v: Identity): Edit => ({ op: 'identify', id: i.id, to: null, value: JSON.stringify(v) });
  const nothing = j.parts.every((p) => !p.options.length && p.status !== 'generic');
  // Usable once any part has something to store; parts with no record ("UV" in "Growth factor, UV, H₂O₂") are left out.
  // A part with a choice must be answered before the rest is stored.
  const usable = j.parts.every((p, k) => p.options.length <= 1 || pick[k] >= 0)
    && j.parts.some((p, k) => (p.status === 'generic' ? !!p.generic?.classTerm : p.options[pick[k]] !== undefined));
  const mark = (kind: 'not a molecule' | 'unidentified') => onSettle(i, store({ kind, records: [], how: [], by: 'you' }));
  return (
    // Any click inside a card makes it the one being worked on (captured first, so its buttons still act).
    <li data-issue={i.key} className={row(active, !!chosen)} onClickCapture={() => { if (!active) onSelect(i); }} onMouseEnter={() => onHover(i.ids ?? [i.id])} onMouseLeave={() => onHover(null)}>
      <div className="flex items-start justify-between gap-2">
        <div className="font-semibold text-ink">"{i.asWritten}"{many && <span className={`${meta} num font-normal`}> · {i.ids!.length} shapes, answered together</span>}</div>
        {!chosen && <span className={toDecide}><span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />{ASK[j.status]}</span>}
      </div>
      {chosen ? (
        <div className="mt-1.5 flex items-start justify-between gap-2 text-body text-ok">
          <span className="flex items-start gap-1.5"><Check size={ICON} className="mt-0.5 shrink-0" /><span>{chosen.records.length ? <>Identified as <Records id={chosen} /></> : `Marked: ${identityText(chosen)}`}</span></span>
          <button className={`${quiet} shrink-0`} onClick={(e) => { e.stopPropagation(); onSettle(i, null); }}>Change</button>
        </div>
      ) : (
        <div className="mt-1.5 space-y-2" onClick={(e) => e.stopPropagation()}>
          {searching && <p className={meta}>Searching the databases again…</p>}
          {j.searchedAs && (
            <p className={meta}>Searched as "{j.searchedAs.text}" ({OTHER_CLASSES.find((c) => c[0] === j.searchedAs!.cls)?.[1].toLowerCase()}), your words. <button className={quiet} onClick={() => { setOther(false); onSearch(i, null); }}>Back to the label as drawn</button></p>
          )}
          {j.parts.map((p, k) => (
            <div key={k}>
              {j.parts.length > 1 && <div className="text-body font-medium text-ink">{p.term}</div>}
              {p.status === 'generic' ? (
                <p className={meta}>A word for a class of molecules, not one molecule{p.generic?.classTerm ? `. ${p.generic.classTerm.record.db} class term ${p.generic.classTerm.record.id}: "${p.generic.classTerm.record.name}".` : '; no class term found.'}</p>
              ) : p.status === 'failed' ? (
                <p className="text-body text-warn-ink">Couldn't reach {p.failed.join(' and ')}. Nothing is filled in. <button className={quiet} onClick={() => onRetry(i)}>Retry</button></p>
              ) : !p.options.length ? (
                <p className={meta}>No record found in {p.tried.join(', ')}.</p>
              ) : (
                <div className="space-y-1" role="radiogroup" aria-label={`Which record is ${p.term}?`}>
                  {p.options.map((o, n) => (
                    <label key={o.record.db + o.record.id} className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 hover:bg-sunk">
                      <input type="radio" className="mt-1" name={`${i.key}:${k}`} checked={!other && pick[k] === n} onChange={() => { setOther(false); setPick((v) => v.map((x, m) => (m === k ? n : x))); }} />
                      <span className="min-w-0">
                        <span className="font-medium text-ink">{o.record.name}</span>
                        {' '}<a className={`${meta} inline-flex items-center gap-0.5 underline decoration-line-2 underline-offset-2`} href={o.record.url} target="_blank" rel="noreferrer">{o.record.db} {o.record.id}<ExternalLink size={11} aria-hidden /></a>
                        <span className={`${meta} block`}>{o.why}</span>
                        {o.also.map((w) => <span key={w} className={`${meta} block`}>{w}</span>)}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}
          <label className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 hover:bg-sunk">
            <input type="radio" className="mt-1" checked={other || nothing} onChange={() => setOther(true)} />
            <span><span className="font-medium text-ink">Other</span><span className={`${meta} block`}>None of these: say what it is, and search again</span></span>
          </label>
          {(other || nothing) && (
            <div className="space-y-1.5 pl-6">
              <input className="w-full rounded border border-line-2 bg-panel px-2 py-1 text-body" value={text} placeholder="What it is, e.g. CARMA1 or protein kinase C" aria-label="What it is"
                onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' && text.trim()) { onSearch(i, { text: text.trim(), cls }); setOther(false); } }} />
              <select className="w-full rounded border border-line-2 bg-panel px-2 py-1 text-body" value={cls} aria-label="What kind of thing" onChange={(e) => setCls(e.target.value as OtherClass)}>
                {OTHER_CLASSES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select>
              <button className={`${button} px-2 py-1`} disabled={!text.trim() || searching} onClick={() => { onSearch(i, { text: text.trim(), cls }); setOther(false); }}>{searching ? 'Searching…' : 'Search again'}</button>
            </div>
          )}
          <div className="flex flex-wrap gap-1 pt-0.5">
            {usable && !other && <button className={`${primary} px-2 py-1`} onClick={() => onSettle(i, store(identityOf(j.parts, pick, 'you', j.searchedAs)))}>{j.parts.every((p) => p.status === 'generic') ? 'Yes, a class of molecules' : j.status === 'confirm' ? 'Confirm' : 'Use this'}</button>}
            <button className={btn} onClick={() => mark('not a molecule')}>Not a molecule</button>
            <button className={btn} onClick={() => mark('unidentified')}>Leave unidentified</button>
          </div>
        </div>
      )}
    </li>
  );
}
