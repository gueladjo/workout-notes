import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { InstanceLock } from '../../src/app/instance';

/**
 * Fakes for the two browser APIs the lock uses: a LockManager that grants one holder at a time in
 * request order, and BroadcastChannels that deliver on a later task to every other channel of the
 * same name open by then (as with a browser's broker, a channel opened while the message was in
 * flight hears it). Each "window" is a fresh copy of the module, whose lock is cached per module.
 */
class FakeLocks {
  private held = false;
  private queue: Array<() => void> = [];
  /** Every grant and release, in order, so a test can check them against its own events. */
  readonly log: string[] = [];
  request(_name: string, cb: () => Promise<unknown>): Promise<void> {
    return new Promise<void>((resolve) => {
      const start = () => {
        if (this.held) throw new Error('lock granted twice');
        this.held = true;
        this.log.push('lock granted');
        void cb().then(() => {
          this.held = false;
          this.log.push('lock released');
          resolve();
          this.queue.shift()?.();
        });
      };
      if (this.held) this.queue.push(start);
      else start();
    });
  }
}

const channels = new Map<string, Set<FakeChannel>>();
class FakeChannel {
  onmessage: ((e: { data: unknown }) => void) | null = null;
  constructor(private readonly name: string) {
    if (!channels.has(name)) channels.set(name, new Set());
    channels.get(name)!.add(this);
  }
  postMessage(data: unknown): void {
    setTimeout(() => {
      for (const ch of channels.get(this.name) ?? []) {
        if (ch !== this) ch.onmessage?.({ data });
      }
    }, 0);
  }
  close(): void {
    channels.get(this.name)?.delete(this);
  }
}

async function windowModule() {
  vi.resetModules();
  return import('../../src/app/instance');
}
const tick = () => new Promise((r) => setTimeout(r, 5));

let locks: FakeLocks;
beforeEach(() => {
  locks = new FakeLocks();
  vi.stubGlobal('navigator', { locks });
  vi.stubGlobal('BroadcastChannel', FakeChannel);
});
afterEach(() => {
  vi.unstubAllGlobals();
  channels.clear();
});

describe('instance lock', () => {
  it('hands over to a new window once the handler and the held work have finished', async () => {
    const first = await windowModule();
    const a = await first.acquireInstanceLock(() => {});
    const events: string[] = [];
    let finishFlush = () => {};
    let finishWork = () => {};
    a.onTakeover(
      () =>
        new Promise<void>((resolve) => {
          finishFlush = () => {
            events.push('flushed');
            resolve();
          };
        }),
    );
    // Recovery-style work still writing when the second window arrives.
    const work = first.holdInstanceLock(
      () =>
        new Promise<void>((resolve) => {
          finishWork = () => {
            events.push('worked');
            resolve();
          };
        }),
    );
    const second = await windowModule();
    let b: InstanceLock | null = null;
    void second
      .acquireInstanceLock(() => {})
      .then((lock) => {
        b = lock;
        events.push('acquired');
      });
    await tick();
    expect(a.released).toBe(true);
    expect(b).toBeNull();
    // Nothing new may start in the old window.
    await expect(first.holdInstanceLock(async () => 1)).rejects.toThrow(/taken over/);
    finishFlush();
    await tick();
    expect(b).toBeNull();
    finishWork();
    await work;
    await tick();
    expect(events).toEqual(['flushed', 'worked', 'acquired']);
    expect(b!.released).toBe(false);
  });

  it('runs a takeover requested before the handler was registered once it is', async () => {
    const first = await windowModule();
    const a = await first.acquireInstanceLock(() => {});
    const second = await windowModule();
    let acquired = false;
    void second
      .acquireInstanceLock(() => {})
      .then(() => {
        acquired = true;
      });
    await tick();
    // Still the owner until it can flush: work may go on.
    expect(a.released).toBe(false);
    expect(acquired).toBe(false);
    await expect(first.holdInstanceLock(async () => 1)).resolves.toBe(1);
    let flushed = false;
    a.onTakeover(async () => {
      flushed = true;
    });
    await tick();
    expect(a.released).toBe(true);
    expect(flushed).toBe(true);
    expect(acquired).toBe(true);
  });

  it('passes the lock on to a third window that asked while the second was still queued', async () => {
    const events = locks.log;
    const first = await windowModule();
    const a = await first.acquireInstanceLock(() => {});
    let finishFlush = () => {};
    a.onTakeover(
      () =>
        new Promise<void>((resolve) => {
          finishFlush = () => {
            events.push('a flushed');
            resolve();
          };
        }),
    );
    const second = await windowModule();
    let b: InstanceLock | null = null;
    void second
      .acquireInstanceLock(() => {})
      .then((lock) => {
        b = lock;
        events.push('b acquired');
      });
    await tick();
    expect(a.released).toBe(true);
    expect(b).toBeNull();
    // A is still flushing when the third window asks: only the queued second one can hear it.
    const third = await windowModule();
    let c: InstanceLock | null = null;
    void third
      .acquireInstanceLock(() => {})
      .then((lock) => {
        c = lock;
        events.push('c acquired');
      });
    await tick();
    finishFlush();
    await tick();
    expect(b).not.toBeNull();
    expect(c).toBeNull();
    // Until B can flush it is the owner; once it can, the kept request hands over straight away.
    expect(b!.released).toBe(false);
    await expect(second.holdInstanceLock(async () => 1)).resolves.toBe(1);
    b!.onTakeover(async () => {
      events.push('b flushed');
    });
    await tick();
    expect(b!.released).toBe(true);
    expect(c).not.toBeNull();
    expect(c!.released).toBe(false);
    await expect(second.holdInstanceLock(async () => 1)).rejects.toThrow(/taken over/);
    expect(events).toEqual([
      'lock granted',
      'a flushed',
      'lock released',
      'lock granted',
      'b acquired',
      'b flushed',
      'lock released',
      'lock granted',
      'c acquired',
    ]);
  });

  it('leaves the later of two windows that start together running, not neither', async () => {
    const events = locks.log;
    const first = await windowModule();
    const second = await windowModule();
    // Both ask before either has heard the other, so each hears the other's request while queued.
    const a = await first.acquireInstanceLock(() => {});
    const b = second.acquireInstanceLock(() => {});
    a.onTakeover(async () => {
      events.push('a flushed');
    });
    await tick();
    const lockB = await b;
    lockB.onTakeover(async () => {
      events.push('b flushed');
    });
    await tick();
    expect(a.released).toBe(true);
    expect(lockB.released).toBe(false);
    await expect(second.holdInstanceLock(async () => 1)).resolves.toBe(1);
    expect(events).toEqual(['lock granted', 'a flushed', 'lock released', 'lock granted']);
  });

  it('does not hand over to a window that asked and was closed before its turn', async () => {
    const events = locks.log;
    const first = await windowModule();
    const a = await first.acquireInstanceLock(() => {});
    let finishFlush = () => {};
    a.onTakeover(
      () =>
        new Promise<void>((resolve) => {
          finishFlush = () => {
            events.push('a flushed');
            resolve();
          };
        }),
    );
    const second = await windowModule();
    let b: InstanceLock | null = null;
    void second
      .acquireInstanceLock(() => {})
      .then((lock) => {
        b = lock;
        events.push('b acquired');
      });
    await tick();
    expect(a.released).toBe(true);
    // A third window asks while the second is queued and is closed again before the lock reaches
    // it: the browser drops its lock request, so here it never queues, and its channel goes.
    const third = new FakeChannel('workoutnotes:instance');
    third.postMessage('release');
    await tick();
    third.close();
    finishFlush();
    await tick();
    expect(b).not.toBeNull();
    b!.onTakeover(async () => {
      events.push('b flushed');
    });
    await tick();
    expect(b!.released).toBe(false);
    await expect(second.holdInstanceLock(async () => 1)).resolves.toBe(1);
    expect(events).toEqual(['lock granted', 'a flushed', 'lock released', 'lock granted', 'b acquired']);
  });

  it('lets a third window in only after the first has drained its held work', async () => {
    const events = locks.log;
    const first = await windowModule();
    const a = await first.acquireInstanceLock(() => {});
    a.onTakeover(async () => {
      events.push('a flushed');
    });
    let finishWork = () => {};
    const work = first.holdInstanceLock(
      () =>
        new Promise<void>((resolve) => {
          finishWork = () => {
            events.push('a worked');
            resolve();
          };
        }),
    );
    const second = await windowModule();
    let b: InstanceLock | null = null;
    void second
      .acquireInstanceLock(() => {})
      .then((lock) => {
        b = lock;
        events.push('b acquired');
        lock.onTakeover(async () => {
          events.push('b flushed');
        });
      });
    await tick();
    expect(a.released).toBe(true);
    const third = await windowModule();
    let c: InstanceLock | null = null;
    void third
      .acquireInstanceLock(() => {})
      .then((lock) => {
        c = lock;
        events.push('c acquired');
      });
    await tick();
    expect(b).toBeNull();
    expect(c).toBeNull();
    finishWork();
    await work;
    await tick();
    expect(b!.released).toBe(true);
    expect(c!.released).toBe(false);
    expect(events).toEqual([
      'lock granted',
      'a flushed',
      'a worked',
      'lock released',
      'lock granted',
      'b acquired',
      'b flushed',
      'lock released',
      'lock granted',
      'c acquired',
    ]);
  });
});
