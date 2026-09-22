import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { InstanceLock } from '../../src/app/instance';

/**
 * Fakes for the two browser APIs the lock uses: a LockManager that grants one holder at a time in
 * request order, and BroadcastChannels that deliver to every other channel of the same name on a
 * later task. Each "window" is a fresh copy of the module, whose lock is cached per module.
 */
class FakeLocks {
  private held = false;
  private queue: Array<() => void> = [];
  request(_name: string, cb: () => Promise<unknown>): Promise<void> {
    return new Promise<void>((resolve) => {
      const start = () => {
        this.held = true;
        void cb().then(() => {
          this.held = false;
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
    for (const ch of channels.get(this.name) ?? []) {
      if (ch !== this) setTimeout(() => ch.onmessage?.({ data }), 0);
    }
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

beforeEach(() => {
  vi.stubGlobal('navigator', { locks: new FakeLocks() });
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
});
