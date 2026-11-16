/**
 * The uploaded figure in a small window over the page, for the simplification steps, where both views show the
 * reconstruction. Move it by its title bar, resize it from its corner, close it with ×.
 */
import { useRef, useState } from 'react';
import { CloseButton } from './Popover.tsx';

export function FloatingOriginal({ src, onClose }: { src: string; onClose: () => void }) {
  // Starts in the bottom-right corner, clear of the header and the step controls.
  const [pos, setPos] = useState(() => ({ x: Math.max(16, window.innerWidth - 460), y: Math.max(200, window.innerHeight - 360) }));
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  return (
    <div role="dialog" aria-label="Original figure" style={{ left: pos.x, top: pos.y, width: 420, resize: 'both', minWidth: 220, minHeight: 120 }}
      className="fixed z-40 overflow-hidden rounded-xl border border-slate-300 bg-white shadow-2xl dark:border-slate-600 dark:bg-slate-800">
      <div className="flex cursor-move select-none items-center justify-between border-b border-slate-200 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-700 dark:text-slate-400"
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }; }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (d && e.buttons & 1) setPos({ x: Math.min(Math.max(0, e.clientX - d.dx), window.innerWidth - 120), y: Math.min(Math.max(0, e.clientY - d.dy), window.innerHeight - 40) });
        }}
        onPointerUp={() => { drag.current = null; }}>
        Original
        <span onPointerDown={(e) => e.stopPropagation()}><CloseButton onClose={onClose} /></span>
      </div>
      <img src={src} alt="The uploaded figure" draggable={false} className="block h-auto w-full bg-white" />
    </div>
  );
}
