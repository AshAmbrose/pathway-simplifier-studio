/**
 * Step 1's arrow check: what curated databases record about each arrow drawn between two identified shapes.
 * Entirely local: it reads two snapshots on disk, so nothing about the figure leaves the machine.
 *  - SIGNOR (data/signor/snapshot.json.gz, CC BY-SA 4.0; `npm run fetch:signor`): human causal interactions, each
 *    with its effect (up- or down-regulates, forms a complex), mechanism, PubMed reference and the curator's sentence.
 *  - OmniPath (data/omnipath/snapshot.json.gz, academic licence; `npm run fetch:omnipath`): signed, referenced,
 *    protein → protein records, used only where SIGNOR has no record for the pair (the order BioPathway Studio uses).
 *
 * A shape is matched to database entities through its identity (src/identify/): a gene by its UniProt accession
 * or symbol; a family or set by each member; and also the SIGNOR complexes and families that hold it, said so
 * ("via SIGNOR complex IKK"), since SIGNOR often records a step at the complex level. A chemical by its ChEBI ID,
 * a process by a SIGNOR phenotype with the same name. Classes of molecules and unidentified shapes can't be checked.
 *
 * Results are flags only: the figure is never changed. "Not recorded" is not "wrong": a figure often draws one arrow
 * for several steps, and databases are incomplete.
 */
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import type { Identity } from '../src/identify/types.ts';
import type { ArrowCheck, ArrowSign, CurationRecord, RelationQuery } from '../src/relations/types.ts';

interface Entity { id: string; name: string; type: string; members?: string[] }
interface Interaction { id: string; a: string; b: string; effect: string; mechanism: string; pmid: string; direct: boolean; score: number | null; sentence: string; taxId: string }
interface OmniRecord { a: string; b: string; aName: string; bName: string; sign: 'up' | 'down'; resources: string[]; pmids: string[] }

const DATA = new URL('../data/', import.meta.url);

class Curated {
  entities = new Map<string, Entity>();
  signor = new Map<string, Interaction[]>();
  omni = new Map<string, OmniRecord>();
  protein = new Map<string, string>();
  holders = new Map<string, Entity[]>();
  phenotype = new Map<string, string>();
  meta: { signor?: string; omnipath?: string } = {};

  constructor() {
    const s = new URL('signor/snapshot.json.gz', DATA);
    if (existsSync(s)) {
      const snap = JSON.parse(gunzipSync(readFileSync(s)).toString('utf8')) as { meta: { downloadedAt?: string }; entities: Entity[]; interactions: Interaction[] };
      this.meta.signor = snap.meta?.downloadedAt;
      for (const e of snap.entities) {
        this.entities.set(e.id, e);
        if (e.type === 'protein' && !this.protein.has(e.name.toUpperCase())) this.protein.set(e.name.toUpperCase(), e.id);
        if (e.type === 'phenotype') this.phenotype.set(e.name.toLowerCase(), e.id);
        if (e.type === 'complex' || e.type === 'proteinfamily') for (const m of e.members ?? []) this.holders.set(m.toUpperCase(), [...(this.holders.get(m.toUpperCase()) ?? []), e]);
      }
      for (const i of snap.interactions) { const k = `${i.a}|${i.b}`; this.signor.set(k, [...(this.signor.get(k) ?? []), i]); }
    }
    const o = new URL('omnipath/snapshot.json.gz', DATA);
    if (existsSync(o)) {
      const snap = JSON.parse(gunzipSync(readFileSync(o)).toString('utf8')) as { meta: { downloadedAt?: string }; records: OmniRecord[] };
      this.meta.omnipath = snap.meta?.downloadedAt;
      for (const r of snap.records) this.omni.set(`${r.a}|${r.b}`, r);
    }
  }
  get ready() { return this.entities.size > 0; }
}

let curated: Curated | null = null;
const load = () => (curated ??= new Curated());

/** The database entities a shape stands for, each with how it was reached (for the reason shown). */
function entitiesOf(c: Curated, id: Identity | null): { ent: string; via: string | null }[] {
  if (!id || ['generic', 'not a molecule', 'unidentified'].includes(id.kind)) return [];
  const out = new Map<string, string | null>();
  const add = (ent: string | undefined, via: string | null) => { if (ent && c.entities.has(ent) && !out.has(ent)) out.set(ent, via); };
  const symbols: string[] = [];
  for (const r of id.records) {
    if (r.db === 'HGNC' || r.db === 'UniProt') {
      for (const acc of r.uniprot ?? []) add(acc, null);
      if (!r.id.startsWith('stem:')) { add(c.protein.get(r.name.toUpperCase()), null); symbols.push(r.name); }
    }
    for (const m of r.members ?? []) { add(c.protein.get(m.toUpperCase()), `${m}, a member of ${r.name}`); symbols.push(m); }
    if (r.db === 'ChEBI') add(r.id, null);
    if (r.db === 'GO') add(c.phenotype.get(r.name.toLowerCase()), `SIGNOR phenotype "${r.name}"`);
  }
  // SIGNOR often records a step at the complex or family level: those holding the shape count too, said so.
  for (const s of symbols) for (const h of c.holders.get(s.toUpperCase()) ?? []) add(h.id, `SIGNOR ${h.type === 'complex' ? 'complex' : 'family'} "${h.name}", which holds ${s}`);
  return [...out].map(([ent, via]) => ({ ent, via }));
}

const signOf = (effect: string): ArrowSign => (/^up-regulates/.test(effect) ? 'up' : /^down-regulates/.test(effect) ? 'down' : effect === 'form complex' ? 'binds' : 'unknown');

/** What SIGNOR, then OmniPath, record from any of one shape's entities to any of the other's. */
function recordsBetween(c: Curated, from: { ent: string; via: string | null }[], to: { ent: string; via: string | null }[]): CurationRecord[] {
  const out: CurationRecord[] = [];
  for (const f of from) for (const t of to) {
    if (f.ent === t.ent) continue;
    const name = (e: string) => c.entities.get(e)?.name ?? e;
    for (const i of c.signor.get(`${f.ent}|${t.ent}`) ?? []) out.push({
      source: 'SIGNOR', id: i.id, from: name(f.ent), to: name(t.ent), sign: signOf(i.effect), effect: i.effect, mechanism: i.mechanism, pmids: i.pmid ? i.pmid.split(';') : [],
      direct: i.direct, human: i.taxId === '9606', sentence: i.sentence, via: [f.via, t.via].filter((v): v is string => !!v), url: `https://signor.uniroma2.it/relation_result.php?id=${i.id}`,
    });
  }
  if (out.length) return out;
  // OmniPath only where SIGNOR records nothing between these shapes.
  for (const f of from) for (const t of to) {
    const r = c.omni.get(`${f.ent}|${t.ent}`);
    if (r) out.push({
      source: 'OmniPath', id: `${r.aName}→${r.bName}`, from: r.aName, to: r.bName, sign: r.sign, effect: r.sign === 'up' ? 'stimulation' : 'inhibition', mechanism: '', pmids: r.pmids,
      direct: true, human: true, sentence: `Curated by ${r.resources.join(', ')}`, via: [f.via, t.via].filter((v): v is string => !!v), url: `https://omnipathdb.org/interactions?sources=${r.a}&targets=${r.b}&genesymbols=yes`,
    });
  }
  return out;
}

/** Records saying the same thing (one per modified residue in SIGNOR) folded into the first, with a count. */
function fold(rs: CurationRecord[]): CurationRecord[] {
  const out = new Map<string, CurationRecord>();
  for (const r of rs) {
    const k = `${r.source}|${r.from}|${r.to}|${r.effect}|${r.mechanism}`;
    const have = out.get(k);
    if (have) have.more = (have.more ?? 0) + 1; else out.set(k, { ...r });
  }
  return [...out.values()];
}

/** Best first: the shape's own records over a complex's, direct over indirect, human, then more references. */
const rank = (a: CurationRecord, b: CurationRecord) => a.via.length - b.via.length || Number(b.direct) - Number(a.direct) || Number(b.human) - Number(a.human) || b.pmids.length - a.pmids.length;

export function checkArrows(q: RelationQuery): { ready: boolean; snapshots: Curated['meta']; results: ArrowCheck[] } {
  const c = load();
  if (!c.ready) return { ready: false, snapshots: {}, results: [] };
  const results = q.arrows.map((a): ArrowCheck => {
    const from = entitiesOf(c, a.from), to = entitiesOf(c, a.to);
    if (!from.length || !to.length) return { id: a.id, status: 'not checkable', records: [], why: !a.from || !a.to ? 'an end is not identified' : 'an end has no entry in SIGNOR or OmniPath' };
    // Both ends the same molecule (β-catenin → β-catenin): a move or a change of state, which these databases don't record.
    const own = (v: { ent: string; via: string | null }[]) => new Set(v.filter((e) => !e.via).map((e) => e.ent));
    const fo = own(from), to_ = own(to);
    if (fo.size && [...fo].some((e) => to_.has(e))) return { id: a.id, status: 'not checkable', records: [], why: 'both ends are the same molecule: a move or a change of state, which these databases don\'t record' };
    const forward = fold(recordsBetween(c, from, to).sort(rank));
    if (forward.length) {
      const signs = new Set(forward.map((r) => r.sign));
      if (a.sign === 'unknown' || a.sign === 'binds') return { id: a.id, status: 'recorded', records: forward.slice(0, 6), why: 'recorded in this direction' };
      if (signs.has(a.sign)) return { id: a.id, status: 'agrees', records: forward.filter((r) => r.sign === a.sign).slice(0, 6), why: 'recorded with the same effect' };
      const opposite = a.sign === 'up' ? 'down' : 'up';
      if (signs.has(opposite)) return { id: a.id, status: 'opposite sign', records: forward.slice(0, 6), why: `recorded as ${opposite === 'down' ? 'inhibiting' : 'activating'}, drawn as ${a.sign === 'down' ? 'inhibiting' : 'activating'}` };
      return { id: a.id, status: 'recorded', records: forward.slice(0, 6), why: 'recorded, with no effect given (forms a complex, or unknown)' };
    }
    const back = fold(recordsBetween(c, to, from).sort(rank));
    if (back.length) return { id: a.id, status: 'other way round', records: back.slice(0, 6), why: 'recorded only in the opposite direction' };
    return { id: a.id, status: 'not recorded', records: [], why: 'no record between them in SIGNOR or OmniPath' };
  });
  return { ready: true, snapshots: c.meta, results };
}
