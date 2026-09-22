/**
 * AppDatabase: the single live SQLite database plus change notification and debounced persistence.
 *
 * All writes go through `mutate()`, which wraps the work in a transaction, bumps `version`, notifies
 * subscribers (React re-queries) and schedules a persist of the full database bytes. Reads use
 * `all/get/scalar`. Repositories in `src/db/repo/*` are the only modules that should write SQL.
 * `close()` hands the stored bytes over to another instance: writes are refused, what is unsaved
 * is persisted one last time and nothing is written afterwards.
 */
import type { BindParams, Database, Row } from './sqlite';
import { all, get, scalar, transaction } from './sqlite';

export type Persist = (bytes: Uint8Array) => Promise<void>;

export const HANDED_OVER_MESSAGE = 'The database was handed over to another WorkoutNotes window';

export interface AppDatabaseOptions {
  /** Called with the full database bytes after changes (debounced). */
  persist?: Persist;
  /** Debounce delay in ms for persistence. */
  persistDelayMs?: number;
}

export class AppDatabase {
  private db: Database;
  private readonly persist: Persist;
  private readonly persistDelayMs: number;
  private listeners = new Set<() => void>();
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;
  private persisting: Promise<void> | null = null;
  /** `closing` refuses writes while the last persist runs; `closed` never persists again. */
  private state: 'open' | 'closing' | 'closed' = 'open';
  /** Incremented on every mutation; used by React to re-run queries. */
  version = 0;
  /** ISO timestamp of the last successful persist, for the settings screen. */
  lastPersistedAt: string | null = null;
  lastPersistError: string | null = null;

  constructor(db: Database, options: AppDatabaseOptions = {}) {
    this.db = db;
    this.persist = options.persist ?? (async () => {});
    this.persistDelayMs = options.persistDelayMs ?? 400;
  }

  /** Raw sql.js handle for read-only use by repositories. */
  get raw(): Database {
    return this.db;
  }

  all<T extends object = Row>(sql: string, params?: BindParams): T[] {
    return all<T>(this.db, sql, params);
  }

  get<T extends object = Row>(sql: string, params?: BindParams): T | undefined {
    return get<T>(this.db, sql, params);
  }

  scalar<T extends number | string | null = number>(sql: string, params?: BindParams): T {
    return scalar(this.db, sql, params) as T;
  }

  /** Execute a write statement. Only valid inside `mutate()`, which guarantees a transaction. */
  run(sql: string, params?: BindParams): void {
    if (this.mutateDepth === 0) throw new Error('AppDatabase.run() must be called inside mutate()');
    this.db.run(sql, params);
  }

  /**
   * Run a write inside a transaction. Nested `mutate` calls share the outer transaction and only
   * the outermost call notifies and persists.
   */
  mutate<T>(fn: (db: Database) => T): T {
    if (this.state !== 'open') throw new Error(HANDED_OVER_MESSAGE);
    const outermost = this.mutateDepth === 0;
    this.mutateDepth++;
    try {
      const result = transaction(this.db, () => fn(this.db));
      if (outermost) this.changed();
      return result;
    } finally {
      this.mutateDepth--;
    }
  }
  private mutateDepth = 0;

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Full database bytes (a valid `.fitnotes` file). Must not be called inside `mutate`. */
  export(): Uint8Array {
    if (this.mutateDepth > 0) throw new Error('export() called inside a transaction');
    return this.db.export();
  }

  /** Swap in a different database (after a restore). Persists immediately. */
  async replaceDatabase(next: Database): Promise<void> {
    if (this.state !== 'open') {
      next.close();
      throw new Error(HANDED_OVER_MESSAGE);
    }
    const old = this.db;
    this.db = next;
    old.close();
    this.changed();
    await this.flush();
  }

  /**
   * Persist now if there are unsaved changes. Waits for an in-flight persist first and returns only
   * once nothing is dirty, so changes made while bytes were being written are written too. Rejects
   * when a persist fails (the changes stay unsaved and are retried on the next change or flush) or
   * when the database was handed over with changes still unsaved.
   */
  async flush(): Promise<void> {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    for (;;) {
      while (this.persisting) await this.persisting;
      if (!this.dirty) return;
      if (this.state === 'closed') throw new Error(HANDED_OVER_MESSAGE);
      this.dirty = false;
      const bytes = this.export();
      this.persisting = this.persist(bytes)
        .then(() => {
          this.lastPersistedAt = new Date().toISOString();
          this.lastPersistError = null;
        })
        .catch((err: unknown) => {
          this.dirty = true;
          this.lastPersistError = err instanceof Error ? err.message : String(err);
          throw err;
        })
        .finally(() => {
          this.persisting = null;
        });
      await this.persisting;
    }
  }

  /**
   * Hand the stored bytes over to another instance: refuse further writes, then persist whatever is
   * still unsaved. Resolves once nothing is unsaved; rejects when that last persist fails, leaving
   * `hasUnsavedChanges` true so the caller can say so (`export()` still gives the bytes for a copy).
   * Either way nothing is written to storage afterwards.
   */
  async close(): Promise<void> {
    if (this.state === 'open') this.state = 'closing';
    try {
      await this.flush();
    } finally {
      this.state = 'closed';
      if (this.persistTimer) {
        clearTimeout(this.persistTimer);
        this.persistTimer = null;
      }
    }
  }

  /** True once `close()` was called: writes are refused. */
  get closed(): boolean {
    return this.state !== 'open';
  }

  /** Mark dirty, notify subscribers and schedule a persist. */
  changed(): void {
    this.version++;
    this.dirty = true;
    for (const l of this.listeners) l();
    if (this.state !== 'open') return;
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      void this.flush().catch(() => {
        /* error is recorded in lastPersistError; retried on next change/flush */
      });
    }, this.persistDelayMs);
  }

  get hasUnsavedChanges(): boolean {
    return this.dirty;
  }
}
