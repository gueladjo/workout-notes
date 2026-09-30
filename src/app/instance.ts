/**
 * Single running instance per origin. Every persist writes the whole database, so two instances
 * (an installed app plus a browser tab, or two desktop tabs) would silently overwrite each other.
 * The newest instance wins. On start an instance listens on a BroadcastChannel, asks any running
 * instance (one `release` message) to save and stop, then queues for the Web Lock that instance
 * holds. The holder runs its takeover handler (a final flush), waits for its held work and releases
 * the lock; it shows a "use it here" screen instead of the app. Only the holder acts on a request.
 * An instance still queued for the lock ignores what it hears, because the lock's queue, not the
 * message, says which instance is newer (two windows starting together would otherwise hand over
 * to each other, and one closed before its turn would be handed over to). Instead each new holder
 * announces itself (`acquired`) and every instance still queued asks again, so the lock moves on
 * to the next in line and the newest instance gets through however many start-ups overlap.
 * Browsers without both APIs get no guard, as before.
 */
const LOCK_NAME = 'workoutnotes:database';
const CHANNEL_NAME = 'workoutnotes:instance';
const RELEASE = 'release';
const ACQUIRED = 'acquired';
/** How long a lock request may pend before the caller is told another instance is still saving. */
const WAITING_AFTER_MS = 300;

export const TAKEN_OVER_MESSAGE = 'Another WorkoutNotes window has taken over';

export interface InstanceLock {
  /**
   * Register what to do when another instance asks to take over. The handler runs (typically a
   * final flush), then the lock is released so the other instance can start. A request that
   * arrived earlier (since this instance took the lock) runs the handler right away.
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
  let handler: (() => Promise<void>) | null = null;
  let holding = false;
  let requested = false;
  let release = () => {};
  const run = () => {
    // The handler is registered through the resolved lock, so a request that arrives before that
    // waits here until it is.
    if (released || !handler) return;
    released = true;
    channel.close();
    // The lock goes once the handler and every piece of held work have finished.
    void handler()
      .catch(() => {})
      .then(() => Promise.all(holds))
      .then(() => release());
  };
  // Listening before asking and before queueing, so that the announcement of a new holder cannot
  // be missed while this instance is queued.
  channel.onmessage = (e: MessageEvent<unknown>) => {
    if (e.data === RELEASE) {
      // A request heard while queued may come from an instance ahead of or behind this one in the
      // lock's queue; whoever is still waiting asks again once this instance holds the lock.
      if (!holding) return;
      requested = true;
      run();
    } else if (e.data === ACQUIRED && !holding) {
      channel.postMessage(RELEASE);
    }
  };
  channel.postMessage(RELEASE);
  return new Promise<InstanceLock>((resolve) => {
    const waitingTimer = setTimeout(onWaiting, WAITING_AFTER_MS);
    void navigator.locks.request(LOCK_NAME, () => {
      clearTimeout(waitingTimer);
      holding = true;
      channel.postMessage(ACQUIRED);
      // Holding the lock = keeping this promise pending; releasing = resolving it.
      return new Promise<void>((r) => {
        release = r;
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
    });
  });
}
