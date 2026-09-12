/**
 * Create a small sample .fitnotes database (default content plus a few workouts) for manual
 * testing of restore on a device or in the browser.
 *
 *   npm run make-fixture -- [out.fitnotes]
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { loadSqlJs } from '../src/db/sqlite';
import { createEmptyDatabase } from '../src/db/schema';
import { seedSampleWorkouts } from '../tests/helpers/sample';

const out = process.argv[2] ?? 'tests/fixtures/generated/sample.fitnotes';
const SQL = await loadSqlJs();
const db = createEmptyDatabase(SQL);
seedSampleWorkouts(db);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, db.export());
console.log(`wrote ${out}`);
