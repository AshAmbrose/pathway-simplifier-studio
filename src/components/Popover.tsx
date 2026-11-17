/**
 * A pop-up placed beside a box on the reconstruction: on whichever side has room, never over the box itself.
 * It follows the box as the view moves.
 */
import { X } from 'lucide-react';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { BoxPx } from '../render/edgePorts.ts';
import type { Placement } from './PairedViewer.tsx';

const GAP = 14, EDGE = 8;

export function Popover({ anchor, place, width = 300, children }: { anchor: BoxPx; place: Placement; width?: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [h, setH] = useState(220);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setH(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const w = Math.min(width, place.paneW - EDGE * 2);
  const a = place.toScreen(anchor.x, anchor.y), b = place.toScreen(anchor.x + anchor.width, anchor.y + anchor.height);
  const midY = (a.top + b.top) / 2, midX = (a.left + b.left) / 2;
  const clampX = (v: number) => Math.min(Math.max(v, EDGE), place.paneW - w - EDGE);
  const clampY = (v: number) => Math.min(Math.max(v, EDGE), Math.max(EDGE, place.paneH - h - EDGE));
  const room = { right: place.paneW - b.left, left: a.left, below: place.paneH - b.top, above: a.top };
  let left: number, top: number;
  if (room.right >= w + GAP + EDGE) { left = b.left + GAP; top = clampY(midY - h / 2); }
  else if (room.left >= w + GAP + EDGE) { left = a.left - GAP - w; top = clampY(midY - h / 2); }
  else if (room.below >= h + GAP + EDGE) { left = clampX(midX - w / 2); top = b.top + GAP; }
  else if (room.above >= h + GAP + EDGE) { left = clampX(midX - w / 2); top = a.top - GAP - h; }
  // No clear side (the box fills the pane): the corner farthest from the box's centre.
  else { left = midX < place.paneW / 2 ? place.paneW - w - EDGE : EDGE; top = midY < place.paneH / 2 ? Math.max(EDGE, place.paneH - h - EDGE) : EDGE; }

  return (
    <div ref={ref} style={{ left, top, width: w, maxHeight: place.paneH - EDGE * 2 }}
      className="pointer-events-auto absolute overflow-y-auto rounded border border-line-2 bg-panel p-4 text-body text-ink shadow-[0_8px_24px_rgb(0_0_0/0.14)]">
      {children}
    </div>
  );
}

export function CloseButton({ onClose }: { onClose: () => void }) {
  return <button aria-label="Close" className="-mr-1 -mt-1 rounded p-1 text-ink-3 hover:bg-sunk hover:text-ink" onClick={onClose}><X size={16} /></button>;
}
