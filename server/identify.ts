/**
 * Step 1's lookups: what public databases say a label is. Runs on the local server, so the browser never talks to
 * the services directly, and every answer is cached on disk (data/identify-cache/, gitignored): a label is sent
 * once, and the same label gives the same answer in later sessions.
 *
 * What is sent: only the label text (or one part of it), never the image, the figure's name or anything else.
 * Requests carry a generic client name. Each service has a short timeout; one that can't be reached is reported as
 * "couldn't reach", and nothing is filled in for it.
 *
 * The services, by kind of shape:
 *  - genes and proteins: HGNC (approved symbol, alias, previous symbol, then approved name), then UniProt
 *    (reviewed human entries: gene name, gene synonym, protein name), then a symbol stem for families
 *    ("JAK" → JAK1, JAK2, JAK3, with their HGNC gene group);
 *  - complexes: the Complex Portal (human complexes);
 *  - processes and outcomes: Gene Ontology, through EBI's Ontology Lookup Service;
 *  - small molecules and stimuli: ChEBI, through the same service;
 *  - class words ("Receptor", "Cytokine"): their class term, by its exact name, in GO or ChEBI.
 * Only matches the database itself states are kept: an equal symbol, alias, name or synonym. Close spellings are
 * left to the matcher (src/identify/candidates.ts), and to the user.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { GENERIC, genericWord, spellings, splitLabel } from '../src/identify/normalise.ts';
import type { DbRecord, Field, Hit, LabelLookup, TermLookup } from '../src/identify/types.ts';

const CACHE_DIR = new URL('../data/identify-cache/', import.meta.url);
const UA = 'pathway-simplifier/0.1 (local research prototype)';
const TIMEOUT_MS = 8000;
const PARALLEL = 3;

// ---- Cached, polite fetching -------------------------------------------------------------------------------

const caches = new Map<string, Record<string, unknown>>();
function cacheOf(service: string): Record<string, unknown> {
  let c = caches.get(service);
  if (!c) {
    const f = new URL(`${service}.json`, CACHE_DIR);
    try { c = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {}; } catch { c = {}; }
    caches.set(service, c!);
  }
  return c!;
}
function saveCache(service: string) {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(new URL(`${service}.json`, CACHE_DIR), JSON.stringify(cacheOf(service)));
}

/** At most a few requests in flight per service. */
const busy = new Map<string, number>(), waiting = new Map<string, (() => void)[]>();
async function slot(service: string) {
  if ((busy.get(service) ?? 0) >= PARALLEL) await new Promise<void>((go) => waiting.set(service, [...(waiting.get(service) ?? []), go]));
  busy.set(service, (busy.get(service) ?? 0) + 1);
}
function release(service: string) {
  busy.set(service, (busy.get(service) ?? 1) - 1);
  const next = waiting.get(service)?.shift();
  if (next) next();
}

/** Thrown when a service can't be reached or answers with an error; the lookup reports it, never guesses. */
class Unreachable extends Error {}

async function getJson(service: string, url: string, accept = 'application/json'): Promise<any> {
  const c = cacheOf(service);
  if (url in c) return c[url];
  await slot(service);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: accept }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Unreachable(`${service}: HTTP ${res.status}`);
    const body = accept === 'application/json' ? await res.json() : await res.text();
    c[url] = body;
    saveCache(service);
    return body;
  } catch (e) {
    throw e instanceof Unreachable ? e : new Unreachable(`${service}: ${(e as Error).message}`);
  } finally {
    release(service);
  }
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const enc = encodeURIComponent;

// ---- HGNC --------------------------------------------------------------------------------------------------

interface HgncDoc { hgnc_id: string; symbol: string; name: string; alias_symbol?: string[]; prev_symbol?: string[]; uniprot_ids?: string[]; gene_group?: string[]; gene_group_id?: number[]; locus_group?: string }

const hgncRecord = (d: HgncDoc): DbRecord => ({
  db: 'HGNC', id: d.hgnc_id, name: d.symbol, full: d.name, uniprot: d.uniprot_ids ?? [],
  url: `https://www.genenames.org/data/gene-symbol-report/#!/hgnc_id/${d.hgnc_id}`,
});
async function hgncFetch(id: string): Promise<HgncDoc | null> {
  const r = await getJson('hgnc', `https://rest.genenames.org/fetch/hgnc_id/${enc(id)}`);
  return r?.response?.docs?.[0] ?? null;
}
async function hgncSearch(query: string): Promise<{ hgnc_id: string; symbol: string }[]> {
  const r = await getJson('hgnc', `https://rest.genenames.org/search/${enc(query).replace(/%3A/g, ':')}`);
  return r?.response?.docs ?? [];
}

/** Symbols, aliases and previous symbols equal to the term; then approved names equal to it. */
async function hgnc(term: string): Promise<Hit[]> {
  const q = (field: string) => `${field}:"${term.replace(/"/g, '')}"`;
  const fieldOf = (d: HgncDoc): [Field, string] | null => {
    if (same(d.symbol, term)) return ['approved symbol', d.symbol];
    const alias = d.alias_symbol?.find((a) => same(a, term));
    if (alias) return ['alias', alias];
    const prev = d.prev_symbol?.find((a) => same(a, term));
    if (prev) return ['previous symbol', prev];
    if (same(d.name, term)) return ['approved name', d.name];
    return null;
  };
  let found = await hgncSearch(`${q('symbol')} OR ${q('alias_symbol')} OR ${q('prev_symbol')}`);
  if (!found.length) found = await hgncSearch(q('name'));
  const hits: Hit[] = [];
  for (const f of found.slice(0, 8)) {
    const d = await hgncFetch(f.hgnc_id);
    const m = d && fieldOf(d);
    if (d && m) hits.push({ record: hgncRecord(d), field: m[0], matched: m[1] });
  }
  return hits;
}

/**
 * A family named by its symbol stem: "JAK" → JAK1, JAK2, JAK3; "STAT" → STAT1 … STAT6. Members are protein-coding
 * genes whose symbol is the stem plus a number (with at most two letters between, as in PTPN1). The gene group
 * they share, if any, is named with them.
 */
async function stemFamily(term: string): Promise<Hit[]> {
  const stem = term.replace(/s$/, '').toUpperCase();
  if (!/^[A-Z]{2,6}$/.test(stem)) return [];
  const found = await hgncSearch(`symbol:${stem}*`);
  // The stem plus a number (TLR4, STAT5A, PTPN1); a trailing P after the number marks a pseudogene (TLR12P), left out.
  const pattern = new RegExp(`^${stem}[A-Z]{0,2}\\d+[A-Z]?$`);
  const members = found.filter((f) => pattern.test(f.symbol) && !/\dP$/.test(f.symbol)).slice(0, 24);
  if (members.length < 2) return [];
  const docs = (await Promise.all(members.slice(0, 4).map((m) => hgncFetch(m.hgnc_id)))).filter((d): d is HgncDoc => !!d);
  // Every gene group the members looked at share is named; none is picked as "the" family.
  const shared = (docs[0]?.gene_group_id ?? []).filter((g) => docs.every((d) => d.gene_group_id?.includes(g)));
  const groups = shared.map((g) => docs[0].gene_group![docs[0].gene_group_id!.indexOf(g)]);
  const symbols = members.map((m) => m.symbol);
  const record: DbRecord = { db: 'HGNC', id: `stem:${stem}`, name: `${stem} family`, full: groups.length ? `gene groups they share: ${groups.join('; ')}` : null,
    members: symbols, url: `https://www.genenames.org/tools/search/#!/?query=${enc(stem)}*` };
  return [{ record, field: 'symbol stem', matched: symbols.join(', ') }];
}

// ---- UniProt -----------------------------------------------------------------------------------------------

/** Reviewed human entries whose gene name, gene synonym or protein name (recommended, alternative or short) equals the term. */
async function uniprot(term: string): Promise<Hit[]> {
  const t = term.replace(/"/g, '');
  const query = `(gene_exact:"${t}" OR protein_name:"${t}") AND organism_id:9606 AND reviewed:true`;
  const r = await getJson('uniprot', `https://rest.uniprot.org/uniprotkb/search?query=${enc(query)}&fields=accession,gene_primary,gene_synonym,protein_name&size=10&format=json`);
  const hits: Hit[] = [];
  for (const e of r?.results ?? []) {
    const gene = e.genes?.[0];
    const primary: string | undefined = gene?.geneName?.value;
    const synonyms: string[] = (gene?.synonyms ?? []).map((s: { value: string }) => s.value);
    const desc = e.proteinDescription ?? {};
    const rec = desc.recommendedName?.fullName?.value as string | undefined;
    const names: string[] = [rec, ...(desc.recommendedName?.shortNames ?? []).map((s: { value: string }) => s.value),
      ...(desc.alternativeNames ?? []).flatMap((a: any) => [a.fullName?.value, ...(a.shortNames ?? []).map((s: { value: string }) => s.value)])].filter(Boolean);
    const record: DbRecord = { db: 'UniProt', id: e.primaryAccession, name: primary ?? e.primaryAccession, full: rec ?? null, uniprot: [e.primaryAccession], url: `https://www.uniprot.org/uniprotkb/${e.primaryAccession}` };
    if (primary && same(primary, t)) hits.push({ record, field: 'gene name', matched: primary });
    else if (synonyms.some((s) => same(s, t))) hits.push({ record, field: 'gene synonym', matched: synonyms.find((s) => same(s, t))! });
    else if (names.some((n) => same(n, t))) hits.push({ record, field: 'protein name', matched: names.find((n) => same(n, t))! });
  }
  return hits;
}

// ---- Complex Portal ----------------------------------------------------------------------------------------

/** Human complexes whose name contains the term (with "complex" taken off), best first. Offered, never assumed. */
async function complexes(term: string): Promise<Hit[]> {
  const t = term.replace(/\bcomplex\b/i, '').trim();
  if (t.length < 2) return [];
  const r = await getJson('complexportal', `https://www.ebi.ac.uk/intact/complex-ws/search/${enc(t)}?first=0&number=20&format=json`);
  return (r?.elements ?? [])
    .filter((e: any) => /9606/.test(e.organismName ?? '') && String(e.complexName).toLowerCase().includes(t.toLowerCase()))
    .slice(0, 4)
    .map((e: any): Hit => ({
      record: { db: 'Complex Portal', id: e.complexAC, name: e.complexName, url: `https://www.ebi.ac.uk/complexportal/complex/${e.complexAC}` },
      field: 'complex name', matched: e.complexName,
    }));
}

// ---- Ontologies (GO, ChEBI) ---------------------------------------------------------------------------------

/** Terms whose name or synonym is the term exactly. */
async function ontology(term: string, onto: 'go' | 'chebi'): Promise<Hit[]> {
  const r = await getJson('ols', `https://www.ebi.ac.uk/ols4/api/search?q=${enc(term)}&ontology=${onto}&type=class&exact=true&rows=6&fieldList=obo_id,label,exact_synonyms,iri`);
  return (r?.response?.docs ?? []).filter((d: any) => d.obo_id).map((d: any): Hit => {
    const field: Field = same(d.label, term) ? 'term name' : (d.exact_synonyms ?? []).some((s: string) => same(s, term)) ? 'exact synonym' : 'related synonym';
    const db = onto === 'go' ? 'GO' : 'ChEBI';
    const url = onto === 'go' ? `https://www.ebi.ac.uk/QuickGO/term/${d.obo_id}` : `https://www.ebi.ac.uk/chebi/searchId.do?chebiId=${d.obo_id}`;
    return { record: { db, id: d.obo_id, name: d.label, url }, field, matched: field === 'term name' ? d.label : term };
  }).sort((a: Hit, b: Hit) => rankField(a.field) - rankField(b.field)).slice(0, 4);
}
const rankField = (f: Field) => ['term name', 'exact synonym', 'related synonym'].indexOf(f);

// ---- One term, one label --------------------------------------------------------------------------------------

const MOLECULE_FIRST = new Set(['small molecule', 'stimulus']);
/** How directly a field names the record, strongest first. */
const STRENGTH: Field[] = ['approved symbol', 'gene name', 'term name', 'approved name', 'protein name', 'complex name', 'alias', 'gene synonym', 'exact synonym', 'previous symbol', 'related synonym', 'symbol stem', 'class term'];
const PROCESS = new Set(['process', 'phenotype']);

/** Every service that fits the kind, each spelling in turn, stopping at the first that answers with matches. */
export async function lookupTerm(term: string, kind: string): Promise<TermLookup> {
  const out: TermLookup = { term, hits: [], tried: [], failed: [], generic: null };
  const ask = async (name: string, f: () => Promise<Hit[]>) => {
    if (!out.tried.includes(name)) out.tried.push(name);
    try { return await f(); } catch { if (!out.failed.includes(name)) out.failed.push(name); return []; }
  };
  const tryAll = async (name: string, f: (s: string) => Promise<Hit[]>) => {
    for (const s of spellings(term)) { const h = await ask(name, () => f(s)); if (h.length) return h; }
    return [];
  };

  const word = genericWord(term);
  if (word) {
    const g = GENERIC[word];
    const terms = await ask(g.ontology === 'go' ? 'Gene Ontology' : 'ChEBI', () => ontology(g.term, g.ontology));
    out.generic = { word, classTerm: terms.find((h) => h.field === 'term name') ? { ...terms.find((h) => h.field === 'term name')!, field: 'class term' } : null };
    return out;
  }
  if (PROCESS.has(kind)) {
    out.hits = await tryAll('Gene Ontology', (s) => ontology(s, 'go'));
    return out;
  }
  // Services are asked in turn and their answers pooled. Asking stops once a record matched by its own name
  // (an approved symbol, a gene name, a term name); weaker matches (an alias, a previous symbol, a synonym) keep
  // the next service asked too, so "LPS" offers ChEBI's lipopolysaccharide beside HGNC's IRF6 (previous symbol).
  const strong = () => out.hits.some((h) => ['approved symbol', 'gene name', 'term name'].includes(h.field));
  const add = (hs: Hit[]) => { out.hits.push(...hs); };
  const plain = spellings(term).find((v) => /^[A-Za-z]+$/.test(v));
  const steps: [boolean, () => Promise<Hit[]>][] = [
    [MOLECULE_FIRST.has(kind) || kind === 'ligand', () => tryAll('ChEBI', (s) => ontology(s, 'chebi'))],
    [true, () => tryAll('HGNC', hgnc)],
    [true, () => tryAll('UniProt', uniprot)],
    // A family is only looked for under a plain-letter spelling ("JAK", "PTPs"), and only when nothing named it
    // directly: "STAT" is also a UniProt gene synonym of SOAT1, which must not hide the STAT family.
    [!!plain, async () => (strong() ? [] : ask('HGNC', () => stemFamily(plain!)))],
    [kind === 'complex' || /complex/i.test(term), () => ask('Complex Portal', () => complexes(term))],
    [!(MOLECULE_FIRST.has(kind) || kind === 'ligand'), async () => (out.hits.length ? [] : tryAll('ChEBI', (s) => ontology(s, 'chebi')))],
    // Last: any Gene Ontology term ("TCR" → T cell receptor complex, a cellular component).
    [true, async () => (out.hits.length ? [] : tryAll('Gene Ontology', (s) => ontology(s, 'go')))],
  ];
  for (const [when, run] of steps) {
    if (!when) continue;
    add(await run());
    if (strong()) break;
  }
  // Strongest first, then the database's own order.
  out.hits.sort((a, b) => STRENGTH.indexOf(a.field) - STRENGTH.indexOf(b.field));
  return out;
}

/** Kinds never looked up: they are layout, not biology. */
const SKIP = new Set(['heading', 'symbol', 'dna']);

export async function identifyLabel(label: string, kind: string): Promise<LabelLookup> {
  if (SKIP.has(kind)) return { label, kind, parts: [] };
  const parts = splitLabel(label, kind);
  return { label, kind, parts: await Promise.all(parts.map((p) => lookupTerm(p, kind))) };
}
