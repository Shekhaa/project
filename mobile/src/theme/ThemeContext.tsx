import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useColorScheme, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeColors, darkColors, espressoColors, lightColors } from './colors';

export type ThemeMode = 'dark' | 'light' | 'espresso' | 'system';
export type ResolvedTheme = 'dark' | 'light' | 'espresso';

interface ThemeContextValue {
  themeMode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  isDark: boolean;
  colors: ThemeColors;
  setThemeMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
}

const THEME_STORAGE_KEY = '@campus_connect_theme_mode';

const ThemeContext = createContext<ThemeContextValue>({
  themeMode: 'dark',
  resolvedTheme: 'dark',
  isDark: true,
  colors: darkColors,
  setThemeMode: () => {},
  toggleTheme: () => {},
});

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const systemScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('dark');

  // Load saved theme preference on mount
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (saved === 'dark' || saved === 'light' || saved === 'espresso' || saved === 'system') {
          setThemeModeState(saved as ThemeMode);
        }
      } catch (err) {
        console.log('Error loading saved theme', err);
      }
    })();
  }, []);

  const resolvedTheme: ResolvedTheme =
    themeMode === 'system'
      ? systemScheme === 'light'
        ? 'light'
        : 'dark'
      : themeMode;

  const isDark = resolvedTheme !== 'light';

  const activeColors =
    resolvedTheme === 'light'
      ? lightColors
      : resolvedTheme === 'espresso'
      ? espressoColors
      : darkColors;

  // Sync web document background when theme changes
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.body.style.backgroundColor = activeColors.background;
      document.documentElement.style.backgroundColor = activeColors.background;
      document.body.style.color = activeColors.textPrimary;
    }
  }, [resolvedTheme, activeColors]);

  const setThemeMode = async (mode: ThemeMode) => {
    setThemeModeState(mode);
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch (err) {
      console.log('Error saving theme mode', err);
    }
  };

  // Cycle cleanly across all 3 signature themes: Dark (Black) -> Mocha (Espresso/Cream) -> Light (White)
  const toggleTheme = () => {
    const nextMode: ThemeMode =
      resolvedTheme === 'dark'
        ? 'espresso'
        : resolvedTheme === 'espresso'
        ? 'light'
        : 'dark';
    setThemeMode(nextMode);
  };

  return (
    <ThemeContext.Provider
      value={{
        themeMode,
        resolvedTheme,
        isDark,
        colors: activeColors,
        setThemeMode,
        toggleTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
