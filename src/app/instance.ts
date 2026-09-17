/**
 * Single running instance per origin. Every persist writes the whole database, so two instances
 * (an installed app plus a browser tab, or two desktop tabs) would silently overwrite each other.
 * The newest instance wins: on start it asks any running instance (BroadcastChannel) to save and
 * stop, then waits for the Web Lock that instance held. The stopped instance shows a "use it here"
 * screen instead of the app. Browsers without both APIs get no guard, as before.
 */
const LOCK_NAME = 'workoutnotes:database';
const CHANNEL_NAME = 'workoutnotes:instance';
const RELEASE = 'release';
/** How long a lock request may pend before the caller is told another instance is still saving. */
const WAITING_AFTER_MS = 300;

export interface InstanceLock {
  /**
   * Register what to do when another instance asks to take over. The handler runs (typically a
   * flush), then the lock is released so the other instance can start.
   */
  onTakeover(handler: () => Promise<void>): void;
}

export function instanceLockSupported(): boolean {
  return typeof navigator !== 'undefined' && 'locks' in navigator && typeof BroadcastChannel !== 'undefined';
}

/**
 * Become the running instance. Resolves once the lock is held; `onWaiting` fires if that takes
 * longer than a moment (the other instance is still saving, or is suspended by the browser).
 */
export function acquireInstanceLock(onWaiting: () => void): Promise<InstanceLock> {
  // One lock per page: a second call (React StrictMode runs bootstrap twice in development) must
  // not ask this very page to hand over.
  if (!acquired) acquired = acquire(onWaiting);
  return acquired;
}

let acquired: Promise<InstanceLock> | null = null;

function acquire(onWaiting: () => void): Promise<InstanceLock> {
  if (!instanceLockSupported()) return Promise.resolve({ onTakeover: () => {} });
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.postMessage(RELEASE);
  return new Promise<InstanceLock>((resolve) => {
    const waitingTimer = setTimeout(onWaiting, WAITING_AFTER_MS);
    void navigator.locks.request(LOCK_NAME, () => {
      clearTimeout(waitingTimer);
      let handler: (() => Promise<void>) | null = null;
      let requested = false;
      let released = false;
      // Holding the lock = keeping this promise pending; releasing = resolving it.
      const held = new Promise<void>((release) => {
        const run = () => {
          if (released || !handler) return;
          released = true;
          channel.close();
          void handler().finally(release);
        };
        channel.onmessage = (e: MessageEvent<unknown>) => {
          if (e.data !== RELEASE) return;
          requested = true;
          run();
        };
        resolve({
          onTakeover(h) {
            handler = h;
            if (requested) run();
          },
        });
      });
      return held;
    });
  });
}
