/**
 * The Finish report as a printable page (A4), turned into a PDF by the local server (server/pdf.ts) or, failing
 * that, the browser's print dialog. One self-contained HTML document: the uploaded image as a data URL, the finished
 * figure as inline SVG (vector, so it stays sharp), and the text with every label exactly as written (Greek letters,
 * sub- and superscripts), which is why the browser's own engine prints it rather than a PDF library.
 * Compact by design: fidelity and counts on the first page beside the two figures, then every shape and arrow.
 */
import type { Report } from './account.ts';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const STEP_NAME: Record<string, string> = { Check: 'Check', issues: '1 Issues', focus: '2 Focus', repeats: '3 Repeats', clusters: '4 Clusters', layout: '5 Layout' };
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

export interface Printable {
  name: string;
  report: Report;
  /** Further summary lines (the arrow check). */
  extra: string[];
  /** The uploaded image, as a data URL. */
  original: string;
  /** The finished figure, as SVG markup. */
  finishedSvg: string;
}

export function reportHtml({ name, report: r, extra, original, finishedSvg }: Printable): string {
  const c = r.counts;
  const added = [...r.shapes, ...r.arrows].filter((v) => v.fate === 'added').length;
  const fidelity = r.unaccounted === 0
    ? `<p class="ok">✓ Every one of the <b>${c.read.shapes}</b> shapes and <b>${c.read.arrows}</b> arrows the model read is accounted for${added ? `, and so is everything added by hand (${added})` : ''}: each is unchanged, or a change in the list says what happened to it.</p>`
    : `<p class="warn">⚠ <b>${r.unaccounted}</b> item${r.unaccounted === 1 ? '' : 's'} changed with no change in the list saying so: ${[...r.shapes, ...r.arrows].filter((v) => v.fate === 'unaccounted').map((v) => `${esc(v.asDrawn)} (${esc(v.detail)})`).join('; ')}.</p>`;
  const counts = (['shapes', 'arrows', 'clusters', 'compartments'] as const).map((k) => {
    const d = c.read[k] ? Math.round(((c.finished[k] - c.read[k]) / c.read[k]) * 100) : 0;
    return `<tr><td>${cap(k)}</td><td>${c.read[k]}</td><td>${c.checked[k]}</td><td><b>${c.finished[k]}</b></td><td class="${d < 0 ? 'down' : ''}">${c.read[k] ? `${d > 0 ? '+' : ''}${d}%` : ''}</td></tr>`;
  }).join('');
  const table = (list: Report['shapes'] | Report['arrows'], identity: boolean) => {
    const fates = [...new Set(list.map((v) => v.fate))].sort((a, b) => Number(b === 'unaccounted') - Number(a === 'unaccounted'));
    return fates.map((f) => {
      const items = list.filter((v) => v.fate === f);
      // One line per item: "kept as drawn" is already the group's name, so kept items show only their identity.
      const span = identity ? 4 : 3;
      return `<tr class="group"><td colspan="${span}">${cap(f)} <span class="n">${items.length}</span></td></tr>` + items.map((v) => {
        const what = f === 'kept' ? '' : esc(v.detail);
        const id = identity ? `<td class="id">${'identity' in v && v.identity ? esc(v.identity) : ''}</td>` : '';
        return `<tr${f === 'unaccounted' ? ' class="bad"' : ''}><td>${esc(v.asDrawn)}</td><td>${what}</td>${id}<td class="where">${v.where ? STEP_NAME[v.where] ?? v.where : ''}</td></tr>`;
      }).join('');
    }).join('');
  };
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(name)} report</title><style>
@page { size: A4; margin: 11mm 12mm; }
* { box-sizing: border-box; }
body { font: 8.5pt/1.35 -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif; color: #1c1f23; margin: 0; }
h1 { font-size: 14pt; margin: 0; } h2 { font-size: 10pt; margin: 9pt 0 3pt; }
.sub { color: #5d6670; margin: 1pt 0 6pt; }
.ok, .warn { margin: 0 0 6pt; padding: 4pt 6pt; border-radius: 3pt; } .ok { background: #e9f5ee; color: #1d6b3d; } .warn { background: #fdf1e3; color: #8a4b08; }
.figs { display: grid; grid-template-columns: 1fr 1fr; gap: 6pt; }
.fig { border: 0.5pt solid #d5d9de; border-radius: 3pt; height: 92mm; display: flex; align-items: center; justify-content: center; overflow: hidden; background: #fff; }
.fig img, .fig svg { max-width: 100%; max-height: 100%; width: 100%; height: 100%; object-fit: contain; }
.cap { color: #5d6670; font-size: 7.5pt; margin-top: 2pt; }
.cols { display: grid; grid-template-columns: 1fr 1fr; gap: 10pt; align-items: start; }
table { border-collapse: collapse; width: 100%; } td, th { padding: 1.5pt 3pt; vertical-align: top; border-top: 0.5pt solid #e3e6ea; text-align: left; }
.counts td:not(:first-child), .counts th:not(:first-child) { text-align: right; font-variant-numeric: tabular-nums; } th { color: #5d6670; font-weight: normal; border-top: 0; }
.down { color: #1d6b3d; } .lines p { margin: 0 0 3pt; color: #3c434b; }
.list { font-size: 7.5pt; } .list td { padding: 1pt 3pt; } .list td:first-child { width: 22%; } .where { width: 9%; color: #5d6670; white-space: nowrap; }
.group td { background: #f3f4f6; font-weight: 600; border-top: 0.5pt solid #c9ced4; } .n { color: #5d6670; font-weight: normal; }
.id { color: #5d6670; width: 38%; } .bad td { color: #8a4b08; }
tr { break-inside: avoid; } .foot { color: #8a929b; font-size: 7pt; margin-top: 8pt; }
</style></head><body>
<h1>Report: ${esc(name)}</h1>
<p class="sub">The figure as the model read it, against the finished figure. ${new Date().toISOString().slice(0, 10)}.</p>
${fidelity}
<div class="figs">
  <div><div class="fig"><img src="${original}" alt="Original"></div><div class="cap">Original, as uploaded · ${c.read.shapes} shapes, ${c.read.arrows} arrows as read</div></div>
  <div><div class="fig">${finishedSvg}</div><div class="cap">Finished · ${c.finished.shapes} shapes, ${c.finished.arrows} arrows</div></div>
</div>
<div class="cols">
  <div><h2>Simpler, in numbers</h2><table class="counts"><tr><th></th><th>As read</th><th>After Check</th><th>Finished</th><th>Change</th></tr>${counts}</table></div>
  <div class="lines"><h2>Science checks</h2><p>Shapes identified in public databases (HGNC, UniProt, Complex Portal, GO, ChEBI): ${r.identified} of the ${c.read.shapes} the model read.</p>${extra.map((l) => `<p>${esc(l)}</p>`).join('')}</div>
</div>
<h2>Shapes</h2><table class="list"><tr><th>As drawn</th><th>What happened</th><th>Identified as</th><th>Where</th></tr>${table(r.shapes, true)}</table>
<h2>Arrows</h2><table class="list"><tr><th>As drawn</th><th>What happened</th><th>Where</th></tr>${table(r.arrows, false)}</table>
<p class="foot">Made by Pathway Simplifier Studio. Every change is in the run's change list; "Where" is the step it was made in.</p>
</body></html>`;
}
