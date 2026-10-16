# Pair solver

The procedure behind the **Pair solver** column of [color-approaches.html](color-approaches.html).

This is an exploration prototype. It is not the pipeline in `packages/tint`. The colors on that page were produced by the steps below, measured on the emitted 8-bit sRGB hex.

The model: a theme is a closed list of foreground/background pairs. Each role is a free color. Hue and chroma come from the config. Luminance is chosen so the pairs pass. A preferred color moves only when a pair cannot be satisfied, and every move is reported.

## Config

One palette, one theme.

```text
palette: { pin: "#2563eb" }     # hue and chroma are read from the pin
neutral: { hue: 250, chroma: 0.02 }   # no pin
theme:   light | dark
```

A pin contributes its OKLCH hue and chroma. Its lightness is discarded, because OKLCH L is not WCAG luminance. Neutral has no pin, so the fill search keeps the highest chroma inside the legal window.

Chroma is then split by role:

| Use                                          | Chroma                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------ |
| Surfaces (`bg.page`, `bg.surface`, disabled) | `min(0.012, requested)`                                                  |
| Text (title, body, muted, placeholder)       | `min(0.08, requested × 0.45)`                                            |
| Button label                                 | `min(0.008, requested)`, at Y 0.99                                       |
| Primary fill and its hover                   | the full requested chroma                                                |
| Input border                                 | 0.60× in light mode, 0.75× in dark mode                                  |
| Divider                                      | `min(0.02, requested × 0.25)` light, `min(0.025, requested × 0.30)` dark |

## What is checked

WCAG 2 relative luminance, on the 8-bit hex. Text must reach 4.5:1. UI boundaries must reach 3:1. APCA is computed and printed. It never accepts or rejects a color.

These pairs are the whole guarantee. A pair that is not in the list is not checked.

| Pair                                                 | Minimum | Kind       |
| ---------------------------------------------------- | ------- | ---------- |
| Title, body, muted on the card                       | 4.5     | text       |
| Placeholder on the input                             | 4.5     | text       |
| Input border on the input and on the card            | 3.0     | ui         |
| Focus ring on the card and on the input              | 3.0     | ui         |
| Primary label on the rest fill and on the hover fill | 4.5     | text       |
| Rest fill and hover fill on the card                 | 3.0     | ui         |
| Secondary label on the secondary fill                | 4.5     | text       |
| Secondary border on its fill and on the card         | 3.0     | ui         |
| Disabled label on the disabled fill                  | 4.5     | exempt     |
| Divider on the card                                  | 3.0     | decorative |

Exempt and decorative pairs are scored and shown. A miss does not fail the theme.

Five steps must be at least ΔEok 0.02 apart (Euclidean distance in OKLab): page and card, title and body, body and muted, rest fill and hover, focus ring and input border.

Text luminance is strictly ordered. In light mode title < body < muted. In dark mode the order reverses. The primary label must be at least 0.02 luminance lighter than the fill in both themes.

## Turning a target luminance into a hex

`paint(Y, hue, chroma)` returns the sRGB hex of that hue whose WCAG Y is within 0.0035 of the target.

1. Search OKLCH lightness at the requested chroma. Keep the in-gamut color whose quantized hex is closest to the target Y.
2. Accept it when the error is at most 0.0035.
3. Otherwise binary-search chroma downward, 16 steps, and keep the highest chroma that still hits the Y.

Out-of-gamut channels are rejected before quantization. Contrast is always remeasured on the hex. A chroma request above 0.05 that lands more than 0.03 short is an amber shortfall, reported once on the final token.

The luminance edges of a ratio `R` against a background `Y` are:

```text
darker  = (Y + 0.05) / R − 0.05
lighter = R × (Y + 0.05) − 0.05
```

## Build order

Surfaces first, then the text on those surfaces, then the button. The button is the only search. Everything earlier is a preference or a one-shot formula.

### 1. Page, card, and input

Light preferences: page Y 0.99, card Y 0.915, input Y 0.993.

Dark preferences: page Y 0.006, card Y 0.05, input Y 0.06. Page chroma is 0.4× the surface cap. Card chroma is the surface cap.

The dark card is then repaired before any text is painted. A preview label at Y 0.99 is used to measure the button window (next section). While that window is narrower than 0.03, the card darkens by 0.003, the input darkens with it, and the window is measured again. At most 14 steps. The card stops at the first Y where the window is wide enough, which in this run is Y 0.014. The banner is:

> Preferred card Y 0.050 cannot host a light label and a 3:1 fill together. Card moved to Y 0.014.

The input is then painted. In dark mode it sits at least 0.01 above the repaired card, at half the surface chroma.

### 2. The button window

The fill has to satisfy two inequalities at once.

A light label only holds 4.5:1 when the fill is dark enough. The search uses 4.55 so quantization still clears 4.5:

```text
Y_max = (Y_label + 0.05) / 4.55 − 0.05
```

With a label near Y 0.99, `Y_max` is about 0.179.

Against a light card the fill must also be dark enough for 3:1, so `Y_max` is tightened again with ratio 3.08. Against a dark card the fill must be light enough:

```text
Y_min = 3.08 × (Y_card + 0.05) − 0.05
```

`Y_min` is 0 on a light card. On the preferred dark card (Y 0.05) it is about 0.26, which is above `Y_max`. The window is empty, and that is what step 1 repairs. After the card reaches Y 0.014 the window is roughly 0.147 to 0.179.

A window narrower than 0.012 after that repair is a red failure. The theme still emits a fill, at `clamp(Y_max, 0.02, 0.16)`, so the card can draw, and the audit fails the pairs.

### 3. Text and borders

Each of these is solved once, against the surfaces that won. `solve_pole` computes the Y edge against every background it is given, keeps the stricter edge, paints it, then steps luminance by 0.008 up to 14 times if the quantized hex still misses the ratio.

Light mode, all darker than their surface:

| Role         | Rule                                                     |
| ------------ | -------------------------------------------------------- |
| Muted        | least-dark color that clears 4.7:1 on the card           |
| Body         | the darker of (muted − 0.05) and 8.5:1 against the card  |
| Title        | 0.035 darker than body, and no lighter than Y 0.03       |
| Placeholder  | least-dark color that clears 4.7:1 on the input          |
| Input border | 3.15:1 against both the input and the card, chroma 0.60× |
| Focus ring   | 3.4:1 against both, full chroma                          |

Dark mode, all lighter than their surface:

| Role         | Rule                                             |
| ------------ | ------------------------------------------------ |
| Muted        | least-light color that clears 4.7:1 on the card  |
| Body         | muted + 0.18                                     |
| Title        | body + 0.16, capped at Y 0.95                    |
| Placeholder  | least-light color that clears 4.7:1 on the input |
| Input border | 3.15:1 against both, chroma 0.75×                |
| Focus ring   | 3.5:1 against both, full chroma                  |

The label is then painted at Y 0.99. The window is recomputed from that label's actual Y and the card's actual Y.

### 4. Fill and hover

Walk candidate Y from `Y_max − 0.004` down to `Y_min + 0.004` in steps of 0.004. Paint each one at full chroma and judge the hex:

- label on fill ≥ 4.5:1
- fill on card ≥ 3.0:1
- a legal hover exists

Hover starts at `Y_rest − 0.012` and steps down by 0.006 while Y > 0.01. A step closer than ΔEok 0.02 to the rest fill is skipped. The first step that still clears 4.5:1 with the label and 3.0:1 with the card is the hover.

With a pin, the winner is the candidate with the smallest ΔEok to the pin. Equal distance keeps the higher chroma. Without a pin, the winner is the highest chroma.

If the winner is ΔEok 0.02 or more from the pin:

> Pin #ca8a04 is not the fill. Nearest passing fill is #9e6b00 (ΔEok 0.116).

If no candidate has a legal hover, the banner is red and names that fact. A fill is still emitted so the card draws.

### 5. Copies and exempt roles

The secondary button is not solved. Its fill is the card, its label is the body text, and its border is the input border.

The divider and the disabled button are fixed and exempt:

| Role           | Light  | Dark          |
| -------------- | ------ | ------------- |
| Divider        | Y 0.80 | card Y + 0.03 |
| Disabled fill  | Y 0.90 | card Y + 0.02 |
| Disabled label | Y 0.74 | card Y + 0.07 |

## What the four pins do

The light window tops out near Y 0.179. Where the pin sits relative to that line decides the banner.

| Pin       | Pin Y vs white | Light fill | Why                                                                                |
| --------- | -------------- | ---------- | ---------------------------------------------------------------------------------- |
| `#2563eb` | 0.153, 5.17:1  | `#2462ea`  | Inside the window. ΔEok < 0.02, no banner.                                         |
| `#dc2626` | 0.167, 4.83:1  | `#dc2526`  | Inside the window. No banner.                                                      |
| `#16a34a` | 0.269, 3.30:1  | `#008739`  | Lighter than every legal fill. Closest is the light end of the window. ΔEok 0.084. |
| `#ca8a04` | 0.307, 2.94:1  | `#9e6b00`  | Same, further away. ΔEok 0.116. Chroma falls to 0.119 from 0.142.                  |

In dark mode the same blue is inside the window, but a hover darker than the pin drops through the 3:1 floor of the repaired card. The search picks a slightly lighter rest, `#2968f0` at Y 0.167, with hover `#2461e9` at Y 0.148. The shift stays under ΔEok 0.02, so the only dark banner is the card move. Green and gold move by the same deltas as in light mode, and the card banner fires as well.

## Reporting

| Level        | Meaning                                                                                                                                                  |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Red fail     | A checked pair, the text order, the label polarity, or a distinctness step missed. Also an empty window or a fill with no legal hover.                   |
| Amber adjust | A preference moved: the dark card, or a pin whose nearest passing fill is ΔEok ≥ 0.02 away.                                                              |
| Amber short  | Requested chroma above 0.05, achieved chroma more than 0.03 lower. Reported on the final token. A token already named in a banner is not reported twice. |
| Blue info    | Not used by this solver. The other three columns use it.                                                                                                 |

Nothing is clamped without one of these lines. The one quiet gap in this run: gold's chroma miss is 0.023, under the 0.03 shortfall bar, so it appears in the token table and inside the adjust banner's hex, and it does not get its own shortfall line.
