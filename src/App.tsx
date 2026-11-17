/**
 * The app's two screens: upload a figure, or work on one (RunScreen: Check, then the simplification steps). The open run's id
 * is kept in the address (?run=<id>), so a run can be reloaded or bookmarked.
 */
import { useEffect, useState } from 'react';
import { getRun, runImageUrl, type RunRecord } from './api.ts';
import { RunScreen } from './components/RunScreen.tsx';
import { UploadScreen } from './components/UploadScreen.tsx';

/** The open run is kept in the address (?run=<id>), so a review can be reloaded or bookmarked. */
function setRunParam(id: string | null) {
  const u = new URL(location.href);
  if (id) u.searchParams.set('run', id); else u.searchParams.delete('run');
  history.replaceState(null, '', u);
}

export default function App() {
  const [run, setRun] = useState<RunRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const show = (r: RunRecord | null) => { setRun(r); setRunParam(r?.id ?? null); };
  const open = (id: string) => getRun(id).then(show).catch((e) => setError((e as Error).message));
  useEffect(() => {
    const id = new URL(location.href).searchParams.get('run');
    if (id) open(id);
  }, []);
  if (run) return <RunScreen key={run.id} run={run} imageUrl={runImageUrl(run.id)} onBack={() => show(null)} />;
  return (
    <>
      {error && <div className="mx-auto mt-4 max-w-4xl px-4 text-body text-bad">{error}</div>}
      <UploadScreen onDone={show} onOpen={open} />
    </>
  );
}
