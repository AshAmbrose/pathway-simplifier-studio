/**
 * One of the model's questions, answered where it applies. The answers are the main route: large buttons,
 * in the order the shapes sit in the figure, none of them recommended. "Fix it myself" is the small last line.
 */
import { CloseButton } from './Popover.tsx';

export interface Choice {
  /** Position in the question's own option list. */
  index: number;
  label: string;
  /** This answer is what the reconstruction shows right now. A fact about the screen, not a recommendation. */
  shownNow: boolean;
  /** The model gave no usable changes for this answer: choosing it opens the fix-by-hand route. */
  byHand: boolean;
}

export function QuestionPopover({ n, total, question, choices, answered, onHover, onChoose, onManual, onClear, onClose }: {
  n: number; total: number; question: string; choices: Choice[]; answered: boolean;
  onHover: (index: number | null) => void; onChoose: (index: number) => void; onManual: () => void; onClear: () => void; onClose: () => void;
}) {
  return (
    <div>
      <div className="flex items-start justify-between gap-2">
        <div className="num text-meta text-ink-3">Question {n} of {total}</div>
        <CloseButton onClose={onClose} />
      </div>
      <p className="mt-1 font-medium leading-snug">{question}</p>
      <div className="mt-2 flex flex-col gap-1.5" onMouseLeave={() => onHover(null)}>
        {choices.map((c) => (
          <button key={c.index} onMouseEnter={() => onHover(c.index)} onFocus={() => onHover(c.index)} onClick={() => onChoose(c.index)}
            className="flex items-center justify-between gap-2 rounded border border-line-2 px-3 py-2 text-left hover:border-accent hover:bg-accent-wash">
            <span>{c.label}</span>
            {c.shownNow && <span className="shrink-0 text-meta font-normal text-ink-3">shown now</span>}
            {c.byHand && !c.shownNow && <span className="shrink-0 text-meta font-normal text-ink-3">fix by hand</span>}
          </button>
        ))}
      </div>
      {choices.length === 0 && <p className="mt-2 text-ink-2">The model gave no answers to choose from.</p>}
      <div className="mt-2 flex items-center justify-between text-meta">
        <button className="text-ink-2 underline decoration-line-2 underline-offset-4 hover:text-ink" onClick={onManual}>None of these: fix it myself</button>
        {answered && <button className="text-ink-2 underline decoration-line-2 underline-offset-4 hover:text-ink" onClick={onClear}>Clear answer</button>}
      </div>
    </div>
  );
}
