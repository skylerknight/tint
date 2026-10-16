# tint v5 — Milestone 1: Engine (no public API)

**Premise:** a config generates contrast-compliant color tokens by role.
**Branch:** `v5` off `v4` (skylerknight/tint). Reuse CLI, CSS/Tailwind outputs, build, CI and the `on`-pair concept. Rewrite engine + API.
**Inputs:** `landscape.md`, `retrospective.md`, `pair-solver.md`.
**Exit criteria:** the invariant suite is green in CI, and the HTML card renders all 5 palettes × light/dark from engine output with zero red reports (or every red is explained).

## Out of scope

Public config API (M2 compares 2–3 shapes against this engine), presets, publishing, high-contrast themes, a states API beyond the fixtures.

## Tasks (one PR each)

| ID     | Goal                                                           | Acceptance criteria                                                                                                                                                                                                                                                                                                                                                 | Deps   |
| ------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| **T0** | Branch + scaffold                                              | `v5` created from `v4`; old engine/API moved out of the build path (not deleted from history); new `packages/tint/src/engine/` stub; CI green.                                                                                                                                                                                                                      | —      |
| **T1** | Color math module                                              | OKLCH↔sRGB, gamut check/map (lower chroma only), WCAG 2 ratio, APCA Lc, luminance↔L solve. Unit tests against reference values.                                                                                                                                                                                                                                     | T0     |
| **T2** | Internal role model + fixtures                                 | Typed internal shape: role → palette (hue/chroma source), backdrop(s), min contrast, kind (`text`/`ui`/`decorative`/`exempt`), optional preference. A fixture theme (page, card, nested card, text body/muted, border, divider, input, placeholder, focus, primary/secondary/disabled button + label, hover). Pair graph validates (no cycles, unknown refs error). | T1     |
| **T3** | Invariant test suite (written before the solver; expected red) | Property tests over fixtures × 5 palettes × light/dark × random seeds: every declared pair meets its gate (WCAG 2; APCA recorded); surface and text ordering hold; minimum ΔL/ΔE between adjacent steps; any value ≠ preference has a report entry (no silent clamps); identical output across runs; all output in sRGB gamut.                                      | T2     |
| **T4** | Solver: surfaces + text on surfaces                            | Pick luminance per pair in dependency order; preferences move only when needed; reports at `red` (fail), `amber-adjust` (preference moved), `amber-short` (chroma lowered for gamut). Palette chroma kept by default. Surface/text invariants pass.                                                                                                                 | T3     |
| **T5** | Solver: fills + labels                                         | Label chooses black/white polarity by headroom **before** the fill moves; fill searched only if neither passes; fill also clears its backdrop (3:1 ui). Bright yellow/green keep a dark label instead of being darkened. Hover/disabled fixtures covered (disabled = `exempt`).                                                                                     | T4     |
| **T6** | Decorative + exempt kinds                                      | Decorative = signed lightness steps from its backdrop, no gate, distinctness only; exempt reported, never failing. All invariants green.                                                                                                                                                                                                                            | T4     |
| **T7** | Report + JSON output                                           | Engine returns `{tokens, pairs[{fg,bg,wcag,apca,pass}], reports[]}`; stable sorted JSON snapshot test; wired into the existing CSS/Tailwind emitters behind an internal entry point.                                                                                                                                                                                | T5, T6 |
| **T8** | HTML card playground                                           | One self-contained HTML file generated by a script from engine output (no framework, no live editor): one card, palette radios (neutral/brand/success/warning/error), light/dark toggle, token table with pair contrast, reports in red/amber. Committed artifact plus CI step regenerating it.                                                                     | T7     |
| **T9** | Hardening pass                                                 | Fuzz pins (extreme hue/chroma/lightness); doc `docs/v5-engine.md` (model, kinds, reports, known limits). CI green.                                                                                                                                                                                                                                                  | T8     |

T5 and T6 can run in parallel after T4.

## Decision points for Skyler (after T8, with real colors on screen)

1. **Brand vs compliance:** when a pin can't carry a compliant label, does the exact brand color win (report red) or does compliance win (move the fill, report amber)?
2. **Light-mode elevation:** white cards on a gray page, borders/shadows on a white page, or containers that darken as they rise?
3. **Default chroma look:** full palette chroma everywhere (gamut the only limit) vs calmer near-neutral surfaces/text by default, with an opt-out per role.

The answers feed M2 (API shape comparison).
