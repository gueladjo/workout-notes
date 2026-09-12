/**
 * Application start-up: load sql.js, open the persisted database (or create a fresh one), reconcile
 * the schema, and wire persistence. Browser-only (imports the WASM asset URL through Vite).
 */
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { loadSqlJs, type SqlJsStatic } from '@/db/sqlite';
import { createEmptyDatabase, ensureSchema } from '@/db/schema';
import { AppDatabase } from '@/db/store';
import { MAIN_KEY, readBlob, requestPersistentStorage, writeBlob } from '@/db/persistence';

export interface BootResult {
  app: AppDatabase;
  SQL: SqlJsStatic;
  /** true when no database existed and a fresh one was created. */
  fresh: boolean;
}

export async function bootstrap(): Promise<BootResult> {
  const SQL = await loadSqlJs(() => sqlWasmUrl);
  const saved = await readBlob(MAIN_KEY);
  const metric = !navigator.language.startsWith('en-US');
  const db = saved ? new SQL.Database(saved) : createEmptyDatabase(SQL, { metric });
  ensureSchema(db);
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
