/**
 * FitNotes backup restore and export. A `.fitnotes` file is a raw SQLite database, so restore means
 * "validate, reconcile schema, swap it in" and export means "hand out the live database bytes".
 * A rollback snapshot of the current database is stored in IndexedDB before every restore.
 */
import type { Database, SqlJsStatic } from '@/db/sqlite';
import { looksLikeSqlite, scalar } from '@/db/sqlite';
import { ensureSchema, validateBackupDatabase, type SchemaReport } from '@/db/schema';
import type { AppDatabase } from '@/db/store';
import { saveSnapshot } from '@/db/persistence';

export interface RestoreSummary {
  exercises: number;
  workouts: number;
  sets: number;
  routines: number;
  measurements: number;
  schema: SchemaReport;
}

export class BackupError extends Error {}

/** Parse and validate backup bytes; returns an opened database ready to use. Never mutates `bytes`. */
export function openBackup(SQL: SqlJsStatic, bytes: Uint8Array): { db: Database; schema: SchemaReport } {
  if (!looksLikeSqlite(bytes)) {
    throw new BackupError('This file is not a FitNotes backup (it is not a SQLite database).');
  }
  let db: Database;
  try {
    db = new SQL.Database(new Uint8Array(bytes));
    // Force a read so corrupt files fail here rather than later.
    scalar(db, "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table'");
  } catch (err) {
    throw new BackupError(
      `The file could not be opened as a database: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const problem = validateBackupDatabase(db);
  if (problem) {
    db.close();
    throw new BackupError(problem);
  }
  const schema = ensureSchema(db);
  return { db, schema };
}

export function summarize(db: AppDatabase): Omit<RestoreSummary, 'schema'> {
  return {
    exercises: db.scalar('SELECT COUNT(*) FROM exercise'),
    workouts: db.scalar('SELECT COUNT(DISTINCT date) FROM training_log'),
    sets: db.scalar('SELECT COUNT(*) FROM training_log'),
    routines: db.scalar('SELECT COUNT(*) FROM Routine'),
    measurements: db.scalar('SELECT COUNT(*) FROM MeasurementRecord'),
  };
}

/** Replace the live database with the backup. Snapshots the current database first. */
export async function restoreBackup(
  app: AppDatabase,
  SQL: SqlJsStatic,
  bytes: Uint8Array,
): Promise<RestoreSummary> {
  const { db, schema } = openBackup(SQL, bytes);
  await app.flush();
  await saveSnapshot(app.export(), 'Before restore');
  await app.replaceDatabase(db);
  return { ...summarize(app), schema };
}

/** File name in FitNotes' timestamped style: FitNotes_Backup_2026_09_12_18_30_00.fitnotes */
export function backupFileName(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `FitNotes_Backup_${now.getFullYear()}_${p(now.getMonth() + 1)}_${p(now.getDate())}_${p(now.getHours())}_${p(now.getMinutes())}_${p(now.getSeconds())}.fitnotes`;
}

/**
 * Build the backup to save or share. Flushing first keeps IndexedDB in step with the file, but a
 * failing flush must not block the export: the in-memory database is intact and the backup is the
 * user's way out of a broken store. `persistError` tells the caller to say so.
 */
export async function prepareBackup(
  app: AppDatabase,
  now = new Date(),
): Promise<{ blob: Blob; name: string; persistError: string | null }> {
  let persistError: string | null = null;
  try {
    await app.flush();
  } catch (err) {
    persistError = err instanceof Error ? err.message : String(err);
  }
  return { blob: exportBackupBlob(app), name: backupFileName(now), persistError };
}

export function exportBackupBlob(app: AppDatabase): Blob {
  const bytes = app.export();
  return new Blob(
    [bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer],
    {
      type: 'application/octet-stream',
    },
  );
}
