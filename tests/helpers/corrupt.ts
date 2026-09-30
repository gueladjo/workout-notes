/**
 * Page-level damage for tests: a SQLite file whose header and schema page are intact but whose
 * data pages are not. Opening, `sqlite_master` queries and `ensureSchema()` all still succeed on
 * such a file; only a query that reaches the damaged page fails ("database disk image is
 * malformed"), which is why `checkIntegrity()` exists.
 */
import type { SqlJsStatic } from '../../src/db/sqlite';
import { scalar } from '../../src/db/sqlite';

/** Page size from the SQLite header (bytes 16-17, big-endian; the value 1 means 65536). */
export function pageSize(bytes: Uint8Array): number {
  const size = ((bytes[16] ?? 0) << 8) | (bytes[17] ?? 0);
  return size === 1 ? 65536 : size;
}

/**
 * A copy of `bytes` whose root page of `table` is filled with 0xFF. Page 1 (header and
 * `sqlite_master`) is left alone, so the file still opens and looks like a FitNotes backup.
 * `bytes` is not modified.
 */
export function damageTableRootPage(SQL: SqlJsStatic, bytes: Uint8Array, table: string): Uint8Array {
  const db = new SQL.Database(new Uint8Array(bytes));
  let root: number;
  try {
    root = Number(
      scalar(db, "SELECT rootpage FROM sqlite_master WHERE type = 'table' AND name = ?", [table]),
    );
  } finally {
    db.close();
  }
  if (root < 2) throw new Error(`${table} has no root page of its own (rootpage ${root})`);
  const size = pageSize(bytes);
  const copy = new Uint8Array(bytes);
  copy.fill(0xff, (root - 1) * size, root * size);
  return copy;
}
