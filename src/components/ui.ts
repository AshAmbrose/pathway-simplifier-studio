/**
 * The few control and text styles every screen shares, so a button, a section or a note looks the same
 * everywhere (see DESIGN.md). Colours are the named roles from src/index.css.
 *  - cta: the next thing to do (one at a time), larger and in the action orange;
 *  - primary: a main action that isn't the next thing to do (ink-filled);
 *  - button: an ordinary action (hairline outline);
 *  - quiet: a minor action, written as underlined text;
 *  - section: a part of a side panel, separated from the one above by a hairline instead of a box;
 *  - note / warnNote: a short message in a tinted band (no coloured side border).
 */
/** The next thing to do on this screen (only one at a time): larger, in the action orange. */
export const cta = 'inline-flex items-center justify-center gap-2 rounded bg-cta px-4 py-2 text-section font-semibold text-on-cta hover:bg-cta-hover disabled:cursor-not-allowed disabled:opacity-40';
export const primary = 'inline-flex items-center justify-center gap-1.5 rounded bg-ink px-3 py-1.5 text-body font-medium text-on-ink hover:bg-ink-2 disabled:cursor-not-allowed disabled:opacity-40';
export const button = 'inline-flex items-center justify-center gap-1.5 rounded border border-line-2 bg-panel px-3 py-1.5 text-body text-ink hover:bg-sunk disabled:cursor-not-allowed disabled:opacity-40';
export const quiet = 'inline-flex items-center gap-1 text-body text-ink-2 underline decoration-line-2 underline-offset-4 hover:text-ink hover:decoration-ink disabled:opacity-40';
export const section = 'border-t border-line pt-4 mt-4 first:mt-0 first:border-t-0 first:pt-0';
export const sectionTitle = 'text-section font-semibold text-ink';
export const meta = 'text-meta text-ink-3';
export const body = 'text-body text-ink-2';
export const note = 'rounded bg-sunk px-3 py-2 text-body text-ink-2';
export const warnNote = 'rounded bg-warn-wash px-3 py-2 text-body text-warn-ink';
export const okNote = 'rounded bg-ok-wash px-3 py-2 text-body text-ok';
/** A small orange marker on an item still waiting for a decision. */
export const toDecide = 'inline-flex shrink-0 items-center gap-1 text-meta font-medium text-accent-ink';
/** An item in a list the user picks from: a row with a hairline, marked by the accent when it's the one in view. */
export const row = (active: boolean, settled = false) =>
  `block w-full cursor-pointer rounded px-3 py-2.5 text-left text-body ${active ? 'bg-accent-wash outline outline-1 outline-accent' : settled ? 'bg-panel' : 'bg-panel hover:bg-sunk'}`;
/** Icon size used beside body text. */
export const ICON = 15;
