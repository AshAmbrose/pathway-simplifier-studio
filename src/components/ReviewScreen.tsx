/**
 * Side by side: the uploaded image and the render of its extraction, aligned. Below, the model's own output
 * as plain lists (counts, clarification questions, flags, cost). Nothing is added or analysed here.
 */
import { useMemo, useState } from 'react';
import type { RunRecord } from '../api.ts';
import { toScene } from '../render/toScene.ts';
import { ImageLayer, MarkerDefs, SceneSvg } from './SceneSvg.tsx';
import { PairedViewer } from './PairedViewer.tsx';

export function ReviewScreen({ run, imageUrl, onBack }: { run: RunRecord; imageUrl: string; onBack: () => void }) {
  const [hot, setHot] = useState<string | null>(null);
  const x = run.extraction;
  const scene = useMemo(() => toScene(x, run.image.width, run.image.height), [x, run.image.width, run.image.height]);
  const name = (id: string): string => {
    const e = x.elements.find((v) => v.id === id);
    if (e) return e.label ?? `(${e.kind}, no label)`;
    const g = x.groups.find((v) => v.id === id);
    if (g) return g.label ?? `[${g.members.map(name).join(' + ')}]`;
    const a = x.arrows.find((v) => v.id === id);
    if (a) return `${name(a.from)} → ${name(a.to)}`;
    return id;
  };
  const counts: [string, number][] = [
    ['elements', x.elements.length], ['groups', x.groups.length], ['contacts', x.contacts.length], ['arrows', x.arrows.length],
    ['regions', x.regions.length], ['flags', x.flags.length], ['clarification questions', x.clarify.length],
  ];

  return (
    <div className="px-4 py-4">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <button className="rounded-lg border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800" onClick={onBack}>← Upload another</button>
        <h1 className="text-lg font-semibold">{run.name}</h1>
        <span className="text-sm text-slate-500 dark:text-slate-400">
          {run.model} · prompt {run.promptVersion} · {run.seconds.toFixed(1)}s · {run.usage.inputTokens.toLocaleString()} in / {run.usage.outputTokens.toLocaleString()} out tokens
          {run.priceKnown ? ` · $${run.costUsd.toFixed(4)}` : ' · price not set'}
        </span>
      </div>

      <PairedViewer
        width={run.image.width}
        height={run.image.height}
        leftTitle="Uploaded figure"
        rightTitle="Rendered from the extraction (original positions)"
        left={<ImageLayer scene={scene} src={imageUrl} hot={hot} onHover={setHot} />}
        right={<><MarkerDefs /><SceneSvg scene={scene} hot={hot} onHover={setHot} /></>}
      />
      <div className="mt-1 h-5 text-sm text-slate-700 dark:text-slate-200">{hot ? name(hot) : ''}</div>

      <div className="mt-3 grid gap-6 lg:grid-cols-3">
        <section>
          <h2 className="font-semibold">What was extracted</h2>
          <ul className="mt-1 text-sm">{counts.map(([k, v]) => <li key={k}>{v} {k}</li>)}</ul>
          {x.structure && <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{x.structure}</p>}
          {(run.problems.length > 0 || scene.skipped.length > 0) && (
            <>
              <h3 className="mt-3 text-sm font-semibold">Could not be placed</h3>
              <ul className="mt-1 list-disc pl-5 text-sm text-slate-600 dark:text-slate-300">
                {[...run.problems, ...scene.skipped].map((p, i) => <li key={i}>{p}</li>)}
              </ul>
            </>
          )}
        </section>
        <section>
          <h2 className="font-semibold">Clarification questions</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Where the model found the drawing ambiguous. Shown for now; answering them comes later.</p>
          {x.clarify.length === 0 ? <p className="mt-1 text-sm">None.</p> : (
            <ul className="mt-1 space-y-2 text-sm">
              {x.clarify.map((c, i) => (
                <li key={i} className="rounded border border-slate-200 p-2 dark:border-slate-700" onMouseEnter={() => setHot(c.about[0] ?? null)} onMouseLeave={() => setHot(null)}>
                  <div>{c.question}</div>
                  {c.options.length > 0 && <div className="mt-1 text-slate-500 dark:text-slate-400">Options: {c.options.join(' · ')}</div>}
                  {c.about.length > 0 && <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">About: {c.about.map(name).join('; ')}</div>}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <h2 className="font-semibold">Flags</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Drawing-level problems the model noticed. Not corrections.</p>
          {x.flags.length === 0 ? <p className="mt-1 text-sm">None.</p> : (
            <ul className="mt-1 space-y-2 text-sm">
              {x.flags.map((f, i) => (
                <li key={i} className="rounded border border-slate-200 p-2 dark:border-slate-700" onMouseEnter={() => setHot(f.on)} onMouseLeave={() => setHot(null)}>
                  <div><span className="font-medium">{f.type}</span> on {name(f.on)} <span className="text-slate-500 dark:text-slate-400">({f.confidence})</span></div>
                  {f.asWritten && <div className="text-slate-600 dark:text-slate-300">Written "{f.asWritten}"{f.suggestion ? `, suggest "${f.suggestion}"` : ''}</div>}
                  <div className="text-slate-600 dark:text-slate-300">{f.basis}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
