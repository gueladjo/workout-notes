/**
 * Deterministic sample data used by unit tests and `npm run make-fixture`.
 */
import type { Database } from '../../src/db/sqlite';
import { run, scalar } from '../../src/db/sqlite';

/** Ids of the default exercises used by the sample data (looked up by name so seed order can change). */
export function sampleExerciseIds(db: Database): { bench: number; squat: number; cycling: number } {
  const id = (name: string) => Number(scalar(db, 'SELECT _id FROM exercise WHERE name = ?', [name]));
  return { bench: id('Flat Barbell Bench Press'), squat: id('Barbell Squat'), cycling: id('Cycling') };
}

export function seedSampleWorkouts(db: Database): void {
  const { bench, squat, cycling } = sampleExerciseIds(db);
  const sets: [number, string, number, number, number, number, number][] = [
    // exercise, date, kg, reps, unit, distance(m), seconds
    [bench, '2026-09-01', 60, 10, 0, 0, 0],
    [bench, '2026-09-01', 80, 5, 0, 0, 0],
    [bench, '2026-09-01', 80, 5, 0, 0, 0],
    [squat, '2026-09-01', 100, 5, 0, 0, 0],
    [bench, '2026-09-04', 82.5, 5, 0, 0, 0],
    [bench, '2026-09-04', 82.5, 4, 0, 0, 0],
    [cycling, '2026-09-04', 0, 0, 3, 12000, 1800],
    [bench, '2026-09-08', 85, 5, 0, 0, 0],
    [squat, '2026-09-08', 105, 5, 0, 0, 0],
    [squat, '2026-09-08', 105, 5, 0, 0, 0],
  ];
  for (const [ex, date, kg, reps, unit, dist, secs] of sets) {
    run(
      db,
      'INSERT INTO training_log (exercise_id, date, metric_weight, reps, unit, distance, duration_seconds) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [ex, date, kg, reps, unit, dist, secs],
    );
  }
  run(
    db,
    "INSERT INTO Comment (date, owner_type_id, owner_id, comment) VALUES ('2026-09-01', 1, 2, 'Felt strong')",
  );
  run(db, "INSERT INTO WorkoutComment (date, comment) VALUES ('2026-09-08', 'Deload next week')");
  run(db, "INSERT INTO Routine (name, notes) VALUES ('Starter', 'Twice a week')");
  run(db, "INSERT INTO RoutineSection (routine_id, name, sort_order) VALUES (1, 'Day A', 1)");
  run(
    db,
    'INSERT INTO RoutineSectionExercise (routine_section_id, exercise_id, sort_order, populate_sets_type) VALUES (1, ?, 1, 1)',
    [bench],
  );
  run(
    db,
    'INSERT INTO RoutineSectionExerciseSet (routine_section_exercise_id, metric_weight, reps, sort_order) VALUES (1, 0, 5, 1), (1, 0, 5, 2), (1, 0, 5, 3)',
  );
  run(
    db,
    "INSERT INTO MeasurementRecord (measurement_id, date, time, value) VALUES (1, '2026-09-01', '08:00:00', 80.4), (1, '2026-09-08', '08:05:00', 79.9)",
  );
}
