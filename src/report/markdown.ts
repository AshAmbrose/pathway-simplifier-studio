/**
 * The Finish report as a Markdown file, to keep with the figure: the counts, whether everything is accounted
 * for, and every shape and arrow with what happened to it and where. Same content as the report on screen.
 */
import type { Report } from './account.ts';

const pct = (a: number, b: number) => (a ? `${b - a >= 0 ? '+' : ''}${Math.round(((b - a) / a) * 100)}%` : '');
const cell = (s: string) => s.replace(/\|/g, '\\|');

export function reportMarkdown(name: string, r: Report, extra: string[] = []): string {
  const c = r.counts;
  const rows = (['shapes', 'arrows', 'clusters', 'compartments'] as const)
    .map((k) => `| ${k[0].toUpperCase() + k.slice(1)} | ${c.read[k]} | ${c.checked[k]} | ${c.finished[k]} | ${pct(c.read[k], c.finished[k])} |`);
  const group = <T extends { fate: string; asDrawn: string; detail: string; where: string | null }>(list: T[], extraCol?: (v: T) => string) => {
    const fates = [...new Set(list.map((v) => v.fate))];
    return fates.flatMap((f) => {
      const items = list.filter((v) => v.fate === f);
      return [`\n**${f[0].toUpperCase() + f.slice(1)}** (${items.length})\n`, `| As drawn | What happened | Where |${extraCol ? ' Identity |' : ''}`, `|---|---|---|${extraCol ? '---|' : ''}`,
        ...items.map((v) => `| ${cell(v.asDrawn)} | ${cell(v.detail)} | ${v.where ?? ''} |${extraCol ? ` ${cell(extraCol(v))} |` : ''}`)];
    });
  };
  return [
    `# Report: ${name}`, '',
    `What changed between the figure as the model read it and the finished figure. Made ${new Date().toISOString().slice(0, 10)}.`, '',
    r.unaccounted === 0
      ? `**Fidelity:** every one of the ${c.read.shapes} shapes and ${c.read.arrows} arrows the model read is accounted for, and so is everything added by hand: each is unchanged, or a change in the list says what happened to it.`
      : `**Fidelity:** ${r.unaccounted} item${r.unaccounted === 1 ? '' : 's'} changed with no change in the list saying so (marked "unaccounted" below).`, '',
    '| | As read | After Check | Finished | Change |', '|---|---|---|---|---|', ...rows, '',
    `Shapes identified in public databases: ${r.identified} of the ${c.read.shapes} the model read.`,
    ...extra, '',
    '## Shapes', ...group(r.shapes, (v) => (v as Report['shapes'][number]).identity ?? ''), '',
    '## Arrows', ...group(r.arrows), '',
  ].join('\n');
}
