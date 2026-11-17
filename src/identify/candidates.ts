/**
 * Step 1: from what the databases returned for a label (server/identify.ts) to what the user is asked. Pure.
 *  - exact: every part matched one record by its own approved symbol (or a term by its exact name), so it is
 *    taken as found and listed, not asked about;
 *  - confirm: one record per part, but through an alias, a previous symbol, a synonym, a name or a family;
 *    shown with the database's own words, waiting for the user to confirm;
 *  - decide: a part matched several records (HGNC lists "p65" as an alias of RELA, SYT1 and GORASP1);
 *  - generic: a word for a class of molecules ("Receptor"), offered as such with its class term;
 *  - not found: no service had a record; failed: a service couldn't be reached (retry, never guessed).
 * No AI is involved on purpose: a curated database gives the same answer every time, with a record behind it.
 */
import type { DbRecord, Hit, Identity, LabelLookup, TermLookup } from './types.ts';

export type IdStatus = 'exact' | 'confirm' | 'decide' | 'generic' | 'not found' | 'failed';
export interface IdOption extends Hit {
  why: string;
  /** The same gene as named by another database (UniProt beside HGNC), in that database's words. */
  also: string[];
}
export interface PartChoice { term: string; status: IdStatus; options: IdOption[]; generic: TermLookup['generic']; tried: string[]; failed: string[] }
export interface Judged {
  label: string; status: IdStatus; parts: PartChoice[]; proposal: Identity | null;
  /** Searched again under the user's own words ("CARMA1" for "CARMA"), and as what kind of thing. */
  searchedAs?: { text: string; cls: OtherClass };
}

/** What the user can say a shape is when searching under their own words ("Other"), and the kind searched as. */
export const OTHER_CLASSES = [
  ['molecule', 'A gene or protein', 'protein'], ['family', 'A family of genes', 'protein family'], ['complex', 'A complex', 'complex'],
  ['process', 'A process or outcome', 'process'], ['chemical', 'A chemical or stimulus', 'small molecule'], ['class', 'A class of molecules', 'class'],
] as const;
export type OtherClass = (typeof OTHER_CLASSES)[number][0];

/** Why a record matched, in the database's own terms, so an alias never passes for the record's own name. */
export function whyOf(term: string, h: Hit): string {
  const r = h.record, full = r.full ? `, ${r.full}` : '';
  switch (h.field) {
    case 'approved symbol': return `HGNC approved symbol ${r.name}${full}`;
    case 'approved name': return `HGNC approved name of ${r.name}: "${h.matched}"`;
    case 'alias': return `HGNC lists "${h.matched}" as an alias of ${r.name} (approved symbol)${full}`;
    case 'previous symbol': return `HGNC lists "${h.matched}" as a previous symbol of ${r.name} (approved symbol)${full}`;
    case 'gene name': return `UniProt ${r.id}: gene name ${h.matched}${full}`;
    case 'gene synonym': return `UniProt ${r.id} lists "${h.matched}" as a gene synonym of ${r.name}${full}`;
    case 'protein name': return `UniProt ${r.id} lists "${h.matched}" as a protein name of ${r.name}${full}`;
    case 'term name': return `${r.db} term ${r.id}: "${r.name}"`;
    case 'exact synonym': return `${r.db} lists "${h.matched}" as an exact synonym of "${r.name}" (${r.id})`;
    case 'related synonym': return `${r.db} lists "${term}" only as a related synonym of "${r.name}" (${r.id})`;
    case 'complex name': return `Complex Portal ${r.id}: "${r.name}", a human complex whose name contains "${term.replace(/\s*complex$/i, '')}"`;
    case 'symbol stem': return `HGNC symbols ${(r.members ?? []).join(', ')} share the stem "${term.replace(/s$/, '').toUpperCase()}"${r.full ? `; ${r.full}` : ''}`;
    case 'gene group': return `HGNC gene group ${r.id} "${r.name}" (${(r.members ?? []).join(', ')}): ${h.matched} belong to it`;
    case 'class term': return `${r.db} class term ${r.id}: "${r.name}"`;
  }
}

/** The kind of identity one record gives. */
export function kindOf(r: DbRecord): Identity['kind'] {
  if (r.db === 'GO') return 'process';
  if (r.db === 'ChEBI') return 'chemical';
  if (r.db === 'Complex Portal') return 'complex';
  if (r.db === 'HGNC gene group' || r.members?.length) return 'family';
  return 'molecule';
}

const EXACT = new Set(['approved symbol', 'term name']);

/** One option per record; HGNC and UniProt naming the same gene (by its symbol) are one option with both reasons. */
function judgePart(p: TermLookup): PartChoice {
  const byKey = new Map<string, IdOption>();
  for (const h of p.hits) {
    const k = h.record.db === 'HGNC' || h.record.db === 'UniProt' ? `gene:${h.record.name.toUpperCase()}` : `${h.record.db}:${h.record.id}`;
    const have = byKey.get(k);
    if (!have) { byKey.set(k, { ...h, why: whyOf(p.term, h), also: [] }); continue; }
    const why = whyOf(p.term, h);
    if (why !== have.why && !have.also.includes(why)) have.also.push(why);
    const uniprot = [...new Set([...(have.record.uniprot ?? []), ...(h.record.uniprot ?? [])])];
    // HGNC names genes, so its record is the one shown; UniProt's accession is kept with it.
    have.record = h.record.db === 'HGNC' && have.record.db === 'UniProt' ? { ...h.record, uniprot } : { ...have.record, uniprot };
  }
  // A term that is only a related synonym (ChEBI lists "TNF-α" for a recombinant zebrafish protein) is dropped
  // when the label names a record more directly; it stays when the alternatives are as weak (a previous symbol).
  const direct = (o: IdOption) => !['related synonym', 'previous symbol', 'symbol stem', 'gene group'].includes(o.field);
  let options = [...byKey.values()];
  if (options.some(direct)) options = options.filter((o) => o.field !== 'related synonym');
  // A label that is a gene's approved symbol names that gene: other genes listing it as an alias or a retired
  // symbol (HGNC lists "LAT" as an alias of SPNS1, "TRAF2" as a previous symbol of TANK) don't compete with it.
  if (options.some((o) => o.field === 'approved symbol')) options = options.filter((o) => !['alias', 'previous symbol', 'gene synonym'].includes(o.field) || o.record.name.toUpperCase() === options.find((v) => v.field === 'approved symbol')!.record.name.toUpperCase());
  const status: IdStatus = p.generic ? 'generic'
    : !options.length ? (p.failed.length ? 'failed' : 'not found')
      : options.length > 1 ? 'decide'
        : EXACT.has(options[0].field) ? 'exact' : 'confirm';
  return { term: p.term, status, options, generic: p.generic, tried: p.tried, failed: p.failed };
}

/** The label's status is its most demanding part's: a failed lookup first, then a choice, then a gap, then a check. */
const ORDER: IdStatus[] = ['failed', 'decide', 'not found', 'confirm', 'generic', 'exact'];

export function judge(l: LabelLookup): Judged {
  const parts = l.parts.map(judgePart);
  const status = parts.length ? ORDER.find((s) => parts.some((p) => p.status === s))! : 'not found';
  // What would be stored if the user took the obvious answer: one option (or a class term) for every part.
  const one = parts.every((p) => p.options.length === 1 || (p.status === 'generic'));
  const proposal: Identity | null = parts.length && one ? identityOf(parts, parts.map(() => 0), status === 'exact' ? 'exact match' : 'you') : null;
  return { label: l.label, status, parts, proposal };
}

/** The identity from one chosen option per part (index into its options; a generic part takes its class term). */
export function identityOf(parts: PartChoice[], chosen: number[], by: Identity['by'], searchedAs?: Judged['searchedAs']): Identity {
  const picked = parts.map((p, i) => (p.status === 'generic'
    ? (p.generic?.classTerm ? { ...p.generic.classTerm, why: whyOf(p.term, p.generic.classTerm), also: [] } : null)
    : p.options[chosen[i]] ?? null));
  const kept = picked.filter((v): v is IdOption => !!v);
  const kind: Identity['kind'] = searchedAs?.cls === 'class' || parts.every((p) => p.status === 'generic') ? 'generic'
    : parts.length > 1 ? 'set' : kindOf(kept[0]?.record ?? { db: 'HGNC', id: '', name: '', url: '' });
  // Found under the user's own words: said so, so the record is never read as matching the label as drawn.
  const said = searchedAs ? `Searched as "${searchedAs.text}" (your words): ` : '';
  return { kind, records: kept.map((v) => v.record), how: kept.map((v) => said + [v.why, ...v.also].join('; ')), by };
}

/** The identity in a few words, for the change list and a settled card. */
export function identityText(i: Identity): string {
  const names = i.records.map((r) => (r.db === 'HGNC' || r.db === 'UniProt' ? r.name : `"${r.name}"`)).join(' + ');
  const ids = i.records.map((r) => (r.db === 'HGNC' && r.uniprot?.length ? `${r.id}, UniProt ${r.uniprot[0]}` : r.db === 'HGNC gene group' ? `HGNC gene group ${r.id}` : r.id)).join('; ');
  switch (i.kind) {
    case 'generic': return `a class of molecules${names ? `: ${names} (${ids})` : ''}`;
    case 'not a molecule': return 'not a molecule';
    case 'unidentified': return 'left unidentified';
    case 'family': return `the ${names} family (${ids})`;
    default: return `${names} (${ids})`;
  }
}
