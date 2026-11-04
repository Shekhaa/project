# Campus Connect Design System — Linear Specification
> Inspired by `linear.app/DESIGN.md` from `awesome-design-md` & `design-taste-frontend` anti-slop framework.

---

## 1. Design Philosophy & Atmosphere

- **Aesthetic**: Ultra-minimal, precise, technical, and quietly luxurious software-craft.
- **Canvas-First**: Built on a deep, near-black canvas (`#08090a`). Depth is constructed through **layered luminance** (`#0f1011`, `#141516`, `#18191a`) rather than blur shadows or heavy saturated fills.
- **Single Chromatic Accent**: Linear's signature lavender-blue (`#5e6ad2`) is used exclusively for key intentional CTAs, active tab indicators, and verified focus states. Never used as a multi-color decorative gradient.
- **Hairline Precision**: Structural panels, cards, and modal dividers utilize crisp 1px hairline borders (`#23252a` / `#34343a`) for clean data separation.

---

## 2. Anti-Slop Discipline (`design-taste-frontend`)

To maintain high visual fidelity and prevent generic "AI template slop":
1. **NO Decorative Gradient Blobs**: Ban random floating purple/pink neon blur circles that add no information value.
2. **NO Low-Contrast Gray Text**: Ensure all text strictly adheres to WCAG AA contrast standards. Use `#f7f8f8` for primary text and `#d0d6e0` for secondary text.
3. **NO Excessive Border Radius**: Restrict cards and panels to `8px`–`12px` radius. Avoid oversized 32px pill bubbles for content containers.
4. **NO Glowing Neons**: Glow is replaced with crisp, razor-sharp 1px hairline borders (`#23252a`).
5. **High Information Density**: UI is compact, informative, and organized like high-craft developer and productivity software.

---

## 3. Core Color Tokens

### Surfaces & Backgrounds
| Token | Hex Value | Usage |
|---|---|---|
| `canvas` / `background` | `#08090a` | Deepest dark root canvas for screens |
| `surface-1` / `surface` | `#0f1011` | Primary cards, inbox rows, list items |
| `surface-2` / `surfaceLight` | `#141516` | Raised containers, inputs, top bars |
| `surface-3` / `card` | `#18191a` | Active items, modals, popovers |
| `surface-hover` | `#1f2022` | Interactive touch / hover states |

### Hairlines & Borders
| Token | Hex Value | Usage |
|---|---|---|
| `hairline` / `cardBorder` | `#23252a` | Standard 1px divider and card perimeter |
| `hairline-strong` | `#34343a` | Focus outlines, active selections |
| `hairline-subtle` | `rgba(255, 255, 255, 0.05)` | Secondary inner dividers |

### Ink & Typography
| Token | Hex Value | Usage |
|---|---|---|
| `ink` / `textPrimary` | `#f7f8f8` | Primary headlines, titles, post content |
| `ink-muted` / `textSecondary` | `#d0d6e0` | Subtitles, authors, action counters |
| `ink-subtle` / `textMuted` | `#8a8f98` | Timestamps, secondary metadata |
| `ink-tertiary` | `#62666d` | Placeholder text, disabled labels |

### Brand & Chromatic Accents
| Token | Hex Value | Usage |
|---|---|---|
| `primary` | `#5e6ad2` | Linear signature lavender-blue accent |
| `primary-hover` | `#828fff` | Active press state |
| `primary-focus` | `#5e69d1` | Focus rings & primary buttons |
| `semantic-success` | `#27a644` | Accepted solutions, verified badges |
| `semantic-warning` | `#f59e0b` | Solved tags, bookmarks, pinned badges |
| `semantic-danger` | `#ef4444` | Destructive deletes, unlikes |

---

## 4. Typography Scale

- **Display**: Linear / SF Pro Display, font weight `600`–`700`, letter spacing `-0.5px`
- **Headings**: `16px`–`18px`, weight `600`, letter spacing `-0.2px`
- **Body**: `14px`–`15px`, weight `400`, line height `1.5`
- **Caption / Meta**: `11px`–`12px`, weight `500`, letter spacing `0`
- **Mono / Tags**: `11px`, weight `600`, letter spacing `0.2px`

---

## 5. Component Patterns

- **Cards**: Single hairline border (`#23252a`), background `#0f1011`, padding `14px`, radius `12px`.
- **Buttons**:
  - Primary: `#5e6ad2` background, white text `#ffffff`, radius `8px`.
  - Secondary: `#141516` surface, border `#23252a`, text `#f7f8f8`, radius `8px`.
- **Badges & Tags**:
  - Compact rounded `6px`–`8px`, background `rgba(255, 255, 255, 0.04)`, border `1px solid #23252a`, text `#8a8f98`.
- **Bottom Navigation**:
  - Surface `#0f1011`, top border `#23252a`, active icon `#5e6ad2`, inactive icon `#8a8f98`.
- **Chat Bubbles**:
  - My Bubble: `#5e6ad2` (or dark indigo `#1e1e38` with `#5e6ad2` border), crisp radius.
  - Their Bubble: `#141516` surface with subtle `#23252a` hairline border.
