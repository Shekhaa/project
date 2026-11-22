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
  // Pure AMOLED Monochrome Black — Zero Brown / Muddy Tint
  background: '#000000',
  surface: '#09090b',
  surfaceLight: '#18181b',
  card: '#0f0f12',
  cardBorder: '#27272a',
  hairline: '#27272a',
  hairlineStrong: '#3f3f46',

  // Crisp Monochrome White Actions + Electric Sky Blue Brand Accent
  primary: '#ffffff',
  onPrimary: '#000000',
  primaryHover: '#f4f4f5',
  primaryFocus: '#e4e4e7',
  brandAccent: '#38bdf8',

  // Monochrome Component Surfaces
  avatarBg: '#27272a',
  avatarText: '#ffffff',
  chipActiveBg: '#27272a',
  chipActiveBorder: '#52525b',
  chipActiveText: '#ffffff',
  bannerBg: '#121215',

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

  // Chat Bubbles (Clean Monochrome Dark)
  bubbleMe: '#27272a',
  bubbleMeText: '#ffffff',
  bubbleThem: '#121215',
  bubbleThemBorder: '#27272a',
  bubbleThemText: '#ffffff',

  // Mascots / Anonymous (Clean White on Graphite)
  anonPurple: '#ffffff',
  anonBadge: '#18181b',

  // Ephemeral Group
  ephemeralFire: '#f97316',

  // Modals & Overlays
  modalOverlay: 'rgba(0, 0, 0, 0.85)',
};

// Backwards-compatibility alias (espresso removed in favor of True Black)
export const espressoColors: ThemeColors = darkColors;

export const lightColors: ThemeColors = {
  // Clean Studio Daylight Canvas & Surfaces
  background: '#f8fafc',
  surface: '#ffffff',
  surfaceLight: '#f1f5f9',
  card: '#ffffff',
  cardBorder: '#e2e8f0',
  hairline: '#e2e8f0',
  hairlineStrong: '#cbd5e1',

  // Crisp Studio Sky Blue
  primary: '#0284c7',
  onPrimary: '#ffffff',
  primaryHover: '#0369a1',
  primaryFocus: '#075985',
  brandAccent: '#0284c7',

  // Studio Daylight Component Surfaces
  avatarBg: '#0284c7',
  avatarText: '#ffffff',
  chipActiveBg: '#e0f2fe',
  chipActiveBorder: '#0284c7',
  chipActiveText: '#0369a1',
  bannerBg: '#f0f9ff',

  // Semantics
  accent: '#16a34a',
  success: '#16a34a',
  warning: '#d97706',
  danger: '#dc2626',

  // Deep High-Contrast Ink
  textPrimary: '#0f172a',
  textSecondary: '#334155',
  textMuted: '#64748b',
  textTertiary: '#94a3b8',

  // Chat Bubbles (Light Mode Craft)
  bubbleMe: '#0284c7',
  bubbleMeText: '#ffffff',
  bubbleThem: '#f1f5f9',
  bubbleThemBorder: '#e2e8f0',
  bubbleThemText: '#0f172a',

  // Mascots / Anonymous
  anonPurple: '#0284c7',
  anonBadge: '#e0f2fe',

  // Ephemeral Group
  ephemeralFire: '#ea580c',

  // Modals & Overlays
  modalOverlay: 'rgba(0, 0, 0, 0.45)',
};

// Default export for backward compatibility with existing static references
export const colors: ThemeColors = darkColors;
