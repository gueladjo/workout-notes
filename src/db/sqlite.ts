/**
 * Thin helpers over sql.js. Nothing here knows about the FitNotes schema.
 *
 * This module must stay free of browser- or Vite-specific imports so that unit tests (Node) and
 * scripts (`tsx scripts/*.ts`) can use the same code paths as the app.
 */
import initSqlJs from 'sql.js';
import type { BindParams, Database, SqlJsStatic, SqlValue } from 'sql.js';

export type { BindParams, Database, SqlJsStatic, SqlValue };
export type Row = Record<string, SqlValue>;

let sqlJsPromise: Promise<SqlJsStatic> | null = null;

/**
 * Load the sql.js WASM runtime once. In the browser pass `locateFile` so the `.wasm` asset is
 * resolved through the bundler; in Node, sql.js finds the file next to its own script.
 */
export function loadSqlJs(locateFile?: (file: string) => string): Promise<SqlJsStatic> {
  if (!sqlJsPromise) {
    sqlJsPromise = initSqlJs(locateFile ? { locateFile } : {});
  }
  return sqlJsPromise;
}

/** Run a query and return every row as an object keyed by column name (aliases respected). */
export function all<T extends object = Row>(db: Database, sql: string, params?: BindParams): T[] {
  const stmt = db.prepare(sql);
  try {
    if (params !== undefined) stmt.bind(params);
    const rows: T[] = [];
    while (stmt.step()) rows.push(stmt.getAsObject() as T);
    return rows;
  } finally {
    stmt.free();
  }
}

/** Run a query and return the first row, or undefined. */
export function get<T extends object = Row>(db: Database, sql: string, params?: BindParams): T | undefined {
  return all<T>(db, sql, params)[0];
}

/** Return the first column of the first row (for COUNT(*) style queries). */
export function scalar<T extends SqlValue = SqlValue>(db: Database, sql: string, params?: BindParams): T {
  const row = get(db, sql, params);
  if (!row) throw new Error(`scalar(): query returned no rows: ${sql}`);
  const first = Object.values(row)[0];
  return first as T;
}

/** Execute a statement that returns nothing. */
export function run(db: Database, sql: string, params?: BindParams): void {
  db.run(sql, params);
}

export function lastInsertId(db: Database): number {
  return Number(scalar(db, 'SELECT last_insert_rowid()'));
}

/** Names of all user tables in the database. */
export function tableNames(db: Database): string[] {
  return all<{ name: string }>(db, "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").map(
    (r) => r.name,
  );
}

/** Column names of a table (empty array when the table does not exist). */
export function columnNames(db: Database, table: string): string[] {
  return all<{ name: string }>(db, `PRAGMA table_info(${quoteIdent(table)})`).map((r) => r.name);
}

export function hasTable(db: Database, table: string): boolean {
  return (
    Number(
      scalar(db, "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?", [table]),
    ) > 0
  );
}

export function quoteIdent(name: string): string {
  return '"' + name.replace(/"/g, '""') + '"';
}

/**
 * Run `fn` inside a transaction. Nested calls reuse the outer transaction so repository functions
 * can compose freely.
 */
export function transaction<T>(db: Database, fn: () => T): T {
  const inTransaction = txDepth.get(db) ?? 0;
  txDepth.set(db, inTransaction + 1);
  if (inTransaction === 0) db.run('BEGIN');
  try {
    const result = fn();
    if (inTransaction === 0) db.run('COMMIT');
    return result;
  } catch (err) {
    if (inTransaction === 0) db.run('ROLLBACK');
    throw err;
  } finally {
    txDepth.set(db, inTransaction);
  }
}
const txDepth = new WeakMap<Database, number>();

export const SQLITE_MAGIC = 'SQLite format 3\0';

/** True when the bytes start with the SQLite file header. */
export function looksLikeSqlite(bytes: Uint8Array): boolean {
  if (bytes.length < 100) return false;
  for (let i = 0; i < SQLITE_MAGIC.length; i++) {
    if (bytes[i] !== SQLITE_MAGIC.charCodeAt(i)) return false;
  }
  return true;
}
