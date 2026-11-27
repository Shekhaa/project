import { AppState, AppStateStatus, Platform } from 'react-native';

/**
 * Returns true when the app (native) or browser tab (web) is visible in the foreground.
 * Used to pause polling timers in the background and avoid unnecessary backend load.
 */
export const isAppForeground = (): boolean => {
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    return document.visibilityState !== 'hidden';
  }
  return AppState.currentState === 'active';
};

/**
 * Subscribes to foreground/background transitions across both Native and Web.
 */
export const subscribeAppForeground = (onForegroundChange: (isActive: boolean) => void): (() => void) => {
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const handleVisibility = () => {
      onForegroundChange(document.visibilityState !== 'hidden');
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }

  const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
    onForegroundChange(state === 'active');
  });
  return () => {
    sub.remove();
  };
};
