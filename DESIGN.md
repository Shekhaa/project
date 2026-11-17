# Campus Connect Design System — 3-Mode Editorial Specification
> Inspired by `apple/DESIGN.md`, `vercel/DESIGN.md`, `oura/DESIGN.md`, and `claude/DESIGN.md` from `awesome-design-md`.

---

## 1. Three Signature Modes

1. **White (`light` — Studio Daylight):** Crisp `#f8f9fa` / `#ffffff` surfaces, deep `#0a0a0a` ink, and Apple Action Blue (`#0066cc`).
2. **Black (`dark` — Instagram True Black):** Pure OLED `#000000` canvas, pure white `#ffffff` ink & monochrome white buttons (`onPrimary: #000000`), graphite `#262626` avatars — **only `Connect` in `CampusConnect` carries `#2997ff` blue** (zero neon blue spam).
3. **Mocha (`espresso` — Gen-Z Cloth Brown & Cream):** Warm espresso-walnut linen surfaces (`#19120e`, `#231a14`, `#30241c`), stitched cocoa borders (`#443429`), creamy ivory ink (`#f6efe2`), creamy oat buttons (`#e5d2b5` with `#19120e` text), caramel `brandAccent` (`#c9a67e`), and quiet-luxury Olive Sage (`#8fa382`) verified badges.

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
