import { createContext, useContext, type ReactNode } from 'react';
import type { SqlJsStatic } from '@/db/sqlite';

const SqlContext = createContext<SqlJsStatic | null>(null);

export function SqlProvider({ sql, children }: { sql: SqlJsStatic; children: ReactNode }) {
  return <SqlContext.Provider value={sql}>{children}</SqlContext.Provider>;
}

/** The sql.js runtime, needed to open backup files. */
export function useSql(): SqlJsStatic {
  const sql = useContext(SqlContext);
  if (!sql) throw new Error('useSql() used outside <SqlProvider>');
  return sql;
}
