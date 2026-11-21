import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

async function loadUpdate() {
  vi.resetModules();
  return import('../../src/app/update');
}

describe('service-worker update hand-off', () => {
  let reload: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    reload = vi.fn();
    vi.stubGlobal('window', { location: { reload } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reloads once the hide flush succeeds when an update is waiting and this window owns the lock', async () => {
    const { markUpdatePending, flushOnHide } = await loadUpdate();
    markUpdatePending();
    await flushOnHide({ flush: async () => {}, closed: false }, () => false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('skips reloading if another window took over while the hide flush was in flight', async () => {
    const { markUpdatePending, flushOnHide } = await loadUpdate();
    markUpdatePending();
    let finishFlush!: () => void;
    let closed = false;
    let released = false;
    const hiding = flushOnHide(
      {
        flush: () =>
          new Promise<void>((resolve) => {
            finishFlush = resolve;
          }),
        get closed() {
          return closed;
        },
      },
      () => released,
    );
    // Another window takes over while the flush runs: closing finishes that same flush.
    closed = true;
    released = true;
    finishFlush();
    await hiding;
    expect(reload).not.toHaveBeenCalled();
  });

  it('skips reloading when the hide flush fails or no update is waiting', async () => {
    const { markUpdatePending, flushOnHide } = await loadUpdate();
    await flushOnHide({ flush: async () => {}, closed: false }, () => false);
    expect(reload).not.toHaveBeenCalled();
    markUpdatePending();
    await flushOnHide(
      {
        flush: async () => {
          throw new Error('quota');
        },
        closed: false,
      },
      () => false,
    );
    expect(reload).not.toHaveBeenCalled();
  });
});
