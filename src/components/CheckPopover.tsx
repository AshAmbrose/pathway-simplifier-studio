/**
 * The check after an arrow's end is put where there is no shape. Ending in open space or on a compartment is
 * allowed, but it is unusual enough to confirm: accept it, or snap to one of the shapes drawn nearest.
 */
import { CloseButton } from './Popover.tsx';

export function CheckPopover({ end, isNew, where, near, onAccept, onNear, onCancel }: {
  end: 'from' | 'to';
  /** A new arrow being drawn, rather than an existing arrow's end being moved. */
  isNew?: boolean;
  /** "open space in the cytoplasm", or "open space" if it is outside every compartment. */
  where: string;
  near: { id: string; name: string }[];
  onAccept: () => void; onNear: (id: string) => void; onCancel: () => void;
}) {
  const verb = end === 'from' ? 'starts' : 'ends';
  return (
    <div>
      <div className="flex items-start justify-between gap-2">
        <div className="text-meta text-ink-3">Check</div>
        <CloseButton onClose={onCancel} />
      </div>
      <p className="mt-1 font-medium leading-snug">There is no shape here. Where does the arrow {verb === 'starts' ? 'start' : 'end'} in the figure?</p>
      <div className="mt-2 flex flex-col gap-1.5">
        <button onClick={onAccept} className="rounded border border-line-2 px-3 py-2 text-left hover:border-ink hover:bg-sunk">
          Here, in {where}
          <span className="block text-meta font-normal text-ink-3">It {verb} without touching a shape.</span>
        </button>
        {near.length > 0 && <div className="mt-1 text-meta text-ink-3">Or on the nearest shape:</div>}
        {near.map((n) => (
          <button key={n.id} onClick={() => onNear(n.id)} className="rounded border border-line-2 px-3 py-2 text-left hover:border-ink hover:bg-sunk">{n.name}</button>
        ))}
      </div>
      <button className="mt-2 text-meta text-ink-3 underline hover:text-ink" onClick={onCancel}>{isNew ? "Cancel: don't add the arrow" : 'Cancel: leave the arrow as it was'}</button>
    </div>
  );
}
