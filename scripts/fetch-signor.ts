// Copied from BioPathway Studio (scripts/fetch-signor.ts), unchanged but for its client name. Run: node scripts/fetch-signor.ts
/**
 * Downloads a snapshot of SIGNOR (https://signor.uniroma2.it, CC BY-SA 4.0):
 *  - all human causal interactions (bulk download),
 *  - the curated SIGNOR pathways and their relations,
 *  - complex member lists for SIGNOR complexes, from OmniPath's redistribution of SIGNOR complex
 *    definitions (https://omnipathdb.org/complexes?databases=SIGNOR), matched by SIGNOR complex ID,
 *  - optionally, member lists from files saved manually into data/signor/raw/ (overrides OmniPath).
 *
 * Writes data/signor/snapshot.json.gz, which the local server loads. Validates as it goes.
 *
 * Run: npm run fetch:signor
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const UA = 'pathway-simplifier-snapshot/1.0 (academic, non-commercial)';
const BASE = 'https://signor.uniroma2.it';
const OUT_DIR = new URL('../data/signor/', import.meta.url);
const RAW_DIR = new URL('../data/signor/raw/', import.meta.url);

type Row = Record<string, string>;

function parseTsv(text: string): Row[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const header = lines[0].split('\t').map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = line.split('\t');
    const row: Row = {};
    header.forEach((h, i) => (row[h] = (cells[i] ?? '').trim()));
    return row;
  });
}

async function get(url: string): Promise<string> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.ok) return res.text();
    if (attempt === 3) throw new Error(`HTTP ${res.status} for ${url}`);
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
  throw new Error('unreachable');
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------

export interface SignorEntity {
  id: string; // UniProt accession, SIGNOR-C…, SIGNOR-PF…, SIGNOR-PH…, CHEBI:…
  name: string;
  type: string; // protein, complex, proteinfamily, phenotype, chemical, smallmolecule, stimulus, …
  members?: string[]; // for complexes / families, when member files are present
}

export interface SignorInteraction {
  id: string; // SIGNOR-xxxxxx
  a: string; // entity id (regulator)
  b: string; // entity id (target)
  effect: string;
  mechanism: string;
  residue: string;
  pmid: string;
  direct: boolean;
  score: number | null;
  sentence: string;
  taxId: string;
  cell: string;
}

console.log('Downloading SIGNOR human interactions…');
const bulk = parseTsv(await get(`${BASE}/download_entity.php?organism=human&format=csv&submit=Download`));

const entities = new Map<string, SignorEntity>();
const interactions: SignorInteraction[] = [];
const problems: string[] = [];

for (const r of bulk) {
  const id = r['signor_id'];
  if (!id) {
    problems.push(`row without SIGNOR_ID: ${r['entitya']} -> ${r['entityb']}`);
    continue;
  }
  if (!r['pmid']) problems.push(`${id}: no PMID`);
  for (const [name, type, eid] of [
    [r['entitya'], r['typea'], r['ida']],
    [r['entityb'], r['typeb'], r['idb']],
  ]) {
    if (!eid) problems.push(`${id}: entity without id (${name})`);
    else if (!entities.has(eid)) entities.set(eid, { id: eid, name, type });
  }
  const score = Number.parseFloat(r['score']);
  interactions.push({
    id,
    a: r['ida'],
    b: r['idb'],
    effect: r['effect'],
    mechanism: r['mechanism'],
    residue: r['residue'],
    pmid: r['pmid'],
    direct: r['direct'] === 't' || r['direct'] === 'YES',
    score: Number.isFinite(score) ? score : null,
    sentence: r['sentence'],
    taxId: r['tax_id'],
    cell: r['cell_data'],
  });
}
console.log(`  ${interactions.length} interactions, ${entities.size} entities`);

// Complex members: SIGNOR's complex definitions as redistributed by OmniPath, matched on SIGNOR-C ids.
let membersLoaded = 0;
let membersFromOmniPath = 0;
try {
  console.log('Downloading SIGNOR complex members (via OmniPath)…');
  const complexes = JSON.parse(await get('https://omnipathdb.org/complexes?databases=SIGNOR&format=json')) as Array<{
    components_genesymbols?: string[];
    identifiers?: string;
  }>;
  for (const c of complexes) {
    for (const [, sid] of (c.identifiers ?? '').matchAll(/SIGNOR:(SIGNOR-C\d+)/g)) {
      const ent = entities.get(sid);
      if (ent && ent.type === 'complex' && !ent.members && c.components_genesymbols?.length) {
        ent.members = c.components_genesymbols;
        membersFromOmniPath++;
      }
    }
  }
  const total = [...entities.values()].filter((e) => e.type === 'complex').length;
  console.log(`  members for ${membersFromOmniPath} of ${total} SIGNOR complexes`);
} catch (err) {
  console.warn(`  could not load complex members from OmniPath (${(err as Error).message}); complexes will show name + id only`);
}

// Members still missing (protein families, and complexes OmniPath does not cover): read the "Formed by" line
// of each SIGNOR entity page. It sits after the page's interaction table, so the page is streamed until that
// line arrives (most pages are small; ~34 MB in total once), one request per second, results cached.
const CACHE_FILE = new URL('../data/signor/members-cache.json', import.meta.url);
const memberCache: Record<string, string[] | null> = existsSync(CACHE_FILE) ? JSON.parse(readFileSync(CACHE_FILE, 'utf8')) : {};
// Entries cached as "not found" are retried (an earlier version gave up too early on long pages).
for (const k of Object.keys(memberCache)) if (memberCache[k] === null) delete memberCache[k];

async function formedBy(id: string): Promise<string[] | null> {
  const controller = new AbortController();
  const res = await fetch(`${BASE}/relation_result.php?id=${encodeURIComponent(id)}`, { headers: { 'User-Agent': UA }, signal: controller.signal });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let html = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
      const at = html.indexOf('Formed by');
      if (at >= 0) {
        const tail = html.slice(at);
        const end = tail.indexOf('</tr>');
        if (end >= 0) {
          const cell = tail.slice(0, end).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').replace(/^Formed by\s*/, '');
          return cell.split(/\s*,\s*/).map((x) => x.trim()).filter(Boolean);
        }
      }
      if (html.length > 8_000_000) break; // unexpectedly large page: give up on this one
    }
  } finally {
    controller.abort();
  }
  return null;
}

const missing = [...entities.values()].filter((e) => (e.type === 'complex' || e.type === 'proteinfamily') && !e.members);
const toFetch = missing.filter((e) => !(e.id in memberCache));
console.log(`Member lists still missing for ${missing.length} complexes/families (${toFetch.length} not cached yet)…`);
for (const [k, e] of toFetch.entries()) {
  try {
    memberCache[e.id] = await formedBy(e.id);
  } catch (err) {
    console.warn(`  ${e.id}: ${(err as Error).message}`);
    continue; // not cached, so a later run retries it
  }
  if ((k + 1) % 25 === 0) {
    process.stdout.write(`  ${k + 1}/${toFetch.length}\n`);
    writeFileSync(CACHE_FILE, JSON.stringify(memberCache));
  }
  await pause(1000);
}
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(CACHE_FILE, JSON.stringify(memberCache));
let membersFromPages = 0;
for (const e of missing) {
  const m = memberCache[e.id];
  if (m && m.length) {
    e.members = m;
    membersFromPages++;
  }
}
console.log(`  members read from SIGNOR entity pages for ${membersFromPages} of ${missing.length}`);

// Optional member lists saved manually from SIGNOR's downloads page.
if (existsSync(RAW_DIR)) {
  for (const file of readdirSync(RAW_DIR)) {
    if (!/\.(csv|tsv|txt)$/i.test(file)) continue;
    const text = readFileSync(new URL(file, RAW_DIR), 'utf8');
    const sep = text.split('\n')[0].includes('\t') ? '\t' : ';';
    const lines = text.split(/\r?\n/).filter(Boolean);
    const header = lines[0].split(sep).map((h) => h.trim().toLowerCase());
    const idCol = header.findIndex((h) => h.includes('signor id') || h === 'signor_id' || h === 'id');
    const memCol = header.findIndex((h) => h.includes('component') || h.includes('members') || h.includes('list of entities'));
    if (idCol < 0 || memCol < 0) {
      console.warn(`  skipped ${file}: could not find id/member columns in header ${JSON.stringify(header)}`);
      continue;
    }
    for (const line of lines.slice(1)) {
      const cells = line.split(sep);
      const eid = cells[idCol]?.trim();
      const members = (cells[memCol] ?? '').split(/[,;]\s*/).map((m) => m.trim()).filter(Boolean);
      const ent = eid ? entities.get(eid) : undefined;
      if (ent && members.length) {
        ent.members = members; // manual files override OmniPath
        membersLoaded++;
      }
    }
  }
}
if (membersLoaded) console.log(`  member lists from data/signor/raw/ for ${membersLoaded} complexes/families`);

console.log('Downloading SIGNOR curated pathways…');
const list = parseTsv(`id\tname\n${await get(`${BASE}/getPathwayData.php?list`)}`).filter((r) => r['id']?.startsWith('SIGNOR-'));
const pathways: Array<{ id: string; name: string; description: string; interactionIds: string[] }> = [];
const knownIds = new Set(interactions.map((i) => i.id));
const skippedPathways: string[] = [];
/** Curated pathway-map layer of each end of an interaction (e.g. "receptor", "factor", "extracellular"). */
const pathwayLayers: Record<string, { a?: string; b?: string }> = {};
for (const p of list) {
  let descRows: Row[];
  let relRows: Row[];
  try {
    descRows = parseTsv(await get(`${BASE}/getPathwayData.php?pathway=${encodeURIComponent(p['id'])}`));
    await pause(300);
    relRows = parseTsv(await get(`${BASE}/getPathwayData.php?pathway=${encodeURIComponent(p['id'])}&relations=only`));
    await pause(300);
  } catch (err) {
    skippedPathways.push(`${p['id']} (${(err as Error).message})`);
    process.stdout.write('x');
    continue;
  }
  const ids = relRows.map((r) => r['signor_id']).filter(Boolean);
  for (const r of relRows) {
    const id = r['signor_id'];
    if (!id || !knownIds.has(id)) continue;
    const a = r['regulator_location'];
    const b = r['target_location'];
    if (a || b) pathwayLayers[id] = { ...pathwayLayers[id], ...(a ? { a } : {}), ...(b ? { b } : {}) };
  }
  const missing = ids.filter((i) => !knownIds.has(i));
  if (missing.length) problems.push(`${p['id']}: ${missing.length} relation(s) not in the human bulk file (kept out)`);
  pathways.push({
    id: p['id'],
    name: p['name'],
    description: descRows[0]?.['description'] ?? '',
    interactionIds: ids.filter((i) => knownIds.has(i)),
  });
  process.stdout.write('.');
}
console.log(`\n  ${pathways.length} pathways${skippedPathways.length ? `; skipped ${skippedPathways.length} that SIGNOR could not serve: ${skippedPathways.join(', ')}` : ''}`);

const meta = {
  source: 'SIGNOR (https://signor.uniroma2.it)',
  license: 'CC BY-SA 4.0',
  downloadedAt: new Date().toISOString().slice(0, 10),
  interactions: interactions.length,
  entities: entities.size,
  pathways: pathways.length,
  membersLoaded: membersLoaded + membersFromOmniPath + membersFromPages,
  membersSource: 'SIGNOR complex definitions via OmniPath (omnipathdb.org), then the "Formed by" line of SIGNOR entity pages',
  skippedPathways,
  interactionsWithPmid: interactions.filter((i) => i.pmid).length,
};
console.log(`  pathway-map layers recorded for ${Object.keys(pathwayLayers).length} interactions`);

mkdirSync(OUT_DIR, { recursive: true });
const json = JSON.stringify({ meta, entities: [...entities.values()], interactions, pathways, pathwayLayers });
writeFileSync(new URL('snapshot.json.gz', OUT_DIR), gzipSync(json));
writeFileSync(new URL('meta.json', OUT_DIR), JSON.stringify(meta, null, 2) + '\n');

console.log(`\nSnapshot written: data/signor/snapshot.json.gz (${(json.length / 1e6).toFixed(1)} MB uncompressed)`);
console.log(JSON.stringify(meta, null, 2));
const hardProblems = problems.filter((p) => !p.includes('not in the human bulk file'));
if (problems.length) console.log(`\n${problems.length} note(s):\n  ${problems.slice(0, 15).join('\n  ')}${problems.length > 15 ? '\n  …' : ''}`);
if (hardProblems.length) {
  console.error(`\n${hardProblems.length} validation problem(s) — snapshot written but review the notes above.`);
  process.exit(1);
}
console.log('\nValidation passed: every interaction has a SIGNOR ID, a PMID, and identified entities.');
