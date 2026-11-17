export interface ThemeColors {
  // Canvas & Surfaces (Layered Luminance)
  background: string;
  surface: string;
  surfaceLight: string;
  card: string;
  cardBorder: string;
  hairline: string;
  hairlineStrong: string;

  // Single Chromatic Accent (Linear-style Refined Indigo)
  primary: string;
  primaryHover: string;
  primaryFocus: string;

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
  // True OLED Black Canvas & Neutral Dark Surfaces (Apple + Vercel awesome-design-md)
  background: '#000000',
  surface: '#0a0a0a',
  surfaceLight: '#141416',
  card: '#0d0d0f',
  cardBorder: '#222226',
  hairline: '#222226',
  hairlineStrong: '#333338',

  // Single Chromatic Accent — Crisp Action Blue (Zero Purple/Indigo AI Slop)
  primary: '#0070f3',
  primaryHover: '#2997ff',
  primaryFocus: '#0060df',

  // Semantics
  accent: '#22c55e',
  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#ef4444',

  // Pure White Ink & High-Contrast Neutral Typography
  textPrimary: '#ffffff',
  textSecondary: '#e4e4e7',
  textMuted: '#a1a1aa',
  textTertiary: '#71717a',

  // Chat Bubbles (Crisp Action Blue + Neutral Dark)
  bubbleMe: '#0070f3',
  bubbleMeText: '#ffffff',
  bubbleThem: '#141416',
  bubbleThemBorder: '#222226',
  bubbleThemText: '#ffffff',

  // Mascots / Anonymous (Aligned Action Blue — No Purple Slop)
  anonPurple: '#2997ff',
  anonBadge: '#0a192f',

  // Ephemeral Group
  ephemeralFire: '#f97316',

  // Modals & Overlays
  modalOverlay: 'rgba(0, 0, 0, 0.85)',
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
  primaryHover: '#0070f3',
  primaryFocus: '#0052cc',

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
