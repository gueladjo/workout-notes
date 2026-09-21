# The FitNotes backup format

A `FitNotes_Backup.fitnotes` file is the app's SQLite database (`database.db` on Android) copied
verbatim. Everything below was derived from FitNotes **25.1** (package
`com.github.jamesgay.fitnotes`, database version **22**) by reading the `CREATE TABLE` / `ALTER
TABLE` statements, enum classes and data-access code in the app, plus public tooling and the help
site. Confidence per item is marked: **verified** (seen in the app code), **inferred** (consistent
with code but not read directly), **assumed** (WorkoutNotes' own choice).

The canonical DDL lives in `src/db/schema.ts` (`TABLES`); encodings in `src/db/constants.ts`;
seed rows in `src/db/seed.ts`. This document explains them.

## Tables (verified)

| Table                                                                              | Purpose                                    | Notes                                                                                                                                           |
| ---------------------------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `Category`                                                                         | muscle groups                              | `colour` is an Android colour int (signed ARGB); `sort_order` for manual ordering                                                               |
| `exercise`                                                                         | exercises                                  | `exercise_type_id`, `weight_unit_id`, `is_favourite`, `weight_increment` (display unit), `default_graph_id`, `default_rest_time`, `notes`       |
| `training_log`                                                                     | one row per set                            | see below                                                                                                                                       |
| `Comment`                                                                          | set comments                               | `owner_type_id` 1 = training_log set; `owner_id` = set id; `date` = workout date                                                                |
| `WorkoutComment`                                                                   | comment per workout date                   | one row per date used                                                                                                                           |
| `WorkoutGroup` / `WorkoutGroupExercise`                                            | supersets                                  | see below                                                                                                                                       |
| `Routine`, `RoutineSection`, `RoutineSectionExercise`, `RoutineSectionExerciseSet` | routines, days, exercises, predefined sets | `populate_sets_type`: 0 none, 1 predefined sets, 2 copy previous workout                                                                        |
| `Goal`                                                                             | exercise goals                             | `type_id` (GoalType), `metric_weight`, `reps`, `distance` (m), `duration_seconds`, `unit` (distance unit), `title`, `start_date`, `target_date` |
| `Measurement`, `MeasurementUnit`, `MeasurementRecord`                              | body tracker                               | `Measurement.custom`/`enabled`; `MeasurementRecord.time` is `HH:MM:SS`                                                                          |
| `BodyWeight`                                                                       | legacy (pre-body-tracker)                  | migrated into `MeasurementRecord` ids 1 (Bodyweight) and 2 (Body Fat)                                                                           |
| `WorkoutTime`                                                                      | workout timer                              | `workout_date`, `start_date_time`, `end_date_time` (`YYYY-MM-DD HH:MM:SS`)                                                                      |
| `ExerciseGraphFavourite`, `RepMaxGridFavourite`                                    | analysis favourites                        | preserved, not used by WorkoutNotes                                                                                                             |
| `Plate`, `Barbell`                                                                 | plate calculator config                    | preserved, not used                                                                                                                             |
| `settings`                                                                         | preference transfer row                    | see below                                                                                                                                       |
| `android_metadata`                                                                 | Android's locale table                     | created with `en_US` on fresh databases                                                                                                         |

`sqlite_sequence` is managed by SQLite (all tables use `AUTOINCREMENT`).

### `training_log` (verified)

```
_id, exercise_id, date (YYYY-MM-DD text), metric_weight (kg, REAL despite INTEGER affinity),
reps, unit, routine_section_exercise_set_id, timer_auto_start, is_personal_record,
is_personal_record_first, is_complete, is_pending_update, distance (metres), duration_seconds
```

- Weight is **always kilograms**. The displayed unit comes from `exercise.weight_unit_id`
  (0 default -> `settings.metric`, 1 kg, 2 lbs). "Just change unit" in FitNotes rescales the stored
  kg so the displayed number stays the same (`UPDATE training_log SET metric_weight = metric_weight * f`).
- `unit` is the **distance unit** the set was entered in (verified from the row writer:
  `getDistanceUnitId()`), not a weight unit: 2 metres, 3 kilometres, 4 feet, 5 miles
  (`DistanceUnit.id`, ratios 1 / 1000 / 0.3048 / 1609.344). 0 = unset (weight-only sets); FitNotes
  falls back to the unit-system default.
- `routine_section_exercise_set_id` links a set to the predefined set it was created from; FitNotes
  uses it to pre-fill the next routine workout ("copy previous" blanks).
- Exercise order within a workout is the order of each exercise's first set id
  (`SELECT MIN(_id) ... GROUP BY date, exercise_id`). Re-ordering therefore re-inserts rows;
  WorkoutNotes re-points comments when it does (`repo/workouts.ts`).
- A workout exists for a date if `training_log`, `WorkoutComment` or `WorkoutTime` has the date.
- `is_personal_record` is recalculated by FitNotes on every change; `is_personal_record_first` is
  set alongside it (semantics not fully known; WorkoutNotes writes the same value to both).

### Exercise types (verified)

| id  | type                | fields           |
| --- | ------------------- | ---------------- |
| 0   | Weight and Reps     | weight, reps     |
| 1   | Distance and Time   | distance, time   |
| 2   | Weight and Distance | weight, distance |
| 3   | Weight and Time     | weight, time     |
| 4   | Reps and Distance   | reps, distance   |
| 5   | Reps and Time       | reps, time       |
| 6   | Weight              | weight           |
| 7   | Reps                | reps             |
| 8   | Distance            | distance         |
| 9   | Time                | time             |

Types 2-9 are "Supporter" types in FitNotes; WorkoutNotes offers all of them.

### Supersets (verified)

`WorkoutGroup(_id, name, date, colour, routine_section_id, auto_jump_enabled,
rest_timer_auto_start_enabled)` and `WorkoutGroupExercise(_id, exercise_id, date,
routine_section_id, workout_group_id)`. Membership is by `(date, exercise_id)`. Routine groups use
the same tables with `routine_section_id` set and `date = ''` (**inferred** from the queries that
join on `wge.routine_section_id = rs._id`); when a routine day is logged, FitNotes creates workout
groups with the same name for that date (`WHERE name = ? AND routine_section_id = ? AND date = ?`).

### Goal types (verified)

0 MAX_WEIGHT, 1 MAX_REPS, 2 TOTAL_VOLUME, 3 TOTAL_REPS, 4 MAX_DISTANCE, 5 MAX_DURATION,
6 TOTAL_DISTANCE, 7 TOTAL_DURATION, 8 MAX_WEIGHT_AND_REPS, 9 ESTIMATED_1RM, 10 MAX_VOLUME,
11 MAX_WORKOUT_VOLUME, 12 MAX_WORKOUT_REPS, 13 MAX_WORKOUT_DISTANCE, 14 MAX_WORKOUT_DURATION.

### Measurements (verified)

`MeasurementUnit` rows: 1 Kilograms/kgs (type 0), 2 Pounds/lbs (0), 3 Centimetres/cm (1),
4 Inches/in (1), 5 Percent/% (2), 6 ""/"" (no unit, type **assumed** 3). Default measurements ids
1..15: Bodyweight, Body Fat (enabled), then Neck, Shoulders, Chest, Waist, Hips, Upper Arm (R/L),
Forearm (R/L), Thigh (R/L), Calf (R/L) (disabled). `goal_type`: 0 none, 1 increase, 2 decrease,
3 specific (`goal_value`).

### Categories and colours (verified)

Default categories in id order: Shoulders `#8e44ad`, Triceps `#27ae60`, Biceps `#f39c12`, Chest
`#c0392b`, Back `#2980b9`, Legs `#54b2b6`, Abs `#2c3e50`, Cardio `#7f8c8d`. Colours are stored as
signed 32-bit ARGB ints (`(0xff000000 | rgb) | 0`, e.g. `-7453523`). The default exercise list
(97 exercises) is in `src/db/seed.ts`; Plank/Side Plank are Weight and Time, cardio is Distance and
Time.

### `settings` row (verified columns, partly inferred semantics)

FitNotes keeps preferences in SharedPreferences and, when creating a backup, drops and recreates
`settings` with one row containing them; on restore it reads that row back. Column semantics used
by WorkoutNotes (`repo/settings.ts`):

- `metric` 1 = kg, 0 = lbs (**inferred**: written from `isMetric()`).
- `first_day_of_week`: `java.util.Calendar` constant, 1 Sunday, 2 Monday, 7 Saturday (**assumed**).
- `weight_increment`: default +/- increment, in the display unit (**assumed**).
- boolean flags stored as 0/1: `track_personal_records`, `mark_sets_complete`,
  `auto_select_next_set`, `keep_screen_on`, `graph_show_points`, `graph_show_trend_line`,
  `graph_start_at_zero`, `calendar_*_visible`, `category_show_colours`, `home_screen_skip_empty_dates`.
- `estimated_1rm_max_reps_to_include` (0 = all), `category_sort_order` (0 name, 1 manual, **assumed**),
  `exercise_list_detail_type_id` (0 none, 1 workout count, 2 last used, 3 both),
  `home_screen_limit_type_id` (0 first, 1 last) / `home_screen_limit_value` (1-10),
  `home_screen_category_visibility_id` (0 none, 1 name, 2 name and colour), `app_theme_id` (0 light, 1 dark).
- Rest-timer, workout-timer, analysis and navigation columns are preserved untouched.

A backup without a `settings` row (older versions) gets defaults.

### Database version (verified)

FitNotes 25.1 opens the file with `SQLiteOpenHelper` version 22. On restore, Android runs its
upgrade steps for any `user_version` below 22 (they are plain `ALTER TABLE ... ADD COLUMN`
statements and would fail on already-present columns), so a WorkoutNotes-created database is
stamped `PRAGMA user_version = 22` and carries every column of version 22. A newer FitNotes will
upgrade it normally.

## Schema reconciliation

`ensureSchema(db)` (`src/db/schema.ts`) runs on every open and on every restore:

1. Create missing tables with FitNotes' statements; add missing columns with
   `ALTER TABLE ADD COLUMN` (adding a default for NOT NULL columns, as FitNotes' own upgrades do).
2. Seed `MeasurementUnit` / `Measurement`, migrate `BodyWeight` rows into `MeasurementRecord` and
   move legacy workout comments (`Comment.owner_type_id = 2`) into `WorkoutComment`, each only when
   the destination table was created in this run (FitNotes' own upgrade steps do the same). An
   existing table is the user's even when empty, so rows they deleted do not come back on the next
   open; the legacy `BodyWeight` and `Comment` rows are left in place. Give colourless categories a
   palette colour.
3. Raise `user_version` to 22 if lower. Never lower it; never touch unknown tables or columns.

Its `SchemaReport` is shown after a restore and asserted empty in tests for an up-to-date database.

## Open questions

Items that could not be confirmed from the app code and are worth checking against a real backup
(`npm run inspect-backup -- backup.fitnotes --samples`):

- `default_graph_id` values: FitNotes' graph-type ids were not recovered; WorkoutNotes uses its own
  numbering (`GraphType` in `constants.ts`, help-page order). A mismatch only changes which graph
  opens by default.
- `first_day_of_week`, `weight_increment` unit and `category_sort_order` encodings (assumed above).
- `Comment.owner_type_id = 2` is treated as legacy workout comments (FitNotes migrates them, so
  current backups should not contain any).
- Whether Android accepts a database whose `sqlite_sequence` values were produced by sql.js (it
  should: it is standard SQLite). Confirm by restoring an exported file on a device.
