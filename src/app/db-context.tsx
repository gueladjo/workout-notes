import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { AppDatabase } from '@/db/store';

const DbContext = createContext<AppDatabase | null>(null);

export function DbProvider({ db, children }: { db: AppDatabase; children: ReactNode }) {
  return <DbContext.Provider value={db}>{children}</DbContext.Provider>;
}

export function useDb(): AppDatabase {
  const db = useContext(DbContext);
  if (!db) throw new Error('useDb() used outside <DbProvider>');
  return db;
}

/** Re-renders the component whenever the database changes. Returns the change counter. */
export function useDbVersion(): number {
  const db = useDb();
  return useSyncExternalStore(
    (cb) => db.subscribe(cb),
    () => db.version,
    () => db.version,
  );
}

/**
 * Run a synchronous query against the database and keep the result fresh across mutations.
 * `deps` are extra inputs (route params, filters) that should trigger a re-query.
 */
export function useQuery<T>(query: (db: AppDatabase) => T, deps: readonly unknown[] = []): T {
  const db = useDb();
  const version = useDbVersion();
  // Cached result keyed on (db, version, deps). Re-computed during render when the key changes,
  // which is React's sanctioned pattern for state derived from props ("adjusting state on change").
  const [cache, setCache] = useState<{ db: AppDatabase; version: number; deps: readonly unknown[]; value: T } | null>(null);
  if (cache && cache.db === db && cache.version === version && sameDeps(cache.deps, deps)) return cache.value;
  const value = query(db);
  setCache({ db, version, deps, value });
  return value;
}

function sameDeps(a: readonly unknown[], b: readonly unknown[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false;
  return true;
}
