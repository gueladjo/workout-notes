import { afterEach, describe, expect, it, vi } from 'vitest';
import { keepScreenOn } from '../../src/app/wake-lock';

/**
 * Fakes for the two browser APIs the lock uses: a WakeLock whose request() resolves only when the
 * test says so (the real one is asynchronous, which is the whole point), and a document with a
 * visibility state and a visibilitychange listener list.
 */
class FakeSentinel {
  released = false;
  release = vi.fn(async () => {
    this.released = true;
  });
}

function fakeWakeLock() {
  const pending: Array<(s: FakeSentinel) => void> = [];
  const sentinels: FakeSentinel[] = [];
  const request = vi.fn(
    () =>
      new Promise<FakeSentinel>((resolve) => {
        pending.push(resolve);
      }),
  );
  /** Grant the oldest pending request. */
  const grant = async () => {
    const s = new FakeSentinel();
    sentinels.push(s);
    pending.shift()!(s);
    await Promise.resolve();
    await Promise.resolve();
    return s;
  };
  return { request, grant, sentinels };
}

function fakeDocument(state: DocumentVisibilityState = 'visible') {
  const listeners = new Set<() => void>();
  return {
    visibilityState: state,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
    /** Change the visibility state and fire visibilitychange. */
    show(visible: boolean) {
      this.visibilityState = visible ? 'visible' : 'hidden';
      for (const fn of listeners) fn();
    },
    listeners,
  };
}

function setup(state: DocumentVisibilityState = 'visible') {
  const wakeLock = fakeWakeLock();
  const doc = fakeDocument(state);
  vi.stubGlobal('navigator', { wakeLock });
  vi.stubGlobal('document', doc);
  return { wakeLock, doc };
}

afterEach(() => vi.unstubAllGlobals());

describe('keepScreenOn', () => {
  it('holds the lock until stopped', async () => {
    const { wakeLock } = setup();
    const stop = keepScreenOn();
    expect(wakeLock.request).toHaveBeenCalledWith('screen');
    const s = await wakeLock.grant();
    expect(s.release).not.toHaveBeenCalled();
    stop();
    expect(s.release).toHaveBeenCalledTimes(1);
  });

  it('releases a lock granted after it was stopped', async () => {
    const { wakeLock, doc } = setup();
    const stop = keepScreenOn();
    stop(); // unmount while request('screen') is still pending
    const s = await wakeLock.grant();
    expect(s.release).toHaveBeenCalledTimes(1);
    expect(doc.listeners.size).toBe(0);
  });

  it('re-acquires when the page becomes visible again and drops a duplicate grant', async () => {
    const { wakeLock, doc } = setup();
    const stop = keepScreenOn();
    const first = await wakeLock.grant();
    // The browser releases the lock itself when the page is hidden.
    doc.show(false);
    first.released = true;
    doc.show(true);
    expect(wakeLock.request).toHaveBeenCalledTimes(2);
    // A second visibilitychange while the request is pending asks again; only one lock is kept.
    doc.show(true);
    expect(wakeLock.request).toHaveBeenCalledTimes(3);
    const second = await wakeLock.grant();
    const third = await wakeLock.grant();
    expect(second.release).not.toHaveBeenCalled();
    expect(third.release).toHaveBeenCalledTimes(1);
    stop();
    expect(second.release).toHaveBeenCalledTimes(1);
  });

  it('waits for the page to be visible before asking', () => {
    const { wakeLock, doc } = setup('hidden');
    const stop = keepScreenOn();
    expect(wakeLock.request).not.toHaveBeenCalled();
    doc.show(true);
    expect(wakeLock.request).toHaveBeenCalledTimes(1);
    stop();
  });

  it('survives a denied request', async () => {
    const { wakeLock } = setup();
    wakeLock.request.mockImplementationOnce(() => Promise.reject(new DOMException('no', 'NotAllowedError')));
    const stop = keepScreenOn();
    await Promise.resolve();
    await Promise.resolve();
    expect(() => stop()).not.toThrow();
  });
});
