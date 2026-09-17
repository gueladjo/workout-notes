/**
 * Application start-up: load sql.js, open the persisted database (or create a fresh one), reconcile
 * the schema, and wire persistence. Browser-only (imports the WASM asset URL through Vite).
 */
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { loadSqlJs, type SqlJsStatic } from '@/db/sqlite';
import { createEmptyDatabase, ensureSchema } from '@/db/schema';
import { AppDatabase } from '@/db/store';
import { MAIN_KEY, readBlob, requestPersistentStorage, writeBlob } from '@/db/persistence';
import { defaultMetric, openStoredDatabase } from './recovery';
import { reloadIfUpdatePending } from './update';
import { acquireInstanceLock } from './instance';

export interface BootResult {
  app: AppDatabase;
  SQL: SqlJsStatic;
  /** true when no database existed and a fresh one was created. */
  fresh: boolean;
}

export interface BootOptions {
  /** Another instance holds the database and is still handing it over. */
  onWaiting?: () => void;
  /** Another instance took over; this one has flushed (or failed to) and must stop. */
  onTakenOver?: (unsaved: boolean) => void;
}

/**
 * Opens the app database once this is the only running instance (see `instance.ts`). Rejects with
 * `UnreadableDatabaseError` (see `recovery.ts`) when the stored bytes cannot be opened or
 * reconciled, so the app can offer recovery instead of a dead end.
 */
export async function bootstrap(options: BootOptions = {}): Promise<BootResult> {
  const [SQL, lock] = await Promise.all([
    loadSqlJs(() => sqlWasmUrl),
    acquireInstanceLock(() => options.onWaiting?.()),
  ]);
  const saved = await readBlob(MAIN_KEY);
  const db = saved ? openStoredDatabase(SQL, saved) : createEmptyDatabase(SQL, { metric: defaultMetric() });
  if (!saved) ensureSchema(db);
  const app = new AppDatabase(db, { persist: (bytes) => writeBlob(MAIN_KEY, bytes, 'live database') });
  if (!saved) {
    app.changed();
    await app.flush();
  }
  void requestPersistentStorage();

  // Flush pending changes when the page is hidden or unloaded (mobile browsers kill tabs freely).
  // A downloaded update is applied once the app is hidden and everything is saved.
  const flush = () => (app.hasUnsavedChanges ? app.flush() : Promise.resolve());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return;
    flush().then(reloadIfUpdatePending, () => {});
  });
  window.addEventListener('pagehide', () => void flush().catch(() => {}));
  lock.onTakeover(async () => {
    await flush().catch(() => {});
    options.onTakenOver?.(app.hasUnsavedChanges);
  });
  return { app, SQL, fresh: !saved };
}
