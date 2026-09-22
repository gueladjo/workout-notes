import { describe, expect, it, beforeAll, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { loadSqlJs, type SqlJsStatic } from '../../src/db/sqlite';
import { createEmptyDatabase } from '../../src/db/schema';
import { AppDatabase } from '../../src/db/store';
import { seedSampleWorkouts } from '../helpers/sample';
import {
  listSnapshots,
  MAIN_KEY,
  MAX_SNAPSHOTS,
  readBlob,
  saveSnapshot,
  writeBlob,
} from '../../src/db/persistence';
import {
  openStoredDatabase,
  recoverFromSnapshot,
  rollbackToSnapshot,
  startFresh,
  UnreadableDatabaseError,
  UNREADABLE_LABEL,
} from '../../src/app/recovery';

let SQL: SqlJsStatic;
const garbage = new Uint8Array(4096).fill(0x41);

function goodBytes(): Uint8Array {
  const db = createEmptyDatabase(SQL);
  seedSampleWorkouts(db);
  return new AppDatabase(db).export();
}

const nextMillisecond = () => new Promise((resolve) => setTimeout(resolve, 2));

function setCount(bytes: Uint8Array | undefined): number {
  return new AppDatabase(openStoredDatabase(SQL, bytes!)).scalar('SELECT COUNT(*) FROM training_log');
}

beforeAll(async () => {
  SQL = await loadSqlJs();
});
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe('start-up recovery', () => {
  it('wraps a database that cannot be opened, keeping its bytes', () => {
    let caught: unknown;
    try {
      openStoredDatabase(SQL, garbage);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(UnreadableDatabaseError);
    expect((caught as UnreadableDatabaseError).bytes).toBe(garbage);
    expect((caught as UnreadableDatabaseError).message).toMatch(/malformed|not a database/);
    // A table shadowed by a view cannot be reconciled either.
    const shadowed = new SQL.Database();
    shadowed.run('CREATE VIEW Plate AS SELECT 1 AS _id');
    expect(() => openStoredDatabase(SQL, shadowed.export())).toThrow(UnreadableDatabaseError);
    // Sound bytes open and are not modified.
    const good = goodBytes();
    const copy = new Uint8Array(good);
    openStoredDatabase(SQL, good).close();
    expect(good).toEqual(copy);
  });

  it('restores a snapshot over the unreadable database and keeps the damaged bytes', async () => {
    await writeBlob(MAIN_KEY, garbage, 'live database');
    const key = await saveSnapshot(goodBytes(), 'Before restore');
    await recoverFromSnapshot(SQL, key, garbage);
    expect(setCount(await readBlob(MAIN_KEY))).toBe(10);
    const kept = (await listSnapshots()).find((s) => s.label === UNREADABLE_LABEL);
    expect(kept).toBeDefined();
    expect(await readBlob(kept!.key)).toEqual(garbage);
  });

  it('refuses a snapshot that is unreadable too and leaves the store untouched', async () => {
    await writeBlob(MAIN_KEY, garbage, 'live database');
    const key = await saveSnapshot(new Uint8Array(200).fill(1), 'Before restore');
    await expect(recoverFromSnapshot(SQL, key, garbage)).rejects.toThrow(UnreadableDatabaseError);
    expect(await readBlob(MAIN_KEY)).toEqual(garbage);
    expect((await listSnapshots()).map((s) => s.label)).toEqual(['Before restore']);
  });

  it('rolls the live database back to a snapshot, keeping the current data as a snapshot', async () => {
    const persisted: Uint8Array[] = [];
    const db = createEmptyDatabase(SQL);
    seedSampleWorkouts(db);
    const app = new AppDatabase(db, { persist: async (bytes) => void persisted.push(bytes) });
    const key = await saveSnapshot(new AppDatabase(createEmptyDatabase(SQL)).export(), 'Before restore');
    await rollbackToSnapshot(app, SQL, key);
    expect(app.scalar('SELECT COUNT(*) FROM training_log')).toBe(0);
    expect(setCount(persisted.at(-1))).toBe(0);
    const snapshots = await listSnapshots();
    expect(snapshots.map((s) => s.label)).toEqual(['Before rollback', 'Before restore']);
    expect(setCount(await readBlob(snapshots[0]!.key))).toBe(10);
  });

  it('refuses an unreadable rollback snapshot before writing or pruning anything', async () => {
    const app = new AppDatabase(openStoredDatabase(SQL, goodBytes()));
    const labels: string[] = [];
    for (let i = 1; i < MAX_SNAPSHOTS; i++) {
      await saveSnapshot(goodBytes(), `Snapshot ${i}`);
      labels.unshift(`Snapshot ${i}`);
      await nextMillisecond(); // snapshot keys are timestamps
    }
    const key = await saveSnapshot(garbage, 'Damaged');
    labels.unshift('Damaged');
    expect(labels).toHaveLength(MAX_SNAPSHOTS);
    await expect(rollbackToSnapshot(app, SQL, key)).rejects.toThrow(UnreadableDatabaseError);
    expect(app.scalar('SELECT COUNT(*) FROM training_log')).toBe(10);
    expect((await listSnapshots()).map((s) => s.label)).toEqual(labels);
    await expect(rollbackToSnapshot(app, SQL, 'snapshot:missing')).rejects.toThrow('Snapshot not found');
  });

  it('starts fresh with an empty database, keeping the damaged bytes', async () => {
    await writeBlob(MAIN_KEY, garbage, 'live database');
    await startFresh(SQL, garbage, false);
    const main = await readBlob(MAIN_KEY);
    expect(setCount(main)).toBe(0);
    expect(new AppDatabase(openStoredDatabase(SQL, main!)).scalar('SELECT metric FROM settings')).toBe(0);
    expect((await listSnapshots()).map((s) => s.label)).toEqual([UNREADABLE_LABEL]);
  });
});
