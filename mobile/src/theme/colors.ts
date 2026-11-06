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
  // Linear Canvas & Surfaces (Layered Dark Luminance)
  background: '#08090a',
  surface: '#0f1011',
  surfaceLight: '#141516',
  card: '#121315',
  cardBorder: '#23252a',
  hairline: '#23252a',
  hairlineStrong: '#34343a',

  // Linear Single Chromatic Accent (Lavender-Blue / Electric Indigo)
  primary: '#5e6ad2',
  primaryHover: '#828fff',
  primaryFocus: '#5e69d1',

  // Semantics
  accent: '#27a644',
  success: '#27a644',
  warning: '#f59e0b',
  danger: '#ef4444',

  // Linear Ink & Typography (Crisp Light Contrast)
  textPrimary: '#f7f8f8',
  textSecondary: '#d0d6e0',
  textMuted: '#8a8f98',
  textTertiary: '#62666d',

  // Chat Bubbles (Linear Craft)
  bubbleMe: '#282d46',
  bubbleMeText: '#f7f8f8',
  bubbleThem: '#141516',
  bubbleThemBorder: '#23252a',
  bubbleThemText: '#f7f8f8',

  // Mascots / Anonymous
  anonPurple: '#7170ff',
  anonBadge: '#1a1936',

  // Ephemeral Group
  ephemeralFire: '#f97316',

  // Modals & Overlays
  modalOverlay: 'rgba(0, 0, 0, 0.75)',
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

  // Refined Indigo for Light Mode
  primary: '#4f46e5',
  primaryHover: '#6366f1',
  primaryFocus: '#4338ca',

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
  bubbleMe: '#4f46e5',
  bubbleMeText: '#ffffff',
  bubbleThem: '#f1f5f9',
  bubbleThemBorder: '#e2e8f0',
  bubbleThemText: '#0f172a',

  // Mascots / Anonymous
  anonPurple: '#6366f1',
  anonBadge: '#eef2ff',

  // Ephemeral Group
  ephemeralFire: '#ea580c',

  // Modals & Overlays
  modalOverlay: 'rgba(15, 23, 42, 0.45)',
};

// Default export for backward compatibility with existing static references
export const colors: ThemeColors = darkColors;
