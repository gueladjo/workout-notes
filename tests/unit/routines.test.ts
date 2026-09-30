import { describe, expect, it, beforeAll, beforeEach } from 'vitest';
import { loadSqlJs, type SqlJsStatic } from '../../src/db/sqlite';
import { createEmptyDatabase } from '../../src/db/schema';
import { AppDatabase } from '../../src/db/store';
import { sampleExerciseIds, seedSampleWorkouts } from '../helpers/sample';
import { addSet, listSets } from '../../src/db/repo/workouts';
import {
  addSection,
  addSectionExercise,
  copyRoutine,
  createRoutine,
  getRoutine,
  listRoutineSets,
  plannedSetsForSection,
  setPredefinedSets,
  type PredefinedSetInput,
} from '../../src/db/repo/routines';
import type { RoutineSet } from '../../src/db/types';

let SQL: SqlJsStatic;
let app: AppDatabase;
let BENCH = 0;
let SQUAT = 0;

/** The sample routine: routine 1, day 1, bench press with three predefined sets (ids 1..3) at 0 kg x 5. */
const SECTION = 1;
const BENCH_EX = 1;

beforeAll(async () => {
  SQL = await loadSqlJs();
});
beforeEach(() => {
  const db = createEmptyDatabase(SQL);
  seedSampleWorkouts(db);
  ({ bench: BENCH, squat: SQUAT } = sampleExerciseIds(db));
  app = new AppDatabase(db);
});

/** What the predefined sets dialog sends back for a row it was opened with: its values and its id. */
const asInput = (s: RoutineSet): PredefinedSetInput => ({
  id: s.id,
  metricWeight: s.metricWeight,
  reps: s.reps,
  distanceMetres: s.distanceMetres,
  durationSeconds: s.durationSeconds,
  unit: s.unit,
});
const rows = (routineExerciseId = BENCH_EX) =>
  listRoutineSets(app, routineExerciseId).map((s) => [s.id, s.metricWeight, s.reps, s.sortOrder]);
const orphanedLinks = () =>
  Number(
    app.scalar(
      'SELECT COUNT(*) FROM training_log WHERE routine_section_exercise_set_id != 0 AND routine_section_exercise_set_id NOT IN (SELECT _id FROM RoutineSectionExerciseSet)',
    ),
  );
const logBench = (date: string, metricWeight: number, reps: number, routineSetId = 0) =>
  addSet(app, {
    exerciseId: BENCH,
    date,
    metricWeight,
    reps,
    distanceMetres: 0,
    durationSeconds: 0,
    unit: 0,
    routineSetId,
  });

describe('predefined sets', () => {
  it('keeps the rows, and the history links planning relies on, when saved unchanged', () => {
    // Log the three predefined sets once, then an unrelated heavier workout.
    const sets = listRoutineSets(app, BENCH_EX);
    expect(sets.map((s) => s.id)).toEqual([1, 2, 3]);
    [42, 43, 44].forEach((kg, i) => logBench('2026-09-10', kg, 5, sets[i]!.id));
    logBench('2026-09-12', 100, 3);
    // Blank weights are filled from the last time each predefined set was logged, not from the latest workout.
    const plannedWeights = () => plannedSetsForSection(app, SECTION, '2026-09-15').map((s) => s.metricWeight);
    expect(plannedWeights()).toEqual([42, 43, 44]);
    // A no-op save, exactly what the dialog does: the rows keep their ids, nothing is orphaned.
    setPredefinedSets(app, BENCH_EX, sets.map(asInput));
    expect(rows()).toEqual([
      [1, 0, 5, 1],
      [2, 0, 5, 2],
      [3, 0, 5, 3],
    ]);
    expect(orphanedLinks()).toBe(0);
    expect(plannedWeights()).toEqual([42, 43, 44]);
  });

  it('edits rows in place, inserts additions, deletes only removals and reorders by rewriting sort_order', () => {
    logBench('2026-09-10', 43, 5, 2);
    // An edit keeps the row's id and so the link of the set logged from it.
    setPredefinedSets(
      app,
      BENCH_EX,
      listRoutineSets(app, BENCH_EX).map((s) => (s.id === 2 ? { ...asInput(s), reps: 8 } : asInput(s))),
    );
    expect(rows()).toEqual([
      [1, 0, 5, 1],
      [2, 0, 8, 2],
      [3, 0, 5, 3],
    ]);
    expect(listSets(app, BENCH, '2026-09-10')[0]!.routineSetId).toBe(2);
    // A row without an id is a new row.
    setPredefinedSets(app, BENCH_EX, [
      ...listRoutineSets(app, BENCH_EX).map(asInput),
      { metricWeight: 50, reps: 10, distanceMetres: 0, durationSeconds: 0, unit: 0 },
    ]);
    expect(rows()).toEqual([
      [1, 0, 5, 1],
      [2, 0, 8, 2],
      [3, 0, 5, 3],
      [4, 50, 10, 4],
    ]);
    // A row left out is deleted; the others keep their ids.
    setPredefinedSets(
      app,
      BENCH_EX,
      listRoutineSets(app, BENCH_EX)
        .filter((s) => s.id !== 1)
        .map(asInput),
    );
    expect(rows()).toEqual([
      [2, 0, 8, 1],
      [3, 0, 5, 2],
      [4, 50, 10, 3],
    ]);
    // Reordering rewrites sort_order and keeps the ids.
    setPredefinedSets(app, BENCH_EX, listRoutineSets(app, BENCH_EX).reverse().map(asInput));
    expect(rows()).toEqual([
      [4, 50, 10, 1],
      [3, 0, 5, 2],
      [2, 0, 8, 3],
    ]);
    expect(orphanedLinks()).toBe(0);
    expect(listSets(app, BENCH, '2026-09-10')[0]!.routineSetId).toBe(2);
  });

  it('copies a routine into rows of its own and leaves the source rows untouched', () => {
    const copyId = copyRoutine(app, 1, 'Starter copy');
    const copied = getRoutine(app, copyId)!.sections[0]!.exercises[0]!;
    expect(copied.sets.map((s) => s.id)).toEqual([4, 5, 6]);
    expect(copied.sets.map((s) => [s.metricWeight, s.reps, s.sortOrder])).toEqual([
      [0, 5, 1],
      [0, 5, 2],
      [0, 5, 3],
    ]);
    expect(rows()).toEqual([
      [1, 0, 5, 1],
      [2, 0, 5, 2],
      [3, 0, 5, 3],
    ]);
    expect(Number(app.scalar('SELECT COUNT(*) FROM RoutineSectionExerciseSet'))).toBe(6);
  });

  it("does not touch another routine exercise's row when handed its id", () => {
    const sectionId = addSection(app, createRoutine(app, 'Other'), 'Day 1');
    const other = addSectionExercise(app, sectionId, SQUAT);
    setPredefinedSets(app, other, [
      { id: 1, metricWeight: 100, reps: 3, distanceMetres: 0, durationSeconds: 0, unit: 0 },
    ]);
    expect(rows()).toEqual([
      [1, 0, 5, 1],
      [2, 0, 5, 2],
      [3, 0, 5, 3],
    ]);
    expect(rows(other)).toEqual([[4, 100, 3, 1]]);
  });

  it('leaves columns it does not know alone on retained rows', () => {
    // A column a newer FitNotes might add; altering a FitNotes table is allowed in this test only.
    app.raw.run('ALTER TABLE RoutineSectionExerciseSet ADD COLUMN future_col INTEGER DEFAULT 0');
    app.raw.run('UPDATE RoutineSectionExerciseSet SET future_col = 7 WHERE _id = 2');
    setPredefinedSets(
      app,
      BENCH_EX,
      listRoutineSets(app, BENCH_EX).map((s) => ({ ...asInput(s), reps: 6 })),
    );
    expect(rows()).toEqual([
      [1, 0, 6, 1],
      [2, 0, 6, 2],
      [3, 0, 6, 3],
    ]);
    expect(app.all('SELECT _id, future_col FROM RoutineSectionExerciseSet ORDER BY _id')).toEqual([
      { _id: 1, future_col: 0 },
      { _id: 2, future_col: 7 },
      { _id: 3, future_col: 0 },
    ]);
  });
});
