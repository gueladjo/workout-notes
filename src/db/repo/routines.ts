import type { AppDatabase } from '../store';
import type {
  Routine,
  RoutineDetail,
  RoutineExerciseDetail,
  RoutineSectionDetail,
  RoutineSet,
} from '../types';
import { getExercise } from './exercises';
import { createGroup, listRoutineSectionGroups } from './groups';
import { addSet, previousWorkoutSets } from './workouts';

/** RoutineSectionExercise.populate_sets_type */
export const PopulateSetsType = { NONE: 0, PREDEFINED_SETS: 1, COPY_PREVIOUS_WORKOUT: 2 } as const;

export function listRoutines(db: AppDatabase): Routine[] {
  return db
    .all<{ _id: number; name: string; notes: string | null }>(
      'SELECT * FROM Routine ORDER BY name COLLATE NOCASE ASC',
    )
    .map((r) => ({ id: r._id, name: r.name, notes: r.notes ?? '' }));
}

export function getRoutine(db: AppDatabase, id: number): RoutineDetail | undefined {
  const r = db.get<{ _id: number; name: string; notes: string | null }>(
    'SELECT * FROM Routine WHERE _id = ?',
    [id],
  );
  if (!r) return undefined;
  const sections = db
    .all<{ _id: number; routine_id: number; name: string; sort_order: number }>(
      'SELECT * FROM RoutineSection WHERE routine_id = ? ORDER BY sort_order ASC, _id ASC',
      [id],
    )
    .map((s): RoutineSectionDetail => ({
      id: s._id,
      routineId: s.routine_id,
      name: s.name,
      sortOrder: Number(s.sort_order) || 0,
      exercises: listSectionExercises(db, s._id),
    }));
  return { id: r._id, name: r.name, notes: r.notes ?? '', sections };
}

export function listSectionExercises(db: AppDatabase, sectionId: number): RoutineExerciseDetail[] {
  const groups = listRoutineSectionGroups(db, sectionId);
  return db
    .all<{
      _id: number;
      routine_section_id: number;
      exercise_id: number;
      sort_order: number;
      populate_sets_type: number;
    }>('SELECT * FROM RoutineSectionExercise WHERE routine_section_id = ? ORDER BY sort_order ASC, _id ASC', [
      sectionId,
    ])
    .flatMap((re) => {
      const exercise = getExercise(db, re.exercise_id);
      if (!exercise) return [];
      return [
        {
          id: re._id,
          sectionId: re.routine_section_id,
          exerciseId: re.exercise_id,
          sortOrder: re.sort_order,
          populateSetsType: re.populate_sets_type,
          exercise,
          sets: listRoutineSets(db, re._id),
          group: groups.find((g) => g.exerciseIds.includes(re.exercise_id)) ?? null,
        },
      ];
    });
}

export function listRoutineSets(db: AppDatabase, routineExerciseId: number): RoutineSet[] {
  return db
    .all<{
      _id: number;
      routine_section_exercise_id: number;
      metric_weight: number;
      reps: number;
      sort_order: number;
      distance: number;
      duration_seconds: number;
      unit: number;
    }>(
      'SELECT * FROM RoutineSectionExerciseSet WHERE routine_section_exercise_id = ? ORDER BY sort_order ASC, _id ASC',
      [routineExerciseId],
    )
    .map((s) => ({
      id: s._id,
      routineExerciseId: s.routine_section_exercise_id,
      metricWeight: Number(s.metric_weight) || 0,
      reps: Number(s.reps) || 0,
      sortOrder: s.sort_order,
      distanceMetres: Number(s.distance) || 0,
      durationSeconds: Number(s.duration_seconds) || 0,
      unit: s.unit,
    }));
}

export function createRoutine(db: AppDatabase, name: string, notes = ''): number {
  return db.mutate(() => {
    db.run('INSERT INTO Routine (name, notes) VALUES (?, ?)', [name.trim(), notes]);
    return Number(db.scalar('SELECT last_insert_rowid()'));
  });
}

export function updateRoutine(db: AppDatabase, id: number, patch: { name?: string; notes?: string }): void {
  db.mutate(() => {
    if (patch.name !== undefined)
      db.run('UPDATE Routine SET name = ? WHERE _id = ?', [patch.name.trim(), id]);
    if (patch.notes !== undefined) db.run('UPDATE Routine SET notes = ? WHERE _id = ?', [patch.notes, id]);
  });
}

export function deleteRoutine(db: AppDatabase, id: number): void {
  db.mutate(() => {
    for (const s of db.all<{ _id: number }>('SELECT _id FROM RoutineSection WHERE routine_id = ?', [id]))
      deleteSection(db, s._id);
    db.run('DELETE FROM Routine WHERE _id = ?', [id]);
  });
}

/** Deep copy of a routine (sections, exercises, predefined sets, groups). */
export function copyRoutine(db: AppDatabase, id: number, newName: string): number {
  return db.mutate(() => {
    const src = getRoutine(db, id);
    if (!src) throw new Error('routine not found');
    const newId = createRoutine(db, newName, src.notes);
    for (const section of src.sections) {
      const newSectionId = addSection(db, newId, section.name);
      const idMap = new Map<number, number>();
      for (const ex of section.exercises) {
        const newExId = addSectionExercise(db, newSectionId, ex.exerciseId);
        idMap.set(ex.exerciseId, newExId);
        setPredefinedSets(db, newExId, ex.sets, ex.populateSetsType);
      }
      for (const g of listRoutineSectionGroups(db, section.id)) {
        createGroup(db, {
          date: '',
          routineSectionId: newSectionId,
          name: g.name,
          colour: g.colour,
          exerciseIds: g.exerciseIds,
        });
      }
    }
    return newId;
  });
}

export function addSection(db: AppDatabase, routineId: number, name: string): number {
  return db.mutate(() => {
    const sort = Number(
      db.scalar('SELECT COALESCE(MAX(sort_order), 0) + 1 FROM RoutineSection WHERE routine_id = ?', [
        routineId,
      ]),
    );
    db.run('INSERT INTO RoutineSection (routine_id, name, sort_order) VALUES (?, ?, ?)', [
      routineId,
      name.trim(),
      sort,
    ]);
    return Number(db.scalar('SELECT last_insert_rowid()'));
  });
}

export function renameSection(db: AppDatabase, sectionId: number, name: string): void {
  db.mutate(() => db.run('UPDATE RoutineSection SET name = ? WHERE _id = ?', [name.trim(), sectionId]));
}

export function deleteSection(db: AppDatabase, sectionId: number): void {
  db.mutate(() => {
    db.run(
      'DELETE FROM RoutineSectionExerciseSet WHERE routine_section_exercise_id IN (SELECT _id FROM RoutineSectionExercise WHERE routine_section_id = ?)',
      [sectionId],
    );
    db.run('DELETE FROM RoutineSectionExercise WHERE routine_section_id = ?', [sectionId]);
    db.run('DELETE FROM WorkoutGroupExercise WHERE routine_section_id = ? AND date = ?', [sectionId, '']);
    db.run('DELETE FROM WorkoutGroup WHERE routine_section_id = ? AND date = ?', [sectionId, '']);
    db.run('DELETE FROM RoutineSection WHERE _id = ?', [sectionId]);
  });
}

export function reorderSections(db: AppDatabase, orderedSectionIds: number[]): void {
  db.mutate(() => {
    orderedSectionIds.forEach((id, i) =>
      db.run('UPDATE RoutineSection SET sort_order = ? WHERE _id = ?', [i + 1, id]),
    );
  });
}

export function addSectionExercise(db: AppDatabase, sectionId: number, exerciseId: number): number {
  return db.mutate(() => {
    const sort = Number(
      db.scalar(
        'SELECT COALESCE(MAX(sort_order), 0) + 1 FROM RoutineSectionExercise WHERE routine_section_id = ?',
        [sectionId],
      ),
    );
    db.run(
      'INSERT INTO RoutineSectionExercise (routine_section_id, exercise_id, sort_order, populate_sets_type) VALUES (?, ?, ?, 0)',
      [sectionId, exerciseId, sort],
    );
    return Number(db.scalar('SELECT last_insert_rowid()'));
  });
}

export function removeSectionExercise(db: AppDatabase, routineExerciseId: number): void {
  db.mutate(() => {
    const re = db.get<{ routine_section_id: number; exercise_id: number }>(
      'SELECT routine_section_id, exercise_id FROM RoutineSectionExercise WHERE _id = ?',
      [routineExerciseId],
    );
    db.run('DELETE FROM RoutineSectionExerciseSet WHERE routine_section_exercise_id = ?', [
      routineExerciseId,
    ]);
    db.run('DELETE FROM RoutineSectionExercise WHERE _id = ?', [routineExerciseId]);
    if (re) {
      db.run(
        'DELETE FROM WorkoutGroupExercise WHERE routine_section_id = ? AND exercise_id = ? AND date = ?',
        [re.routine_section_id, re.exercise_id, ''],
      );
      db.run(
        "DELETE FROM WorkoutGroup WHERE routine_section_id = ? AND date = '' AND _id NOT IN (SELECT workout_group_id FROM WorkoutGroupExercise WHERE routine_section_id = ? AND date = '')",
        [re.routine_section_id, re.routine_section_id],
      );
    }
  });
}

export function reorderSectionExercises(db: AppDatabase, orderedRoutineExerciseIds: number[]): void {
  db.mutate(() => {
    orderedRoutineExerciseIds.forEach((id, i) =>
      db.run('UPDATE RoutineSectionExercise SET sort_order = ? WHERE _id = ?', [i + 1, id]),
    );
  });
}

export type PredefinedSetInput = Pick<
  RoutineSet,
  'metricWeight' | 'reps' | 'distanceMetres' | 'durationSeconds' | 'unit'
>;

/**
 * Replace the predefined sets of a routine exercise. Without an explicit `populateType`, rows mean
 * predefined sets (1); no rows keeps FitNotes' "copy previous workout" (2), which nothing in the app
 * can set back, and otherwise means none (0).
 */
export function setPredefinedSets(
  db: AppDatabase,
  routineExerciseId: number,
  sets: PredefinedSetInput[],
  populateType?: number,
): void {
  db.mutate(() => {
    const current = Number(
      db.scalar('SELECT populate_sets_type FROM RoutineSectionExercise WHERE _id = ?', [routineExerciseId]),
    );
    const type =
      populateType ??
      (sets.length
        ? PopulateSetsType.PREDEFINED_SETS
        : current === PopulateSetsType.COPY_PREVIOUS_WORKOUT
          ? PopulateSetsType.COPY_PREVIOUS_WORKOUT
          : PopulateSetsType.NONE);
    db.run('DELETE FROM RoutineSectionExerciseSet WHERE routine_section_exercise_id = ?', [
      routineExerciseId,
    ]);
    sets.forEach((s, i) => {
      db.run(
        'INSERT INTO RoutineSectionExerciseSet (routine_section_exercise_id, metric_weight, reps, sort_order, distance, duration_seconds, unit) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          routineExerciseId,
          s.metricWeight,
          Math.round(s.reps),
          i + 1,
          s.distanceMetres,
          Math.round(s.durationSeconds),
          s.unit,
        ],
      );
    });
    db.run('UPDATE RoutineSectionExercise SET populate_sets_type = ? WHERE _id = ?', [
      type,
      routineExerciseId,
    ]);
  });
}

export interface PlannedSet {
  routineExerciseId: number;
  exerciseId: number;
  routineSetId: number;
  metricWeight: number;
  reps: number;
  distanceMetres: number;
  durationSeconds: number;
  unit: number;
}

/**
 * Sets a routine day would add to a workout: predefined sets, with empty (zero) fields filled from
 * the last time this predefined set was logged, else from the previous workout of the exercise.
 * An exercise FitNotes set to copy the previous workout (`populate_sets_type` 2) gets every set of
 * that workout; any other exercise without predefined sets gets one empty set.
 */
export function plannedSetsForSection(db: AppDatabase, sectionId: number, date: string): PlannedSet[] {
  const result: PlannedSet[] = [];
  for (const ex of listSectionExercises(db, sectionId)) {
    const prev = previousWorkoutSets(db, ex.exerciseId, date);
    if (ex.sets.length === 0) {
      const copied = ex.populateSetsType === PopulateSetsType.COPY_PREVIOUS_WORKOUT && prev ? prev.sets : [];
      if (copied.length === 0) {
        result.push({
          routineExerciseId: ex.id,
          exerciseId: ex.exerciseId,
          routineSetId: 0,
          metricWeight: 0,
          reps: 0,
          distanceMetres: 0,
          durationSeconds: 0,
          unit: prev?.sets[0]?.unit ?? 0,
        });
      }
      for (const s of copied) {
        result.push({
          routineExerciseId: ex.id,
          exerciseId: ex.exerciseId,
          routineSetId: 0,
          metricWeight: s.metricWeight,
          reps: s.reps,
          distanceMetres: s.distanceMetres,
          durationSeconds: s.durationSeconds,
          unit: s.unit,
        });
      }
      continue;
    }
    ex.sets.forEach((s, i) => {
      const last = db.get<{
        metric_weight: number;
        reps: number;
        distance: number;
        duration_seconds: number;
        unit: number;
      }>(
        'SELECT metric_weight, reps, distance, duration_seconds, unit FROM training_log WHERE routine_section_exercise_set_id = ? AND date < ? ORDER BY date DESC, _id DESC LIMIT 1',
        [s.id, date],
      );
      const fallback = prev?.sets[i] ?? prev?.sets[prev.sets.length - 1];
      result.push({
        routineExerciseId: ex.id,
        exerciseId: ex.exerciseId,
        routineSetId: s.id,
        metricWeight: s.metricWeight || Number(last?.metric_weight ?? fallback?.metricWeight ?? 0),
        reps: s.reps || Number(last?.reps ?? fallback?.reps ?? 0),
        distanceMetres: s.distanceMetres || Number(last?.distance ?? fallback?.distanceMetres ?? 0),
        durationSeconds:
          s.durationSeconds || Number(last?.duration_seconds ?? fallback?.durationSeconds ?? 0),
        unit: s.unit || Number(last?.unit ?? fallback?.unit ?? 0),
      });
    });
  }
  return result;
}

/** Log the selected planned sets into a workout and recreate the section's groups for that date. */
export function logRoutineSection(
  db: AppDatabase,
  sectionId: number,
  date: string,
  sets: PlannedSet[],
): void {
  db.mutate(() => {
    for (const s of sets) {
      addSet(db, {
        exerciseId: s.exerciseId,
        date,
        metricWeight: s.metricWeight,
        reps: s.reps,
        distanceMetres: s.distanceMetres,
        durationSeconds: s.durationSeconds,
        unit: s.unit,
        routineSetId: s.routineSetId,
      });
    }
    const loggedExerciseIds = new Set(sets.map((s) => s.exerciseId));
    for (const g of listRoutineSectionGroups(db, sectionId)) {
      const members = g.exerciseIds.filter((id) => loggedExerciseIds.has(id));
      if (members.length < 2) continue;
      const exists = db.get(
        'SELECT _id FROM WorkoutGroup WHERE name = ? AND routine_section_id = ? AND date = ?',
        [g.name, sectionId, date],
      );
      if (!exists)
        createGroup(db, {
          date,
          routineSectionId: sectionId,
          name: g.name,
          colour: g.colour,
          exerciseIds: members,
        });
    }
  });
}
