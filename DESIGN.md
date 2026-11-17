---
name: Pathway Simplifier Studio
description: A precise instrument for reading pathway figures; the interface is quiet and exact, and the figures own the screen.
colors:
  paper: "#f3f4f6"
  panel: "#ffffff"
  sunk: "#e9ebee"
  ink: "#14171b"
  ink-2: "#424954"
  ink-3: "#5f6773"
  line: "#d6dadf"
  line-2: "#878e98"
  on-ink: "#ffffff"
  accent: "#e8590c"
  accent-ink: "#b8430a"
  accent-wash: "#fff1e8"
  cta: "#c2410c"
  cta-hover: "#a5370a"
  on-cta: "#ffffff"
  ok: "#2b7a4b"
  ok-wash: "#eaf6ef"
  warn-ink: "#7a4a00"
  warn-wash: "#fdf3d8"
  bad: "#b42318"
typography:
  page:
    fontFamily: "Public Sans Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.4375rem"
    fontWeight: 600
    lineHeight: "1.9rem"
  title:
    fontFamily: "Public Sans Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.1875rem"
    fontWeight: 600
    lineHeight: "1.6rem"
  section:
    fontFamily: "Public Sans Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: "1.4rem"
  body:
    fontFamily: "Public Sans Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.35rem"
  meta:
    fontFamily: "Public Sans Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: "1.1rem"
rounded:
  sm: "3px"
  md: "4px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  button-action:
    backgroundColor: "{colors.cta}"
    textColor: "{colors.on-cta}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    typography: "{typography.section}"
  button-action-hover:
    backgroundColor: "{colors.cta-hover}"
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink}"
    rounded: "{rounded.md}"
    padding: "6px 12px"
  button-primary-hover:
    backgroundColor: "{colors.ink-2}"
  button:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "6px 12px"
  button-hover:
    backgroundColor: "{colors.sunk}"
  row-selected:
    backgroundColor: "{colors.accent-wash}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
  note-warn:
    backgroundColor: "{colors.warn-wash}"
    textColor: "{colors.warn-ink}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
---

# Design system

The values live in `src/index.css`, as named roles defined once for light and once for dark. Components use those role names (`bg-panel`, `text-ink-3`, `border-line`), never raw colours and never `dark:` variants. The shared control styles are in `src/components/ui.ts`.

## Overview
"Precise instrument": the interface is calibrated, quiet and exact, so the two figures (the original and the reconstruction) dominate. Its character comes from type, hairlines and careful number setting, not from decoration. It refuses the generic dashboard: slate cards inside cards, one blue for everything, and symbols standing in for icons.

The drawn figures are content, not interface. Their colours are the authors', or the user's choice in step 5, and the design system never restyles them. Figure panes stay white in both themes, because the figures are drawn on white.

## Colors
- **Restrained:** cool neutral greys plus one accent.
- **Orange means "look here" and "do this next"**, and nothing else; it is never decoration. Pathway figures rarely use orange for their own outlines, so it reads as the interface, not the figure.
  - **Look here (`accent`):** the current step's underline, the selected row, the hover outline on a figure, the item a question is about, "To decide" markers, and focus rings.
  - **Do this next (`cta`, a deeper orange so white text on it is 5.2:1):** the one action button per screen, larger than the rest. It is the next question in Check while questions are open, "Compact the figure" in step 5 before it's laid out, and otherwise Next, Continue or Finish.
- **Ink (`ink`)** is for main actions that aren't the next thing to do, and for the shape selected for editing on a figure.
- **Status colours:** `ok` for done and settled, `warn` for things worth a look, `bad` for destructive actions and errors. Each always comes with words or a drawn icon, never colour alone.
- **Contrast:** every text pair is at least 4.5:1 in both themes (meta text `ink-3`: 5.2:1 on paper in light, 6.8:1 in dark); control borders (`line-2`) are at least 3:1.
- **Dark theme:** the same roles with dark values (paper `#111316`, panel `#191c20`, ink `#eceef1`, accent `#ff7a33`), chosen by the system setting.

## Typography
- **One face:** Public Sans (self-hosted, variable), a workhorse government-standard sans. Product UI needs no display pairing.
- **A fixed rem scale, about 1.2 between steps:** meta 12, body 14, section 16, step title 19, page 23. Nothing in the interface is smaller than 12px.
- **Numbers read like readings.** Counts, measures, dates and zoom levels use tabular figures (the `.num` class).
- **Headings are plain:** no small capitals with letter-spacing, and no kicker labels above headings.

## Layout
- **A run screen** has, top to bottom: a top bar (back, figure name, Original, the change list), the step rail (Check, then steps 1 to 5, with the current step's controls at the right), then the step's panel on the left (380px) beside the two figure panes, which fill the remaining width and height.
- **The side panel reads as a document:** the step's title and one line on what it does, then sections divided by hairlines. Sections have no boxes.
- **Lists of choices** (issues, repeats, clusters, changes) are rows divided by hairlines. The selected row takes the accent wash and a 1px accent outline.

## Elevation & Depth
Flat by default. Only things that float above the page cast a shadow: menus and pop-ups (`0 8px 24px rgb(0 0 0 / 0.14)`). Panels, cards and rows have none.

## Shapes
Small corners (4px, 3px inside a segmented control), 1px hairlines, rounded-full only for status dots and badges.

## Components
- **Buttons:** action (orange, larger, the one next thing to do on the screen); primary (ink-filled, other main actions); button (hairline outline on panel); quiet (underlined text for minor actions such as Undo, Change, Cancel). Icons are drawn (Lucide, 15px beside text), never Unicode glyphs.
- **Step rail:** numbered steps in tabular figures. The current step is in ink and semibold with a 2px accent underline; done steps have a small drawn tick in `ok`; skipped steps say "skipped".
- **Segmented control** (Compact / Tidy as drawn / Redraw as a cell; Add shape / Add arrow): a `sunk` track, with the chosen option raised on `panel`.
- **Notes:** a tinted band with no border (warn, ok, neutral). A coloured side border is never used.
- **Figure overlays:** hover and "about" outlines in the accent, the selected shape and its handles in ink, question pins as numbered accent dots.

## Do's and Don'ts
- **Do** use the role names; add a role in `src/index.css` before reaching for a raw colour.
- **Do** keep the figure the loudest thing on screen.
- **Don't** nest boxes, add coloured side borders, or use emoji or Unicode arrows and ticks as icons.
- **Don't** use orange for anything but "look here" and "do this next", and never show two orange action buttons at once.
- **Do** open with the next thing ready: Check opens its first open question, and step 1 selects its first undecided issue.
- **Don't** restyle the drawn figure as part of interface work.
