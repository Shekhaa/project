export interface ThemeColors {
  // Canvas & Surfaces (Layered Luminance)
  background: string;
  surface: string;
  surfaceLight: string;
  card: string;
  cardBorder: string;
  hairline: string;
  hairlineStrong: string;

  // Primary Action & Brand Accent
  primary: string;
  onPrimary: string;
  primaryHover: string;
  primaryFocus: string;
  brandAccent: string;

  // Component Surfaces
  avatarBg: string;
  avatarText: string;
  chipActiveBg: string;
  chipActiveBorder: string;
  chipActiveText: string;
  bannerBg: string;

  // Semantics
  accent: string;
  success: string;
  warning: string;
  danger: string;

  // Ink & Typography (High Contrast, Crisp Readability)
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textTertiary: string;

  // Chat Bubbles
  bubbleMe: string;
  bubbleMeText: string;
  bubbleThem: string;
  bubbleThemBorder: string;
  bubbleThemText: string;

  // Mascots / Anonymous
  anonPurple: string;
  anonBadge: string;

  // Ephemeral Group
  ephemeralFire: string;

  // Modals & Overlays
  modalOverlay: string;
}

export const darkColors: ThemeColors = {
  // Instagram True Black — Pure Monochrome White Ink (ONLY CampusConnect wordmark is bluish)
  background: '#000000',
  surface: '#0a0a0a',
  surfaceLight: '#18181b',
  card: '#0d0d0d',
  cardBorder: '#262626',
  hairline: '#262626',
  hairlineStrong: '#3f3f46',

  // Crisp Monochrome White Actions + Single Brand Blue Accent
  primary: '#ffffff',
  onPrimary: '#000000',
  primaryHover: '#e4e4e7',
  primaryFocus: '#d4d4d8',
  brandAccent: '#2997ff',

  // Monochrome Component Surfaces (Zero Repetitive Blue Blobs)
  avatarBg: '#262626',
  avatarText: '#ffffff',
  chipActiveBg: '#1f1f22',
  chipActiveBorder: '#ffffff',
  chipActiveText: '#ffffff',
  bannerBg: '#111113',

  // Semantics
  accent: '#22c55e',
  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#ef4444',

  // Pure White Ink & Crisp Neutral Typography
  textPrimary: '#ffffff',
  textSecondary: '#e4e4e7',
  textMuted: '#a1a1aa',
  textTertiary: '#71717a',

  // Chat Bubbles (Clean Instagram Monochrome Dark)
  bubbleMe: '#262626',
  bubbleMeText: '#ffffff',
  bubbleThem: '#141416',
  bubbleThemBorder: '#262626',
  bubbleThemText: '#ffffff',

  // Mascots / Anonymous (Monochrome White on Graphite)
  anonPurple: '#ffffff',
  anonBadge: '#1c1c1e',

  // Ephemeral Group
  ephemeralFire: '#f97316',

  // Modals & Overlays
  modalOverlay: 'rgba(0, 0, 0, 0.85)',
};

export const espressoColors: ThemeColors = {
  // Gen-Z Quiet-Luxury Mocha / Espresso Cloth Brown + Creamy Ivory Typography + Olive Sage
  // Inspired by Oura & Claude DESIGN.md warm organic palettes
  background: '#19120e',
  surface: '#231a14',
  surfaceLight: '#30241c',
  card: '#271d17',
  cardBorder: '#443429',
  hairline: '#443429',
  hairlineStrong: '#5c4739',

  // Creamy Linen Primary CTAs + Warm Caramel Brand Accent
  primary: '#e5d2b5',
  onPrimary: '#19120e',
  primaryHover: '#f2e4ce',
  primaryFocus: '#d4bc9a',
  brandAccent: '#c9a67e',

  // Warm Suede & Linen Surfaces
  avatarBg: '#3e2e24',
  avatarText: '#f6efe2',
  chipActiveBg: '#382a21',
  chipActiveBorder: '#e5d2b5',
  chipActiveText: '#f6efe2',
  bannerBg: '#2b2019',

  // Organic Earth Semantics (Olive Sage Verified!)
  accent: '#8fa382',
  success: '#8fa382',
  warning: '#d9a760',
  danger: '#d96b59',

  // Warm Creamy Ivory Ink
  textPrimary: '#f6efe2',
  textSecondary: '#e4d5bf',
  textMuted: '#b8a58e',
  textTertiary: '#877460',

  // Chat Bubbles (Warm Espresso & Cocoa)
  bubbleMe: '#3e2e24',
  bubbleMeText: '#f6efe2',
  bubbleThem: '#2a1f18',
  bubbleThemBorder: '#443429',
  bubbleThemText: '#f6efe2',

  // Mascots / Anonymous (Warm Sand/Caramel)
  anonPurple: '#c9a67e',
  anonBadge: '#30241c',

  // Ephemeral Group
  ephemeralFire: '#d98245',

  // Modals & Overlays
  modalOverlay: 'rgba(18, 12, 8, 0.86)',
};

export const lightColors: ThemeColors = {
  // Apple / Vercel Studio Daylight Canvas & Surfaces
  background: '#f8f9fa',
  surface: '#ffffff',
  surfaceLight: '#f1f3f5',
  card: '#ffffff',
  cardBorder: '#e5e7eb',
  hairline: '#e5e7eb',
  hairlineStrong: '#d1d5db',

  // Apple / Vercel Action Blue for Light Mode
  primary: '#0066cc',
  onPrimary: '#ffffff',
  primaryHover: '#0070f3',
  primaryFocus: '#0052cc',
  brandAccent: '#0066cc',

  // Studio Daylight Component Surfaces
  avatarBg: '#0066cc',
  avatarText: '#ffffff',
  chipActiveBg: '#eff6ff',
  chipActiveBorder: '#0066cc',
  chipActiveText: '#0066cc',
  bannerBg: '#eff6ff',

  // Semantics
  accent: '#16a34a',
  success: '#16a34a',
  warning: '#d97706',
  danger: '#dc2626',

  // Deep High-Contrast Ink
  textPrimary: '#0a0a0a',
  textSecondary: '#334155',
  textMuted: '#64748b',
  textTertiary: '#94a3b8',

  // Chat Bubbles (Light Mode Craft)
  bubbleMe: '#0066cc',
  bubbleMeText: '#ffffff',
  bubbleThem: '#f1f5f9',
  bubbleThemBorder: '#e2e8f0',
  bubbleThemText: '#0a0a0a',

  // Mascots / Anonymous
  anonPurple: '#0066cc',
  anonBadge: '#e8f2ff',

  // Ephemeral Group
  ephemeralFire: '#ea580c',

  // Modals & Overlays
  modalOverlay: 'rgba(0, 0, 0, 0.45)',
};

// Default export for backward compatibility with existing static references
export const colors: ThemeColors = darkColors;
