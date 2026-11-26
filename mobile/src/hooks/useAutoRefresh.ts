import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';

/**
 * Automatically triggers a background refresh when the user re-opens the app
 * or switches back to the browser tab, provided the data has exceeded `staleTimeMs`.
 * Emulates the auto-refresh behavior of Twitter/X, Instagram, and Reddit.
 */
export function useAutoRefresh(
  onRefresh: () => void | Promise<any>,
  staleTimeMs: number = 25000 // 25 seconds stale threshold
) {
  const lastRefreshTimeRef = useRef<number>(Date.now());
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  // Mark data as fresh whenever onRefresh is called directly (e.g. pull-to-refresh)
  const markFresh = () => {
    lastRefreshTimeRef.current = Date.now();
  };

  useEffect(() => {
    // 1. Mobile Native AppState listener (background -> active)
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        const now = Date.now();
        if (now - lastRefreshTimeRef.current >= staleTimeMs) {
          lastRefreshTimeRef.current = now;
          onRefreshRef.current?.();
        }
      }
    });

    // 2. Web browser tab focus & visibility listener
    let cleanupWeb: (() => void) | undefined;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const handleWebFocus = () => {
        const now = Date.now();
        if (now - lastRefreshTimeRef.current >= staleTimeMs) {
          lastRefreshTimeRef.current = now;
          onRefreshRef.current?.();
        }
      };

      const handleVisibilityChange = () => {
        if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
          handleWebFocus();
        }
      };

      window.addEventListener('focus', handleWebFocus);
      document.addEventListener('visibilitychange', handleVisibilityChange);

      cleanupWeb = () => {
        window.removeEventListener('focus', handleWebFocus);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    }

    return () => {
      subscription.remove();
      cleanupWeb?.();
    };
  }, [staleTimeMs]);

  return { markFresh };
}
