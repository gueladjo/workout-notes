import { describe, expect, it, beforeAll, vi } from 'vitest';
import { loadSqlJs, type SqlJsStatic } from '../../src/db/sqlite';
import { createEmptyDatabase } from '../../src/db/schema';
import { AppDatabase } from '../../src/db/store';

let SQL: SqlJsStatic;
beforeAll(async () => {
  SQL = await loadSqlJs();
});

describe('AppDatabase', () => {
  it('rolls back a failed mutation and refuses writes outside mutate()', () => {
    const app = new AppDatabase(createEmptyDatabase(SQL));
    expect(() => app.run("INSERT INTO Routine (name) VALUES ('x')")).toThrow(/mutate/);
    expect(() =>
      app.mutate(() => {
        app.run("INSERT INTO Routine (name) VALUES ('x')");
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(app.scalar('SELECT COUNT(*) FROM Routine')).toBe(0);
  });

  it('notifies subscribers once per outermost mutation and persists debounced', async () => {
    vi.useFakeTimers();
    const persist = vi.fn(async () => {});
    const app = new AppDatabase(createEmptyDatabase(SQL), { persist, persistDelayMs: 50 });
    const listener = vi.fn();
    app.subscribe(listener);
    app.mutate(() => {
      app.run("INSERT INTO Routine (name) VALUES ('a')");
      app.mutate(() => app.run("INSERT INTO Routine (name) VALUES ('b')"));
    });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(app.hasUnsavedChanges).toBe(true);
    await vi.advanceTimersByTimeAsync(60);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(app.hasUnsavedChanges).toBe(false);
    vi.useRealTimers();
  });

  it('flush() waits for an in-flight persist and includes changes made during it', async () => {
    vi.useFakeTimers();
    const pending: Array<() => void> = [];
    const written: Uint8Array[] = [];
    const persist = vi.fn((bytes: Uint8Array) => {
      written.push(bytes);
      return new Promise<void>((resolve) => pending.push(resolve));
    });
    const app = new AppDatabase(createEmptyDatabase(SQL), { persist, persistDelayMs: 1 });
    app.mutate(() => app.run("INSERT INTO Routine (name) VALUES ('a')"));
    await vi.advanceTimersByTimeAsync(5);
    expect(persist).toHaveBeenCalledTimes(1);
    // The write is still in flight, yet nothing is dirty: callers must not treat this as saved.
    expect(app.hasUnsavedChanges).toBe(false);
    app.mutate(() => app.run("INSERT INTO Routine (name) VALUES ('b')"));
    let settled = false;
    const flushed = app.flush().then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(5);
    expect(settled).toBe(false);
    expect(persist).toHaveBeenCalledTimes(1);
    pending.shift()!();
    await vi.advanceTimersByTimeAsync(0);
    expect(persist).toHaveBeenCalledTimes(2);
    expect(settled).toBe(false);
    pending.shift()!();
    await flushed;
    expect(app.hasUnsavedChanges).toBe(false);
    const saved = new SQL.Database(written[1]);
    expect(saved.exec('SELECT COUNT(*) FROM Routine')[0]!.values[0]![0]).toBe(2);
    saved.close();
    vi.useRealTimers();
  });

  it('close() writes the changes accepted before it, refuses new ones and never writes again', async () => {
    vi.useFakeTimers();
    const pending: Array<() => void> = [];
    const written: Uint8Array[] = [];
    const persist = vi.fn((bytes: Uint8Array) => {
      written.push(bytes);
      return new Promise<void>((resolve) => pending.push(resolve));
    });
    const app = new AppDatabase(createEmptyDatabase(SQL), { persist, persistDelayMs: 1 });
    app.mutate(() => app.run("INSERT INTO Routine (name) VALUES ('a')"));
    await vi.advanceTimersByTimeAsync(5);
    expect(persist).toHaveBeenCalledTimes(1);
    // Accepted while the first write is in flight: it must reach storage before the handover ends.
    app.mutate(() => app.run("INSERT INTO Routine (name) VALUES ('b')"));
    let done = false;
    const closing = app.close().then(() => {
      done = true;
    });
    expect(app.closed).toBe(true);
    expect(() => app.mutate(() => app.run("INSERT INTO Routine (name) VALUES ('c')"))).toThrow(/handed over/);
    pending.shift()!();
    await vi.advanceTimersByTimeAsync(0);
    expect(persist).toHaveBeenCalledTimes(2);
    expect(done).toBe(false);
    pending.shift()!();
    await closing;
    expect(app.hasUnsavedChanges).toBe(false);
    // The debounce timer of the second change is gone and nothing else is ever written.
    await vi.advanceTimersByTimeAsync(50);
    await app.flush();
    expect(persist).toHaveBeenCalledTimes(2);
    const saved = new SQL.Database(written[1]);
    expect(saved.exec('SELECT COUNT(*) FROM Routine')[0]!.values[0]![0]).toBe(2);
    saved.close();
    await expect(app.replaceDatabase(createEmptyDatabase(SQL))).rejects.toThrow(/handed over/);
    vi.useRealTimers();
  });

  it('close() reports a failed last persist, keeps the bytes for a copy and still never writes again', async () => {
    const persist = vi.fn(async () => {
      throw new Error('quota');
    });
    const app = new AppDatabase(createEmptyDatabase(SQL), { persist, persistDelayMs: 1 });
    app.mutate(() => app.run("INSERT INTO Routine (name) VALUES ('a')"));
    await expect(app.close()).rejects.toThrow('quota');
    expect(app.hasUnsavedChanges).toBe(true);
    expect(app.closed).toBe(true);
    await expect(app.flush()).rejects.toThrow(/handed over/);
    expect(persist).toHaveBeenCalledTimes(1);
    const copy = new SQL.Database(app.export());
    expect(copy.exec('SELECT COUNT(*) FROM Routine')[0]!.values[0]![0]).toBe(1);
    copy.close();
  });

  it('retries persistence after a failure', async () => {
    let fail = true;
    const persist = vi.fn(async () => {
      if (fail) throw new Error('quota');
    });
    const app = new AppDatabase(createEmptyDatabase(SQL), { persist, persistDelayMs: 1 });
    app.mutate(() => app.run("INSERT INTO Routine (name) VALUES ('a')"));
    await expect(app.flush()).rejects.toThrow('quota');
    expect(app.lastPersistError).toBe('quota');
    fail = false;
    await app.flush();
    expect(app.lastPersistError).toBeNull();
    expect(app.hasUnsavedChanges).toBe(false);
  });

  it('tells persist subscribers when saving starts failing and when it works again, debounced saves included', async () => {
    vi.useFakeTimers();
    let fail = true;
    const persist = vi.fn(async () => {
      if (fail) throw new Error('quota');
    });
    const app = new AppDatabase(createEmptyDatabase(SQL), { persist, persistDelayMs: 1 });
    const seen: (string | null)[] = [];
    app.subscribePersist(() => seen.push(app.lastPersistError));
    app.mutate(() => app.run("INSERT INTO Routine (name) VALUES ('a')"));
    await vi.advanceTimersByTimeAsync(5);
    expect(seen).toEqual(['quota']);
    // Failing again with the same error is not news.
    app.mutate(() => app.run("INSERT INTO Routine (name) VALUES ('b')"));
    await vi.advanceTimersByTimeAsync(5);
    expect(persist).toHaveBeenCalledTimes(2);
    expect(seen).toEqual(['quota']);
    fail = false;
    app.mutate(() => app.run("INSERT INTO Routine (name) VALUES ('c')"));
    await vi.advanceTimersByTimeAsync(5);
    expect(seen).toEqual(['quota', null]);
    expect(app.hasUnsavedChanges).toBe(false);
    vi.useRealTimers();
  });

  it('replaceDatabase() adopts the new database even when saving it fails, and says why', async () => {
    const persist = vi.fn(async () => {
      throw new Error('quota');
    });
    const app = new AppDatabase(createEmptyDatabase(SQL), { persist, persistDelayMs: 1 });
    const next = createEmptyDatabase(SQL);
    next.run("INSERT INTO Routine (name) VALUES ('restored')");
    await expect(app.replaceDatabase(next)).resolves.toBe('quota');
    expect(app.scalar('SELECT COUNT(*) FROM Routine')).toBe(1);
    expect(app.hasUnsavedChanges).toBe(true);
    expect(app.lastPersistError).toBe('quota');
  });

  it('keeps the dirty flag and records the persist error when export() throws during flush()', async () => {
    const app = new AppDatabase(createEmptyDatabase(SQL), { persist: async () => {} });
    const seen: (string | null)[] = [];
    app.subscribePersist(() => seen.push(app.lastPersistError));
    app.mutate(() => app.run("INSERT INTO Routine (name) VALUES ('a')"));
    const realExport = app.export.bind(app);
    let fail = true;
    app.export = () => {
      if (fail) throw new Error('wasm oom');
      return realExport();
    };
    await expect(app.flush()).rejects.toThrow('wasm oom');
    expect(app.hasUnsavedChanges).toBe(true);
    expect(app.lastPersistError).toBe('wasm oom');
    expect(seen).toEqual(['wasm oom']);
    fail = false;
    await app.flush();
    expect(app.hasUnsavedChanges).toBe(false);
    expect(app.lastPersistError).toBeNull();
    expect(seen).toEqual(['wasm oom', null]);
  });

  it('retries newer changes during close() and replaceDatabase() after a stale in-flight persist fails', async () => {
    const written: Uint8Array[] = [];
    let rejectFirst!: (err: Error) => void;
    let calls = 0;
    const persist = vi.fn((bytes: Uint8Array) => {
      calls++;
      if (calls === 1) {
        return new Promise<void>((_, reject) => {
          rejectFirst = reject;
        });
      }
      written.push(bytes);
      return Promise.resolve();
    });
    const app = new AppDatabase(createEmptyDatabase(SQL), { persist, persistDelayMs: 1 });
    app.mutate(() => app.run("INSERT INTO Routine (name) VALUES ('a')"));
    const firstFlush = app.flush();
    // A second mutation supersedes the in-flight persist before it rejects transiently.
    app.mutate(() => app.run("INSERT INTO Routine (name) VALUES ('b')"));
    const closing = app.close();
    rejectFirst(new Error('transient'));
    await expect(firstFlush).rejects.toThrow('transient');
    await closing;
    expect(persist).toHaveBeenCalledTimes(2);
    expect(app.hasUnsavedChanges).toBe(false);
    expect(app.lastPersistError).toBeNull();
    const saved = new SQL.Database(written[0]);
    expect(saved.exec('SELECT COUNT(*) FROM Routine')[0]!.values[0]![0]).toBe(2);
    saved.close();

    // Same for replaceDatabase(): a stale persist failure must not skip persisting the restored db.
    let rejectStale!: (err: Error) => void;
    let restoreCalls = 0;
    const restoredWritten: Uint8Array[] = [];
    const app2 = new AppDatabase(createEmptyDatabase(SQL), {
      persist: (bytes) => {
        restoreCalls++;
        if (restoreCalls === 1) {
          return new Promise<void>((_, reject) => {
            rejectStale = reject;
          });
        }
        restoredWritten.push(bytes);
        return Promise.resolve();
      },
      persistDelayMs: 1,
    });
    app2.mutate(() => app2.run("INSERT INTO Routine (name) VALUES ('old')"));
    const staleFlush = app2.flush();
    const next = createEmptyDatabase(SQL);
    next.run("INSERT INTO Routine (name) VALUES ('restored')");
    const replacing = app2.replaceDatabase(next);
    rejectStale(new Error('stale'));
    await expect(staleFlush).rejects.toThrow('stale');
    await expect(replacing).resolves.toBeNull();
    expect(app2.hasUnsavedChanges).toBe(false);
    expect(app2.lastPersistError).toBeNull();
    const saved2 = new SQL.Database(restoredWritten[0]);
    expect(saved2.exec('SELECT name FROM Routine')[0]!.values[0]![0]).toBe('restored');
    saved2.close();
  });

  it('does not retry a failed in-flight persist when no newer change superseded it', async () => {
    let rejectFirst!: (err: Error) => void;
    const persist = vi.fn(
      () =>
        new Promise<void>((_, reject) => {
          rejectFirst = reject;
        }),
    );
    const app = new AppDatabase(createEmptyDatabase(SQL), { persist, persistDelayMs: 1 });
    app.mutate(() => app.run("INSERT INTO Routine (name) VALUES ('a')"));
    const first = app.flush();
    const waiter = app.flush();
    rejectFirst(new Error('quota'));
    await expect(first).rejects.toThrow('quota');
    await expect(waiter).rejects.toThrow('quota');
    expect(persist).toHaveBeenCalledTimes(1);
    expect(app.hasUnsavedChanges).toBe(true);
  });

  it('close() waits for an in-flight saveSnapshot() and refuses snapshots once closing or closed', async () => {
    let finishSnapshot!: (key: string) => void;
    const saveSnapshot = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          finishSnapshot = resolve;
        }),
    );
    const app = new AppDatabase(createEmptyDatabase(SQL), { saveSnapshot });
    const snap = app.saveSnapshot('Before delete');
    expect(saveSnapshot).toHaveBeenCalledTimes(1);

    let closed = false;
    const closing = app.close().then(() => {
      closed = true;
    });
    // No new snapshot may start while handover is draining.
    await expect(app.saveSnapshot('Too late')).rejects.toThrow(/handed over/);
    expect(saveSnapshot).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    expect(closed).toBe(false);

    finishSnapshot('snapshot:1');
    await expect(snap).resolves.toBe('snapshot:1');
    await closing;
    expect(closed).toBe(true);
    await expect(app.saveSnapshot('After close')).rejects.toThrow(/handed over/);
    expect(saveSnapshot).toHaveBeenCalledTimes(1);
  });
});
