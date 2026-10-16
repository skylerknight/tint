# tint — Retrospective, Requirements, Invariants, Open Questions

_Research only. No repo changes. Written Wed Oct 14, 2026 (PT). Sources: `main` (v3), `v4` docs/v4-spec.md, PRs #18, #19, #21, #22 (descriptions), the chat history with Skyler._

**Premise (Skyler):** a configurable, token-based config that generates contrast-compliant color tokens based on role. Everything else is open.

---

## 1. Retrospective

### v3 (`main`, Deno + Adobe Leonardo + chroma-js, Tailwind 4 plugin)

- **What it did:** per theme: a `lightness` (85 light / 20 dark), a `colors` map whose first entry is the background, and tokens as numbers that Leonardo reads as _contrast ratios against that background_ (negative numbers = Leonardo's lighter/darker convention, e.g. `surface.default: -1.15`, `on.action: -2`). Output was Tailwind utilities plus `data-theme`.
- **Worked:** one unit (contrast ratio) for everything; one obvious backdrop; small config; Tailwind integration; good enough in production.
- **Failed / root causes:**
  - Every token is measured against **one** background, so `on.action` is not actually checked against `action`. Pairs were implied by naming, not modeled. → no real compliance guarantee for fg-on-fill.
  - Raw ratios in config, with sign tricks for direction: compact but cryptic, and they need retuning per theme (light and dark configs repeat each token with different numbers).
  - No states model, no palette re-skinning, light and dark hand-written separately.
  - Leonardo dependency limits control of the solver (gamut, hue, chroma).

### v4 spec (`v4` branch, `docs/v4-spec.md`, m1/* milestone branches)

- **What it tried:** kinds (`surface/text/border/emphasis`) × levels 1–5 with names, separate `state`s, an `on` backdrop graph, APCA or WCAG2, contrast `level` for high-contrast themes, palette re-skinning through `tint-<name>` classes, `tune`/`exact` overrides, auto-nudge, diagnostics with repair fixes, CSS/Tailwind/DTCG/flat outputs, a CLI.
- **Worked (keep):** the `on` graph (real pairs); "guaranteed pairs" principle; palette-agnostic template; plain-data config; deterministic output; diagnostics that carry paths and fixes; multiple outputs; per-palette `tune`; OKLCH plus gamut module.
- **Failed / root causes:** the spec got big (levels, names, states, presets, nudge) before the core math was proven. Levels 1–5 were too coarse, and naming per kind made the surface area large. Emphasis 1–2 being "tints" while 3–5 are solids put **two regimes behind one scale**, which is the seed of every later problem.

### PR #18 `proto/numeric-scale`: numbers instead of names

- **Tried:** `surface(n)`, `text(n)`, `border(n)`, `emphasis(n)`, decimals allowed, no states (hover is just another number).
- **Worked:** numbers felt better to tune by feel; dropping `state` simplified things.
- **Failed:** units differ by kind (surface/emphasis = lightness steps, text/border = contrast ladders). Solid actions landed at `emphasis(15–18)`; dark solids too dim, so `action.on` was unreachable (~Lc 65 vs 75). **Root cause:** a lightness step can't express "a fill that supports a label", because the needed L is very different on light vs dark pages.

### PR #19 `proto/numeric-scale-hybrid`

- **Tried:** emphasis 1–2 = tint steps, 3–5 = contrast ladder, lerp across 2–3.
- **Worked:** solids clear body text; continuous scale; the analysis that neither one lightness curve nor one contrast number works for fills (APCA's mid-tone dead zone).
- **Failed:** a hidden mode switch inside one number; hard to reason about, still mixed units.

### PR #21 `proto/scale-0-10`

- **Tried:** one 0–10 contrast scale for all kinds; soft fills and disabled.
- **Worked:** one mental model for the contrast kinds; `disabled.*` wrapper idea.
- **Failed:** soft fills/surfaces don't belong on a contrast scale (contrast of a near-page tint is flat and noisy under APCA).

### PR #22 `proto/unified` (paused)

- **Tried:** surfaces as signed lightness steps from theme lightness (97/18); `surface.DEFAULT` editable and painting the page; emphasis re-ranged so 0 = first fill clearing 3:1; `disabled.*`; `decorative` reworked 3+ times (wrapper with warnings off → faint contrast scale → presets → single lightness kind `decorative(n)`, 0.04/step); live editor then removed; one-card playground; warnings 62 → 6; surfaces clamp at white with `surface-no-headroom`; `on` for surfaces.
- **Worked:** clamp-not-fold ordering; surface `on` for nesting; `decorative(n)` gets real hairlines (~1.2:1) in both modes; minimal playground; loud diagnostics; 600+ tests.
- **Failed, symptom → root cause:**
  | Symptom                                                                                 | Root cause                                                                                                                                                                                                                              |
  | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Mixed units per kind (0.02/0.03/0.04 L steps vs Lc ladders), `n` means different things | No single definition of a "step". Each kind was invented on its own.                                                                                                                                                                    |
  | `text(n)` on mid-tone fills does nothing (all clamp to #fff)                            | Fill and label are solved **independently**: the fill is picked first, then the label is asked for a target the fill makes impossible. The pair should be solved together (or the fill bounded by its label's needs).                   |
  | Dark emphasis dead zone (2–4) and pastel fills                                          | Dark emphasis maps "higher n = lighter". Mid-L fills sit in APCA's dead zone where neither white nor black text reaches body contrast; polarity of the label is fixed instead of chosen.                                                |
  | Light headroom: raised clamps to white at 97                                            | Surfaces step in absolute L from an anchor near the top of the range, so there's no room. Steps should be fit to the available range, or elevation expressed differently (e.g. light mode raises with white plus shadow, sinks darker). |
  | Decorative redesigned repeatedly                                                        | Its purpose (non-essential, exempt from contrast) was never defined first; it was derived from contrast kinds, whose low end APCA flattens.                                                                                             |
  | emphasis 3 and 5 collapse in light mode                                                 | Ladder targets plus gamut/clamping are not checked for monotonicity or distinctness.                                                                                                                                                    |
  | False "unreached label" warnings                                                        | Validation recomputes contrast with a different method/rounding from the solver. There's no single source of truth for the measurement.                                                                                                 |
  | Theme lightness vs `surface.DEFAULT` confusion                                          | Two knobs control "the page": the anchor (theme lightness) and the token. Unclear which one is the base that others are relative to.                                                                                                    |
  | Saturated seed tints the neutral page                                                   | Neutral derived from seed hue/chroma without a chroma cap.                                                                                                                                                                              |
  | Engine's reported page doesn't follow `surface.DEFAULT`                                 | Same two-knob problem, duplicated state.                                                                                                                                                                                                |
- **Meta root cause:** iteration happened by patching the API in front of a solver whose math constraints (APCA nonlinearity, gamut edges, polarity) weren't written down first. Each fix added an exception. There was no invariant test suite (ordering, distinctness, pair compliance) to catch regressions.

---

## 2. Requirements (from Skyler's asks in the history)

### Must-have

1. **Roles, not colors:** tokens named by role (surface/page, text levels, border, action, soft, input, card, divider, focus, icon, placeholder…), and the user picks the role names.
2. **Declared fg/bg pairs:** an `on` relation; every text/icon/label token is checked against each backdrop it's declared on, including that backdrop's states.
3. **Contrast compliance by default,** with a chosen standard (WCAG 2 ratios at least; APCA optional), and failures surfaced loudly.
4. **States:** hover, pressed/active, focus ring, disabled (disabled may opt out of compliance explicitly).
5. **Light and dark** from one template, with no duplicated per-theme numbers. A per-theme base lightness knob that stays (Skyler: "theme lightness should not go away").
6. **The page surface is a normal editable token** (Skyler: surface(0) = theme lightness; DEFAULT can be any step and the page follows it).
7. **Surfaces:** sunken/default/raised and nesting (card on card), ordered.
8. **Palettes:** several seed colors (neutral, brand, info, success, warning, error), same token shape for each, swappable by class.
9. **Non-essential/decorative colors** (hairline borders, dividers, ornaments, placeholder, icons) that can go well below 3:1 and are independent of border, with a wide range. Must work in dark mode.
10. **Every adjustable value visibly changes the result** (Skyler's action-on complaint).
11. **Consistent, predictable mental model**: "positive = lighter/more" must hold; no hidden regime switches.
12. **Outputs:** CSS variables plus Tailwind 4 integration.
13. **Simple:** a small config, and a plain playground (no live editor).

### Nice-to-have

- APCA alongside WCAG 2; high-contrast themes from a contrast level.
- DTCG / flat JSON outputs, CLI (`build`, `check`, `explain`).
- Per-palette overrides (`tune`), an exact brand-color snap.
- Raw expert escape hatches (exact ratio/Lc/color).
- Presets (shadcn, Radix, …), auto-nudge, repair suggestions.
- Alpha for decorative only.

---

## 3. Core invariants a good design must guarantee

1. **Pair compliance:** every declared fg/bg pair (including backdrop states) meets its target, or the build fails / errors loudly. Opt-outs (decorative, disabled) are explicit per token.
2. **One measurement:** the solver and the validator use the same contrast function and rounding. No false positives or negatives.
3. **Monotonic ordering:** surfaces sunken < default < raised in the mode's direction; text muted < body < strong in contrast; emphasis steps ordered. No folding or crossing.
4. **Distinctness:** adjacent declared steps differ by a minimum perceptible ΔE / ΔL (or warn naming both tokens). No collapses like emphasis 3 = 5.
5. **Reachability before acceptance:** a fill is never emitted with a label target it makes impossible. Either solve fill and label together, or constrain the fill range by the label requirement, and choose the label polarity (light/dark) by available headroom.
6. **Uniform units:** one number means one kind of thing across kinds (or the kinds are visibly different APIs). Every step maps to a defined, documented quantity.
7. **Headroom-aware scales:** steps fit the available range between the anchor and white/black. They never clamp silently.
8. **Single source of truth for the page:** exactly one definition of the base; everything else references it. Reported page = painted page.
9. **Palette symmetry:** every palette produces the same token set and passes the same checks; neutral stays neutral (chroma cap).
10. **Mode symmetry:** the same config step looks perceptually comparable in light and dark.
11. **Determinism:** same config → byte-identical output.
12. **In-gamut output** (sRGB at least) with gamut mapping that preserves the invariants above.

---

## 4. Open questions only Skyler can answer

1. **Standard:** WCAG 2 ratios (legal baseline), APCA, or both with one as the gate? Which levels (AA body 4.5, large/UI 3)?
2. **Unit of intent:** should users express tokens as contrast targets, as perceptual lightness, as named roles with no numbers at all, or by picking from a generated ramp (Radix-style 12 steps with fixed role meanings)?
3. **Generated ramps vs per-token solving:** would a fixed palette ramp per color plus a role map (like Radix/Material) be acceptable, or must each token be solved individually?
4. **Brand fidelity vs compliance:** when an exact brand color can't carry a compliant label, which wins: shift the fill, flip the label, or error?
5. **Elevation model in light mode:** should raised surfaces be lighter (limited headroom) or use white plus borders/shadow, with sunken being darker?
6. **Theme lightness:** is it the page itself, or an anchor that the page token can move away from? (The history shows both views.)
7. **Decorative:** fully exempt and unchecked, or a minimum floor (e.g. never invisible: ≥1.05:1)?
8. **Disabled:** exempt from contrast, or a reduced target?
9. **Scope:** a Tailwind plugin, a framework-agnostic generator, or both? Is runtime theming (in-browser) needed or only build time?
10. **v3 compatibility:** must v3 configs migrate, or is a clean break fine?
11. **High contrast / more themes** beyond light and dark: required for v1 of the new design?
12. **Hue behavior:** should text/surfaces carry a tint of the palette hue, and how much?

---

_Note: the research brief also mentions surveying existing tools (Leonardo, Radix Colors, Material HCT, Primer, Polaris, Huetone, etc.). This document covers the tint history only; the external survey isn't included here._
