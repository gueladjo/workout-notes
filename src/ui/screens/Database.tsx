import { useQuery } from '@/app/db-context';
import { columnNames, tableNames } from '@/db/sqlite';
import { TABLES } from '@/db/schema';
import { TopBar } from '@/ui/components/TopBar';

/** Diagnostics: tables, row counts and schema version of the live database. */
export function DatabaseScreen() {
  const info = useQuery((d) => {
    const tables = tableNames(d.raw).map((name) => ({
      name,
      rows: Number(d.scalar(`SELECT COUNT(*) FROM "${name.replace(/"/g, '""')}"`)),
      columns: columnNames(d.raw, name),
      known: name in TABLES,
    }));
    const size = Number(d.scalar('PRAGMA page_count')) * Number(d.scalar('PRAGMA page_size'));
    return { tables, version: Number(d.scalar('PRAGMA user_version')), size };
  });
  return (
    <div className="screen">
      <TopBar
        back
        title="Database"
        subtitle={`FitNotes schema version ${info.version} · ${(info.size / 1024).toFixed(0)} KB`}
      />
      <div className="screen__content">
        <div className="container">
          <div className="list">
            {info.tables.map((t) => (
              <div key={t.name} className="stat-row" style={{ display: 'block' }}>
                <div className="row row--between">
                  <span className="mono" style={{ fontSize: 13 }}>
                    {t.name}
                    {!t.known && (
                      <span className="chip" style={{ marginLeft: 6 }}>
                        extra
                      </span>
                    )}
                  </span>
                  <span className="stat-row__value">{t.rows}</span>
                </div>
                <div className="muted mono" style={{ fontSize: 11, marginTop: 2, wordBreak: 'break-word' }}>
                  {t.columns.join(', ')}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
