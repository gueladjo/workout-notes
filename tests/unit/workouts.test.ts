import { describe, expect, it, beforeAll, beforeEach } from 'vitest';
import { loadSqlJs, type SqlJsStatic } from '../../src/db/sqlite';
import { createEmptyDatabase } from '../../src/db/schema';
import { AppDatabase } from '../../src/db/store';
import { sampleExerciseIds, seedSampleWorkouts } from '../helpers/sample';
import {
  addSet,
  copySets,
  deleteSet,
  deleteWorkoutExercises,
  exerciseHistory,
  getWorkout,
  listSets,
  moveWorkout,
  previousWorkoutSets,
  reorderSets,
  reorderWorkoutExercises,
  updateSet,
  workoutDates,
  deleteWorkoutHistory,
} from '../../src/db/repo/workouts';
import { getSetComment, setSetComment, setWorkoutComment } from '../../src/db/repo/comments';
import {
  createExercise,
  deleteExercise,
  getExercise,
  listExercises,
  updateExercise,
} from '../../src/db/repo/exercises';
import { createCategory, deleteCategory, listCategories } from '../../src/db/repo/categories';
import { createGroup, listGroups, nextGroupName } from '../../src/db/repo/groups';
import { getSettings, updateSettings, DEFAULT_SETTINGS } from '../../src/db/repo/settings';
import {
  addSection,
  createRoutine,
  getRoutine,
  logRoutineSection,
  plannedSetsForSection,
  setPredefinedSets,
  listSectionExercises,
  addSectionExercise,
  copyRoutine,
} from '../../src/db/repo/routines';
import {
  addRecord,
  listMeasurements,
  listRecords,
  createMeasurement,
  deleteMeasurement,
} from '../../src/db/repo/measurements';
import { ExerciseType, DistanceUnit } from '../../src/db/constants';

let SQL: SqlJsStatic;
let app: AppDatabase;
let BENCH = 0;
let SQUAT = 0;

beforeAll(async () => {
  SQL = await loadSqlJs();
});
beforeEach(() => {
  const db = createEmptyDatabase(SQL);
  seedSampleWorkouts(db);
  ({ bench: BENCH, squat: SQUAT } = sampleExerciseIds(db));
  app = new AppDatabase(db);
});

describe('sets and workouts', () => {
  it('reads a workout in exercise order with comments and PR flags', () => {
    const w = getWorkout(app, '2026-09-01');
    expect(w.exercises.map((e) => e.exercise.name)).toEqual(['Flat Barbell Bench Press', 'Barbell Squat']);
    expect(w.exercises[0]!.sets).toHaveLength(3);
    expect(w.exercises[0]!.sets[1]!.comment).toBe('Felt strong');
    // Records are flagged lazily; adding a set recalculates for that exercise.
    addSet(app, {
      exerciseId: BENCH,
      date: '2026-09-10',
      metricWeight: 90,
      reps: 5,
      distanceMetres: 0,
      durationSeconds: 0,
      unit: 0,
    });
    const hist = exerciseHistory(app, BENCH);
    expect(hist[0]!.date).toBe('2026-09-10');
    expect(hist[0]!.sets[0]!.isPersonalRecord).toBe(true);
    const oldPr = hist.find((h) => h.date === '2026-09-08')!.sets[0]!;
    expect(oldPr.isPersonalRecord).toBe(false);
    expect(hist.find((h) => h.date === '2026-09-01')!.sets[0]!.isPersonalRecord).toBe(true); // 60x10 is the 10RM
  });

  it('adds, updates, deletes sets and their comments', () => {
    const id = addSet(app, {
      exerciseId: SQUAT,
      date: '2026-09-12',
      metricWeight: 120,
      reps: 3,
      distanceMetres: 0,
      durationSeconds: 0,
      unit: 0,
    });
    setSetComment(app, id, 'belt on');
    expect(getSetComment(app, id)?.comment).toBe('belt on');
    updateSet(app, id, { reps: 4 });
    expect(listSets(app, SQUAT, '2026-09-12')[0]!.reps).toBe(4);
    deleteSet(app, id);
    expect(listSets(app, SQUAT, '2026-09-12')).toHaveLength(0);
    expect(getSetComment(app, id)).toBeUndefined();
    expect(app.version).toBeGreaterThan(0);
  });

  it('pre-fills from the previous workout and lists workout dates with categories', () => {
    const prev = previousWorkoutSets(app, BENCH, '2026-09-05');
    expect(prev?.date).toBe('2026-09-04');
    expect(prev?.sets[0]!.metricWeight).toBe(82.5);
    const dates = workoutDates(app);
    expect([...dates.keys()]).toEqual(['2026-09-01', '2026-09-04', '2026-09-08']);
    expect(dates.get('2026-09-01')).toEqual([4, 6]); // Chest, Legs
  });

  it('reorders sets and exercises while keeping comments attached', () => {
    const before = listSets(app, BENCH, '2026-09-01');
    const newIds = reorderSets(app, [before[2]!.id, before[0]!.id, before[1]!.id]);
    const after = listSets(app, BENCH, '2026-09-01');
    expect(after.map((s) => s.metricWeight)).toEqual([80, 60, 80]);
    expect(after.map((s) => s.id)).toEqual(newIds);
    expect(after[2]!.comment).toBe('Felt strong');
    // Re-ordering the first exercise's sets must not move it behind the others.
    expect(getWorkout(app, '2026-09-01').exercises.map((e) => e.exercise.id)).toEqual([BENCH, SQUAT]);
    expect(listSets(app, SQUAT, '2026-09-01').map((s) => s.metricWeight)).toEqual([100]);
    reorderWorkoutExercises(app, '2026-09-01', [SQUAT, BENCH]);
    expect(getWorkout(app, '2026-09-01').exercises.map((e) => e.exercise.id)).toEqual([SQUAT, BENCH]);
    expect(getWorkout(app, '2026-09-01').exercises[1]!.sets.find((s) => s.comment)?.comment).toBe(
      'Felt strong',
    );
  });

  it('copies, moves and deletes workouts', () => {
    copySets(
      app,
      [{ exerciseId: BENCH, metricWeight: 70, reps: 8, distanceMetres: 0, durationSeconds: 0, unit: 0 }],
      '2026-09-12',
    );
    expect(listSets(app, BENCH, '2026-09-12')).toHaveLength(1);
    setWorkoutComment(app, '2026-09-12', 'copied');
    moveWorkout(app, '2026-09-12', '2026-09-13');
    expect(listSets(app, BENCH, '2026-09-12')).toHaveLength(0);
    expect(getWorkout(app, '2026-09-13').comment).toBe('copied');
    deleteWorkoutExercises(app, '2026-09-13', [BENCH]);
    expect(getWorkout(app, '2026-09-13').exercises).toHaveLength(0);
    const removed = deleteWorkoutHistory(app, { from: '2026-09-04', to: '2026-09-04' });
    expect(removed).toBe(3);
    expect(workoutDates(app).has('2026-09-04')).toBe(false);
  });

  it('keeps supersets in sync with exercise membership', () => {
    const gid = createGroup(app, {
      date: '2026-09-01',
      name: 'Group 1',
      colour: -1,
      exerciseIds: [BENCH, SQUAT],
    });
    expect(getWorkout(app, '2026-09-01').exercises[0]!.group?.id).toBe(gid);
    deleteWorkoutExercises(app, '2026-09-01', [SQUAT]);
    expect(listGroups(app, '2026-09-01')[0]!.exerciseIds).toEqual([BENCH]);
  });

  it('leaves no orphan group, membership or time rows behind', () => {
    const group = (date: string, ids: number[]) =>
      createGroup(app, { date, name: nextGroupName(app, date), colour: -1, exerciseIds: ids });
    const { cycling } = sampleExerciseIds(app.raw);
    // Deleting history for some exercises drops their membership where no sets remain.
    group('2026-09-01', [BENCH, SQUAT]);
    deleteWorkoutHistory(app, { exerciseIds: [SQUAT] });
    expect(listGroups(app, '2026-09-01')[0]!.exerciseIds).toEqual([BENCH]);
    expect(listGroups(app, '2026-09-08')).toHaveLength(0);
    // Deleting an exercise removes the groups it leaves empty.
    deleteExercise(app, BENCH);
    expect(listGroups(app, '2026-09-01')).toHaveLength(0);
    expect(nextGroupName(app, '2026-09-01')).toBe('Group 1');
    // Merging workouts: an exercise already grouped on the target keeps that group even when the
    // moved group is older; the moved group keeps its other exercises; one workout time per date.
    const cardio = {
      exerciseId: cycling,
      metricWeight: 0,
      reps: 0,
      distanceMetres: 1000,
      durationSeconds: 300,
      unit: 3,
    };
    const squats = {
      exerciseId: SQUAT,
      metricWeight: 100,
      reps: 5,
      distanceMetres: 0,
      durationSeconds: 0,
      unit: 0,
    };
    copySets(app, [cardio, squats], '2026-09-12');
    const g12 = group('2026-09-12', [cycling, SQUAT]);
    const g4 = group('2026-09-04', [cycling]);
    app.mutate(() => {
      for (const d of ['2026-09-04', '2026-09-12'])
        app.run('INSERT INTO WorkoutTime (workout_date, start_date_time, end_date_time) VALUES (?, ?, ?)', [
          d,
          `${d}T10:00:00`,
          `${d}T11:00:00`,
        ]);
    });
    moveWorkout(app, '2026-09-12', '2026-09-04');
    const merged = listGroups(app, '2026-09-04').sort((a, b) => a.id - b.id);
    expect(merged.map((g) => [g.id, g.exerciseIds])).toEqual([
      [g12, [SQUAT]],
      [g4, [cycling]],
    ]);
    expect(listGroups(app, '2026-09-12')).toHaveLength(0);
    expect(app.scalar('SELECT COUNT(*) FROM WorkoutGroupExercise WHERE date = ?', ['2026-09-12'])).toBe(0);
    expect(app.all('SELECT * FROM WorkoutTime')).toHaveLength(1);
    expect(getWorkout(app, '2026-09-04').time?.start).toBe('2026-09-04T10:00:00');
  });
});

describe('exercises and categories', () => {
  it('creates, edits (type change clears fields), and deletes exercises with all references', () => {
    const id = createExercise(app, {
      name: 'Farmer Walk',
      categoryId: 6,
      typeId: ExerciseType.WEIGHT_AND_DISTANCE,
    });
    addSet(app, {
      exerciseId: id,
      date: '2026-09-12',
      metricWeight: 40,
      reps: 0,
      distanceMetres: 50,
      durationSeconds: 0,
      unit: DistanceUnit.METRES,
    });
    updateExercise(app, id, { typeId: ExerciseType.WEIGHT });
    const s = listSets(app, id, '2026-09-12')[0]!;
    expect(s.distanceMetres).toBe(0);
    expect(s.metricWeight).toBe(40);
    deleteExercise(app, id);
    expect(getExercise(app, id)).toBeUndefined();
    expect(listSets(app, id, '2026-09-12')).toHaveLength(0);
  });

  it('"just change unit" rescales stored kilograms so displayed numbers stay the same', () => {
    updateExercise(app, BENCH, {
      weightUnitId: 2,
      previousUnit: 'kg',
      nextUnit: 'lbs',
      convertWeightsOnUnitChange: false,
    });
    expect(listSets(app, BENCH, '2026-09-01')[0]!.metricWeight).toBeCloseTo(60 * 0.45359237, 6);
  });

  it('searches by every term and manages categories', () => {
    expect(listExercises(app, { search: 'dum press' }).map((e) => e.name)).toContain('Seated Dumbbell Press');
    // LIKE wildcards and the escape character are matched literally.
    createExercise(app, { name: '100% Row', categoryId: 1, typeId: 0 });
    createExercise(app, { name: 'Push_Up', categoryId: 1, typeId: 0 });
    createExercise(app, { name: 'A\\B', categoryId: 1, typeId: 0 });
    expect(listExercises(app, { search: '%' }).map((e) => e.name)).toEqual(['100% Row']);
    expect(listExercises(app, { search: 'push_' }).map((e) => e.name)).toEqual(['Push_Up']);
    expect(listExercises(app, { search: 'pushu' })).toHaveLength(0);
    expect(listExercises(app, { search: '\\' }).map((e) => e.name)).toEqual(['A\\B']);
    const c = createCategory(app, 'Forearms');
    expect(listCategories(app).some((x) => x.id === c.id)).toBe(true);
    createExercise(app, { name: 'Wrist Curl', categoryId: c.id, typeId: 0 });
    deleteCategory(app, c.id);
    expect(listExercises(app, { search: 'Wrist' })).toHaveLength(0);
  });
});

describe('settings', () => {
  it('round-trips through the settings table with defaults for missing values', () => {
    expect(getSettings(app).metric).toBe(true);
    updateSettings(app, { metric: false, homeScreenLimitValue: 3, appTheme: 1 });
    const s = getSettings(app);
    expect(s.metric).toBe(false);
    expect(s.homeScreenLimitValue).toBe(3);
    expect(s.appTheme).toBe(1);
    expect(s.trackPersonalRecords).toBe(DEFAULT_SETTINGS.trackPersonalRecords);
  });
});

describe('routines', () => {
  it('plans sets from predefined values, filling blanks from the last workout, and logs them with groups', () => {
    const planned = plannedSetsForSection(app, 1, '2026-09-12');
    expect(planned).toHaveLength(3);
    expect(planned[0]!.reps).toBe(5);
    expect(planned[0]!.metricWeight).toBe(85); // copied from 2026-09-08 first set
    const routineId = createRoutine(app, 'PPL');
    const sectionId = addSection(app, routineId, 'Push');
    const re = addSectionExercise(app, sectionId, SQUAT);
    setPredefinedSets(app, re, [
      { metricWeight: 100, reps: 5, distanceMetres: 0, durationSeconds: 0, unit: 0 },
    ]);
    const r = getRoutine(app, routineId)!;
    expect(r.sections[0]!.exercises[0]!.sets[0]!.metricWeight).toBe(100);
    logRoutineSection(app, sectionId, '2026-09-12', plannedSetsForSection(app, sectionId, '2026-09-12'));
    expect(listSets(app, SQUAT, '2026-09-12')[0]!.routineSetId).toBe(
      r.sections[0]!.exercises[0]!.sets[0]!.id,
    );
    const copyId = copyRoutine(app, routineId, 'PPL copy');
    expect(listSectionExercises(app, getRoutine(app, copyId)!.sections[0]!.id)).toHaveLength(1);
  });
});

describe('measurements', () => {
  it('records and lists measurement values', () => {
    expect(listMeasurements(app, true).map((m) => m.name)).toEqual(['Bodyweight', 'Body Fat']);
    const id = createMeasurement(app, { name: 'Calories', unitId: 0, goalType: 0, goalValue: 0 });
    addRecord(app, { measurementId: id, date: '2026-09-12', time: '09:00:00', value: 2400 });
    expect(listRecords(app, id)[0]!.value).toBe(2400);
    expect(listMeasurements(app)[0]!.name).toBe('Calories');
    deleteMeasurement(app, id);
    expect(listRecords(app, id)).toHaveLength(0);
  });
});
