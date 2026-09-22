/**
 * Start-up recovery. When the stored database cannot be opened or reconciled, the app must still
 * offer a way out: save the unreadable bytes as a file, restore a rollback snapshot, or start
 * fresh. The unreadable bytes are always kept as a snapshot before anything replaces them.
 * No browser-only imports, so the whole path is unit-tested in Node with fake-indexeddb.
 */
import type { Database, SqlJsStatic } from '@/db/sqlite';
import type { AppDatabase } from '@/db/store';
import { createEmptyDatabase, ensureSchema } from '@/db/schema';
import { MAIN_KEY, readBlob, saveSnapshot, writeBlob } from '@/db/persistence';

/** Snapshot label given to the bytes the app could not open. */
export const UNREADABLE_LABEL = 'Unreadable database';

export class UnreadableDatabaseError extends Error {
  constructor(
    message: string,
    /** The stored bytes as they were, so the user can save them and tools can try to salvage them. */
    readonly bytes: Uint8Array,
    readonly SQL: SqlJsStatic,
  ) {
    super(message);
    this.name = 'UnreadableDatabaseError';
  }
}

/** FitNotes' metric default depends on locale; en-US users get pounds. */
export function defaultMetric(): boolean {
  return !navigator.language.startsWith('en-US');
}

/**
 * Open stored bytes and reconcile the schema. Any failure (corrupt file, a table shadowed by a
 * view, ...) is wrapped in `UnreadableDatabaseError` carrying the bytes so the caller can recover.
 */
export function openStoredDatabase(SQL: SqlJsStatic, bytes: Uint8Array): Database {
  let db: Database | undefined;
  try {
    db = new SQL.Database(new Uint8Array(bytes));
    ensureSchema(db);
    return db;
  } catch (err) {
    try {
      db?.close();
    } catch {
      // Nothing more to release.
    }
    throw new UnreadableDatabaseError(err instanceof Error ? err.message : String(err), bytes, SQL);
  }
}

/** File name for the saved copy of an unreadable database. */
export function unreadableFileName(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `WorkoutNotes_Unreadable_${now.getFullYear()}_${p(now.getMonth() + 1)}_${p(now.getDate())}_${p(now.getHours())}_${p(now.getMinutes())}_${p(now.getSeconds())}.fitnotes`;
}

/**
 * Replace the stored database with a rollback snapshot. The snapshot is opened first so an
 * unreadable one fails before anything is written; the damaged bytes are then kept as a snapshot.
 */
export async function recoverFromSnapshot(SQL: SqlJsStatic, key: string, damaged: Uint8Array): Promise<void> {
  const bytes = await readBlob(key);
  if (!bytes) throw new Error('Snapshot not found');
  const db = openStoredDatabase(SQL, bytes);
  const next = db.export();
  db.close();
  await replaceStoredDatabase(next, damaged);
}

/**
 * Replace the live database with a rollback snapshot (Settings > Rollback snapshots). The snapshot
 * is opened first so an unreadable one fails before the "Before rollback" snapshot is written,
 * which would have pruned the oldest recovery point for nothing.
 */
export async function rollbackToSnapshot(app: AppDatabase, SQL: SqlJsStatic, key: string): Promise<void> {
  const bytes = await readBlob(key);
  if (!bytes) throw new Error('Snapshot not found');
  const next = openStoredDatabase(SQL, bytes);
  try {
    await saveSnapshot(app.export(), 'Before rollback');
  } catch (err) {
    next.close();
    throw err;
  }
  await app.replaceDatabase(next);
}

/** Replace the stored database with an empty one, keeping the damaged bytes as a snapshot. */
export async function startFresh(SQL: SqlJsStatic, damaged: Uint8Array, metric: boolean): Promise<void> {
  const db = createEmptyDatabase(SQL, { metric });
  const next = db.export();
  db.close();
  await replaceStoredDatabase(next, damaged);
}

async function replaceStoredDatabase(next: Uint8Array, damaged: Uint8Array): Promise<void> {
  await saveSnapshot(damaged, UNREADABLE_LABEL);
  await writeBlob(MAIN_KEY, next, 'live database');
}
