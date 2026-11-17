---
target: the whole app (home, Check, steps 1-5)
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/Users/ash/code/pathway-simplifier-studio/src/components"
timestamp: 2026-11-17T02-43-28Z
slug: src-components
---
⚠️ DEGRADED: single-context (sub-agents not used in this session unless the user asks)

## Design Health Score
| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Step bar, change count and out-of-date notices are clear; inactive steps are faint (3.7:1 in dark) |
| 2 | Match system / real world | 3 | Plain language mostly; "Skip (undo 29)", "[TRADD + cIAP2 + …]" and "Styling on a30" leak system terms and an internal id |
| 3 | User control and freedom | 3 | Undo everywhere, Reset, Back; the change list hides in a dropdown |
| 4 | Consistency and standards | 2 | One blue for every action and state; circled-number glyphs, ✓ marks and chevrons mixed with text buttons |
| 5 | Error prevention | 3 | Out-of-date layout and stale choices are flagged before they mislead |
| 6 | Recognition rather than recall | 3 | Hover outlines on both views; the original is one click away |
| 7 | Flexibility and efficiency | 2 | No keyboard shortcuts (Next, Back, Undo, zoom); everything by pointer |
| 8 | Aesthetic and minimalist design | 2 | Boxes in boxes in the side panel; 11–13px text; flat heading sizes; empty card chrome around the figures |
| 9 | Error recovery | 3 | Problems are listed with reasons and a way back |
| 10 | Help and documentation | 2 | Help lives in small grey lines under the views; no single place explaining a step |
| Total | | 26/40 | Acceptable |

## Design Specificity Verdict
- **Review:** category-interchangeable. Default Tailwind slate and blue-600, rounded-lg bordered cards, system font and a centred single-column home page. Nothing says "scientific figure tool". Swap the content and this could be any admin dashboard. Worse, its blue accent competes with the figures, which use blue heavily themselves, against the principle that the figure owns the colour.
- **Detector (code + 3 live pages):** 19 findings.
  - side-tab border (IssuesStep.tsx:118);
  - nested cards ×3 (step panel);
  - low contrast 3.7:1 (slate-500 on slate-900, dark);
  - 11px body text;
  - 6px cramped padding;
  - flat type hierarchy (advisory: body 14, h3 14, h2 16, h1 18).
  - **False positives:** 7.9px and 12.7px "tiny text" are labels inside the drawn figure (content, not interface).
- **Visual overlays:** not used (no in-page injection in this run).

## Overall Impression
It works and it is honest, but it looks generic and busy. The single biggest opportunity: make the interface recede so the two figures dominate, with one deliberate accent that never clashes with a figure, and a side panel that reads as a document rather than a stack of boxes.

## What's Working
- **The before → after pairing with shared hover outlines** directly serves "faithful, nothing hidden".
- **Plain-language step copy and reasons on every change** ("left out: not on a chosen pathway").
- **The step bar makes the journey legible:** Check, then five numbered steps, with done states.

## Priority Issues
- **[P1] Generic look that competes with the figure**
  - **Why:** an interface that reads as AI-generated undermines trust, and the blue accent fights the figures' own blues.
  - **Fix:** a neutral, ink-based interface; one accent that doesn't appear in typical pathway figures; one deliberate typeface with tabular figures for counts.
  - **Commands:** /impeccable typeset, /impeccable quieter.
- **[P1] Side panel density: boxes in boxes, small text, flat hierarchy**
  - **Why:** the panel is where decisions are made; at 11–13px with five bordered boxes (Layout) it's tiring and hard to scan.
  - **Fix:** flatten into sections separated by space and hairlines; 14px body, 12px minimum for meta text; a real heading scale (about 1.25 steps).
  - **Commands:** /impeccable distill, /impeccable layout.
- **[P2] Step bar: glyph soup and faint inactive steps**
  - **Why:** circled numbers, ✓, chevrons and a blue pill plus a blue Finish button make status noisy; inactive steps fail contrast in dark mode.
  - **Fix:** numbers set in tabular type, the current step marked by weight and an underline, done steps by a quiet tick or text, one primary button.
  - **Commands:** /impeccable typeset, /impeccable clarify.
- **[P2] Figure panes waste room and glare in dark mode**
  - **Why:** bright white cards with large empty margins shrink the figure, and in dark mode two white slabs dominate.
  - **Fix:** remove card chrome, let the canvases fill the height, use a calm neutral surround in dark mode. The figure itself stays as drawn.
  - **Command:** /impeccable layout.
- **[P3] Copy leaks**
  - **Why:** "Styling on a30" breaks the no-internal-ids rule, "Skip (undo 29)" is cryptic, and bracketed cluster names read as code.
  - **Fix:** name items as written ("Dotted arrows"), "Skip this step (removes 29 changes)", "TRADD + cIAP2 + RIP1 + TRAF2/5".
  - **Command:** /impeccable clarify.

## Persona Red Flags
- **First-timer:** lands on a list of runs with "unknown · 0s" metadata and a disabled-looking blue Extract button. On step ① the tab-bordered cards and ✓ "Seen" chips don't say what's left to do.
- **Power user:** no keyboard path through the steps; Next/Back, undo and zoom are pointer-only. The change list is a dropdown rather than a persistent log.
- **A careful researcher (from PRODUCT.md):** wants to compare against the original constantly. The original is a floating window or the left view only in step ①. The side panel's density pushes the "How it reads" numbers below the fold.

## Minor Observations
- **Home:** the title and subtitle are generic; the earlier-runs list has no thumbnails, so runs are found by name only.
- **Mixed button styles:** filled blue, outlined, underlined text and a pill all mean "act".
- **"Before this step" / "After ⑤ Layout":** small uppercase labels with letter-spacing, a common template tell.
- **Colour-meaning warning:** the amber block inside a bordered box inside the panel is a box three levels deep.

## Questions to Consider
- What if the interface were nearly monochrome, and colour appeared only in the figures and in status?
- Does the side panel need boxes at all, or would headings and space do?
- What would this look like if it were printed in a lab notebook?
