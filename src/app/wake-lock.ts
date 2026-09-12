import { useEffect } from 'react';

/**
 * Keep the screen on while a component is mounted (Settings > Keep Screen On), using the Screen
 * Wake Lock API where available. The lock is released when the page is hidden and re-acquired
 * when it becomes visible again, as the API requires.
 */
export function useKeepScreenOn(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        if (document.visibilityState !== 'visible') return;
        lock = await navigator.wakeLock.request('screen');
      } catch {
        lock = null; // denied (low battery, not a secure context, ...): nothing to do
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !cancelled) void acquire();
    };
    void acquire();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      void lock?.release().catch(() => {});
    };
  }, [enabled]);
}
