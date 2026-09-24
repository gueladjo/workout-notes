import { useEffect } from 'react';

/**
 * Keep the screen on while a component is mounted (Settings > Keep Screen On), using the Screen
 * Wake Lock API where available. The lock is released when the page is hidden and re-acquired
 * when it becomes visible again, as the API requires.
 */
export function useKeepScreenOn(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || !('wakeLock' in navigator)) return;
    return keepScreenOn();
  }, [enabled]);
}

/**
 * Hold a screen wake lock until the returned function is called. The request is asynchronous: a
 * sentinel that arrives after the caller stopped (unmount, setting switched off) or while another
 * one is already held is released on the spot, otherwise nobody would ever release it and the
 * screen would stay awake for good.
 */
export function keepScreenOn(): () => void {
  let lock: WakeLockSentinel | null = null;
  let cancelled = false;
  const acquire = async () => {
    if (document.visibilityState !== 'visible') return;
    let sentinel: WakeLockSentinel;
    try {
      sentinel = await navigator.wakeLock.request('screen');
    } catch {
      return; // denied (low battery, not a secure context, ...): nothing to do
    }
    if (cancelled || (lock !== null && !lock.released)) {
      void sentinel.release().catch(() => {});
      return;
    }
    lock = sentinel;
  };
  const onVisibility = () => {
    if (document.visibilityState === 'visible') void acquire();
  };
  void acquire();
  document.addEventListener('visibilitychange', onVisibility);
  return () => {
    cancelled = true;
    document.removeEventListener('visibilitychange', onVisibility);
    void lock?.release().catch(() => {});
    lock = null;
  };
}
