/**
 * Offline checks (no network, no cost): `npm run check:extraction`
 *  1. the JSON Schema for Gemini builds and has the top-level fields;
 *  2. the six saved Hydrogen 4 chat results (local/, if present) convert to v2 and pass the zod schema;
 *  3. toScene places every element inside the image;
 *  4. a dangling arrow reference is reported, and the render skips that arrow instead of failing;
 *  5. every kind of change applies, a change that can't apply is reported, and no changes gives back the extraction;
 *  6. runs saved before prompt v3 (local data/, if present) still load.
 */
import { existsSync, readFileSync } from 'node:fs';
import { ExtractionSchema, extractionJsonSchema, referenceProblems } from '../src/types/extraction.ts';
import { toScene } from '../src/render/toScene.ts';
import { v1ToV2 } from './v1ToV2.ts';
import { applyEdits, optionProblems, optionState } from '../src/edit/applyEdits.ts';
import { describeEdit } from '../src/edit/describe.ts';
import { EDIT_OPS, type Edit } from '../src/types/extraction.ts';
import { getRun, listRuns } from '../server/runs.ts';

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

// --- changes ---
const base = ExtractionSchema.parse({
  structure: 'single panel', panels: [], regions: [],
  elements: ['A', 'B', 'C', 'D'].map((l, i) => ({ id: `e${i + 1}`, label: l, kind: 'protein', region: null, panel: null,
    modifications: i === 0 ? [{ type: 'P', site: null, count: null }, { type: 'Ub', site: null, count: 3 }] : [], description: null, box: [10 + i * 20, 10, 10, 5], fill: null, outline: 'rounded box', textColour: null })),
  groups: [{ id: 'g1', members: ['e3', 'e4'], label: null, region: null }],
  contacts: [{ a: 'e1', b: 'e2', kind: 'binds' }],
  arrows: [
    { id: 'a1', from: 'e1', to: 'e2', head: 'arrow', line: 'solid', colour: null, text: null, meaning: 'activates', notes: null },
    { id: 'a2', from: 'e2', to: 'g1', head: 'arrow', line: 'solid', colour: null, text: null, meaning: 'unknown', notes: null },
  ],
  flags: [],
  clarify: [{ about: ['e1'], question: 'Which shape carries the Ub chain?', options: [
    { label: 'A', shape: 'e1', asRead: true, edits: [] },
    { label: 'B', shape: 'e2', asRead: false, edits: [{ op: 'move_badge', id: 'e1', to: 'e2', value: 'Ub×3' }] },
    { label: 'Z', shape: null, asRead: false, edits: [{ op: 'move_badge', id: 'e1', to: 'e9', value: 'Ub×3' }] },
  ] }],
});
const snapshot = JSON.stringify(base);
const E = (op: Edit['op'], id: string, to: string | null = null, value: string | null = null): Edit => ({ op, id, to, value });
const run1 = (e: Edit) => applyEdits(base, [e]);
const cases: [Edit, (x: typeof base) => boolean][] = [
  [E('move_badge', 'e1', 'e2', 'Ub×3'), (x) => x.elements[0].modifications.length === 1 && x.elements[1].modifications[0]?.count === 3],
  [E('add_badge', 'e2', null, 'Ub×4'), (x) => x.elements[1].modifications[0]?.type === 'Ub' && x.elements[1].modifications[0]?.count === 4],
  [E('remove_badge', 'e1', null, 'P'), (x) => x.elements[0].modifications.length === 1 && x.elements[0].modifications[0].type === 'Ub'],
  [E('set_arrow_from', 'a1', 'e3'), (x) => x.arrows[0].from === 'e3'],
  [E('set_arrow_to', 'a1', 'g1'), (x) => x.arrows[0].to === 'g1'],
  [E('add_arrow', 'e3', 'e1', 'bar'), (x) => x.arrows.length === 3 && x.arrows[2].head === 'bar' && x.arrows[2].from === 'e3'],
  [E('remove_arrow', 'a1'), (x) => x.arrows.length === 1 && x.arrows[0].id === 'a2'],
  [E('set_arrow_head', 'a1', null, 'bar'), (x) => x.arrows[0].head === 'bar'],
  [E('set_arrow_line', 'a1', null, 'dashed'), (x) => x.arrows[0].line === 'dashed'],
  [E('set_arrow_meaning', 'a1', null, 'inhibits'), (x) => x.arrows[0].meaning === 'inhibits'],
  [E('set_arrow_text', 'a1', null, '2'), (x) => x.arrows[0].text === '2'],
  [E('set_label', 'e1', null, null), (x) => x.elements[0].label === null],
  [E('remove_element', 'e2'), (x) => x.elements.length === 3 && x.arrows.length === 0 && x.contacts.length === 0],
  [E('add_to_group', 'e1', 'g1'), (x) => x.groups[0].members.length === 3],
  [E('remove_from_group', 'e3', 'g1'), (x) => x.groups[0].members.join() === 'e4'],
  [E('set_box', 'e1', null, '40,40,12,6'), (x) => x.elements[0].box.join() === '40,40,12,6'],
];
check(cases.length === EDIT_OPS.length && new Set(cases.map(([e]) => e.op)).size === EDIT_OPS.length, `every kind of change has a test (${EDIT_OPS.length})`);
for (const [e, ok] of cases) {
  const r = run1(e);
  check(r.failed.length === 0 && ok(r.extraction) && describeEdit(base, e).length > 0, `change "${e.op}" applies: ${describeEdit(base, e)}`);
}
const free = applyEdits({ ...base, regions: [{ id: 'r1', kind: 'cytoplasm', label: null, boundary: null, box: [0, 0, 100, 100] }] }, [E('set_arrow_to', 'a1', 'r1', '60,70')]);
check(free.failed.length === 0 && free.extraction.arrows[0].to === 'r1' && free.extraction.arrows[0].ends?.to?.join() === '60,70'
  && toScene(free.extraction, 1000, 800).arrows.find((a) => a.id === 'a1')?.freeTo === true && !referenceProblems(free.extraction).some((p) => p.startsWith('arrow')),
  `an arrow's end can be put in open space and is still drawn: ${describeEdit({ ...base, regions: free.extraction.regions }, E('set_arrow_to', 'a1', 'r1', '60,70'))}`);
const back = applyEdits(free.extraction, [E('set_arrow_to', 'a1', 'e2')]);
check(back.extraction.arrows[0].to === 'e2' && !back.extraction.arrows[0].ends?.to, 'pointing it back at a shape clears the open-space end');
check(!JSON.stringify(extractionJsonSchema()).includes('"ends"'), 'the model is never asked for open-space arrow ends');
check(JSON.stringify(base) === snapshot, 'applying changes never alters the extraction itself');
check(JSON.stringify(applyEdits(base, []).extraction) === snapshot, 'with every change undone, the result is the extraction exactly');
const bad = applyEdits(base, [E('move_badge', 'e1', 'e9', 'Ub×3'), E('set_arrow_head', 'a1', null, 'bar')]);
check(bad.failed.length === 1 && bad.failed[0].index === 0 && bad.extraction.arrows[0].head === 'bar', "a change pointing at a missing shape is reported, and the changes after it still apply");
check(applyEdits(base, [E('remove_element', 'e3'), E('remove_element', 'e4')]).extraction.groups.length === 0, 'a group whose shapes are all removed goes too');
const [oA, oB, oZ] = base.clarify[0].options;
check(optionState(base, oA) === 'ready' && optionState(base, oB) === 'ready' && optionState(base, oZ) === 'manual', 'answers: as-read and applicable ones are ready; one that cannot apply needs fixing by hand');
check(optionProblems(base).length === 1 && optionProblems(base)[0].includes('"Z"'), 'an answer whose changes cannot apply is listed as a problem');

// --- saved runs ---
const saved = listRuns();
if (!saved.length) console.log('skip saved-run checks (no runs in data/)');
else {
  const all = saved.map((r) => getRun(r.id)!);
  check(all.every((r) => r.review && Array.isArray(r.review.edits) && ExtractionSchema.safeParse(r.extraction).success), `${all.length} saved run(s) load in the current shape, including any saved before prompt v3`);
}

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
