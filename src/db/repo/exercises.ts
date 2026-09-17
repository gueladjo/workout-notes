import type { AppDatabase } from '../store';
import type { ExerciseWithCategory } from '../types';
import {
  ExerciseWeightUnit,
  exerciseTypeHas,
  isExerciseTypeId,
  KG_PER_LB,
  type ExerciseTypeId,
} from '../constants';
import { recalculatePersonalRecords } from './records';
import { deleteEmptyGroups } from './groups';

export interface ExerciseRow {
  _id: number;
  name: string;
  category_id: number;
  exercise_type_id: number;
  notes: string | null;
  weight_increment: number | null;
  default_graph_id: number | null;
  default_rest_time: number | null;
  weight_unit_id: number;
  is_favourite: number;
  category_name?: string;
  category_colour?: number;
}

export function toExercise(r: ExerciseRow): ExerciseWithCategory {
  return {
    id: r._id,
    name: r.name,
    categoryId: r.category_id,
    typeId: (isExerciseTypeId(r.exercise_type_id) ? r.exercise_type_id : 0) as ExerciseTypeId,
    notes: r.notes ?? '',
    weightIncrement: r.weight_increment === null ? null : Number(r.weight_increment) || null,
    defaultGraphId: r.default_graph_id,
    defaultRestTime: r.default_rest_time,
    weightUnitId: r.weight_unit_id ?? 0,
    isFavourite: !!r.is_favourite,
    categoryName: r.category_name ?? '',
    categoryColour: r.category_colour ?? 0,
  };
}

const SELECT =
  'SELECT e.*, c.name AS category_name, c.colour AS category_colour FROM exercise e LEFT JOIN Category c ON c._id = e.category_id';

export function listExercises(
  db: AppDatabase,
  opts: { categoryId?: number; favouritesOnly?: boolean; search?: string } = {},
): ExerciseWithCategory[] {
  const where: string[] = [];
  const params: (number | string)[] = [];
  if (opts.categoryId !== undefined) {
    where.push('e.category_id = ?');
    params.push(opts.categoryId);
  }
  if (opts.favouritesOnly) where.push('e.is_favourite = 1');
  if (opts.search && opts.search.trim()) {
    // FitNotes: every whitespace-separated term must appear somewhere in the name.
    for (const term of opts.search.trim().split(/\s+/)) {
      where.push("e.name LIKE ? COLLATE NOCASE ESCAPE '\\'");
      params.push(`%${term.replace(/[\\%_]/g, (m) => '\\' + m)}%`);
    }
  }
  const sql = `${SELECT}${where.length ? ' WHERE ' + where.join(' AND ') : ''} ORDER BY e.name COLLATE NOCASE ASC`;
  return db.all<ExerciseRow>(sql, params).map(toExercise);
}

export function getExercise(db: AppDatabase, id: number): ExerciseWithCategory | undefined {
  const r = db.get<ExerciseRow>(`${SELECT} WHERE e._id = ?`, [id]);
  return r ? toExercise(r) : undefined;
}

export function exerciseNameExists(db: AppDatabase, name: string, exceptId?: number): boolean {
  return (
    Number(
      db.scalar('SELECT COUNT(*) FROM exercise WHERE name = ? COLLATE NOCASE AND _id != ?', [
        name.trim(),
        exceptId ?? -1,
      ]),
    ) > 0
  );
}

export interface ExerciseInput {
  name: string;
  categoryId: number;
  typeId: ExerciseTypeId;
  notes?: string;
  weightUnitId?: number;
  weightIncrement?: number | null;
  defaultGraphId?: number | null;
  defaultRestTime?: number | null;
}

export function createExercise(db: AppDatabase, input: ExerciseInput): number {
  return db.mutate(() => {
    db.run(
      `INSERT INTO exercise (name, category_id, exercise_type_id, notes, weight_increment, default_graph_id, default_rest_time, weight_unit_id, is_favourite)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        input.name.trim(),
        input.categoryId,
        input.typeId,
        input.notes ?? null,
        input.weightIncrement ?? null,
        input.defaultGraphId ?? null,
        input.defaultRestTime ?? null,
        input.weightUnitId ?? ExerciseWeightUnit.DEFAULT,
      ],
    );
    return Number(db.scalar('SELECT last_insert_rowid()'));
  });
}

export interface ExerciseUpdate extends Partial<ExerciseInput> {
  /** When the weight unit changes: convert stored values (true) or keep numbers as-is (false). */
  convertWeightsOnUnitChange?: boolean;
  /** Resolved display units before/after, needed for conversion when switching units. */
  previousUnit?: 'kg' | 'lbs';
  nextUnit?: 'kg' | 'lbs';
}

export function updateExercise(db: AppDatabase, id: number, patch: ExerciseUpdate): void {
  db.mutate(() => {
    const current = getExercise(db, id);
    if (!current) throw new Error(`exercise ${id} not found`);
    const sets: [string, unknown][] = [];
    if (patch.name !== undefined) sets.push(['name', patch.name.trim()]);
    if (patch.categoryId !== undefined) sets.push(['category_id', patch.categoryId]);
    if (patch.notes !== undefined) sets.push(['notes', patch.notes]);
    if (patch.weightIncrement !== undefined) sets.push(['weight_increment', patch.weightIncrement]);
    if (patch.defaultGraphId !== undefined) sets.push(['default_graph_id', patch.defaultGraphId]);
    if (patch.defaultRestTime !== undefined) sets.push(['default_rest_time', patch.defaultRestTime]);
    if (patch.weightUnitId !== undefined) sets.push(['weight_unit_id', patch.weightUnitId]);
    if (patch.typeId !== undefined) sets.push(['exercise_type_id', patch.typeId]);
    for (const [col, val] of sets) db.run(`UPDATE exercise SET ${col} = ? WHERE _id = ?`, [val as never, id]);

    // Changing the type drops fields that the new type does not have (FitNotes behaviour).
    if (patch.typeId !== undefined && patch.typeId !== current.typeId) {
      const clears: string[] = [];
      if (!exerciseTypeHas(patch.typeId, 'weight')) clears.push('metric_weight = 0');
      if (!exerciseTypeHas(patch.typeId, 'reps')) clears.push('reps = 0');
      if (!exerciseTypeHas(patch.typeId, 'distance')) clears.push('distance = 0, unit = 0');
      if (!exerciseTypeHas(patch.typeId, 'time')) clears.push('duration_seconds = 0');
      if (clears.length) {
        db.run(`UPDATE training_log SET ${clears.join(', ')} WHERE exercise_id = ?`, [id]);
        db.run(
          `UPDATE RoutineSectionExerciseSet SET ${clears.join(', ')} WHERE routine_section_exercise_id IN (SELECT _id FROM RoutineSectionExercise WHERE exercise_id = ?)`,
          [id],
        );
      }
    }

    // "Just change unit": keep the displayed numbers, so the stored kg value must be rescaled.
    if (
      patch.weightUnitId !== undefined &&
      patch.previousUnit &&
      patch.nextUnit &&
      patch.previousUnit !== patch.nextUnit &&
      patch.convertWeightsOnUnitChange === false
    ) {
      const factor = patch.nextUnit === 'lbs' ? KG_PER_LB : 1 / KG_PER_LB;
      db.run('UPDATE training_log SET metric_weight = metric_weight * ? WHERE exercise_id = ?', [factor, id]);
      db.run('UPDATE Goal SET metric_weight = metric_weight * ? WHERE exercise_id = ?', [factor, id]);
      db.run(
        'UPDATE RoutineSectionExerciseSet SET metric_weight = metric_weight * ? WHERE routine_section_exercise_id IN (SELECT _id FROM RoutineSectionExercise WHERE exercise_id = ?)',
        [factor, id],
      );
    }
    recalculatePersonalRecords(db, id);
  });
}

export function setFavourite(db: AppDatabase, id: number, favourite: boolean): void {
  db.mutate(() => db.run('UPDATE exercise SET is_favourite = ? WHERE _id = ?', [favourite ? 1 : 0, id]));
}

/** Delete an exercise and everything that references it. */
export function deleteExercise(db: AppDatabase, id: number): void {
  db.mutate(() => {
    db.run(
      'DELETE FROM Comment WHERE owner_type_id = 1 AND owner_id IN (SELECT _id FROM training_log WHERE exercise_id = ?)',
      [id],
    );
    db.run('DELETE FROM training_log WHERE exercise_id = ?', [id]);
    db.run('DELETE FROM Goal WHERE exercise_id = ?', [id]);
    db.run(
      'DELETE FROM RoutineSectionExerciseSet WHERE routine_section_exercise_id IN (SELECT _id FROM RoutineSectionExercise WHERE exercise_id = ?)',
      [id],
    );
    db.run('DELETE FROM RoutineSectionExercise WHERE exercise_id = ?', [id]);
    db.run('DELETE FROM WorkoutGroupExercise WHERE exercise_id = ?', [id]);
    deleteEmptyGroups(db);
    db.run('DELETE FROM ExerciseGraphFavourite WHERE exercise_id = ?', [id]);
    db.run('DELETE FROM Barbell WHERE exercise_id = ?', [id]);
    db.run('DELETE FROM exercise WHERE _id = ?', [id]);
  });
}

export function favouriteCount(db: AppDatabase): number {
  return Number(db.scalar('SELECT COUNT(*) FROM exercise WHERE is_favourite = 1'));
}

/** Workout count and last-used date per exercise (for the exercise list details option). */
export function exerciseUsage(db: AppDatabase): Map<number, { workouts: number; lastDate: string }> {
  const rows = db.all<{ exercise_id: number; workouts: number; last_date: string }>(
    'SELECT exercise_id, COUNT(DISTINCT date) AS workouts, MAX(date) AS last_date FROM training_log GROUP BY exercise_id',
  );
  return new Map(rows.map((r) => [r.exercise_id, { workouts: r.workouts, lastDate: r.last_date }]));
}
