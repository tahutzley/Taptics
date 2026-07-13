# Siege-ledger design tokens

## Palette and state grammar

| Role | Token | Value |
| --- | --- | --- |
| Charred field | `--siege-charred` | `#17130f` |
| Deep shadow | `--siege-shadow` | `#0c0a08` |
| Parchment text | `--siege-parchment` | `#f2e3bd` |
| Aged parchment | `--siege-parchment-aged` | `#d5b873` |
| Oak | `--siege-oak` | `#6a4028` |
| Iron | `--siege-iron` | `#474641` |
| Stone | `--siege-stone` | `#787064` |
| Heraldic gold/focus ring | `--siege-gold`, `--siege-focus` | `#d3a53b`, `#d3a53b` |
| Danger | `--siege-danger` | `#a8473b` |
| Attack | `--siege-attack` | `#d46b3e` |
| Crew | `--siege-crew` | `#8ca34a` |
| Magic | `--siege-magic` | `#896bb5` |
| Positive | `--siege-positive` | `#65a25c` |
| Shield | `--siege-shield` | `#6195a2` |
| Fortify/Clash/Overload/Double phase surfaces | `--siege-phase-fortify`, `--siege-phase-clash`, `--siege-phase-overload`, `--siege-phase-double` | `#3a342e`, `#2f4327`, `#5b2723`, `#4b301f` |
| Victory/draw title ink | `--siege-result-victory`, `--siege-result-draw` | `#2f642f`, `#5a4f45` |

Attack uses a pointed ember frame and crossed-bolt icon; Crew uses a square timber frame and hammer icon; Magic uses a clipped rune-stone frame and diamond sigil. Category, selected, busy, pending, disabled, damage, healing, and Shield states always combine color with a label, icon/pattern, border shape, or meter layer.

## Geometry and materials

- Base layout grid: 4 CSS pixels.
- Logical art sizes: 16px UI icons, 32px minor actors/effects, 48px portraits, 64px cores/walls/primary structures.
- Runtime art uses integer-scale background sizing and `image-rendering: pixelated`.
- Frames use a two-pixel dark keyline, one- or two-pixel material highlight, stepped/clipped corners, and a hard 4px shadow.
- Parchment owns information/details; timber and iron own controls; stone owns defenses/meters; cloth owns identity/results; rune stone owns Magic.

## Type

Short headings use a local system monospace stack until a separately licensed bundled bitmap face is approved. Body copy uses a local system sans/serif stack. Remote font loading is removed in Phase 2. Body text targets 14-16px, tactical labels at least 12px, and numeric data uses tabular figures.

## Motion

| Purpose | Token / range |
| --- | --- |
| Press | `--motion-press: 80ms` |
| Deployment | `--motion-deploy: 220ms` |
| Impact | `--motion-impact: 180ms` |
| Floating delta | `--motion-delta: 520ms` |
| Wind-up | Static double outline, label, and meter |
| Phase change | Static banner plus one bounded notice |

Motion is limited to transform, opacity, and sprite position. Reduced motion removes travel, shake, flash, looping charge, and animated reflow; equivalent borders, pips, labels, target emphasis, and numeric deltas remain.

## Accessibility states

Focus uses a 3px charred outline, 3px offset, and 6px heraldic-gold outer ring so selected/current controls remain distinct. Disabled controls retain readable copy and a dashed iron frame. Selected controls add a wax seal/check and `aria-pressed`. Busy/pending controls include text, static double outlines, and progress pips. Minimum primary target is 48px. Zoom is never disabled.
