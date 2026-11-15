/**
 * Offline checks (no network, no cost): `npm run check:extraction`
 *  1. the JSON Schema for Gemini builds and has the top-level fields;
 *  2. the six saved Hydrogen 4 chat results (local/, if present) convert to v2 and pass the zod schema;
 *  3. toScene places every element inside the image;
 *  4. a dangling arrow reference is reported, and the render skips that arrow instead of failing.
 */
import { existsSync, readFileSync } from 'node:fs';
import { ExtractionSchema, extractionJsonSchema, referenceProblems } from '../src/types/extraction.ts';
import { toScene } from '../src/render/toScene.ts';
import { v1ToV2 } from './v1ToV2.ts';

let failed = 0;
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed++; };

const js = extractionJsonSchema() as { properties?: Record<string, unknown>; required?: string[] };
check(!!js.properties && ['elements', 'arrows', 'groups', 'regions', 'flags', 'clarify'].every((k) => k in js.properties!), 'JSON Schema for Gemini has the top-level fields');
check(!JSON.stringify(js).includes('prefixItems'), 'JSON Schema uses no tuple (prefixItems) constructs');

const SIZES: Record<string, [number, number]> = { F1: [1964, 1380], F2: [1826, 1232], F3: [698, 416], F4: [718, 454], F5: [700, 628], F6: [718, 500] };
const dir = new URL('../local/extraction-tests/clean/Hydrogen4/', import.meta.url);
if (!existsSync(dir)) console.log('skip saved-result checks (local/ not present)');
else for (const [fig, [w, h]] of Object.entries(SIZES)) {
  const v2 = v1ToV2(JSON.parse(readFileSync(new URL(`${fig}.json`, dir), 'utf8')));
  const parsed = ExtractionSchema.safeParse(v2);
  check(parsed.success, `${fig}: converted Hydrogen result passes the v2 schema${parsed.success ? '' : ' — ' + JSON.stringify(parsed.error.issues[0])}`);
  if (!parsed.success) continue;
  const scene = toScene(parsed.data, w, h);
  const inside = scene.nodes.every((n) => n.x >= 0 && n.y >= 0 && n.x + n.width <= w + 0.5 && n.y + n.height <= h + 0.5);
  check(inside && scene.nodes.length === parsed.data.elements.length, `${fig}: all ${scene.nodes.length} elements placed inside the ${w}×${h} image`);
  const problems = referenceProblems(parsed.data);
  console.log(`     ${scene.arrows.length}/${parsed.data.arrows.length} arrows drawn; ${problems.length} reference problem(s)${problems.length ? ': ' + problems.slice(0, 2).join('; ') : ''}`);
}

const tiny = ExtractionSchema.parse({
  structure: 'single panel', panels: [], regions: [],
  elements: [
    { id: 'e1', label: 'A', kind: 'protein', region: null, panel: null, modifications: [], description: null, box: [10, 10, 10, 5], fill: '#ffcc00', outline: 'rounded box', textColour: null },
    { id: 'e2', label: 'B', kind: 'protein', region: null, panel: null, modifications: [], description: null, box: [50, 50, 10, 5], fill: null, outline: 'oval', textColour: null },
  ],
  groups: [], contacts: [],
  arrows: [
    { id: 'a1', from: 'e1', to: 'e2', head: 'arrow', line: 'solid', colour: null, text: null, meaning: 'activates', notes: null },
    { id: 'a2', from: 'e1', to: 'e9', head: 'bar', line: 'dashed', colour: '#ff0000', text: null, meaning: 'inhibits', notes: null },
  ],
  flags: [], clarify: [],
});
const probs = referenceProblems(tiny);
check(probs.some((p) => p.includes('a2') && p.includes('e9')), 'a dangling arrow end is reported');
const s = toScene(tiny, 1000, 800);
check(s.arrows.length === 1 && s.skipped.some((p) => p.includes('a2')), 'the render skips the dangling arrow and lists it');
check(!ExtractionSchema.safeParse({ ...tiny, elements: [{ ...tiny.elements[0], box: [1, 2, 3] }] }).success, 'a box without 4 numbers is rejected');

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
