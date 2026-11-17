// Copied from BioPathway Studio (scripts/fetch-omnipath.ts), unchanged but for its client name. Run: node scripts/fetch-omnipath.ts
/**
 * Downloads a local snapshot of OmniPath's human, directed, literature-curated signalling interactions
 * (datasets omnipath, pathwayextra, kinaseextra) into data/omnipath/snapshot.json.gz.
 *
 * One bulk request with fixed parameters: nothing about the user's figures or questions is sent. Lookups
 * afterwards are local (server/omnipathIndex.ts).
 *
 * Kept only when usable as an arrow without guessing:
 *   - protein → protein (complexes, small molecules and RNAs are left to SIGNOR);
 *   - OmniPath's consensus direction is source → target;
 *   - the consensus sign is exactly one of stimulation / inhibition (unsigned records are dropped, never
 *     drawn as activation or inhibition);
 *   - at least one PubMed reference.
 *
 * Licence: OmniPath is free for academic and non-profit use; the resources it combines carry their own
 * licences (queried with license=academic, which this personal, non-commercial project may use).
 *
 * Run: npm run fetch:omnipath [-- <local raw TSV to convert instead of downloading>]
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const URL_ =
  'https://omnipathdb.org/interactions?genesymbols=yes&fields=sources,references,curation_effort,type,entity_type&datasets=omnipath,pathwayextra,kinaseextra&organisms=9606&directed=yes&license=academic';
const OUT = new URL('../data/omnipath/', import.meta.url);

export interface OmniPathRecord {
  /** UniProt accessions (the same ids SIGNOR uses for proteins). */
  a: string;
  b: string;
  aName: string;
  bName: string;
  sign: 'up' | 'down';
  /** Resources that curated it (OmniPath's "sources"). */
  resources: string[];
  pmids: string[];
}

const local = process.argv[2];
const text = local
  ? readFileSync(local, 'utf8')
  : await (async () => {
      console.log('Downloading OmniPath interactions (one bulk request)…');
      const res = await fetch(URL_, { headers: { 'User-Agent': 'pathway-simplifier' }, signal: AbortSignal.timeout(300_000) });
      if (!res.ok) throw new Error(`OmniPath returned ${res.status}`);
      return res.text();
    })();

const [header, ...lines] = text.trim().split('\n');
const col = Object.fromEntries(header.split('\t').map((h, i) => [h, i]));
const records: OmniPathRecord[] = [];
const dropped = { notProtein: 0, notConsensusDirected: 0, unsigned: 0, noReference: 0 };
for (const line of lines) {
  const f = line.split('\t');
  const get = (k: string) => f[col[k]] ?? '';
  if (get('entity_type_source') !== 'protein' || get('entity_type_target') !== 'protein') {
    dropped.notProtein++;
    continue;
  }
  if (get('consensus_direction') !== 'True') {
    dropped.notConsensusDirected++;
    continue;
  }
  const up = get('consensus_stimulation') === 'True';
  const down = get('consensus_inhibition') === 'True';
  if (up === down) {
    dropped.unsigned++;
    continue;
  }
  const pmids = [...new Set(get('references').split(';').map((r) => r.split(':').pop()!).filter((p) => /^\d+$/.test(p)))];
  if (!pmids.length) {
    dropped.noReference++;
    continue;
  }
  records.push({
    a: get('source'),
    b: get('target'),
    aName: get('source_genesymbol'),
    bName: get('target_genesymbol'),
    sign: up ? 'up' : 'down',
    resources: get('sources').split(';').filter(Boolean),
    pmids,
  });
}

const meta = {
  source: 'OmniPath (https://omnipathdb.org)',
  query: URL_,
  license: 'OmniPath academic / non-profit use; combined resources keep their own licences',
  downloadedAt: new Date().toISOString().slice(0, 10),
  records: records.length,
  dropped,
};
mkdirSync(OUT, { recursive: true });
writeFileSync(new URL('snapshot.json.gz', OUT), gzipSync(JSON.stringify({ meta, records })));
writeFileSync(new URL('meta.json', OUT), JSON.stringify(meta, null, 2) + '\n');
console.log(`Kept ${records.length} records; dropped ${JSON.stringify(dropped)}.`);
