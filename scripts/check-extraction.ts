/**
 * Offline checks (no network, no cost): `npm run check:extraction`
 *  1. the JSON Schema for Gemini builds and has the top-level fields;
 *  2. the six saved Hydrogen 4 chat results (local/, if present) convert to v2 and pass the zod schema;
 *  3. toScene places every element inside the image;
 *  4. a dangling arrow reference is reported, and the render skips that arrow instead of failing;
 *  5. every kind of change applies, a change that can't apply is reported, and no changes gives back the extraction;
 *  6. runs saved before prompt v3 (local data/, if present) still load;
 *  7. simplification: the order changes apply in, the "hide" change, and step 2's route tracing on the saved
 *     test figures (local data/, if present), with untick → left out → tick back → restored exactly;
 *  8. steps 3–4: repeats found on the test figures, merging leaves no duplicate arrows, self-loops or clusters,
 *     and collapsing part of a cluster re-points its arrows.
 *  9. step 5, both ways, on each test figure with every rule on and with each switched off: applies cleanly, keeps
 *     every shape on its canvas, overlaps no shapes from different units, and is the same every time.
 *     Tidy keeps shapes in place and never adds crossings; Guo with only canonical routes is cropped to that side.
 *     Redraw: panels become columns (Wnt OFF | ON, Guo canonical | non-canonical), and Guo's main line runs into the nucleus.
 */
import { existsSync, readFileSync } from 'node:fs';
import { ExtractionSchema, extractionJsonSchema, referenceProblems } from '../src/types/extraction.ts';
import { toScene } from '../src/render/toScene.ts';
import { v1ToV2 } from './v1ToV2.ts';
import { applyEdits, dependents, optionProblems, optionState } from '../src/edit/applyEdits.ts';
import { describeEdit } from '../src/edit/describe.ts';
import { EDIT_OPS, EMPTY_SIMPLIFY, ReviewSchema, type Edit } from '../src/types/extraction.ts';
import { inOrder } from '../src/edit/order.ts';
import { findIssues } from '../src/simplify/issues.ts';
import { focusHidden, setItem, toggleShape, traceRoutes } from '../src/simplify/routes.ts';
import { findRepeats } from '../src/simplify/repeats.ts';
import { collapseEdit } from '../src/simplify/clusters.ts';
import { layOut, RULES } from '../src/layout/adapt.ts';
import { TIDY_RULES } from '../src/layout/tidy.ts';
import { measure } from '../src/layout/measures.ts';
import { DEFAULT_LAYOUT } from '../src/layout/value.ts';
import { STYLE_RED } from '../src/edit/applyEdits.ts';
import { getRun, listRuns } from '../server/runs.ts';

let failed = 0;
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed++; };

const js = extractionJsonSchema() as { properties?: Record<string, unknown>; required?: string[] };
check(!!js.properties && ['elements', 'arrows', 'groups', 'regions', 'flags', 'clarify'].every((k) => k in js.properties!), 'JSON Schema for Gemini has the top-level fields');
check(!JSON.stringify(js).includes('prefixItems'), 'JSON Schema uses no tuple (prefixItems) constructs');
check(!['"canvas"', '"bend"', '"textAt"', '"sublabel"', '"ends"'].some((k) => JSON.stringify(js).includes(k)), "JSON Schema never asks the model for the user's or the layout's own fields");

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
  [E('add_element', 'new-k1', null, JSON.stringify({ box: [70, 70, 8, 4], fill: '#aabbcc' })), (x) => x.elements.length === 5 && x.elements[4].fill === '#aabbcc' && x.elements[4].label === null],
  [E('hide', 'e2', null, 'not on a chosen pathway'), (x) => x.elements.length === 3 && x.arrows.length === 0 && x.contacts.length === 0],
  // B merged into A: A → B becomes A → A and is dropped (it wasn't drawn as a loop), B → cluster becomes A → cluster.
  [E('merge_into', 'e2', 'e1'), (x) => x.elements.length === 3 && x.arrows.length === 1 && x.arrows[0].from === 'e1' && x.arrows[0].to === 'g1' && x.contacts.length === 0],
  // C and D collapsed: their cluster goes, and the arrow to it points at the new shape, which keeps "C + D" under its name.
  [E('collapse', 'col-k', null, JSON.stringify({ members: ['e3', 'e4'], label: 'CD', sub: 'C + D' })),
    (x) => x.elements.length === 3 && x.groups.length === 0 && x.arrows.some((a) => a.to === 'col-k') && x.elements.some((e) => e.id === 'col-k' && e.sublabel === 'C + D')],
  // Step 5: the tiny figure laid out on its own canvas; every shape placed on it.
  [E('set_layout', 'layout', null, JSON.stringify(layOut(base, 1000, 800, traceRoutes(base), DEFAULT_LAYOUT))),
    (x) => x.canvas?.length === 2 && x.elements.every((e) => e.box[0] >= 0 && e.box[1] >= 0 && e.box[0] + e.box[2] <= 100.01 && e.box[1] + e.box[3] <= 100.01)],
  [E('restyle', 'style'), (x) => x.elements.every((e) => e.fill === '#bfdbfe') && x.arrows.every((a) => a.colour === (a.head === 'bar' ? STYLE_RED : null))],
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
// An added shape, named, with an arrow to it and one onward from that arrow's end; undo takes them all.
const K = (e: Edit, key: string) => ({ ...e, key, source: 'manual', at: '' });
const added = [
  K(E('add_element', 'new-s1', null, JSON.stringify({ box: [70, 70, 8, 4], fill: null })), 's1'),
  K(E('set_label', 'new-s1', null, 'Z'), 'l1'),
  K(E('add_arrow', 'e1', 'new-s1', 'arrow'), 'a9'),
  K(E('set_arrow_head', 'new-a9', null, 'bar'), 'h1'),
  K(E('set_label', 'e2', null, 'B2'), 'u1'),
];
const withAdded = applyEdits(base, added);
check(withAdded.failed.length === 0 && withAdded.extraction.elements.some((e) => e.id === 'new-s1' && e.label === 'Z')
  && withAdded.extraction.arrows.some((a) => a.id === 'new-a9' && a.to === 'new-s1' && a.head === 'bar'), 'an added shape can be named and given arrows');
const deps = dependents(added, 's1').map((e) => e.key);
check(deps.join() === 'l1,a9,h1', `undoing an added shape also undoes what depends on it (${deps.join(', ')}), and nothing else`);
check(applyEdits(base, [added[0], added[0]]).failed.length === 1, 'adding a shape whose id already exists is reported');
check(JSON.stringify(base) === snapshot, 'applying changes never alters the extraction itself');
check(JSON.stringify(applyEdits(base, []).extraction) === snapshot, 'with every change undone, the result is the extraction exactly');
const bad = applyEdits(base, [E('move_badge', 'e1', 'e9', 'Ub×3'), E('set_arrow_head', 'a1', null, 'bar')]);
check(bad.failed.length === 1 && bad.failed[0].index === 0 && bad.extraction.arrows[0].head === 'bar', "a change pointing at a missing shape is reported, and the changes after it still apply");
check(applyEdits(base, [E('remove_element', 'e3'), E('remove_element', 'e4')]).extraction.groups.length === 0, 'a group whose shapes are all removed goes too');
const [oA, oB, oZ] = base.clarify[0].options;
check(optionState(base, oA) === 'ready' && optionState(base, oB) === 'ready' && optionState(base, oZ) === 'manual', 'answers: as-read and applicable ones are ready; one that cannot apply needs fixing by hand');
check(optionProblems(base).length === 1 && optionProblems(base)[0].includes('"Z"'), 'an answer whose changes cannot apply is listed as a problem');

// --- simplification ---
check(!['"hide"', '"merge_into"', '"collapse"', '"sublabel"'].some((w) => JSON.stringify(extractionJsonSchema()).includes(w)), 'the model is never offered the simplification-only changes, nor the sub-label');
check(applyEdits(base, [E('collapse', 'col-z', null, JSON.stringify({ members: ['e3', 'e9'], label: null }))]).failed.length === 1, 'a collapse naming a shape that is gone is reported');
check(applyEdits(base, [E('hide', 'a1', null, 'x')]).extraction.arrows.map((a) => a.id).join() === 'a2' && applyEdits(base, [E('hide', 'g1', null, 'x')]).extraction.elements.length === 2,
  'hiding an arrow takes only that arrow; hiding a cluster takes its shapes');
const src = (source: string, key: string) => ({ ...E('set_label', 'e1', null, key), key, source, at: '' });
const order = inOrder([src('step:focus', 'f'), src('manual', 'm'), src('q2', 'q2'), src('step:issues', 'i'), src('q0', 'q0')]).map((e) => e.key).join();
check(order === 'q0,q2,m,i,f', `changes apply as answers, then fixes by hand, then each step in order (${order})`);
check(ReviewSchema.safeParse({ edits: [], answers: {}, simplify: EMPTY_SIMPLIFY }).success && ReviewSchema.safeParse({ edits: [], answers: {} }).success, 'a review saves with or without a simplification record');

// --- saved runs ---
const saved = listRuns();
if (!saved.length) console.log('skip saved-run checks (no runs in data/)');
else {
  const all = saved.map((r) => getRun(r.id)!);
  check(all.every((r) => r.review && Array.isArray(r.review.edits) && ExtractionSchema.safeParse(r.extraction).success), `${all.length} saved run(s) load in the current shape, including any saved before prompt v3`);
  // Answered runs look exactly as before: corrections still apply in the old order (answers by question, then by hand).
  const oldOrder = <T extends { source: string }>(es: T[]) => [...es.filter((e) => e.source !== 'manual').sort((a, b) => Number(a.source.slice(1)) - Number(b.source.slice(1))), ...es.filter((e) => e.source === 'manual')];
  const corrections = (r: (typeof all)[number]) => r.review.edits.filter((e) => !e.source.startsWith('step:'));
  check(all.every((r) => JSON.stringify(applyEdits(r.extraction, inOrder(corrections(r))).extraction) === JSON.stringify(applyEdits(r.extraction, oldOrder(corrections(r))).extraction)),
    "every saved review's corrections give the same picture as before simplification was added");

  // Step 2 on the test figures: routes grouped the way each figure groups them.
  const find = (part: string) => all.find((r) => r.id.includes(part));
  const groupsOf = (part: string) => { const r = find(part); return r ? traceRoutes(r.extraction).groups.map((g) => g.label) : null; };
  const wnt = groupsOf('wnt-liu2022-v3'), guo = groupsOf('guo2024-nfkb-v3'), yu = groupsOf('yu2020-nfkb-v3');
  if (wnt) check(wnt.join() === 'WNT OFF,WNT ON', `Wnt: routes grouped by panel (${wnt.join(' | ')})`);
  if (guo) check(guo.join() === 'Canonical pathway,Non-canonical pathway', `Guo: routes grouped under its headings (${guo.join(' | ')})`);
  // Branch d has no route of its own (the model read no arrows from TLR4 onward), so only a–c are groups.
  if (yu) check(yu.join() === 'a,b,c', `Yu: routes grouped under its branch labels (${yu.join(' | ')})`);
  const guoRun = find('guo2024-nfkb-v3');
  if (guoRun) {
    const canon = traceRoutes(guoRun.extraction).groups.find((g) => g.label === 'Canonical pathway');
    const regs = canon?.regulators.map((r) => r.name).join() ?? '';
    check(['A20', 'CYLD', 'LUBAC'].every((n) => regs.includes(n)), `Guo: regulators sit with the routes they act on (Canonical: ${regs})`);
  }

  for (const r of all.filter((v) => /v3$/.test(v.id))) {
    const x = r.extraction, t = traceRoutes(x);
    const none = focusHidden(x, t, EMPTY_SIMPLIFY.focus);
    const first = t.groups[0]?.routes[0];
    if (!first) continue;
    const off = setItem(EMPTY_SIMPLIFY.focus, t, first.key, false);
    const h = focusHidden(x, t, off);
    const shown = applyEdits(x, [...h].map(([id, why]) => E('hide', id, null, why)));
    const otherRoutes = new Set(t.groups.flatMap((g) => g.routes).filter((v) => v !== first).flatMap((v) => v.members));
    const ok = none.size === 0 && h.size > 0 && shown.failed.length === 0
      && first.members.every((m) => h.has(m) === !otherRoutes.has(m))
      && shown.extraction.arrows.every((a) => !h.has(a.from) && !h.has(a.to));
    const back = focusHidden(x, t, setItem(off, t, first.key, true));
    const click = toggleShape(EMPTY_SIMPLIFY.focus, t, first.members[0], true);
    const clicked = focusHidden(x, t, click), unclicked = focusHidden(x, t, toggleShape(click, t, first.members[0], false));
    check(ok && back.size === 0 && clicked.has(first.members[0]) && unclicked.size === 0,
      `${r.id}: nothing left out by default; unticking "${first.name}" leaves out ${h.size} shape(s) not shared with other routes, and their arrows; ticking it back, or clicking a shape out and in, restores everything`);
  }
  // Step 3 on the test figures.
  const yuRun = find('yu2020-nfkb-v3'), wntRun = find('wnt-liu2022-v3');
  if (yuRun) {
    const x = yuRun.extraction, rep = findRepeats(x, traceRoutes(x), false);
    const found = rep.groups.map((g) => x.elements.find((e) => e.id === g.copies[0])!.label);
    const merged = applyEdits(x, rep.groups.flatMap((g) => g.copies.filter((c) => c !== g.keeper).map((c) => E('merge_into', c, g.keeper))));
    const keys = merged.extraction.arrows.map((a) => `${a.from}>${a.to}>${a.head}>${a.line}`);
    const clusters = merged.extraction.groups.map((g) => [...g.members].sort().join());
    const loops = (v: typeof x) => v.arrows.filter((a) => a.from === a.to).length;
    check(['TAB2/3', 'TAK1'].every((l) => found.includes(l)) && merged.failed.length === 0 && keys.length === new Set(keys).size
      && clusters.length === new Set(clusters).size && loops(merged.extraction) === loops(x),
      `Yu, parts of one picture: repeats found (${[...new Set(found)].join(', ')}); merging them all leaves no duplicate arrows, clusters or new self-loops`);
  }
  if (wntRun) {
    const x = wntRun.extraction, rep = findRepeats(x, traceRoutes(x), true);
    const bcat = rep.apart.find((a) => a.name === 'β-catenin');
    check(rep.groups.length === 0 && !!bcat && bcat.reason.includes('compartments') && bcat.reason.includes('panels'),
      `Wnt, different conditions: nothing merged across OFF and ON; β-catenin left apart (${bcat?.reason})`);
    const members = ['e_gsk_2', 'e_axin_2', 'e_apc_2'];
    const col = applyEdits(x, [collapseEdit(x, 't', members, 'Destruction complex core')]);
    const n = col.extraction.elements.find((e) => e.id === 'col-t');
    const g2 = col.extraction.groups.find((g) => g.id === 'g_2');
    check(col.failed.length === 0 && !!n && n.sublabel === 'GSK-3β + Axin + APC' && !members.some((m) => col.extraction.elements.some((e) => e.id === m))
      && !!g2 && g2.members.includes('col-t') && g2.members.length === 3 && col.extraction.arrows.some((a) => a.from === 'e_dvl_2' && (a.to === 'col-t' || a.to === 'g_2')),
      'Wnt: collapsing part of the destruction complex makes one named shape (members as its sub-label), kept in the cluster with the rest, with the Dishevelled arrow re-pointed');
  }
  const hu = find('hu2021-jak-stat-v3');
  if (hu) {
    const kinds = findIssues(hu.extraction).map((i) => i.kind);
    check(kinds.includes('typo') && kinds.includes('unlabelled') && kinds.includes('meaning'), `Hu: step 1 lists typos, unlabelled parts and colour meanings (${kinds.length} issues)`);
  }
  // Step 5 on the test figures, both ways.
  const overlap = (a: number[], b: number[]) => Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]));
  const layEdit = (x: Parameters<typeof layOut>[0], W: number, H: number, o: typeof DEFAULT_LAYOUT) => E('set_layout', 'layout', null, JSON.stringify(layOut(x, W, H, traceRoutes(x), o)));
  /** Problems with one layout: applies cleanly, on its canvas, the same twice, and no shapes from different units overlapping. */
  const problems = (x: Parameters<typeof layOut>[0], W: number, H: number, o: typeof DEFAULT_LAYOUT, share: number, label: string) => {
    const bad: string[] = [], t = traceRoutes(x), e1 = layEdit(x, W, H, o);
    const out = applyEdits(x, [e1]), y = out.extraction;
    if (out.failed.length || referenceProblems(y).length > referenceProblems(x).length) bad.push(`${label}: does not apply cleanly`);
    if (e1.value !== layEdit(x, W, H, o).value) bad.push(`${label}: differs between two runs`);
    if (!y.elements.every((e) => e.box[0] >= -0.01 && e.box[1] >= -0.01 && e.box[0] + e.box[2] <= 100.01 && e.box[1] + e.box[3] <= 100.01)) bad.push(`${label}: a shape is off the canvas`);
    const same = (a: string, b: string) => !o.off.includes('blocks') && t.unitOf.get(a)?.includes(b);
    const els = y.elements.filter((e) => e.kind !== 'heading');
    if (!o.off.includes('overlaps')) for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++)
      if (!same(els[i].id, els[j].id) && overlap(els[i].box, els[j].box) > share * Math.min(els[i].box[2] * els[i].box[3], els[j].box[2] * els[j].box[3]))
        bad.push(`${label}: ${els[i].label} overlaps ${els[j].label}`);
    return { bad, y };
  };
  const centreOf = (y: { elements: { id: string; label: string | null; kind: string; box: number[] }[]; canvas?: number[] }, W: number, H: number, find: (e: { label: string | null; kind: string }) => boolean) => {
    const e = y.elements.find(find)!; const [cw, ch] = y.canvas ?? [W, H];
    return { x: ((e.box[0] + e.box[2] / 2) / 100) * cw, y: ((e.box[1] + e.box[3] / 2) / 100) * ch };
  };
  for (const r of all.filter((v) => /(yu2020-nfkb|wnt-liu2022|guo2024-nfkb|hu2021-jak-stat)-v3$/.test(v.id))) {
    const x = r.extraction, W = r.image.width, H = r.image.height;
    const before = measure(toScene(x, W, H));

    // Tidy (the default): every rule on, and each switched off.
    const tidy = { ...DEFAULT_LAYOUT, mode: 'tidy' as const };
    const tbad = [tidy, ...TIDY_RULES.map((rule) => ({ ...tidy, off: [rule.key] }))].flatMap((o) => problems(x, W, H, o, 0.15, o.off[0] ?? 'all rules on').bad);
    const ty = applyEdits(x, [layEdit(x, W, H, tidy)]).extraction, tm = measure(toScene(ty, W, H));
    // Shapes keep their places: after taking out the overall shift, the typical shape moves less than its own width.
    const px = (y: typeof x, e: (typeof x)['elements'][number], [cw, ch] = y.canvas ?? [W, H]) => ({ x: ((e.box[0] + e.box[2] / 2) / 100) * cw, y: ((e.box[1] + e.box[3] / 2) / 100) * ch });
    const moves = x.elements.map((e) => { const a = px(x, e), b = px(ty, ty.elements.find((v) => v.id === e.id)!); return { dx: b.x - a.x, dy: b.y - a.y }; });
    const med = (v: number[]) => [...v].sort((p, q) => p - q)[Math.floor(v.length / 2)];
    const mdx = med(moves.map((m) => m.dx)), mdy = med(moves.map((m) => m.dy));
    const typical = med(moves.map((m) => Math.hypot(m.dx - mdx, m.dy - mdy))), width = med(x.elements.map((e) => (e.box[2] / 100) * W));
    check(!tbad.length && typical < width && tm.crossings <= before.crossings && tm.behind <= before.behind,
      `${r.id}, tidy: with all ${TIDY_RULES.length} rules and with each switched off, applies cleanly, on its canvas, no overlapping shapes, the same every time; shapes stay put (typical move ${typical.toFixed(0)} px, a shape is ${width.toFixed(0)}); crossings ${before.crossings} → ${tm.crossings}, behind a shape ${before.behind} → ${tm.behind}${tbad.length ? ': ' + [...new Set(tbad)].slice(0, 6).join('; ') : ''}`);

    // Redraw as a cell: every rule on, and each switched off.
    const cell = { ...DEFAULT_LAYOUT, mode: 'cell' as const };
    const cbad = [cell, ...RULES.map((rule) => ({ ...cell, off: [rule.key] }))].flatMap((o) => problems(x, W, H, o, 0.05, o.off[0] ?? 'all rules on').bad);
    const laid = applyEdits(x, [layEdit(x, W, H, cell)]).extraction;
    const m = measure(toScene(laid, W, H));
    check(!cbad.length, `${r.id}, redraw as a cell: with all ${RULES.length} rules and with each switched off, applies cleanly, on its canvas, no overlapping shapes, the same every time (crossings ${before.crossings} → ${m.crossings}, behind a shape ${before.behind} → ${m.behind}, pointing up ${before.up} → ${m.up})${cbad.length ? ': ' + [...new Set(cbad)].slice(0, 6).join('; ') : ''}`);
    const centre = (id: string) => { const e = laid.elements.find((v) => v.id === id)!; return e.box[0] + e.box[2] / 2; };
    const panel = (label: string) => laid.panels.find((p) => p.label === label);
    if (/wnt/.test(r.id)) {
      const t = traceRoutes(x), off = panel('WNT OFF'), on = panel('WNT ON');
      const inside = (p: typeof off, part: string) => !!p && laid.elements.filter((e) => e.kind !== 'heading' && t.partOf.get(e.id) === part).every((e) => centre(e.id) >= p.box[0] - 0.5 && centre(e.id) <= p.box[0] + p.box[2] + 0.5);
      check(inside(off, 'panel:p1') && inside(on, 'panel:p2') && m.up === 0, 'Wnt, redraw: OFF and ON become side-by-side columns, nothing crosses between them, and no arrow points up');
    }
    if (/guo/.test(r.id)) {
      const non = panel('Non-canonical pathway');
      const regs = ['A20', 'CYLD', 'LUBAC'].map((l) => laid.elements.find((e) => e.label === l)!);
      const ikb = centreOf(laid, W, H, (e) => e.label === 'IκB'), dna = centreOf(laid, W, H, (e) => e.kind === 'dna');
      check(!!panel('Canonical pathway') && !!non && regs.every((e) => centre(e.id) < non.box[0]) && Math.abs(ikb.x - dna.x) < 2,
        'Guo, redraw: canonical and non-canonical as columns, A20, CYLD and LUBAC on the canonical side, and the main line runs from IκB straight into the nucleus');
      // As in the user's test: the non-canonical routes ticked off in step 2, then tidied.
      const t = traceRoutes(x);
      const nonItems = t.groups.filter((g) => g.label === 'Non-canonical pathway').flatMap((g) => [...g.routes, ...g.regulators].map((v) => v.key));
      const focused = applyEdits(x, [...focusHidden(x, t, { off: nonItems, keep: [], drop: [] })].map(([id, why]) => E('hide', id, null, why))).extraction;
      const fy = applyEdits(focused, [layEdit(focused, W, H, tidy)]).extraction;
      const near = (y: typeof x, l: string) => { const a = centreOf(y, W, H, (e) => e.label === l), n = centreOf(y, W, H, (e) => e.label === 'NEMO'); return Math.hypot(a.x - n.x, a.y - n.y); };
      const ratio = Math.max(...['CYLD', 'LUBAC'].map((l) => near(fy, l) / near(focused, l)));
      // The shared DNA strand and the second outcome box stay (step 2 keeps them: both routes reach them), so
      // the width is held by them; the height and the empty margins are what crop can take.
      check(nonItems.length > 0 && !!fy.canvas && fy.canvas[0] <= W && fy.canvas[1] <= H && ratio < 1.25,
        `Guo, canonical only, tidied: cropped (${fy.canvas?.[0]} × ${fy.canvas?.[1]} of ${W} × ${H} px), with CYLD and LUBAC still beside NEMO (distance × ${ratio.toFixed(2)})`);
    }
  }
}

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
