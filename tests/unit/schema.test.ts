import { describe, expect, it, beforeAll } from 'vitest';
import { loadSqlJs, tableNames, columnNames, scalar, run, type SqlJsStatic } from '../../src/db/sqlite';
import {
  TABLES,
  createEmptyDatabase,
  ensureSchema,
  columnDefinitions,
  validateBackupDatabase,
} from '../../src/db/schema';
import { FITNOTES_DB_VERSION, KG_PER_LB } from '../../src/db/constants';
import { DEFAULT_CATEGORIES, DEFAULT_EXERCISES, DEFAULT_MEASUREMENTS } from '../../src/db/seed';

let SQL: SqlJsStatic;
beforeAll(async () => {
  SQL = await loadSqlJs();
});

describe('createEmptyDatabase', () => {
  it('creates every FitNotes table with the expected columns and version', () => {
    const db = createEmptyDatabase(SQL);
    for (const [table, ddl] of Object.entries(TABLES)) {
      expect(tableNames(db)).toContain(table);
      expect(columnNames(db, table)).toEqual(columnDefinitions(ddl).map((c) => c.name));
    }
    expect(tableNames(db)).toContain('android_metadata');
    expect(scalar(db, 'PRAGMA user_version')).toBe(FITNOTES_DB_VERSION);
    db.close();
  });

  it('seeds FitNotes default categories, exercises, units and measurements', () => {
    const db = createEmptyDatabase(SQL);
    expect(scalar(db, 'SELECT COUNT(*) FROM Category')).toBe(DEFAULT_CATEGORIES.length);
    expect(scalar(db, 'SELECT COUNT(*) FROM exercise')).toBe(DEFAULT_EXERCISES.length);
    expect(scalar(db, 'SELECT name FROM Category WHERE _id = 4')).toBe('Chest');
    expect(scalar(db, "SELECT exercise_type_id FROM exercise WHERE name = 'Cycling'")).toBe(1);
    expect(scalar(db, 'SELECT COUNT(*) FROM MeasurementUnit')).toBe(6);
    expect(scalar(db, 'SELECT COUNT(*) FROM Measurement')).toBe(DEFAULT_MEASUREMENTS.length);
    expect(scalar(db, 'SELECT COUNT(*) FROM Measurement WHERE enabled = 1')).toBe(2);
    expect(scalar(db, 'SELECT metric FROM settings')).toBe(1);
    db.close();
  });

  it('uses imperial units when asked', () => {
    const db = createEmptyDatabase(SQL, { metric: false });
    expect(scalar(db, 'SELECT metric FROM settings')).toBe(0);
    expect(scalar(db, 'SELECT unit_id FROM Measurement WHERE _id = 1')).toBe(2); // lbs
    db.close();
  });
});

describe('ensureSchema', () => {
  it('is a no-op on an up-to-date database', () => {
    const db = createEmptyDatabase(SQL);
    const report = ensureSchema(db);
    expect(report).toEqual({ createdTables: [], addedColumns: [], migrations: [] });
    db.close();
  });

  it('upgrades an old backup: adds columns, creates tables, migrates BodyWeight and legacy comments', () => {
    const db = new SQL.Database();
    // A minimal, early-FitNotes shaped database.
    run(db, 'CREATE TABLE Category(_id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)');
    run(
      db,
      'CREATE TABLE exercise(_id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, category_id INTEGER NOT NULL)',
    );
    run(
      db,
      'CREATE TABLE training_log (_id INTEGER PRIMARY KEY AUTOINCREMENT, exercise_id INTEGER NOT NULL, date DATE NOT NULL, metric_weight INTEGER NOT NULL, reps INTEGER NOT NULL)',
    );
    run(
      db,
      'CREATE TABLE BodyWeight (_id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, body_weight_metric REAL NOT NULL, body_fat REAL NOT NULL, comments TEXT)',
    );
    run(
      db,
      'CREATE TABLE Comment (_id INTEGER PRIMARY KEY AUTOINCREMENT, date DATE NOT NULL, owner_type_id INTEGER NOT NULL, owner_id INTEGER NOT NULL, comment TEXT NOT NULL)',
    );
    run(db, "INSERT INTO Category (name) VALUES ('Chest')");
    run(db, "INSERT INTO exercise (name, category_id) VALUES ('Bench', 1)");
    run(
      db,
      "INSERT INTO training_log (exercise_id, date, metric_weight, reps) VALUES (1, '2015-01-01', 100, 5)",
    );
    run(
      db,
      "INSERT INTO BodyWeight (date, body_weight_metric, body_fat, comments) VALUES ('2015-01-01 08:30:00', 80.5, 15, 'morning')",
    );
    run(
      db,
      "INSERT INTO Comment (date, owner_type_id, owner_id, comment) VALUES ('2015-01-01', 2, 0, 'good session')",
    );
    run(db, 'PRAGMA user_version = 3');

    const report = ensureSchema(db);
    expect(report.createdTables).toContain('WorkoutComment');
    expect(report.addedColumns).toContain('exercise.exercise_type_id');
    expect(report.addedColumns).toContain('training_log.distance');
    expect(columnNames(db, 'training_log')).toEqual(
      columnDefinitions(TABLES.training_log!).map((c) => c.name),
    );
    expect(scalar(db, 'SELECT COUNT(*) FROM MeasurementRecord')).toBe(2);
    expect(scalar(db, 'SELECT value FROM MeasurementRecord WHERE measurement_id = 1')).toBe(80.5);
    expect(scalar(db, 'SELECT time FROM MeasurementRecord WHERE measurement_id = 1')).toBe('08:30:00');
    expect(scalar(db, 'SELECT comment FROM WorkoutComment WHERE date = ?', ['2015-01-01'])).toBe(
      'good session',
    );
    expect(scalar(db, 'SELECT colour FROM Category WHERE _id = 1')).not.toBe(0);
    expect(scalar(db, 'PRAGMA user_version')).toBe(FITNOTES_DB_VERSION);
    // Data untouched
    expect(scalar(db, 'SELECT metric_weight FROM training_log')).toBe(100);
    // Running again changes nothing
    expect(ensureSchema(db)).toEqual({ createdTables: [], addedColumns: [], migrations: [] });
    // Rows the user deletes afterwards stay deleted although the legacy sources are still there.
    run(db, 'DELETE FROM MeasurementRecord');
    run(db, 'DELETE FROM WorkoutComment');
    run(db, 'DELETE FROM Measurement');
    expect(ensureSchema(db)).toEqual({ createdTables: [], addedColumns: [], migrations: [] });
    expect(scalar(db, 'SELECT COUNT(*) FROM MeasurementRecord')).toBe(0);
    expect(scalar(db, 'SELECT COUNT(*) FROM WorkoutComment')).toBe(0);
    expect(scalar(db, 'SELECT COUNT(*) FROM Measurement')).toBe(0);
    expect(scalar(db, 'SELECT COUNT(*) FROM BodyWeight')).toBe(1);
    expect(scalar(db, 'SELECT COUNT(*) FROM Comment WHERE owner_type_id = 2')).toBe(1);
    db.close();
  });

  it('converts legacy bodyweight kilograms to pounds for an imperial backup', () => {
    const db = new SQL.Database();
    run(db, 'CREATE TABLE Category(_id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)');
    run(
      db,
      'CREATE TABLE exercise(_id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, category_id INTEGER NOT NULL)',
    );
    run(
      db,
      'CREATE TABLE training_log (_id INTEGER PRIMARY KEY AUTOINCREMENT, exercise_id INTEGER NOT NULL, date DATE NOT NULL, metric_weight INTEGER NOT NULL, reps INTEGER NOT NULL)',
    );
    run(
      db,
      'CREATE TABLE BodyWeight (_id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, body_weight_metric REAL NOT NULL, body_fat REAL NOT NULL, comments TEXT)',
    );
    run(
      db,
      'CREATE TABLE settings (_id INTEGER PRIMARY KEY AUTOINCREMENT, metric INTEGER NOT NULL DEFAULT 0)',
    );
    run(db, 'INSERT INTO settings (metric) VALUES (0)');
    run(
      db,
      "INSERT INTO BodyWeight (date, body_weight_metric, body_fat) VALUES ('2015-01-01 08:30:00', 80, 15)",
    );
    const report = ensureSchema(db);
    // The Bodyweight measurement was seeded in pounds, so its record is in pounds; Body Fat stays a percentage.
    expect(scalar(db, 'SELECT unit_id FROM Measurement WHERE _id = 1')).toBe(2);
    expect(Number(scalar(db, 'SELECT value FROM MeasurementRecord WHERE measurement_id = 1'))).toBeCloseTo(
      80 / KG_PER_LB,
      6,
    );
    expect(scalar(db, 'SELECT value FROM MeasurementRecord WHERE measurement_id = 2')).toBe(15);
    expect(report.migrations).toContain('BodyWeight -> MeasurementRecord (1 rows, kg -> lbs)');
    expect(scalar(db, 'SELECT body_weight_metric FROM BodyWeight')).toBe(80);
    expect(ensureSchema(db)).toEqual({ createdTables: [], addedColumns: [], migrations: [] });
    db.close();
  });

  it('migrates only into tables it created, not into existing empty ones', () => {
    const db = new SQL.Database();
    run(db, 'CREATE TABLE Category(_id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)');
    run(
      db,
      'CREATE TABLE exercise(_id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, category_id INTEGER NOT NULL)',
    );
    run(
      db,
      'CREATE TABLE training_log (_id INTEGER PRIMARY KEY AUTOINCREMENT, exercise_id INTEGER NOT NULL, date DATE NOT NULL, metric_weight INTEGER NOT NULL, reps INTEGER NOT NULL)',
    );
    run(
      db,
      'CREATE TABLE BodyWeight (_id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, body_weight_metric REAL NOT NULL, body_fat REAL NOT NULL, comments TEXT)',
    );
    run(
      db,
      "INSERT INTO BodyWeight (date, body_weight_metric, body_fat) VALUES ('2015-01-01 08:30:00', 80.5, 0)",
    );
    // FitNotes created these in the same upgrade that migrated BodyWeight: their presence means the
    // migration already happened, whatever they hold now.
    run(db, TABLES.MeasurementRecord!);
    run(db, TABLES.Measurement!);
    const report = ensureSchema(db);
    expect(report.createdTables).not.toContain('MeasurementRecord');
    expect(report.migrations.filter((m) => /BodyWeight|seed Measurement$/.test(m))).toEqual([]);
    expect(scalar(db, 'SELECT COUNT(*) FROM MeasurementRecord')).toBe(0);
    expect(scalar(db, 'SELECT COUNT(*) FROM Measurement')).toBe(0);
    expect(scalar(db, 'SELECT COUNT(*) FROM MeasurementUnit')).toBeGreaterThan(0);
    db.close();
  });

  it('never lowers a newer user_version and keeps unknown tables', () => {
    const db = createEmptyDatabase(SQL);
    run(db, 'PRAGMA user_version = 30');
    run(db, 'CREATE TABLE FutureTable (x INTEGER)');
    run(db, 'ALTER TABLE exercise ADD COLUMN future_column TEXT');
    ensureSchema(db);
    expect(scalar(db, 'PRAGMA user_version')).toBe(30);
    expect(tableNames(db)).toContain('FutureTable');
    expect(columnNames(db, 'exercise')).toContain('future_column');
    db.close();
  });

  it('rejects databases that are not FitNotes backups', () => {
    const db = new SQL.Database();
    run(db, 'CREATE TABLE something (x)');
    expect(validateBackupDatabase(db)).toMatch(/Category/);
    db.close();
    expect(validateBackupDatabase(createEmptyDatabase(SQL))).toBeNull();
  });
});
