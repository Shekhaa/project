# Campus Connect Design System — True Black & Action Blue Specification
> Inspired by `apple/DESIGN.md`, `vercel/DESIGN.md`, and `x.ai/DESIGN.md` from `awesome-design-md`.

---

## 1. Design Philosophy & Atmosphere

- **Aesthetic**: Stark, editorial, high-contrast monochrome craft — zero AI-template purple/indigo gradients or decorative badges.
- **True Black Canvas**: Built on pure OLED black (`#000000`) with neutral dark surfaces (`#0a0a0a`, `#0d0d0f`, `#141416`) separated strictly by 1px neutral hairlines (`#222226` / `#333338`).
- **Pure White Ink**: All primary text (`CampusConnect`, headings, posts, labels) uses pure `#ffffff` on dark mode for effortless legibility, paired with crisp `#e4e4e7` secondary text and `#a1a1aa` metadata.
- **Single Action Blue Accent**: Authentic Vercel/Apple Action Blue (`#0070f3` / `#2997ff` on dark; `#0066cc` on light) used sparingly for intentional primary actions, active links, and focus indicators.

---

## 2. Anti-Slop Discipline

To prevent generic AI-generated template aesthetics:
1. **NO Purple/Indigo AI Accents**: Ban `#5e6ad2` / `#7170ff` lavender-purple glows and multi-color decorative gradients.
2. **NO Fake Social-Proof Pills**: Ban pulsing `"10,000+ Active"` fake status chips and decorative `#hashtag` spam on authentication screens.
3. **NO Murky Low-Contrast Text**: Use `#ffffff` primary text and `#e4e4e7` secondary text on `#000000`/`#0a0a0a`.
4. **Crisp Geometry**: Keep cards to `12px`–`14px` radius with `1px` solid `#222226` hairlines instead of heavy drop shadows.
5. **High Information Density**: UI is direct, calm, and utility-first.

---

## 3. Core Color Tokens

### Surfaces & Backgrounds (Dark Mode)
| Token | Hex Value | Usage |
|---|---|---|
| `canvas` / `background` | `#000000` | Pure true-black root canvas for screens |
| `surface` | `#0a0a0a` | Primary cards, auth container, bottom bar |
| `card` | `#0d0d0f` | Post cards, list items |
| `surfaceLight` | `#141416` | Inputs, segmented tracks, secondary buttons |

### Hairlines & Borders
| Token | Hex Value | Usage |
|---|---|---|
| `hairline` / `cardBorder` | `#222226` | Standard 1px divider and card perimeter |
| `hairlineStrong` | `#333338` | Focus outlines, active borders |

### Ink & Typography
| Token | Hex Value | Usage |
|---|---|---|
| `textPrimary` | `#ffffff` | Brand wordmark, headlines, post content, primary labels |
| `textSecondary` | `#e4e4e7` | Subtitles, authors, action counters |
| `textMuted` | `#a1a1aa` | Timestamps, secondary metadata |
| `textTertiary` | `#71717a` | Placeholder text, disabled labels |

### Brand & Chromatic Accents
| Token | Hex Value | Usage |
|---|---|---|
| `primary` | `#0070f3` (dark) / `#0066cc` (light) | Action Blue primary CTAs & active indicators |
| `primaryHover` | `#2997ff` | High-contrast Apple dark-mode blue for links & highlights |
| `primaryFocus` | `#0060df` | Focus rings & pressed states |
| `success` | `#22c55e` | Verified badges, accepted solutions |
| `warning` | `#f59e0b` | Pending ID review, warnings |
| `danger` | `#ef4444` | Destructive deletes, errors |

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
