/**
 * The arrow check's shapes (server/relations.ts): what is asked about each drawn arrow, and what SIGNOR and
 * OmniPath record about it. Shared by the server, the Issues panel and the Finish report.
 */
import type { Identity } from '../identify/types.ts';
import type { Extraction } from '../types/extraction.ts';

/** An arrow's effect: as drawn (a bar is inhibition), or as a database records it. */
export type ArrowSign = 'up' | 'down' | 'binds' | 'unknown';

export interface RelationQuery { arrows: { id: string; from: Identity | null; to: Identity | null; sign: ArrowSign }[] }

export interface CurationRecord {
  source: 'SIGNOR' | 'OmniPath';
  /** SIGNOR's record ID (SIGNOR-…), or OmniPath's regulator → target. */
  id: string;
  from: string; to: string;
  sign: ArrowSign;
  /** In the database's words: "down-regulates activity", "form complex", "stimulation". */
  effect: string;
  mechanism: string;
  pmids: string[];
  direct: boolean;
  human: boolean;
  /** SIGNOR's curator sentence, or which resources OmniPath combines. */
  sentence: string;
  /** How a shape reached the record when not directly ("via SIGNOR complex IKK, which holds IKBKB"). */
  via: string[];
  url: string;
  /** Further records saying the same (SIGNOR often has one per modified residue), folded into this one. */
  more?: number;
}

/**
 * What the databases say about one arrow:
 *  - agrees: recorded with the same effect; recorded: recorded, and the arrow (or record) has no effect to compare;
 *  - opposite sign: recorded with the other effect; other way round: recorded only in the opposite direction;
 *  - not recorded: no record between them (not the same as wrong: a figure often draws one arrow for several steps);
 *  - not checkable: an end isn't identified, or has no entry in the databases.
 */
export type CheckStatus = 'agrees' | 'recorded' | 'opposite sign' | 'other way round' | 'not recorded' | 'not checkable';
export interface ArrowCheck { id: string; status: CheckStatus; records: CurationRecord[]; why: string }

/** The effect an arrow is drawn with: a bar or "inhibits" is down; an arrowhead, "activates", "transcribes" or "leads to" up. */
export function drawnSign(a: { head: string; meaning: string }): ArrowSign {
  if (a.head === 'bar' || a.meaning === 'inhibits' || a.meaning === 'degrades') return 'down';
  if (a.meaning === 'binds' || a.meaning === 'joins') return 'binds';
  if (['activates', 'transcribes', 'leads to'].includes(a.meaning) || (a.head === 'arrow' && ['unknown', 'uncertain'].includes(a.meaning))) return 'up';
  return 'unknown';
}

/**
 * What an arrow's end stands for: a shape's identity, or for a cluster, its identified members together (an arrow
 * into the TRADD + cIAP2 + RIP1 + TRAF2/5 cluster is checked against each of them). Null if nothing is identified.
 */
export function endIdentity(x: Extraction, id: string, known: Map<string, Identity>): Identity | null {
  if (known.has(id)) return known.get(id)!;
  const g = x.groups.find((v) => v.id === id);
  if (!g) return null;
  const parts = g.members.map((m) => known.get(m)).filter((v): v is Identity => !!v && !['generic', 'not a molecule', 'unidentified'].includes(v.kind));
  if (!parts.length) return null;
  return { kind: 'set', records: parts.flatMap((p) => p.records), how: [`the cluster's identified members (${parts.length} of ${g.members.length})`], by: 'you' };
}

/** What an arrow's end was checked as, in words: "IKBKB (cluster: 1 of 3 shapes identified)", or "not identified". */
export function endText(x: Extraction, id: string, known: Map<string, Identity>): string {
  const i = endIdentity(x, id, known);
  if (!i) return 'not identified';
  const names = i.records.map((r) => r.name).join(' + ');
  const g = x.groups.find((v) => v.id === id);
  if (!g || known.has(id)) return names;
  const n = g.members.filter((m) => { const k = known.get(m); return k && !['generic', 'not a molecule', 'unidentified'].includes(k.kind); }).length;
  return `${names} (cluster: ${n} of ${g.members.length} shapes identified)`;
}
