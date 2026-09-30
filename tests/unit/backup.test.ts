import { describe, expect, it, beforeAll, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { loadSqlJs, scalar, type SqlJsStatic } from '../../src/db/sqlite';
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
import { damageTableRootPage } from '../helpers/corrupt';
import {
  listSnapshots,
  readBlob,
  writeBlob,
  saveSnapshot,
  MAIN_KEY,
  MAX_SNAPSHOTS,
} from '../../src/db/persistence';
import { workoutCsv } from '../../src/backup/csv';
import { ExerciseWeightUnit } from '../../src/db/constants';

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

  it('rejects a damaged backup before touching the live database or its snapshots', async () => {
    const source = createEmptyDatabase(SQL);
    seedSampleWorkouts(source);
    // Header, schema page and required tables intact: only the sets' data page is damaged.
    const damaged = damageTableRootPage(SQL, source.export(), 'training_log');
    const untouched = new Uint8Array(damaged);
    expect(() => openBackup(SQL, damaged)).toThrow(BackupError);
    expect(() => openBackup(SQL, damaged)).toThrow(/damaged/);
    expect(damaged).toEqual(untouched);

    const live = createEmptyDatabase(SQL);
    seedSampleWorkouts(live);
    const app = new AppDatabase(live, { persist: (bytes) => writeBlob(MAIN_KEY, bytes, 'live database') });
    app.changed();
    await app.flush();
    const storedBefore = await readBlob(MAIN_KEY);
    const snapshotsBefore = await listSnapshots();
    await expect(restoreBackup(app, SQL, damaged)).rejects.toThrow(BackupError);
    expect(app.scalar('SELECT COUNT(*) FROM training_log')).toBe(10);
    expect(app.hasUnsavedChanges).toBe(false);
    expect(await readBlob(MAIN_KEY)).toEqual(storedBefore);
    expect(await listSnapshots()).toEqual(snapshotsBefore);
  });

  it('closes the backup it opened when the flush before the restore fails', async () => {
    const app = new AppDatabase(createEmptyDatabase(SQL), {
      persist: async () => {
        throw new Error('quota');
      },
    });
    app.mutate(() => app.run("INSERT INTO Routine (name) VALUES ('a')"));
    const backup = createEmptyDatabase(SQL);
    seedSampleWorkouts(backup);
    const bytes = backup.export();
    backup.close();
    const closed = vi.spyOn(SQL.Database.prototype, 'close');
    try {
      await expect(restoreBackup(app, SQL, bytes)).rejects.toThrow('quota');
      // The one close is the backup's: the live database is kept, with its unsaved change.
      expect(closed).toHaveBeenCalledTimes(1);
    } finally {
      closed.mockRestore();
    }
    expect(app.scalar('SELECT COUNT(*) FROM Routine')).toBe(1);
    expect(app.hasUnsavedChanges).toBe(true);
  });

  it('still opens and reconciles legacy-shaped and newer backups', () => {
    const legacy = new SQL.Database();
    legacy.run('CREATE TABLE Category(_id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)');
    legacy.run(
      'CREATE TABLE exercise(_id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, category_id INTEGER NOT NULL)',
    );
    legacy.run(
      'CREATE TABLE training_log (_id INTEGER PRIMARY KEY AUTOINCREMENT, exercise_id INTEGER NOT NULL, date DATE NOT NULL, metric_weight INTEGER NOT NULL, reps INTEGER NOT NULL)',
    );
    legacy.run("INSERT INTO Category (name) VALUES ('Chest')");
    legacy.run("INSERT INTO exercise (name, category_id) VALUES ('Bench', 1)");
    legacy.run(
      "INSERT INTO training_log (exercise_id, date, metric_weight, reps) VALUES (1, '2015-01-01', 100, 5)",
    );
    const upgraded = openBackup(SQL, legacy.export());
    expect(upgraded.schema.addedColumns).toContain('training_log.distance');
    expect(upgraded.schema.createdTables).toContain('Routine');
    expect(scalar(upgraded.db, 'SELECT reps FROM training_log')).toBe(5);
    upgraded.db.close();

    const newer = createEmptyDatabase(SQL);
    newer.run('PRAGMA user_version = 30');
    newer.run('CREATE TABLE FutureTable (x INTEGER)');
    newer.run('INSERT INTO FutureTable VALUES (1)');
    const kept = openBackup(SQL, newer.export());
    expect(kept.schema).toEqual({ createdTables: [], addedColumns: [], migrations: [] });
    expect(scalar(kept.db, 'PRAGMA user_version')).toBe(30);
    expect(scalar(kept.db, 'SELECT x FROM FutureTable')).toBe(1);
    kept.db.close();
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

  it('writes every weight in the unit named in the CSV header', () => {
    const db = createEmptyDatabase(SQL);
    seedSampleWorkouts(db);
    const app = new AppDatabase(db);
    // An exercise pinned to pounds in a metric database: the header says kgs, so the rows must too.
    app.mutate(() =>
      app.run('UPDATE exercise SET weight_unit_id = ? WHERE name = ?', [
        ExerciseWeightUnit.IMPERIAL,
        'Flat Barbell Bench Press',
      ]),
    );
    expect(workoutCsv(app).split('\n')[1]).toBe('2026-09-01,Flat Barbell Bench Press,Chest,60,10,,,,');
    app.mutate(() => app.run('UPDATE settings SET metric = 0'));
    const imperial = workoutCsv(app).split('\n');
    expect(imperial[0]).toBe('Date,Exercise,Category,Weight (lbs),Reps,Distance,Distance Unit,Time,Comment');
    expect(imperial[1]).toBe('2026-09-01,Flat Barbell Bench Press,Chest,132.277,10,,,,');
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
