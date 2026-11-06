import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useColorScheme, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeColors, darkColors, lightColors } from './colors';

export type ThemeMode = 'dark' | 'light' | 'system';

interface ThemeContextValue {
  themeMode: ThemeMode;
  isDark: boolean;
  colors: ThemeColors;
  setThemeMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
}

const THEME_STORAGE_KEY = '@campus_connect_theme_mode';

const ThemeContext = createContext<ThemeContextValue>({
  themeMode: 'dark',
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
        if (saved === 'dark' || saved === 'light' || saved === 'system') {
          setThemeModeState(saved as ThemeMode);
        }
      } catch (err) {
        console.log('Error loading saved theme', err);
      }
    })();
  }, []);

  const isDark =
    themeMode === 'system'
      ? systemScheme !== 'light'
      : themeMode === 'dark';

  const activeColors = isDark ? darkColors : lightColors;

  // Sync web document background when theme changes
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.body.style.backgroundColor = activeColors.background;
      document.documentElement.style.backgroundColor = activeColors.background;
      document.body.style.color = activeColors.textPrimary;
    }
  }, [isDark, activeColors]);

  const setThemeMode = async (mode: ThemeMode) => {
    setThemeModeState(mode);
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch (err) {
      console.log('Error saving theme mode', err);
    }
  };

  const toggleTheme = () => {
    const nextMode: ThemeMode = isDark ? 'light' : 'dark';
    setThemeMode(nextMode);
  };

  return (
    <ThemeContext.Provider
      value={{
        themeMode,
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
