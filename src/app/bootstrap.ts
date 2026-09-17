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

export interface BootResult {
  app: AppDatabase;
  SQL: SqlJsStatic;
  /** true when no database existed and a fresh one was created. */
  fresh: boolean;
}

/**
 * Opens the app database. Rejects with `UnreadableDatabaseError` (see `recovery.ts`) when the stored
 * bytes cannot be opened or reconciled, so the app can offer recovery instead of a dead end.
 */
export async function bootstrap(): Promise<BootResult> {
  const SQL = await loadSqlJs(() => sqlWasmUrl);
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
  const flush = () => {
    if (app.hasUnsavedChanges) void app.flush().catch(() => {});
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  window.addEventListener('pagehide', flush);
  return { app, SQL, fresh: !saved };
}
