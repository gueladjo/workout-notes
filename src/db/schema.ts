/**
 * Canonical FitNotes-compatible schema. The CREATE TABLE statements are verbatim from FitNotes 25.1
 * (database version 22) so a database created here restores cleanly into the Android app.
 *
 * `ensureSchema()` reconciles any opened database (a fresh one, an old FitNotes backup, or a newer
 * one) with this schema: it creates missing tables, adds missing columns using SQLite ALTER TABLE
 * (exactly what FitNotes' own upgrade path does), runs the few data migrations FitNotes performs,
 * and leaves unknown tables and columns untouched so they survive a round trip.
 */
import type { Database, SqlJsStatic } from './sqlite';
import { all, columnNames, hasTable, run, scalar, transaction } from './sqlite';
import { FITNOTES_DB_VERSION, KG_PER_LB } from './constants';
import { MEASUREMENT_UNIT, seedDefaults, seedMeasurementUnits, seedMeasurements } from './seed';

/** Table name -> CREATE TABLE statement (FitNotes 25.1). Order matters only for readability. */
export const TABLES: Record<string, string> = {
  Category:
    'CREATE TABLE Category(_id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, colour INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0)',
  exercise:
    'CREATE TABLE exercise(_id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, category_id INTEGER NOT NULL, exercise_type_id INTEGER NOT NULL DEFAULT 0, notes TEXT, weight_increment INTEGER, default_graph_id INTEGER, default_rest_time INTEGER, weight_unit_id INTEGER NOT NULL DEFAULT 0, is_favourite INTEGER NOT NULL DEFAULT 0)',
  training_log:
    'CREATE TABLE training_log (_id INTEGER PRIMARY KEY AUTOINCREMENT, exercise_id INTEGER NOT NULL, date DATE NOT NULL, metric_weight INTEGER NOT NULL, reps INTEGER NOT NULL, unit INTEGER NOT NULL DEFAULT 0, routine_section_exercise_set_id INTEGER NOT NULL DEFAULT 0, timer_auto_start INTEGER NOT NULL DEFAULT 0, is_personal_record INTEGER NOT NULL DEFAULT 0, is_personal_record_first INTEGER NOT NULL DEFAULT 0, is_complete INTEGER NOT NULL DEFAULT 0, is_pending_update INTEGER NOT NULL DEFAULT 0, distance INTEGER NOT NULL DEFAULT 0, duration_seconds INTEGER NOT NULL DEFAULT 0)',
  Routine: 'CREATE TABLE Routine(_id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, notes TEXT)',
  RoutineSection:
    "CREATE TABLE RoutineSection(_id INTEGER PRIMARY KEY AUTOINCREMENT, routine_id INTEGER NOT NULL, name TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT '0')",
  RoutineSectionExercise:
    'CREATE TABLE RoutineSectionExercise(_id INTEGER PRIMARY KEY AUTOINCREMENT, routine_section_id INTEGER NOT NULL, exercise_id INTEGER NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, populate_sets_type INTEGER NOT NULL DEFAULT 0)',
  RoutineSectionExerciseSet:
    'CREATE TABLE RoutineSectionExerciseSet(_id INTEGER PRIMARY KEY AUTOINCREMENT, routine_section_exercise_id INTEGER NOT NULL, metric_weight INTEGER NOT NULL, reps INTEGER NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, distance INTEGER NOT NULL DEFAULT 0, duration_seconds INTEGER NOT NULL DEFAULT 0, unit INTEGER NOT NULL DEFAULT 0)',
  Comment:
    'CREATE TABLE Comment (_id INTEGER PRIMARY KEY AUTOINCREMENT, date DATE NOT NULL, owner_type_id INTEGER NOT NULL, owner_id INTEGER NOT NULL, comment TEXT NOT NULL)',
  BodyWeight:
    'CREATE TABLE BodyWeight (_id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, body_weight_metric REAL NOT NULL, body_fat REAL NOT NULL, comments TEXT)',
  WorkoutGroup:
    'CREATE TABLE WorkoutGroup (_id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, date TEXT NOT NULL, colour INTEGER NOT NULL, routine_section_id INTEGER, auto_jump_enabled INTEGER NOT NULL DEFAULT 1, rest_timer_auto_start_enabled INTEGER NOT NULL DEFAULT 0)',
  WorkoutGroupExercise:
    'CREATE TABLE WorkoutGroupExercise(_id INTEGER PRIMARY KEY AUTOINCREMENT, exercise_id INTEGER NOT NULL, date TEXT NOT NULL, routine_section_id INTEGER NOT NULL, workout_group_id INTEGER NOT NULL)',
  ExerciseGraphFavourite:
    'CREATE TABLE ExerciseGraphFavourite(_id INTEGER PRIMARY KEY AUTOINCREMENT, group_id INTEGER NOT NULL, exercise_id INTEGER NOT NULL, graph_type_id INTEGER NOT NULL DEFAULT 0, time_period INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0, is_default INTEGER NOT NULL DEFAULT 0)',
  Goal: 'CREATE TABLE Goal (_id INTEGER PRIMARY KEY AUTOINCREMENT, type_id INTEGER NOT NULL, exercise_id INTEGER NOT NULL, metric_weight INTEGER NOT NULL, reps INTEGER NOT NULL, unit INTEGER NOT NULL, title TEXT, target_date TEXT, sort_order INTEGER NOT NULL DEFAULT 0, distance INTEGER NOT NULL DEFAULT 0, duration_seconds INTEGER NOT NULL DEFAULT 0, start_date TEXT)',
  Barbell:
    'CREATE TABLE Barbell (_id INTEGER PRIMARY KEY AUTOINCREMENT, weight REAL NOT NULL, unit INTEGER NOT NULL DEFAULT 0, exercise_id INTEGER NOT NULL DEFAULT 0)',
  Plate:
    'CREATE TABLE Plate (_id INTEGER PRIMARY KEY AUTOINCREMENT, weight REAL NOT NULL, unit INTEGER NOT NULL DEFAULT 0, count INTEGER NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 0, colour INTEGER NOT NULL DEFAULT 0, width_ratio REAL NOT NULL DEFAULT 1, height_ratio REAL NOT NULL DEFAULT 1)',
  WorkoutComment:
    'CREATE TABLE WorkoutComment (_id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, comment TEXT NOT NULL)',
  MeasurementUnit:
    'CREATE TABLE MeasurementUnit (_id INTEGER PRIMARY KEY AUTOINCREMENT, type INTEGER NOT NULL DEFAULT 0, long_name TEXT NOT NULL, short_name TEXT NOT NULL)',
  Measurement:
    'CREATE TABLE Measurement (_id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, unit_id INTEGER NOT NULL DEFAULT 0, goal_type INTEGER NOT NULL DEFAULT 0, goal_value REAL NOT NULL DEFAULT 0, custom INTEGER NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0)',
  MeasurementRecord:
    'CREATE TABLE MeasurementRecord (_id INTEGER PRIMARY KEY AUTOINCREMENT, measurement_id INTEGER NOT NULL, date TEXT NOT NULL, time TEXT NOT NULL, value REAL NOT NULL, comment TEXT)',
  RepMaxGridFavourite:
    'CREATE TABLE RepMaxGridFavourite (_id INTEGER PRIMARY KEY AUTOINCREMENT, exercise_ids TEXT NOT NULL, rep_counts TEXT NOT NULL, is_default INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0)',
  WorkoutTime:
    'CREATE TABLE WorkoutTime (_id INTEGER PRIMARY KEY AUTOINCREMENT, workout_date TEXT NOT NULL, start_date_time TEXT NOT NULL, end_date_time TEXT NOT NULL)',
  settings:
    'CREATE TABLE settings (_id INTEGER PRIMARY KEY AUTOINCREMENT, metric INTEGER NOT NULL DEFAULT 0, first_day_of_week INTEGER NOT NULL DEFAULT 0, selected_navigation_item_id INTEGER NOT NULL DEFAULT 0, weight_increment INTEGER NOT NULL DEFAULT 0, body_weight_increment INTEGER, body_weight_goal INTEGER, body_weight_goal_weight INTEGER, body_weight_show_in_workout_log INTEGER, estimated_1rm_max_reps_to_include INTEGER, estimated_1rm_max_apply_to_graph INTEGER, track_personal_records INTEGER, mark_sets_complete INTEGER, auto_select_next_set INTEGER, keep_screen_on INTEGER, graph_show_points INTEGER, graph_show_trend_line INTEGER, graph_start_at_zero INTEGER, rest_timer_seconds INTEGER, rest_timer_vibrate INTEGER, rest_timer_sound INTEGER, rest_timer_volume INTEGER, rest_timer_auto_start INTEGER, calendar_detail_visible INTEGER, calendar_category_dots_visible INTEGER, calendar_navigation_bar_visible INTEGER, calendar_history_category_dots_visible INTEGER, calendar_history_category_names_visible INTEGER, calendar_history_sets_visible INTEGER, category_sort_order INTEGER, category_show_colours INTEGER, measurement_tracker_initial_load INTEGER, measurement_show_in_workout_log INTEGER, workout_graph_default_graph_type INTEGER, workout_graph_default_time_period INTEGER, analysis_breakdown_breakdown_type INTEGER, analysis_breakdown_time_period INTEGER, exercise_list_detail_type_id INTEGER, workout_timer_auto_start_enabled INTEGER, workout_timer_auto_stop_enabled INTEGER, home_screen_limit_type_id INTEGER, home_screen_limit_value INTEGER, home_screen_category_visibility_id INTEGER, home_screen_skip_empty_dates INTEGER, app_theme_id INTEGER)',
};

/** Tables that must exist for a file to be accepted as a FitNotes backup. */
export const REQUIRED_TABLES = ['Category', 'exercise', 'training_log'];

/** Parse "name TYPE ..." column definitions out of a CREATE TABLE statement. */
export function columnDefinitions(createSql: string): { name: string; definition: string }[] {
  const inner = createSql.slice(createSql.indexOf('(') + 1, createSql.lastIndexOf(')'));
  return inner
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((definition) => ({ name: definition.split(/\s+/)[0]!, definition }));
}

/** Column definition usable in ALTER TABLE ADD COLUMN (NOT NULL columns need a default). */
function addableDefinition(definition: string): string {
  if (/PRIMARY KEY/i.test(definition)) throw new Error(`cannot add primary key column: ${definition}`);
  if (/NOT NULL/i.test(definition) && !/DEFAULT/i.test(definition)) {
    return definition + (/TEXT|DATE/i.test(definition) ? " DEFAULT ''" : ' DEFAULT 0');
  }
  return definition;
}

export interface SchemaReport {
  createdTables: string[];
  addedColumns: string[];
  migrations: string[];
}

/**
 * Bring `db` up to the canonical schema without touching anything it does not know about.
 * Safe to run on every open; a no-op on an up-to-date database.
 */
export function ensureSchema(db: Database): SchemaReport {
  const report: SchemaReport = { createdTables: [], addedColumns: [], migrations: [] };
  transaction(db, () => {
    for (const [table, create] of Object.entries(TABLES)) {
      if (!hasTable(db, table)) {
        run(db, create);
        report.createdTables.push(table);
        continue;
      }
      const existing = new Set(columnNames(db, table));
      for (const col of columnDefinitions(create)) {
        if (!existing.has(col.name)) {
          run(db, `ALTER TABLE ${table} ADD COLUMN ${addableDefinition(col.definition)}`);
          report.addedColumns.push(`${table}.${col.name}`);
        }
      }
    }
    if (!hasTable(db, 'android_metadata')) {
      run(db, 'CREATE TABLE android_metadata (locale TEXT)');
      run(db, "INSERT INTO android_metadata VALUES ('en_US')");
    }

    // --- Data migrations mirrored from FitNotes' upgrade path ---
    // Seeds and migrations run only when their destination table was created just now, as in
    // FitNotes' own upgrade steps. An existing table is the user's, even when empty: rows they
    // deleted must not come back on the next open. Legacy source rows are left in place.
    const created = (table: string) => report.createdTables.includes(table);
    if (created('MeasurementUnit')) {
      seedMeasurementUnits(db);
      report.migrations.push('seed MeasurementUnit');
    }
    if (created('Measurement')) {
      const metric = Number(scalar(db, 'SELECT COALESCE((SELECT metric FROM settings LIMIT 1), 1)')) !== 0;
      seedMeasurements(db, metric);
      report.migrations.push('seed Measurement');
    }
    // Legacy BodyWeight table -> MeasurementRecord (measurement 1 = Bodyweight, 2 = Body Fat).
    // BodyWeight holds kilograms; a record holds the value in its measurement's unit, so a
    // Bodyweight measurement in pounds (imperial settings) gets the converted value.
    if (created('MeasurementRecord') && Number(scalar(db, 'SELECT COUNT(*) FROM BodyWeight')) > 0) {
      const bodyweightUnit = Number(
        scalar(db, 'SELECT COALESCE((SELECT unit_id FROM Measurement WHERE _id = 1), ?)', [
          MEASUREMENT_UNIT.KILOGRAMS,
        ]),
      );
      const inPounds = bodyweightUnit === MEASUREMENT_UNIT.POUNDS;
      const rows = all<{
        date: string;
        body_weight_metric: number;
        body_fat: number;
        comments: string | null;
      }>(db, 'SELECT date, body_weight_metric, body_fat, comments FROM BodyWeight ORDER BY _id ASC');
      for (const r of rows) {
        const [date, time = '12:00:00'] = String(r.date).split(' ');
        if (r.body_weight_metric > 0) {
          run(
            db,
            'INSERT INTO MeasurementRecord (measurement_id, date, time, value, comment) VALUES (1, ?, ?, ?, ?)',
            [
              date ?? '',
              time,
              inPounds ? r.body_weight_metric / KG_PER_LB : r.body_weight_metric,
              r.comments ?? null,
            ],
          );
        }
        if (r.body_fat > 0) {
          run(
            db,
            'INSERT INTO MeasurementRecord (measurement_id, date, time, value, comment) VALUES (2, ?, ?, ?, ?)',
            [date ?? '', time, r.body_fat, null],
          );
        }
      }
      report.migrations.push(
        `BodyWeight -> MeasurementRecord (${rows.length} rows${inPounds ? ', kg -> lbs' : ''})`,
      );
    }
    // Legacy workout comments (Comment.owner_type_id = 2) -> WorkoutComment.
    if (
      created('WorkoutComment') &&
      Number(scalar(db, 'SELECT COUNT(*) FROM Comment WHERE owner_type_id = 2')) > 0
    ) {
      run(
        db,
        'INSERT INTO WorkoutComment (date, comment) SELECT date, comment FROM Comment WHERE owner_type_id = 2 ORDER BY _id ASC',
      );
      report.migrations.push('Comment(owner_type 2) -> WorkoutComment');
    }
    // Categories without a colour (pre-colour backups) get one from the FitNotes palette.
    const uncoloured = all<{ _id: number }>(db, 'SELECT _id FROM Category WHERE colour = 0 ORDER BY _id ASC');
    if (uncoloured.length > 0) {
      uncoloured.forEach((c, i) =>
        run(db, 'UPDATE Category SET colour = ? WHERE _id = ?', [
          CATEGORY_COLOURS[i % CATEGORY_COLOURS.length]!,
          c._id,
        ]),
      );
      report.migrations.push(`assigned colours to ${uncoloured.length} categories`);
    }
    // FitNotes only upgrades; never lower the version of a newer backup.
    const version = Number(scalar(db, 'PRAGMA user_version'));
    if (version < FITNOTES_DB_VERSION) {
      run(db, `PRAGMA user_version = ${FITNOTES_DB_VERSION}`);
      report.migrations.push(`user_version ${version} -> ${FITNOTES_DB_VERSION}`);
    }
  });
  return report;
}

/** FitNotes' default category colours (Android colour ints), in default category order. */
export const CATEGORY_COLOURS = [
  -7453523, // #8e44ad Shoulders
  -14176672, // #27ae60 Triceps
  -812014, // #f39c12 Biceps
  -4179669, // #c0392b Chest
  -14057287, // #2980b9 Back
  -11226442, // #54b2b6 Legs
  -13877680, // #2c3e50 Abs
  -8418163, // #7f8c8d Cardio
  -13710223, // #2ecc71
  -932849, // #f1c40f
  -1618884, // #e74c3c
  -13330213, // #3498db
  -6969946, // #95a5a6
  -1671646, // #e67e22
];

/** Create a brand-new database with FitNotes' default content. */
export function createEmptyDatabase(SQL: SqlJsStatic, options: { metric?: boolean } = {}): Database {
  const db = new SQL.Database();
  transaction(db, () => {
    for (const create of Object.values(TABLES)) run(db, create);
    run(db, 'CREATE TABLE android_metadata (locale TEXT)');
    run(db, "INSERT INTO android_metadata VALUES ('en_US')");
    seedDefaults(db, options.metric ?? true);
    run(db, `PRAGMA user_version = ${FITNOTES_DB_VERSION}`);
  });
  return db;
}

/** Validate that a database looks like a FitNotes backup; returns a human-readable problem or null. */
export function validateBackupDatabase(db: Database): string | null {
  for (const t of REQUIRED_TABLES) {
    if (!hasTable(db, t))
      return `The file is a SQLite database but has no "${t}" table, so it is not a FitNotes backup.`;
  }
  return null;
}
