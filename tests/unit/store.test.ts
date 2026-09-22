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
});
