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

export const TAKEN_OVER_MESSAGE = 'Another WorkoutNotes window has taken over';

export interface InstanceLock {
  /**
   * Register what to do when another instance asks to take over. The handler runs (typically a
   * final flush), then the lock is released so the other instance can start.
   */
  onTakeover(handler: () => Promise<void>): void;
  /**
   * True from the moment another instance asks for the database: the stored bytes are (about to
   * be) that instance's and nothing here may write them any more.
   */
  readonly released: boolean;
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

/**
 * Run work that writes the stored database outside `AppDatabase` (start-up recovery) under the
 * lock: a takeover requested meanwhile waits for it to finish, and once a takeover was requested
 * the work is refused instead of racing the other instance's writes.
 */
export function holdInstanceLock<T>(work: () => Promise<T>): Promise<T> {
  if (released) return Promise.reject(new Error(TAKEN_OVER_MESSAGE));
  const result = work();
  const settled = result.then(
    () => undefined,
    () => undefined,
  );
  holds.add(settled);
  void settled.then(() => holds.delete(settled));
  return result;
}

let acquired: Promise<InstanceLock> | null = null;
let released = false;
const holds = new Set<Promise<void>>();

function acquire(onWaiting: () => void): Promise<InstanceLock> {
  if (!instanceLockSupported()) return Promise.resolve({ onTakeover: () => {}, released: false });
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.postMessage(RELEASE);
  return new Promise<InstanceLock>((resolve) => {
    const waitingTimer = setTimeout(onWaiting, WAITING_AFTER_MS);
    void navigator.locks.request(LOCK_NAME, () => {
      clearTimeout(waitingTimer);
      let handler: (() => Promise<void>) | null = null;
      let requested = false;
      // Holding the lock = keeping this promise pending; releasing = resolving it.
      const held = new Promise<void>((release) => {
        const run = () => {
          if (released || !handler) return;
          released = true;
          channel.close();
          // The lock goes once the handler and every piece of held work have finished.
          void handler()
            .catch(() => {})
            .then(() => Promise.all(holds))
            .then(() => release());
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
          get released() {
            return released;
          },
        });
      });
      return held;
    });
  });
}
