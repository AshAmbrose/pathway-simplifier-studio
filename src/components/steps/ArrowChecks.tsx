/**
 * Step 1, "Arrows against curated records": each arrow between identified shapes, looked up in SIGNOR, then
 * OmniPath where SIGNOR has no record (server/relations.ts, on this machine). Flags only: nothing is changed.
 *  - A summary: how many arrows agree, are recorded, are to look at, aren't recorded, or can't be checked, with the
 *    full list behind "show all".
 *  - A card for each arrow to look at: recorded with the opposite effect, or only the other way round. Each shows
 *    the database's records in its own words (effect, mechanism, the curator's sentence), how a shape reached the
 *    record (through a family member or a complex holding it), and links to the record and its PubMed references.
 *    "Seen", with an optional note, settles it.
 * "Not recorded" is not "wrong": a figure often draws one arrow for several steps, and databases are incomplete.
 */
import { Check, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { cleanText, nameOf } from '../../edit/describe.ts';
import type { ArrowCheck, CheckStatus, CurationRecord } from '../../relations/types.ts';
import type { Issue } from '../../simplify/issues.ts';
import type { Extraction, Simplify } from '../../types/extraction.ts';
import { button, ICON, meta, quiet, row, section, sectionTitle, toDecide } from '../ui.ts';

export const STATUS_TEXT: Record<CheckStatus, string> = {
  agrees: 'Agrees', recorded: 'Recorded', 'opposite sign': 'Opposite effect', 'other way round': 'Only the other way round', 'not recorded': 'Not recorded', 'not checkable': "Can't be checked",
};
/** The same, as counted in a summary ("9 agree"). */
const COUNT_TEXT: Record<CheckStatus, string> = {
  agrees: 'agree', recorded: 'recorded', 'opposite sign': 'opposite effect', 'other way round': 'only the other way round', 'not recorded': 'not recorded', 'not checkable': "can't be checked",
};
/** Arrows the user is asked to look at. */
export const TO_LOOK = new Set<CheckStatus>(['opposite sign', 'other way round']);

/** One line summing up the check, for the panel and the Finish report. */
export function checkSummary(results: ArrowCheck[]): string {
  const n = (s: CheckStatus) => results.filter((r) => r.status === s).length;
  return `Arrows checked against SIGNOR and OmniPath: ${n('agrees')} agree, ${n('recorded')} recorded, ${n('opposite sign')} recorded with the opposite effect, ${n('other way round')} recorded only the other way round, ${n('not recorded')} not recorded, ${n('not checkable')} can't be checked.`;
}

function Record({ r }: { r: CurationRecord }) {
  return (
    <li className="py-1">
      <span className="text-ink">{r.source}: {r.from} → {r.to}, "{r.effect}"{r.mechanism ? ` by ${r.mechanism}` : ''}</span>
      {' '}<a className={`${meta} inline-flex items-center gap-0.5 underline decoration-line-2 underline-offset-2`} href={r.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{r.id}<ExternalLink size={11} aria-hidden /></a>
      {r.pmids.slice(0, 3).map((p) => <a key={p} className={`${meta} ml-1.5 underline decoration-line-2 underline-offset-2`} href={`https://pubmed.ncbi.nlm.nih.gov/${p}/`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>PMID {p}</a>)}
      <span className={`${meta} block`}>{[r.direct ? 'direct' : 'indirect', r.human ? 'human' : 'not human', ...r.via.map((v) => `via ${v}`)].join(' · ')}</span>
      {!!r.more && <span className={`${meta} block`}>and {r.more} more record{r.more === 1 ? '' : 's'} like it</span>}
      {r.sentence && <span className={`${meta} block italic`}>{r.sentence.length > 220 ? r.sentence.slice(0, 220) + '…' : r.sentence}</span>}
    </li>
  );
}

export function ArrowChecksSection({ x, results, issues, decisions, active, pending, ends, onSeen, onHover, onSelect }: {
  /** The figure as step 1 leaves it, for the arrows' names. */
  x: Extraction;
  results: ArrowCheck[];
  /** The arrows to look at, as issues (kind 'relation'). */
  issues: Issue[];
  decisions: Simplify['issues'];
  active: string | null;
  pending: boolean;
  /** What each end of an arrow was checked as, in words (src/relations/types.ts, endText). */
  ends: (arrowId: string) => { from: string; to: string };
  onSeen: (i: Issue, note: string | null) => void;
  onHover: (ids: string[] | null) => void;
  onSelect: (i: Issue) => void;
}) {
  const [all, setAll] = useState(false);
  const order: CheckStatus[] = ['opposite sign', 'other way round', 'agrees', 'recorded', 'not recorded', 'not checkable'];
  return (
    <section className={section}>
      <h3 className={`${sectionTitle} mb-1 flex items-baseline justify-between`}>Arrows against curated records<span className={`${meta} num font-normal`}>{issues.length}</span></h3>
      <p className={`${meta} mb-2`}>
        Each arrow between identified shapes, looked up in SIGNOR, then OmniPath where SIGNOR has no record, on this machine. Flags only: nothing is changed.
        "Not recorded" isn't "wrong": figures often draw one arrow for several steps.
      </p>
      {pending && <p className={`${meta} mb-2`}>Checking…</p>}
      <p className="num mb-2 text-body text-ink-2">
        {order.filter((s) => results.some((r) => r.status === s)).map((s, k) => <span key={s}>{k > 0 && ' · '}{results.filter((r) => r.status === s).length} {COUNT_TEXT[s]}</span>)}
        {' '}<button className={quiet} onClick={() => setAll((v) => !v)}>{all ? 'hide list' : 'show all'}</button>
      </p>
      {all && (
        <ul className="mb-3 divide-y divide-line border-y border-line text-body">
          {order.flatMap((s) => results.filter((r) => r.status === s)).map((r) => (
            <li key={r.id} className="py-1.5" onMouseEnter={() => onHover([r.id])} onMouseLeave={() => onHover(null)}>
              <div className="flex items-baseline justify-between gap-2"><span className="text-ink">{cleanText(x, nameOf(x, r.id))}</span><span className={meta}>{STATUS_TEXT[r.status]}</span></div>
              {r.records[0] ? <ul className="pl-2">{r.records.slice(0, 1).map((c) => <Record key={c.id} r={c} />)}</ul> : <div className={meta}>{r.why}</div>}
            </li>
          ))}
        </ul>
      )}
      {issues.length > 0 && (
        <ul className="divide-y divide-line border-y border-line">
          {issues.map((i) => {
            const r = results.find((v) => v.id === i.id)!;
            const dec = decisions[i.key];
            return <ArrowCard key={i.key} x={x} i={i} r={r} ends={ends(i.id)} seen={dec ? dec.note ?? '' : null} active={active === i.key} onSeen={onSeen} onHover={onHover} onSelect={onSelect} />;
          })}
        </ul>
      )}
    </section>
  );
}

function ArrowCard({ x, i, r, ends, seen, active, onSeen, onHover, onSelect }: {
  x: Extraction; i: Issue; r: ArrowCheck; ends: { from: string; to: string }; seen: string | null; active: boolean;
  onSeen: (i: Issue, note: string | null) => void; onHover: (ids: string[] | null) => void; onSelect: (i: Issue) => void;
}) {
  const [note, setNote] = useState('');
  return (
    <li data-issue={i.key} className={row(active, seen !== null)} onClickCapture={() => { if (!active) onSelect(i); }} onMouseEnter={() => onHover([i.id])} onMouseLeave={() => onHover(null)}>
      <div className="flex items-start justify-between gap-2">
        <div className="font-semibold text-ink">{cleanText(x, nameOf(x, i.id))}</div>
        {seen === null && <span className={toDecide}><span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />To look at</span>}
      </div>
      <div className="mt-0.5 text-body text-warn-ink">{STATUS_TEXT[r.status]}: {r.why}.</div>
      {/* What was looked up: a cluster only partly identified can make a step look reversed. */}
      <div className={`${meta} mt-0.5`}>Checked as: {ends.from} → {ends.to}</div>
      <ul className="mt-1 divide-y divide-line">{r.records.slice(0, 3).map((c) => <Record key={c.id} r={c} />)}</ul>
      {seen !== null ? (
        <div className="mt-1.5 flex items-start justify-between gap-2 text-body text-ok">
          <span className="flex items-start gap-1.5"><Check size={ICON} className="mt-0.5 shrink-0" />{seen ? `Seen: ${seen}` : 'Seen'}</span>
          <button className={`${quiet} shrink-0`} onClick={(e) => { e.stopPropagation(); onSeen(i, null); }}>Change</button>
        </div>
      ) : (
        <div className="mt-2 flex gap-1" onClick={(e) => e.stopPropagation()}>
          <input className="w-full rounded border border-line-2 bg-panel px-2 py-1 text-body" value={note} placeholder="What you make of it (optional)"
            onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') onSeen(i, note.trim()); }} />
          <button className={`${button} px-2 py-1`} onClick={() => onSeen(i, note.trim())}>Seen</button>
        </div>
      )}
    </li>
  );
}
