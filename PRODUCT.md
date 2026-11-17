# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Researchers who make figures: scientists turning a published pathway figure into a faithful, editable diagram, then simplifying it for a talk, a paper or teaching. They work at a desk, carefully, spending many minutes on one figure, and they check the result against the original as they go.

## Product Purpose
Pathway Simplifier Studio turns a published signalling-pathway figure into an editable diagram and then helps make it simpler. Success is a diagram the researcher trusts as their figure, made clearer: fewer, better-placed parts, with nothing changed that they didn't choose.

## Positioning
Faithful first, then simpler, with scientific rigour. The figure is first copied exactly as drawn and checked beside the original. Simplification, the point of the product, then happens in guided steps. Each step's change is visible, explained in plain words and undoable, and nothing is added from outside knowledge without a cited source.

## Operating Context
- **Input:** a published figure (PNG, JPEG or WebP), read by one model call.
- **Check:** the researcher answers the model's questions and fixes anything misread, side by side with the original.
- **Simplify:** five ordered, skippable steps: Issues, Focus, Repeats, Clusters, Layout. Each shows one canvas, with what the step changes faded or marked, and the original folded beside it.
- **Runs locally:** a single-user web app on the researcher's own machine. The API key stays on the computer.

## Capabilities and Constraints
- **The extraction is never altered.** Every answer, fix or simplification is a change in one list on top of it, shown in plain words and undoable.
- **Nothing is hidden.** Problems, and changes that can no longer apply, are listed, never dropped. What a step leaves out is listed with its reason and can be restored.
- **During extraction and Check, answers come only from what is drawn.** Suggestions from prior knowledge may come later, always labelled with their source.
- **No internal ids on screen.**
- **Undecided:** an editing canvas for final tweaks after the last step (deferred).

## Brand Commitments
- **Name:** Pathway Simplifier Studio.
- **Voice:** plain, short, precise English. No jargon, no hype.

## Evidence on Hand
- **Test figures:** four open-licence figures from *Signal Transduction and Targeted Therapy* (CC BY 4.0), used as test material: Liu 2022 (Wnt), Hu 2021 (JAK-STAT), and Yu 2020 and Guo 2024 (NF-κB).
- **No customers, testimonials or published results exist;** none should be implied.

## Product Principles
1. **The figure is the content.** It owns the colour and the attention, and the interface around it stays quiet and never recolours it.
2. **Faithful, nothing hidden.** Every change is visible, explained and reversible; the original is always one click away.
3. **Simplification is the point, done with rigour.** Each step says what it changed and why, measured where it can be (crossings, arrows behind shapes), and claims only what the figure or a cited source supports.
4. **Plain language.** Short labels and sentences a scientist outside software would read without effort.
