/**
 * The check after an arrow's end is put where there is no shape. Ending in open space or on a compartment is
 * allowed, but it is unusual enough to confirm: accept it, or snap to one of the shapes drawn nearest.
 */
import { CloseButton } from './Popover.tsx';

export function CheckPopover({ end, where, near, onAccept, onNear, onCancel }: {
  end: 'from' | 'to';
  /** "open space in the cytoplasm", or "open space" if it is outside every compartment. */
  where: string;
  near: { id: string; name: string }[];
  onAccept: () => void; onNear: (id: string) => void; onCancel: () => void;
}) {
  const verb = end === 'from' ? 'starts' : 'ends';
  return (
    <div>
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">Check</div>
        <CloseButton onClose={onCancel} />
      </div>
      <p className="mt-1 font-medium leading-snug">There is no shape here. Where does the arrow {verb === 'starts' ? 'start' : 'end'} in the figure?</p>
      <div className="mt-2 flex flex-col gap-1.5">
        <button onClick={onAccept} className="rounded-lg border border-slate-300 px-3 py-2 text-left font-medium hover:border-blue-500 hover:bg-blue-50 dark:border-slate-600 dark:hover:bg-slate-700">
          Here, in {where}
          <span className="block text-xs font-normal text-slate-500 dark:text-slate-400">It {verb} without touching a shape.</span>
        </button>
        {near.length > 0 && <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">Or on the nearest shape:</div>}
        {near.map((n) => (
          <button key={n.id} onClick={() => onNear(n.id)} className="rounded-lg border border-slate-300 px-3 py-2 text-left font-medium hover:border-blue-500 hover:bg-blue-50 dark:border-slate-600 dark:hover:bg-slate-700">{n.name}</button>
        ))}
      </div>
      <button className="mt-2 text-xs text-slate-500 underline hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200" onClick={onCancel}>Cancel: leave the arrow as it was</button>
    </div>
  );
}
