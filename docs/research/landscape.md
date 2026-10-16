# Tint: prior-art landscape and architectural directions

_Research only. No repo changes. Oct 14, 2026._

**Premise under study:** a configurable, token-based config that generates contrast-compliant color tokens by role.
**v4 pain points used as the lens:** units differ per kind, labels on mid-tone fills clamp, dark-mode saturated fills sit in a "dead zone" where neither white nor black text passes, and light mode has very little room above the page for raised surfaces.

Verification note: I checked these live during this pass: CSS `contrast-color()` status, DTCG 2025.10 status, and Harmonizer's model. The other entries come from the projects' public docs and source, which are well known and linked below. Re-check exact numbers before quoting them.

---

## 1. Survey

### Adobe Leonardo — https://leonardocolor.io · https://github.com/adobe/leonardo

- **Model:** You give a list of target contrast ratios, such as `[1.1, 1.25, 3, 4.5, 7]`, against one _background color_ that you set with a lightness value. Leonardo then searches along an interpolated color "key color" curve (CAM02/OKLCH/etc.) for the color that hits each ratio. It supports WCAG 2 or APCA (`formula: 'wcag3'`).
- **Roles:** The output is ratio-named swatches (`gray100`…). Mapping them to roles is up to you.
- **Dark mode:** You change the background lightness and the same ratios regenerate, so dark mode is "free" and stays contrast-consistent.
- **Config:** `new Theme({ colors:[new Color({name, colorKeys, ratios})], backgroundColor, lightness, contrast, saturation })`.
- **(a) Text on fills:** Not modeled. Every ratio is measured against the _one_ background, so you have to check fg-on-fill yourself.
- **(b) Dark saturated fills:** A ratio-defined fill at 4.5:1 against a dark background is a light pastel. The dead zone is inherent to the approach.
- **(c) Near-white headroom:** You can ask for ratios below 1 (lighter than the background), but they get crushed near white. This is the same problem tint has.
- **Takeaway:** Tint v3 was essentially Leonardo-shaped. It's strong on bg-relative consistency and weak on pairs other than the background.

### Radix Colors — https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale

- **Model:** Hand-tuned 12-step scales per hue, each with a light and a dark version (plus alpha and P3 variants). Each step has a **fixed role**: 1–2 app/subtle backgrounds, 3–5 component backgrounds (normal/hover/active), 6–8 borders, 9–10 solid fills, 11 low-contrast text, 12 high-contrast text. The guarantees are only "11 and 12 pass on 1–2."
- **Text on fills (a):** This is solved explicitly. Most step-9s take white text, while "bright" scales (sky, mint, lime, yellow, amber) are documented to need dark text. The newer custom palette generator (radix-ui.com/colors/custom) outputs a `contrast` color for step 9.
- **Dark saturated fills (b):** Dark scales are separate, hand-tuned scales, not mirrors. Step 9 stays _the same saturated brand color_ in both modes. Contrast is achieved by flipping the label color, not by moving the fill.
- **Near-white headroom (c):** Light step 1 is about `#fcfcfc` and step 2 about `#f9f9f9`. Raised surfaces are expected to be **white or step 1 with shadow**. Radix Themes uses `--color-panel-solid` = white in light, plus alpha overlays (`a1–a12`) for layering.
- **Strength:** The role semantics people actually use, and it's stable. **Weakness:** It's not generative. The custom generator is heuristic and gives you 12 steps whether you want them or not.

### Material 3 / HCT / material-color-utilities — https://github.com/material-foundation/material-color-utilities · https://m3.material.io/styles/color/system/how-the-system-works

- **Model:** HCT (CAM16 hue + chroma, with L* as "Tone" from 0 to 100). The key property is that **tone difference ≈ WCAG contrast**: ΔT 40 ≥ 3:1 and ΔT 50 ≥ 4.5:1, independent of hue. Tonal palettes have tones 0..100 per hue (primary, secondary, tertiary, neutral, neutral-variant, error).
- **Roles:** These are the most formal of any system. `DynamicScheme` + `MaterialDynamicColors` define each role (`primary`, `onPrimary`, `primaryContainer`, `onPrimaryContainer`, `surface`, `surfaceContainerLowest…Highest`, `outline`, `outlineVariant`…) as `DynamicColor{ palette, tone(scheme), background(scheme), contrastCurve, toneDeltaPair }`. A role declares **its background role and a contrast curve**, and the solver nudges its tone until the ratio holds. `ToneDeltaPair` keeps pairs such as container and primary a set distance apart.
- **Contrast levels:** `contrastLevel` runs from -1 to 1 (standard 0, medium 0.5, high 1). `ContrastCurve(low, normal, medium, high)` interpolates the target ratio for each role.
- **(a) Text on fills:** `onPrimary` has `background = primary` and a curve of about 4.5→7. The tone gets pushed to the far end (often 100 or 0), and the fill tone is chosen so that's achievable (primary is T40 light / T80 dark).
- **(b) Dark saturated fills:** M3 sidesteps the problem. Dark `primary` is **T80, a light pastel with dark text (T20)**. The saturated mid-tones (T40–60) are avoided for labeled fills. Containers are T30 in dark. Brand-exact color is allowed via "fidelity/content" schemes, which shift tones.
- **(c) Near-white headroom:** M3 dropped elevation-by-tint for **surface container roles**. Light `surface` is about T98, containers go _darker_ (T96, 94, 92, 90), and `surfaceContainerLowest` is T100. So in light mode, "raised" = **lower** tone, and elevation comes mostly from shadow. This is the same choice tint was circling.
- **Strength:** A pair-aware solver with formal role graphs and accessibility levels. **Weakness:** Heavyweight, opinionated hues, and "brand color fidelity" is a known complaint.

### Apple HIG semantic colors — https://developer.apple.com/design/human-interface-guidelines/color

- **Model:** Hand-specified semantic roles (`label`, `secondaryLabel`, `tertiaryLabel`, `quaternaryLabel`, `systemBackground`, `secondarySystemBackground`, `systemGroupedBackground`, `separator`, `systemFill…`), each with light, dark, and **increased-contrast** variants. Labels/fills are often **alpha** over the backdrop.
- **(a)** Tinted buttons use white labels on system colors. The system colors are themselves tuned so that works, and the dark variants are brighter.
- **(b)** Dark variants of system colors are _lighter/more luminous_ (for example, systemBlue dark #0A84FF), which keeps white text passing at large sizes.
- **(c)** **Elevated** background variants exist in dark mode only (base vs elevated). Light mode uses white plus shadow.
- **Lesson:** Alpha-based hierarchies plus an explicit "increased contrast" mode is a cheap, robust pattern.

### IBM Carbon — https://carbondesignsystem.com/elements/color/tokens/ · https://carbondesignsystem.com/guidelines/color/overview

- **Model:** 10-step hue ramps (10–100), roughly matched in luminance across hues, plus 4 themes (White, Gray 10, Gray 90, Gray 100). **Layering tokens** (`layer-01/02/03`, `layer-accent`, `field-01..03`, `border-subtle-0x`) alternate per layer. In light mode, layers can alternate white and gray-10 rather than climbing lighter.
- **(a)** `text-on-color` is white over interactive/60 steps. Ramps are tuned so step 60+ passes with white.
- **(c)** Explicitly solved with **alternating layers** (white/gray on light themes), so you never need "lighter than white."
- **Lesson:** Contextual "layer" tokens that are relative to the parent layer, which is exactly what tint's surface `on` needed.

### GitHub Primer Primitives — https://primer.style/foundations/primitives/color · https://github.com/primer/primitives

- **Model:** Base scales plus functional tokens (`fgColor-default/muted/onEmphasis`, `bgColor-accent-emphasis/muted`, `borderColor-default/muted`). Separate _themes_ for light, dark, dark-dimmed, high-contrast, and colorblind variants. Each is authored, then contrast-tested in CI (`contrast` check scripts). Uses DTCG-ish JSON and Style Dictionary.
- **Pattern:** Every role exists as `muted` / `emphasis` (subtle bg + colored text vs solid bg + `onEmphasis` text). `fgColor-onEmphasis` is white in all dark themes, and the emphasis fills are kept dark enough.
- **Lesson:** "muted vs emphasis" is a 2-slot API that covers most fill needs. Contrast is a **test**, not a generator.

### Atlassian Design Tokens — https://atlassian.design/foundations/color-new/ · https://atlassian.design/components/tokens/all-tokens

- **Model:** A grammar of `color.{text|icon|border|background}.{role}.{emphasis}.{state}`, for example `color.background.brand.bold.hovered`, `color.text.inverse`, plus `elevation.surface.{raised|overlay|sunken}`. Built on a hand-tuned 1000–1100 neutral and hue ramp (with **alpha neutrals**).
- **(a)** `bold` backgrounds use `text.inverse`. Warning/yellow bold uses `text.warning.inverse` (dark text). That's an explicit exception token.
- **(c)** Light: `surface` = white, `surface.raised` = white + shadow, `surface.sunken` = darker. Dark: raised/overlay are lighter.
- **Lesson:** The **token-name grammar is the API**. Roles × emphasis × state is a clean, finite matrix.

### Tailwind v4 + shadcn/ui — https://tailwindcss.com/docs/colors · https://ui.shadcn.com/docs/theming

- **Tailwind v4:** The default palette is **OKLCH** 50–950, and `@theme` defines CSS variables. There are no contrast guarantees.
- **shadcn:** Pairs are the core idea: `--background/--foreground`, `--primary/--primary-foreground`, `--card/--card-foreground`, `--muted/--muted-foreground`, `--accent`, `--border`, `--input`, `--ring`. Values are hand-picked OKLCH. Light card = white on a white background, separated by border. Dark card is slightly lighter.
- **Lesson:** The **bg/foreground pair** is the de facto consumer API. Tint could _emit_ this shape.

### Open Props — https://open-props.style/#colors

- Hand-tuned 0–12 (now OKLCH generated `--hue`-driven "oklch" palette) ramps plus `--surface-1..4`, `--text-1..2` adaptive props that flip with `prefers-color-scheme`. There's no solver. It's simple and cheap but has no guarantees.

### Huetone — https://huetone.ardov.me · https://github.com/ardov/huetone

- An editor for a hue × step grid in LCH/OKLCH with APCA/WCAG readouts. You adjust per cell and see contrast against chosen references. It's a **diagnostic tool, not a solver**. The lesson is that equal-L rows across hues produce equal contrast, which validates the "fixed perceptual ramp" idea.

### ColorBox (Lyft) — https://colorbox.io · https://design.lyft.com/re-approaching-color-9e604ba22c88

- Curve-based generation: hue, saturation, and luminosity each follow an easing curve over N steps. Lyft then picked the steps per role and checked contrast. It's good for shaping ramps and has no notion of pairs.

### Reasonable Colors — https://www.reasonable.work/colors/

- 6 shades per hue, with **luminance-locked shade numbers across all hues**. The rule is: **a difference of 2 shades ≥ 3:1, a difference of 3 shades ≥ 4.5:1 (WCAG), any hue.** It's the simplest "contrast by arithmetic" system and the clearest proof that a shared lightness ramp makes pairs predictable.

### Accessible Palette (Eric Matthes / "accessiblepalette.com") — https://accessiblepalette.com

- Generates ramps in CIELAB/OKLCH where each **step has a fixed relative luminance target across hues**. This yields the same Reasonable-Colors-style "steps apart ⇒ ratio" guarantee for your own brand hues.

### APCA tooling — https://github.com/Myndex/apca-w3 · https://github.com/Myndex/SAPC-APCA · https://git.apcacontrast.com/documentation/APCA_in_a_Nutshell

- `APCAcontrast(sRGBtoY(txt), sRGBtoY(bg))` → Lc (signed, polarity-aware). Usage is tied to **font size/weight lookup** (Lc 90 body preferred, 75 min body, 60 content, 45 large/headlines, 30 spot/non-text, 15 invisible-ish threshold). There's also a reverse-solve helper (`reverseAPCA`) to find a color for a target Lc.
- **Relevant fact:** APCA _compresses_ contrast in dark and very light regions and is polarity-sensitive. This is why tint's faint dark-mode steps bottomed out and the mid-tone dead zone looked worse. APCA is still not part of WCAG 3 normatively. WCAG 2.x ratios remain the legal baseline.
- **APCACH** (Evil Martians) — https://github.com/antiflasher/apcach : `apcach(contrast, chroma, hue)` finds a color _by contrast + chroma + hue_ in OKLCH, with a `maxChroma` clamp for gamut. **This is the most direct prior art for "solve the lightness for a role."**

### Evil Martians Harmonizer — https://harmonizer.evilmartians.com · https://github.com/evilmartians/harmonizer

- **Model (verified):** You define levels (columns) by a **contrast target per level** against a configurable background (default white/black). You add hues (rows). Each cell is solved with APCACH so **every hue at a level has identical contrast**, with consistent OKLCH chroma per level (chroma is capped at the gamut minimum across hues, so brand colors can wash out, which is a top user complaint). Contrast direction is configurable, and themes mirror.
- **Lesson:** Level = contrast (not lightness) makes "same level ⇒ same text contrast" true across hues. The cost is brand fidelity, which suggests allowing a pinned brand cell.

### Standards & platform, 2025–2026

- **DTCG Format Module 2025.10 (stable, Oct 28 2025)** — https://www.designtokens.org/TR/2025.10/format/ — JSON tokens with `$type: color`, structured `$value` with `colorSpace` (oklch, display-p3…), aliases, and **resolver/theming module** for light/dark/high-contrast sets. Implemented by Style Dictionary, Tokens Studio, and Terrazzo. → Tint should probably _emit_ DTCG.
- **CSS `contrast-color()`** — https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/color_value/contrast-color — **Baseline 2026 (Apr 2026)**: Chrome/Edge 147, Firefox 146, Safari 26. It returns **only black or white**, the algorithm is UA-defined (WCAG 2 today), and MDN explicitly warns that mid-tones fail with both. That is exactly tint's dead zone, and the platform does not solve it.
- **Relative color syntax** (`oklch(from var(--brand) calc(l - .1) c h)`) is Baseline 2024. It lets tint ship _formulas_ instead of baked hexes for hover/active variants and runtime theming.
- **`light-dark()`** is Baseline 2024. It enables single-declaration theme tokens: `--surface: light-dark(#f5f5f5, #121212)` with `color-scheme`.
- **`@property` / `color-mix()`** are widely available. `color-mix(in oklch, …)` gives you alpha-like overlays without alpha.

---

## 2. Cross-cutting answers to tint's three hard problems

**(a) Text on colored fills.** Every robust system does one of the following:

1. Constrains the **fill** so that the label is achievable (M3: the fill tone is chosen relative to the label; Carbon/Primer: emphasis fills are dark enough for white).
2. **Flips label polarity** per hue (Radix bright scales, Atlassian `warning.inverse`, `contrast-color()`).

Nobody gives a free label scale on an arbitrary fill. The reachable range on a fill is tiny (on a mid-tone fill, the max is about 4.5:1), so a 0–10 label scale there is not meaningful. **The fill and its `on` are one decision.**

**(b) Dark-mode saturated fills.** There are three strategies:

1. Pastel fill with dark label (M3 T80/T20).
2. Keep the brand fill and use a white label, accepting large-text contrast or darkening the fill (Radix step 9, Apple's brighter system colors with white).
3. A darker, saturated fill with a white label (Primer, Atlassian bold).

All three **avoid the L≈0.55–0.7 band for labeled fills**. That band is the mathematically dead zone where max(white, black) < 4.5:1.

**(c) Near-white headroom.** Nobody climbs lighter above a near-white page in light mode:

- Light page = white and cards = white + border/shadow (shadcn, Atlassian, Apple).
- **Or** page slightly gray with cards white (Carbon gray-10, Radix panel).
- **Or** "raised = darker container" (M3 surface containers).

Elevation-by-lightness is a **dark-mode-only** idea in essentially every system.

---

## 3. Architectural directions for tint

### Direction A — Tone ramp first, then role mapping plus a pair solver (M3/Radix-style)

Generate a fixed perceptual ramp per palette (for example, OKLCH L or HCT tone 0–100, per hue, with a chroma curve). Roles are **references into the ramp** with a declared background role and contrast target. A solver nudges the tone only when a declared pair fails.

```ts
palettes: { neutral: { hue: 250, chroma: .01 }, brand: '#6d4aff' },
roles: {
  page:        { palette: 'neutral', tone: { light: 98, dark: 10 } },
  card:        { palette: 'neutral', tone: { light: 100, dark: 14 } },
  text:        { palette: 'neutral', on: 'page', contrast: 'body' },   // solver picks tone
  action:      { palette: 'brand',   tone: { light: 40, dark: 80 } },
  'action-on': { on: 'action', contrast: 'body' },                     // solver: white/black/tone
},
contrastLevel: 0, // -1..1 like M3
```

- **Pro:** One unit (tone), so it's predictable. Ramps can also be exported as Tailwind-style scales. Pair correctness is explicit, and M3 proves it at scale.
- **Con:** Tone ≠ APCA, so you'd need a WCAG/APCA check layer. Brand fidelity needs a "pin" escape hatch.

### Direction B — Pair-first constraint solving (Leonardo/APCACH, generalized)

Each token is defined _only_ by constraints relative to other tokens: `contrast(on: X) ≥ k`, `delta-from(X) ≈ d`, `hue/chroma from palette`, and `same-as/near(X)`. A small solver (with topological order, then iterative repair) finds colors that satisfy the graph, and it reports **unsatisfiable** constraints instead of silently clamping.

```ts
tokens: {
  page:   { color: 'neutral', lightness: { light: .97, dark: .18 } },
  card:   { color: 'neutral', on: 'page', distinct: 'subtle' },        // auto picks lighter/darker by headroom
  text:   { on: ['page','card'], min: { wcag: 4.5, apca: 75 } },        // must pass on BOTH
  action: { color: 'brand', fillFor: 'action-on' },                     // fill constrained so label is reachable
  'action-on': { on: 'action', min: { wcag: 4.5 } },
}
```

- **Pro:** Directly encodes the premise ("contrast compliant by role"). Multi-background tokens and the fill↔label coupling are first-class. Infeasibility is reported, never hidden, which fixes v4's clamping confusion.
- **Con:** It's the hardest to make _predictable_, since small config edits can move things non-locally. Debugging requires good tooling. Designers think in lightness, not constraints.

### Direction C — Per-role recipes on a fixed perceptual ramp (Reasonable Colors/Harmonizer-style)

Pick **one shared lightness or contrast ramp** (say 13 steps, luminance-locked across hues so "N steps apart ⇒ ≥ ratio" holds for every hue). Roles are **recipes** that pick steps by rule: `text = page + 9`, `border.subtle = page ± 2`, `fill = step 9 with label flip`. Light/dark is the ramp mirrored with an offset. Config mostly picks palettes and a few knobs.

```ts
ramp: { steps: 13, space: 'oklch', lockLuminance: true },
palettes: { neutral: 'slate', brand: { hue: 275, pin: '#6d4aff' } },
recipe: 'default',          // or 'compact' | 'high-contrast'
overrides: { 'surface.raised': { light: 'white', dark: '+1' } },
```

- **Pro:** It's the most stable and explainable, and contrast holds by construction ("3 steps ⇒ 4.5:1"). Hover is +1, the units are uniform, and the output ships easily as CSS vars with `light-dark()`.
- **Con:** It's less configurable per token. Brand colors must snap to a step (or be pinned and flagged). Fine hairlines need sub-steps or alpha.

### Direction D — Hybrid: ramp + recipes for 90%, constraint checker/solver for pairs

Use C's ramp and recipes as the default generator. Every role **declares its backdrops**, and a pair checker (WCAG 2 baseline, with APCA reported alongside) validates them. Only _pair_ tokens (`on-*`, labels on fills) are solved: pick polarity first, then the step, and if neither passes, move the **fill** along the ramp per a policy (`'darken' | 'pastel' | 'keep+warn'`). Non-text "decorative" tokens are recipes with no checks.

```ts
palettes: { neutral: { hue: 250 }, brand: '#6d4aff' },
modes: { light: { page: 97 }, dark: { page: 18 } },
roles: {
  surface: { sunken: -1, raised: { light: 'white', dark: +1 } },
  text:    { muted: 'secondary', DEFAULT: 'body' },        // named contrast levels, not numbers
  action:  { color: 'brand', fillPolicy: 'keep-brand-then-darken', label: 'auto' },
  border:  { subtle: 'hairline', DEFAULT: 'ui' },          // hairline = non-text, unchecked
},
contrast: { standard: 'wcag2', report: ['apca'], level: 'AA' },
output: ['css', 'dtcg', 'tailwind'],
```

- **Pro:** It keeps v4's good ideas (a theme lightness anchor, signed surface steps in dark, unchecked decorative tokens) while removing per-kind units. It makes fill/label coupling explicit and solves the dead zone through **fill policy**, not label clamping.
- **Con:** It has two mental models (recipe vs solved), and policy names need careful design.

---

## 4. Recommendation

Prototype **D** and **A** side by side, each as a thin engine plus the single-card playground, and skip pure B as a product API. Possibly use B internally as D's pair solver.

- **D first.** It maps most directly onto what Skyler already likes (a lightness anchor, signed steps), and it fixes all three failures structurally:
  - one ramp ⇒ one unit;
  - fill-policy ⇒ no dead zone;
  - light-mode raised = white/darker by rule.
- **A second.** M3's `DynamicColor{background, contrastCurve, toneDeltaPair}` is the best-proven formalization of "role + backdrop + contrast target" and also gives a `contrastLevel` knob for free. It's a useful check on whether tint wants to _be_ that.
- **C** is the fallback if D's solved layer still feels unstable. It's the most boring option, and the most likely to ship.
- In all of these, **emit shadcn-style bg/fg pairs + DTCG 2025.10 JSON + CSS with `light-dark()`**. Treat `contrast-color()` as a runtime fallback only, since it's black/white and WCAG-only. Use WCAG 2 as the compliance gate and report APCA alongside, so APCA's compression no longer shapes the scales.

Concrete experiments for the prototypes:

1. Compute the dead-zone band for WCAG 4.5 (and APCA Lc 75) in OKLCH L per hue, and make fill policies avoid it.
2. Test luminance-locked ramps across 6 palettes to confirm "Δsteps ⇒ ratio".
3. Run light page 97/98/100 with a white raised surface + border vs M3-style darker containers, and compare screenshots.

## 5. Source links

Leonardo https://leonardocolor.io , https://github.com/adobe/leonardo · Radix https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale , https://www.radix-ui.com/colors/custom · M3 https://m3.material.io/styles/color/system/how-the-system-works , https://github.com/material-foundation/material-color-utilities , https://material.io/blog/science-of-color-design · Apple https://developer.apple.com/design/human-interface-guidelines/color · Carbon https://carbondesignsystem.com/elements/color/tokens/ · Primer https://primer.style/foundations/primitives/color , https://github.com/primer/primitives · Atlassian https://atlassian.design/foundations/color-new/ · Tailwind https://tailwindcss.com/docs/colors · shadcn https://ui.shadcn.com/docs/theming · Open Props https://open-props.style · Huetone https://github.com/ardov/huetone · ColorBox https://colorbox.io , https://design.lyft.com/re-approaching-color-9e604ba22c88 · Reasonable Colors https://www.reasonable.work/colors/ · Accessible Palette https://accessiblepalette.com · APCA https://github.com/Myndex/apca-w3 , https://git.apcacontrast.com/documentation/APCA_in_a_Nutshell · APCACH https://github.com/antiflasher/apcach · Harmonizer https://github.com/evilmartians/harmonizer · DTCG https://www.designtokens.org/TR/2025.10/format/ · contrast-color() https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/color_value/contrast-color , https://web-platform-dx.github.io/web-features-explorer/features/contrast-color/ · light-dark() https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/light-dark · Relative colors https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_colors/Relative_colors
