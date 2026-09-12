/**
 * Print the schema, row counts and a few sample rows of a FitNotes backup (.fitnotes) without
 * modifying it. Useful to compare a real backup against doc/fitnotes-format.md.
 *
 *   npm run inspect-backup -- path/to/FitNotes_Backup.fitnotes
 */
import { readFileSync } from 'node:fs';
import { loadSqlJs, all, tableNames, columnNames, scalar, looksLikeSqlite } from '../src/db/sqlite';
import { TABLES, columnDefinitions } from '../src/db/schema';

const file = process.argv[2];
if (!file) {
  console.error('usage: npm run inspect-backup -- <file.fitnotes>');
  process.exit(2);
}
const bytes = new Uint8Array(readFileSync(file));
if (!looksLikeSqlite(bytes)) {
  console.error('Not a SQLite database (bad header).');
  process.exit(1);
}
const SQL = await loadSqlJs();
const db = new SQL.Database(bytes);
console.log(`file: ${file} (${bytes.length} bytes)`);
console.log(`user_version: ${scalar(db, 'PRAGMA user_version')}`);
const names = tableNames(db);
for (const name of names) {
  const cols = columnNames(db, name);
  const rows = Number(scalar(db, `SELECT COUNT(*) FROM "${name}"`));
  const expected = TABLES[name] ? columnDefinitions(TABLES[name]).map((c) => c.name) : null;
  const missing = expected ? expected.filter((c) => !cols.includes(c)) : [];
  const extra = expected ? cols.filter((c) => !expected.includes(c)) : [];
  console.log(`\n${name}: ${rows} rows${expected ? '' : '  (not in canonical schema)'}`);
  console.log(`  columns: ${cols.join(', ')}`);
  if (missing.length) console.log(`  MISSING vs canonical: ${missing.join(', ')}`);
  if (extra.length) console.log(`  EXTRA vs canonical: ${extra.join(', ')}`);
  if (rows > 0 && process.argv.includes('--samples')) {
    for (const r of all(db, `SELECT * FROM "${name}" LIMIT 3`)) console.log('  ', JSON.stringify(r));
  }
}
for (const name of Object.keys(TABLES)) if (!names.includes(name)) console.log(`\n${name}: TABLE MISSING`);
if (names.includes('training_log') && names.includes('exercise')) {
  console.log('\ndistance unit usage by exercise type (training_log.unit):');
  for (const r of all(
    db,
    'SELECT e.exercise_type_id AS type, t.unit AS unit, COUNT(*) AS n FROM training_log t JOIN exercise e ON e._id = t.exercise_id GROUP BY 1, 2 ORDER BY 1, 2',
  )) {
    console.log('  ', JSON.stringify(r));
  }
}
db.close();
