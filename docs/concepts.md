# Concepts

**v3.** This page describes the v3 config (`lc`, `ls`, `$on`). Version 4.0.0-alpha.0
replaces that config. See the [package README](../packages/tint/README.md), the
[v4 spec](v4-spec.md), and the [migration guide](migration-v4.md).

This page is the mental model behind a tint config. The
[package README](../packages/tint/README.md) has the reference tables; this page explains
why the pieces fit together the way they do.

## One sentence

A tint config is a **graph of contrast requirements**. Nodes are tokens, edges are `$on`,
and each node's color is solved from its parent's color plus a single number: a contrast
target (`lc`) or a lightness step (`ls`). Seeds supply hue and chroma; the mode supplies
the direction.

## The pieces

```
Config
 ├─ colors   base, brand, error, …           one palette per color, same structure
 ├─ tokens   group → variant → { lc | ls }   the structure
 ├─ mode     light | dark                   baseline + direction
 └─ overrides color → group → variant       per-palette tweaks
```

### Seeds supply hue and chroma, never lightness

`brand: "#7c3aed"` is converted to OKLCH (`L 0.54, C 0.25, H 293`). Only `C` and `H`
survive into generated tokens. Every token's `L` is computed: solved for `lc`, stepped
for `ls`. This is why a dark theme does not need "dark versions" of the brand color; it
needs the same hue and chroma with lightness solved in the other direction. (You may
still want a different seed per mode, as the playground does, for a lighter purple in
dark mode. That is taste, not necessity.)

### The mode baseline

Light mode measures foundations against pure white; dark mode against pure black. The
baseline is not a token you can see; the first visible surface is `offset` away from it
(0.015 in light, 0.15 in dark by default). The gap is deliberate: pure white as the page
background is harsh and leaves no room for a "well" surface below the default.

```
light mode                         dark mode

L 1.00  white  (baseline)          L 0.00  black  (baseline)
L 0.985 surface  ls 0  (offset)    L 0.15  surface  ls 0  (offset)
L 0.965 surface  ls 1              L 0.17  surface  ls 1
L 0.945 surface  ls 2              L 0.19  surface  ls 2
   …  each ls step = scale (0.02)     …
```

## The dependency graph

Take the playground's token set:

```ts
surface: { well: {ls:0}, DEFAULT: {ls:1}, raised: {ls:2, $reference:true}, highlight: {ls:4} }
text:    { $on: "surface", heading: {lc:90}, body: {lc:75}, muted: {lc:50} }
border:  { $on: "surface", $decorative: true, DEFAULT: {lc:25}, subtle: {ls:3} }
action:  { $on: "surface", DEFAULT: {lc:60, $reference:true}, hover: {lc:68}, soft: {ls:3} }
on:      { action: {lc:60, $on:"action"}, "action-soft": {lc:75, $on:"action.soft"} }
ring:    { $on: "surface", DEFAULT: {lc:65} }
```

Resolved, it is this graph (arrows point from a token to what it is measured against):

```
                       mode baseline (white / black)
                                  ▲
            ┌──────────┬──────────┼──────────┬──────────┐
       surface.well  surface   surface.raised  surface.highlight
         ls 0         ls 1       ls 2 (ref)      ls 4
                                  ▲
       ┌──────────┬───────────┬───┴───────┬─────────────┬──────────┐
  text.heading  text.body  text.muted  border      border.subtle  ring
    lc 90        lc 75      lc 50      lc 25         ls 3        lc 65
                                  ▲
                    ┌─────────────┼─────────────┐
               action (ref)  action.hover   action.soft
                 lc 60         lc 68          ls 3
                   ▲                            ▲
               on.action                  on.action-soft
                 lc 60                        lc 75
```

Observations:

- `$on: "surface"` means `surface.raised`, the reference. Text is solved against the card
  background, not the page. Put text on `surface.well` and it still passes, because
  `well` is lighter than `raised` in light mode and darker in dark mode (more contrast,
  not less). Designing the reference as the *least contrasting surface text will sit on*
  is the whole trick.
- `on.action` is two levels deep. Its color depends on `action.DEFAULT`, which depends on
  `surface.raised`. tint evaluates in topological order so parents exist before children.
- `border.subtle` is an `ls` token with a reference: three steps from `surface.raised`.
  Its APCA contrast is irrelevant; it only needs to be visibly different.
- `on.action-soft` targets a specific variant with `$on: "action.soft"`, bypassing the
  group reference.

Validation rejects cycles (`a.b -> c.d -> a.b`), unknown targets and self-references
before any color is computed.

## How a single `lc` token is solved

```
 reference color R (already generated)
          │
          ▼
  choose polarity: which of black / white scores higher APCA against R?
  ($invert flips it; foundations use the mode's fixed direction)
          │
          ▼
  working seed W = seed with chroma × $chroma, gamut-mapped
          │
          ▼
  bisect OKLCH L between R.L and the far extreme (0 or 1),
  keeping W's hue and chroma, gamut-mapping each sample,
  until |Lc| lands in [target, target + 0.25]
          │
     reached? ──no──► try the other polarity (unless $invert) ──► keep the better one
          │                                                         + contrast-unreachable
         yes
          ▼
  token { hex, rgb, oklch, lc: achieved, target }
```

Within one polarity, APCA is monotonic in OKLCH lightness for a fixed hue and chroma,
so bisection is exact and fast (at most 60 iterations, usually far fewer). Gamut mapping
happens inside the loop, so the final color is always a real sRGB color whose contrast
was actually measured, not predicted.

## How a single `ls` token is computed

```
 anchor L = reference.L            (with $on)
          = 1 - offset | offset    (foundation, light | dark)

 L = anchor - ls × scale  (light)   or   anchor + ls × scale  (dark)
 C = min(seed C × $chroma, ceiling(ls))     ceiling: 0.02 @0, 0.05 ≤3, 0.08 ≤7, 0.12 >7
 H = seed H
 color = gamut-map(L, C, H)
```

`ls` steps are the same visual distance in every palette because OKLCH L is perceptually
uniform. The chroma ceiling keeps a `brand` surface a *tinted* neutral rather than a
pastel; by `ls: 8` and beyond it is allowed to be noticeably colored (think selection
highlights).

## Light and dark from one config

Nothing in the token structure says "dark text" or "light surface". Direction comes from:

| Token kind              | Light mode                     | Dark mode                      |
| ----------------------- | ------------------------------ | ------------------------------ |
| foundation `ls`         | steps down from `1 - offset`   | steps up from `offset`         |
| foundation `lc`         | darker than white              | lighter than black             |
| referenced `ls`         | `L - ls × scale`               | `L + ls × scale`               |
| referenced `lc`         | whichever side of R reaches more, same rule in both modes |         |

The last row is the interesting one. `on.action` on a Lc 60 fill: in light mode the
fill is mid-dark (`#777777`) and white wins, so the label is light (`#e6e6e6`). In dark
mode the fill is mid-light (`#b2b2b6`) and black wins, so the label is dark (`#1d1d20`).
Same token, same number, opposite result, both correct.

## Why `$reference` matters

`$on: "group"` resolves to the group's reference variant, chosen as: explicit
`$reference`, else the variant named `DEFAULT`, else the highest non-pure value, else the
first variant. "Highest" is right for surfaces without a `DEFAULT` (the strongest surface
is the hardest case for text); `DEFAULT` wins for groups like `action` where `hover` is
higher than the resting state. Mark a variant `$reference: true` whenever the automatic
choice is not the one other groups should contrast against.

## Decorative and roles

`$decorative` is a promise to the linter: this token is not a foreground element, do
not lint its contrast. Borders, dividers, disabled fills. The color is still solved
exactly as requested.

`$role` is the opposite promise: this group *is* text/icon/action/status/border, so warn
if a target is below the minimum for that role. `surface` is a valid role with no
minimum; it documents intent and nothing else.

## Palettes are interchangeable by construction

Because every color runs through the same graph, `error.on.action` is to
`error.action` exactly what `brand.on.action` is to `brand.action`. The Tailwind
integration exploits this: unprefixed `--color-action` points at the default palette, and
`tint-error` re-points every unprefixed variable at the error palette. No component
knows which palette it is in.

```
<div class="tint-error">          --color-action → var(--error-action)
  <button class="bg-action">      bg: var(--color-action)  ⇒ #dc2526
```

## Vocabulary

| Term                | Meaning                                                                 |
| ------------------- | ----------------------------------------------------------------------- |
| seed                | A color in `colors`. Supplies hue and chroma.                           |
| palette             | All tokens generated for one seed.                                      |
| group               | A key in `tokens` (`surface`, `text`). Has `$` settings and variants.   |
| variant             | A token within a group (`heading`, `DEFAULT`).                          |
| foundation          | A variant with no effective `$on`. Measured against the mode baseline.  |
| reference (variant) | The variant a `$on: "group"` points to.                                 |
| reference (color)   | The already-generated color a token is solved against.                  |
| polarity            | Whether the token is lighter or darker than its reference.              |
| Lc                  | APCA lightness contrast, 0..~108.                                       |
| `ls`                | Lightness steps; one step is `scale` in OKLCH L.                        |
| offset              | Distance of `ls: 0` foundations from the baseline.                      |
