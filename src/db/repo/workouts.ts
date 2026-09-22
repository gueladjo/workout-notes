/**
 * Sets (training_log) and the workout views built from them. A "workout" is simply every set on a
 * date; exercise order within a workout is the order of each exercise's first set id, exactly like
 * FitNotes (`SELECT MIN(_id) ... GROUP BY date, exercise_id`).
 */
import type { AppDatabase } from '../store';
import { columnNames, quoteIdent } from '../sqlite';
import type { TrainingSetWithComment, Workout, WorkoutExercise, WorkoutTime } from '../types';
import { CommentOwnerType } from '../constants';
import { getExercise, toExercise, type ExerciseRow } from './exercises';
import { recalculatePersonalRecords } from './records';
import { deleteEmptyGroups, listGroups } from './groups';
import { getWorkoutComment } from './comments';

export interface SetRow {
  _id: number;
  exercise_id: number;
  date: string;
  metric_weight: number;
  reps: number;
  unit: number;
  distance: number;
  duration_seconds: number;
  is_personal_record: number;
  is_complete: number;
  routine_section_exercise_set_id: number;
  comment_id?: number | null;
  comment_text?: string | null;
}

export function toSet(r: SetRow): TrainingSetWithComment {
  return {
    id: r._id,
    exerciseId: r.exercise_id,
    date: r.date,
    metricWeight: Number(r.metric_weight) || 0,
    reps: Number(r.reps) || 0,
    unit: r.unit ?? 0,
    distanceMetres: Number(r.distance) || 0,
    durationSeconds: Number(r.duration_seconds) || 0,
    isPersonalRecord: !!r.is_personal_record,
    isComplete: !!r.is_complete,
    routineSetId: r.routine_section_exercise_set_id ?? 0,
    comment: r.comment_text ?? null,
    commentId: r.comment_id ?? null,
  };
}

const SET_SELECT = `SELECT t.*, c._id AS comment_id, c.comment AS comment_text FROM training_log t LEFT JOIN Comment c ON c.owner_type_id = ${CommentOwnerType.TRAINING_LOG_SET} AND c.owner_id = t._id`;

export function listSets(db: AppDatabase, exerciseId: number, date: string): TrainingSetWithComment[] {
  return db
    .all<SetRow>(`${SET_SELECT} WHERE t.exercise_id = ? AND t.date = ? ORDER BY t._id ASC`, [
      exerciseId,
      date,
    ])
    .map(toSet);
}

export function getSet(db: AppDatabase, id: number): TrainingSetWithComment | undefined {
  const r = db.get<SetRow>(`${SET_SELECT} WHERE t._id = ?`, [id]);
  return r ? toSet(r) : undefined;
}

/** Every set of an exercise, oldest first (for history, graphs and records). */
export function allSetsForExercise(db: AppDatabase, exerciseId: number): TrainingSetWithComment[] {
  return db
    .all<SetRow>(`${SET_SELECT} WHERE t.exercise_id = ? ORDER BY t.date ASC, t._id ASC`, [exerciseId])
    .map(toSet);
}

/** Training history grouped by workout date, most recent first. */
export function exerciseHistory(
  db: AppDatabase,
  exerciseId: number,
): { date: string; sets: TrainingSetWithComment[] }[] {
  const byDate = new Map<string, TrainingSetWithComment[]>();
  for (const s of allSetsForExercise(db, exerciseId)) {
    const list = byDate.get(s.date);
    if (list) list.push(s);
    else byDate.set(s.date, [s]);
  }
  return [...byDate.entries()]
    .map(([date, sets]) => ({ date, sets }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

/** The most recent workout of this exercise strictly before `date` (used to pre-fill set fields). */
export function previousWorkoutSets(
  db: AppDatabase,
  exerciseId: number,
  date: string,
): { date: string; sets: TrainingSetWithComment[] } | undefined {
  const r = db.get<{ date: string }>(
    'SELECT MAX(date) AS date FROM training_log WHERE exercise_id = ? AND date < ?',
    [exerciseId, date],
  );
  if (!r?.date) return undefined;
  return { date: r.date, sets: listSets(db, exerciseId, r.date) };
}

/** Dates that have a workout (sets, a comment, or a workout time), with the category ids trained. */
export function workoutDates(db: AppDatabase): Map<string, number[]> {
  const rows = db.all<{ date: string; category_id: number | null }>(
    `SELECT d.date AS date, e.category_id AS category_id FROM (
       SELECT DISTINCT date FROM training_log
       UNION SELECT DISTINCT date FROM WorkoutComment
       UNION SELECT DISTINCT workout_date AS date FROM WorkoutTime
     ) d
     LEFT JOIN (SELECT date, exercise_id, MIN(_id) AS min_id FROM training_log GROUP BY date, exercise_id) s ON s.date = d.date
     LEFT JOIN exercise e ON e._id = s.exercise_id
     ORDER BY d.date ASC, s.min_id ASC`,
  );
  const result = new Map<string, number[]>();
  for (const r of rows) {
    const list = result.get(r.date) ?? [];
    if (r.category_id !== null && !list.includes(r.category_id)) list.push(r.category_id);
    result.set(r.date, list);
  }
  return result;
}

/** Sorted list of all workout dates (ascending). */
export function allWorkoutDates(db: AppDatabase): string[] {
  return [...workoutDates(db).keys()].sort();
}

/** Exercise ids for a date in workout order. */
export function workoutExerciseIds(db: AppDatabase, date: string): number[] {
  return db
    .all<{ exercise_id: number }>(
      'SELECT exercise_id, MIN(_id) AS min_id FROM training_log WHERE date = ? GROUP BY exercise_id ORDER BY min_id ASC',
      [date],
    )
    .map((r) => r.exercise_id);
}

export function getWorkoutTime(db: AppDatabase, date: string): WorkoutTime | null {
  const r = db.get<{ _id: number; workout_date: string; start_date_time: string; end_date_time: string }>(
    'SELECT * FROM WorkoutTime WHERE workout_date = ? ORDER BY _id DESC LIMIT 1',
    [date],
  );
  return r ? { id: r._id, date: r.workout_date, start: r.start_date_time, end: r.end_date_time } : null;
}

export function getWorkout(db: AppDatabase, date: string): Workout {
  const exerciseIds = workoutExerciseIds(db, date);
  const groups = listGroups(db, date);
  const exercises: WorkoutExercise[] = [];
  for (const id of exerciseIds) {
    const exercise = getExercise(db, id);
    if (!exercise) continue;
    const group = groups.find((g) => g.exerciseIds.includes(id)) ?? null;
    exercises.push({ exercise, sets: listSets(db, id, date), group });
  }
  return { date, exercises, comment: getWorkoutComment(db, date), time: getWorkoutTime(db, date) };
}

export interface SetInput {
  exerciseId: number;
  date: string;
  metricWeight: number;
  reps: number;
  distanceMetres: number;
  durationSeconds: number;
  unit: number;
  routineSetId?: number;
  isComplete?: boolean;
}

export function addSet(db: AppDatabase, input: SetInput): number {
  return db.mutate(() => {
    db.run(
      `INSERT INTO training_log (exercise_id, date, metric_weight, reps, unit, routine_section_exercise_set_id, is_complete, distance, duration_seconds)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.exerciseId,
        input.date,
        input.metricWeight,
        Math.round(input.reps),
        input.unit,
        input.routineSetId ?? 0,
        input.isComplete ? 1 : 0,
        input.distanceMetres,
        Math.round(input.durationSeconds),
      ],
    );
    const id = Number(db.scalar('SELECT last_insert_rowid()'));
    recalculatePersonalRecords(db, input.exerciseId);
    return id;
  });
}

export function updateSet(
  db: AppDatabase,
  id: number,
  patch: Partial<Pick<SetInput, 'metricWeight' | 'reps' | 'distanceMetres' | 'durationSeconds' | 'unit'>>,
): void {
  db.mutate(() => {
    const set = getSet(db, id);
    if (!set) throw new Error(`set ${id} not found`);
    db.run(
      'UPDATE training_log SET metric_weight = ?, reps = ?, distance = ?, duration_seconds = ?, unit = ? WHERE _id = ?',
      [
        patch.metricWeight ?? set.metricWeight,
        Math.round(patch.reps ?? set.reps),
        patch.distanceMetres ?? set.distanceMetres,
        Math.round(patch.durationSeconds ?? set.durationSeconds),
        patch.unit ?? set.unit,
        id,
      ],
    );
    recalculatePersonalRecords(db, set.exerciseId);
  });
}

export function setSetComplete(db: AppDatabase, id: number, complete: boolean): void {
  db.mutate(() => db.run('UPDATE training_log SET is_complete = ? WHERE _id = ?', [complete ? 1 : 0, id]));
}

export function deleteSet(db: AppDatabase, id: number): void {
  db.mutate(() => {
    const set = getSet(db, id);
    if (!set) return;
    db.run('DELETE FROM Comment WHERE owner_type_id = ? AND owner_id = ?', [
      CommentOwnerType.TRAINING_LOG_SET,
      id,
    ]);
    db.run('DELETE FROM training_log WHERE _id = ?', [id]);
    cleanupGroupMembership(db, set.date, set.exerciseId);
    recalculatePersonalRecords(db, set.exerciseId);
  });
}

/** Remove the exercise from its group when it has no sets left on that date. */
function cleanupGroupMembership(db: AppDatabase, date: string, exerciseId: number): void {
  const remaining = Number(
    db.scalar('SELECT COUNT(*) FROM training_log WHERE date = ? AND exercise_id = ?', [date, exerciseId]),
  );
  if (remaining > 0) return;
  db.run('DELETE FROM WorkoutGroupExercise WHERE date = ? AND exercise_id = ?', [date, exerciseId]);
  deleteEmptyGroups(db, date);
}

/** Delete all sets of the given exercises on a date. */
export function deleteWorkoutExercises(db: AppDatabase, date: string, exerciseIds: number[]): void {
  db.mutate(() => {
    for (const exerciseId of exerciseIds) {
      db.run(
        'DELETE FROM Comment WHERE owner_type_id = ? AND owner_id IN (SELECT _id FROM training_log WHERE date = ? AND exercise_id = ?)',
        [CommentOwnerType.TRAINING_LOG_SET, date, exerciseId],
      );
      db.run('DELETE FROM training_log WHERE date = ? AND exercise_id = ?', [date, exerciseId]);
      cleanupGroupMembership(db, date, exerciseId);
      recalculatePersonalRecords(db, exerciseId);
    }
  });
}

/**
 * Re-order the sets of one exercise on one date. Set order is id order, so rows are re-inserted in
 * the new order (ids change) and comments are re-pointed. Exercise order within the workout is
 * MIN(_id) per exercise, so every set of the date is re-inserted in the current exercise order to
 * keep the exercise where it is. Returns the new ids of `orderedSetIds`, in the same order, so a
 * caller can keep a set selected across the move.
 */
export function reorderSets(db: AppDatabase, orderedSetIds: number[]): number[] {
  return db.mutate(() => {
    const first = orderedSetIds[0];
    const target = first === undefined ? undefined : getSet(db, first);
    if (!target) return [];
    const all: number[] = [];
    for (const exerciseId of workoutExerciseIds(db, target.date)) {
      if (exerciseId === target.exerciseId) all.push(...orderedSetIds);
      else for (const s of listSets(db, exerciseId, target.date)) all.push(s.id);
    }
    const newIds = reinsertSets(db, all);
    // Ids changed: a record tied between sets of one day belongs to the one that is now first.
    for (const exerciseId of workoutExerciseIds(db, target.date)) recalculatePersonalRecords(db, exerciseId);
    const start = all.indexOf(orderedSetIds[0]!);
    return newIds.slice(start, start + orderedSetIds.length);
  });
}

/** Re-order the exercises of a workout by re-inserting their sets in the new exercise order. */
export function reorderWorkoutExercises(db: AppDatabase, date: string, orderedExerciseIds: number[]): void {
  db.mutate(() => {
    const ids: number[] = [];
    for (const exerciseId of orderedExerciseIds) {
      for (const s of listSets(db, exerciseId, date)) ids.push(s.id);
    }
    reinsertSets(db, ids);
    for (const exerciseId of orderedExerciseIds) recalculatePersonalRecords(db, exerciseId);
  });
}

function reinsertSets(db: AppDatabase, orderedSetIds: number[]): number[] {
  // Every column but the id is copied, so fields this version does not know (a newer FitNotes
  // backup) survive the move; only the comment link needs re-pointing.
  const columns = columnNames(db.raw, 'training_log')
    .filter((c) => c !== '_id')
    .map(quoteIdent)
    .join(', ');
  const newIds: number[] = [];
  for (const oldId of orderedSetIds) {
    if (!db.get('SELECT _id FROM training_log WHERE _id = ?', [oldId])) continue;
    db.run(`INSERT INTO training_log (${columns}) SELECT ${columns} FROM training_log WHERE _id = ?`, [
      oldId,
    ]);
    const newId = Number(db.scalar('SELECT last_insert_rowid()'));
    newIds.push(newId);
    db.run('UPDATE Comment SET owner_id = ? WHERE owner_type_id = ? AND owner_id = ?', [
      newId,
      CommentOwnerType.TRAINING_LOG_SET,
      oldId,
    ]);
    db.run('DELETE FROM training_log WHERE _id = ?', [oldId]);
  }
  return newIds;
}

/**
 * Move every part of a workout to another date, merging into whatever is already there. Where the
 * target already has a workout comment or workout time, the target's row wins and the moved one is
 * dropped; an exercise already in a group on the target date keeps that group. Records are
 * re-awarded: an equal set on a date the workout moves past becomes the earlier one.
 */
export function moveWorkout(db: AppDatabase, fromDate: string, toDate: string): void {
  if (fromDate === toDate) return;
  db.mutate(() => {
    const moved = workoutExerciseIds(db, fromDate);
    db.run('UPDATE training_log SET date = ? WHERE date = ?', [toDate, fromDate]);
    db.run('UPDATE Comment SET date = ? WHERE date = ? AND owner_type_id = ?', [
      toDate,
      fromDate,
      CommentOwnerType.TRAINING_LOG_SET,
    ]);
    // An exercise can only be in one group per date: one already grouped on the target keeps that
    // group, so its membership in the moved group is dropped before the two dates merge.
    db.run(
      `DELETE FROM WorkoutGroupExercise WHERE date = ? AND exercise_id IN (
         SELECT exercise_id FROM WorkoutGroupExercise WHERE date = ?)`,
      [fromDate, toDate],
    );
    db.run('UPDATE WorkoutGroup SET date = ? WHERE date = ?', [toDate, fromDate]);
    db.run('UPDATE WorkoutGroupExercise SET date = ? WHERE date = ?', [toDate, fromDate]);
    deleteEmptyGroups(db, toDate);
    if (getWorkoutTime(db, toDate)) db.run('DELETE FROM WorkoutTime WHERE workout_date = ?', [fromDate]);
    else db.run('UPDATE WorkoutTime SET workout_date = ? WHERE workout_date = ?', [toDate, fromDate]);
    const targetHasComment = getWorkoutComment(db, toDate) !== null;
    if (targetHasComment) db.run('DELETE FROM WorkoutComment WHERE date = ?', [fromDate]);
    else db.run('UPDATE WorkoutComment SET date = ? WHERE date = ?', [toDate, fromDate]);
    for (const exerciseId of moved) recalculatePersonalRecords(db, exerciseId);
  });
}

export interface CopySet {
  exerciseId: number;
  metricWeight: number;
  reps: number;
  distanceMetres: number;
  durationSeconds: number;
  unit: number;
}

/** Copy sets (from a previous workout, the history, or a routine) into `toDate` as new, incomplete sets. */
export function copySets(db: AppDatabase, sets: CopySet[], toDate: string): void {
  db.mutate(() => {
    const touched = new Set<number>();
    for (const s of sets) {
      db.run(
        'INSERT INTO training_log (exercise_id, date, metric_weight, reps, unit, distance, duration_seconds) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          s.exerciseId,
          toDate,
          s.metricWeight,
          Math.round(s.reps),
          s.unit,
          s.distanceMetres,
          Math.round(s.durationSeconds),
        ],
      );
      touched.add(s.exerciseId);
    }
    for (const id of touched) recalculatePersonalRecords(db, id);
  });
}

export function workoutSetCount(db: AppDatabase, date: string): number {
  return Number(db.scalar('SELECT COUNT(*) FROM training_log WHERE date = ?', [date]));
}

/** Exercises that have at least one set, for pickers (exercise filter, stats). */
export function exercisesWithHistory(db: AppDatabase) {
  return db
    .all<ExerciseRow>(
      'SELECT e.*, c.name AS category_name, c.colour AS category_colour FROM exercise e INNER JOIN training_log t ON t.exercise_id = e._id LEFT JOIN Category c ON c._id = e.category_id GROUP BY e._id ORDER BY e.name COLLATE NOCASE ASC',
    )
    .map(toExercise);
}

/** Delete workout history in a date range (optionally only some exercises), keeping configuration. */
export function deleteWorkoutHistory(
  db: AppDatabase,
  opts: { from?: string; to?: string; exerciseIds?: number[] },
): number {
  return db.mutate(() => {
    const where: string[] = [];
    const params: (string | number)[] = [];
    if (opts.from) {
      where.push('date >= ?');
      params.push(opts.from);
    }
    if (opts.to) {
      where.push('date <= ?');
      params.push(opts.to);
    }
    if (opts.exerciseIds && opts.exerciseIds.length) {
      where.push(`exercise_id IN (${opts.exerciseIds.map(() => '?').join(',')})`);
      params.push(...opts.exerciseIds);
    }
    const clause = where.length ? ' WHERE ' + where.join(' AND ') : '';
    const count = Number(db.scalar(`SELECT COUNT(*) FROM training_log${clause}`, params));
    db.run(
      `DELETE FROM Comment WHERE owner_type_id = ${CommentOwnerType.TRAINING_LOG_SET} AND owner_id IN (SELECT _id FROM training_log${clause})`,
      params,
    );
    db.run(`DELETE FROM training_log${clause}`, params);
    if (opts.exerciseIds?.length) {
      // Sets of only some exercises were removed: drop their group membership on dates where they
      // have no sets left, then any group that became empty.
      const exClause = `exercise_id IN (${opts.exerciseIds.map(() => '?').join(',')})`;
      db.run(
        `DELETE FROM WorkoutGroupExercise WHERE date != '' AND ${exClause} AND NOT EXISTS (
           SELECT 1 FROM training_log t WHERE t.date = WorkoutGroupExercise.date AND t.exercise_id = WorkoutGroupExercise.exercise_id)`,
        opts.exerciseIds,
      );
      deleteEmptyGroups(db);
    } else {
      // Routine supersets share WorkoutGroup / WorkoutGroupExercise with `date = ''`: an open or
      // upper-bound-only range must not match them, so every date predicate excludes the empty date.
      const dateClause = ["date != ''", ...where.filter((w) => w.startsWith('date'))].join(' AND ');
      const dateParams = params.filter((p) => typeof p === 'string');
      db.run(`DELETE FROM WorkoutComment WHERE ${dateClause}`, dateParams);
      db.run(`DELETE FROM WorkoutGroupExercise WHERE ${dateClause}`, dateParams);
      db.run(`DELETE FROM WorkoutGroup WHERE ${dateClause}`, dateParams);
      db.run(`DELETE FROM WorkoutTime WHERE ${dateClause.replace(/date/g, 'workout_date')}`, dateParams);
    }
    recalculatePersonalRecords(db);
    return count;
  });
}
