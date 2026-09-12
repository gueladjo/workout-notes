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
