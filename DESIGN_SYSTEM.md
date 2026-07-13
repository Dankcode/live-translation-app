# LingoLoop Design System

Audit and token reference for `src/app/globals.css`. Updated 2026-07-09.

## Design Tokens

All colors, radii, and layout constants live in `:root` in `globals.css`. Use tokens — do not hardcode values.

### Color

| Token | Value | Use |
|-------|-------|-----|
| `--bg` / `--bg-soft` | `#0d1110` / `#121816` | App background |
| `--surface` / `--surface-strong` | `#171f1d` / `#202a27` | Cards, sheets |
| `--surface-glass` / `--surface-glass-strong` | dark rgba | Blurred overlays |
| `--line` / `--line-strong` | white-green 12% / 22% | Borders, default / hover |
| `--text` / `--muted` / `--soft` | `#f3f6f1` / `#a6b2aa` / `#748078` | Text hierarchy |
| `--teal` / `--teal-strong` | `#42d9c8` / `#1ba895` | Primary accent |
| `--amber`, `--blue`, `--red` | — | Warning / info / error accents |
| `--ink-on-accent` | `#051412` | Text on teal/amber fills (the only allowed value) |
| `--ink-on-accent-soft` | 74% ink | Secondary text on accent fills |
| `--accent-tint-weak` / `--accent-tint` | teal 9% / 12% | Selected/active backgrounds |
| `--accent-border-soft` / `--accent-border` / `--accent-border-strong` | teal 30% / 50% / 74% | Accent borders by emphasis |
| `--tint-1` / `--tint-2` / `--tint-3` | white 4% / 6% / 8% | Neutral surface tints: rest / hover / strong |

### Shape & layout

| Token | Value | Use |
|-------|-------|-----|
| `--radius` | `8px` | Default corner radius (buttons, cards, inputs) |
| `--radius-sm` | `6px` | Nested elements (inner buttons, chips) |
| `--shadow` | soft 34% black | Elevated panels |
| `--topbar` | `76px` | Sticky header height |

### Typography

Weight ladder is **600 / 700 / 800** only (semibold labels / bold UI text / heavy emphasis). The previous non-standard values (650, 680, 720–790, 820) were normalized — browsers snap them to the nearest available face anyway, so the declared values were misleading.

Font stack references Inter but the font is not bundled; users without Inter installed get the system fallback. Follow-up: self-host Inter (e.g. `next/font` with a local woff2) so desktop builds render consistently offline.

## Audit summary (2026-07-09)

Issues found and fixed:

1. **Two different "ink on accent" colors** — `#051412` (7 uses) and `#061412` (5 uses) were both used for text on teal fills. Unified to `--ink-on-accent`.
2. **19 distinct teal alpha values** hardcoded as `rgba(66, 217, 200, x)` with 9 different alphas. Collapsed to 5 semantic tokens (`--accent-tint-weak/tint`, `--accent-border-soft/border/strong`).
3. **10 distinct white surface tints** (0.025–0.08) collapsed to a 3-step scale (`--tint-1/2/3`).
4. **12 non-standard font weights** normalized to the 600/700/800 ladder.
5. **`border-radius: 8px`/`6px` hardcoded ~40×** despite `--radius` existing. Now `var(--radius)` / `var(--radius-sm)`.

Remaining (recommended follow-ups):

- Amber alphas (`rgba(255, 207, 112, x)`, ~10 uses) could get the same tint/border token treatment.
- `overlay/`, `history/`, and `satellite/` pages predate this system and use their own inline styles; migrate when touched.
- Bundle Inter locally (see Typography).

## Component conventions

- Segmented controls (`.mode-toggle`, `.panel-tabs`, `.source-modes`, `.subtitle-control-group`): container has `--tint-1` bg + `--line` border; the selected button gets `--teal` fill with `--ink-on-accent` text.
- Buttons share the base group at the top of the stylesheet (border `--line`, bg `--tint-1`, hover lifts 1px and moves to `--line-strong`/`--tint-3`). New buttons should join that group rather than redefine hover behavior.
- Selected/active states use `--accent-border(-soft)` + `--accent-tint(-weak)`, never new alpha values.
- Interactive icon-only controls must be `<button class="icon-button">` with `aria-label` — never a bare svg.
