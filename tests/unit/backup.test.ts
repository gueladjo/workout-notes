import { describe, expect, it, beforeAll } from 'vitest';
import 'fake-indexeddb/auto';
import { loadSqlJs, type SqlJsStatic } from '../../src/db/sqlite';
import { createEmptyDatabase } from '../../src/db/schema';
import { AppDatabase } from '../../src/db/store';
import {
  BackupError,
  backupFileName,
  openBackup,
  prepareBackup,
  restoreBackup,
  summarize,
} from '../../src/backup/fitnotes';
import { seedSampleWorkouts } from '../helpers/sample';
import { listSnapshots, readBlob, writeBlob, saveSnapshot, MAX_SNAPSHOTS } from '../../src/db/persistence';
import { workoutCsv } from '../../src/backup/csv';

let SQL: SqlJsStatic;
beforeAll(async () => {
  SQL = await loadSqlJs();
});

describe('backup round trip', () => {
  it('export -> open -> export is byte-identical and does not modify the input', async () => {
    const db = createEmptyDatabase(SQL);
    seedSampleWorkouts(db);
    const app = new AppDatabase(db);
    const bytes = app.export();
    const copy = new Uint8Array(bytes);
    const opened = openBackup(SQL, bytes);
    expect(bytes).toEqual(copy);
    expect(opened.schema).toEqual({ createdTables: [], addedColumns: [], migrations: [] });
    const again = new AppDatabase(opened.db).export();
    expect(again).toEqual(bytes);
  });

  it('still produces a backup when saving to IndexedDB fails', async () => {
    const app = new AppDatabase(createEmptyDatabase(SQL), {
      persist: async () => {
        throw new Error('quota');
      },
    });
    app.mutate(() => app.run("INSERT INTO Routine (name) VALUES ('a')"));
    const { blob, name, persistError } = await prepareBackup(app, new Date(2026, 8, 12, 18, 30, 0));
    expect(persistError).toBe('quota');
    expect(name).toBe('FitNotes_Backup_2026_09_12_18_30_00.fitnotes');
    const reopened = openBackup(SQL, new Uint8Array(await blob.arrayBuffer()));
    expect(new AppDatabase(reopened.db).scalar('SELECT COUNT(*) FROM Routine')).toBe(1);
    expect(app.hasUnsavedChanges).toBe(true);
  });

  it('restores into the live database with a rollback snapshot', async () => {
    const source = createEmptyDatabase(SQL);
    seedSampleWorkouts(source);
    const backupBytes = source.export();
    const app = new AppDatabase(createEmptyDatabase(SQL));
    const result = await restoreBackup(app, SQL, backupBytes);
    expect(result.sets).toBe(10);
    expect(result.workouts).toBe(3);
    expect(summarize(app).routines).toBe(1);
    const snaps = await listSnapshots();
    expect(snaps).toHaveLength(1);
    expect(snaps[0]!.label).toBe('Before restore');
    const snapBytes = await readBlob(snaps[0]!.key);
    expect(
      snapBytes && new AppDatabase(new SQL.Database(snapBytes)).scalar('SELECT COUNT(*) FROM training_log'),
    ).toBe(0);
  });

  it('rejects non-SQLite and non-FitNotes files', () => {
    expect(() =>
      openBackup(SQL, new TextEncoder().encode('hello world, definitely not a database file at all........')),
    ).toThrow(BackupError);
    const other = new SQL.Database();
    other.run('CREATE TABLE t (x)');
    expect(() => openBackup(SQL, other.export())).toThrow(/Category/);
  });

  it('names backups like FitNotes', () => {
    expect(backupFileName(new Date(2026, 8, 12, 15, 30, 5))).toBe(
      'FitNotes_Backup_2026_09_12_15_30_05.fitnotes',
    );
  });

  it('exports CSV in FitNotes column layout', () => {
    const db = createEmptyDatabase(SQL);
    seedSampleWorkouts(db);
    const csv = workoutCsv(new AppDatabase(db));
    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe('Date,Exercise,Category,Weight (kgs),Reps,Distance,Distance Unit,Time,Comment');
    expect(lines[1]).toBe('2026-09-01,Flat Barbell Bench Press,Chest,60,10,,,,');
    expect(lines).toContain('2026-09-04,Cycling,Cardio,,,12,km,30:00,');
  });
});

describe('persistence snapshots', () => {
  it('prunes to the newest MAX_SNAPSHOTS', async () => {
    for (let i = 0; i < MAX_SNAPSHOTS + 3; i++) {
      await saveSnapshot(new Uint8Array([i]), `s${i}`);
      await new Promise((r) => setTimeout(r, 2));
    }
    const snaps = await listSnapshots();
    expect(snaps.length).toBe(MAX_SNAPSHOTS);
    await writeBlob('main', new Uint8Array([1, 2, 3]));
    expect(await readBlob('main')).toEqual(new Uint8Array([1, 2, 3]));
  });
});
