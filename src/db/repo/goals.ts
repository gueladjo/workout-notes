import type { AppDatabase } from '../store';
import type { Goal } from '../types';

interface GoalRow {
  _id: number;
  type_id: number;
  exercise_id: number;
  metric_weight: number;
  reps: number;
  unit: number;
  title: string | null;
  target_date: string | null;
  start_date: string | null;
  sort_order: number;
  distance: number;
  duration_seconds: number;
}

function toGoal(r: GoalRow): Goal {
  return {
    id: r._id,
    typeId: r.type_id,
    exerciseId: r.exercise_id,
    metricWeight: Number(r.metric_weight) || 0,
    reps: Number(r.reps) || 0,
    unit: r.unit,
    title: r.title,
    targetDate: r.target_date,
    startDate: r.start_date,
    sortOrder: r.sort_order,
    distanceMetres: Number(r.distance) || 0,
    durationSeconds: Number(r.duration_seconds) || 0,
  };
}

export function listGoals(db: AppDatabase, exerciseId?: number): Goal[] {
  if (exerciseId !== undefined) {
    return db
      .all<GoalRow>('SELECT * FROM Goal WHERE exercise_id = ? ORDER BY sort_order ASC, _id ASC', [exerciseId])
      .map(toGoal);
  }
  return db.all<GoalRow>('SELECT * FROM Goal ORDER BY exercise_id ASC, sort_order ASC, _id ASC').map(toGoal);
}

export type GoalInput = Omit<Goal, 'id' | 'sortOrder'>;

export function createGoal(db: AppDatabase, input: GoalInput): number {
  return db.mutate(() => {
    const sort = Number(
      db.scalar('SELECT COALESCE(MAX(sort_order), 0) + 1 FROM Goal WHERE exercise_id = ?', [
        input.exerciseId,
      ]),
    );
    db.run(
      'INSERT INTO Goal (type_id, exercise_id, metric_weight, reps, unit, title, target_date, sort_order, distance, duration_seconds, start_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        input.typeId,
        input.exerciseId,
        input.metricWeight,
        Math.round(input.reps),
        input.unit,
        input.title,
        input.targetDate,
        sort,
        input.distanceMetres,
        Math.round(input.durationSeconds),
        input.startDate,
      ],
    );
    return Number(db.scalar('SELECT last_insert_rowid()'));
  });
}

export function updateGoal(db: AppDatabase, id: number, input: GoalInput): void {
  db.mutate(() =>
    db.run(
      'UPDATE Goal SET type_id = ?, metric_weight = ?, reps = ?, unit = ?, title = ?, target_date = ?, distance = ?, duration_seconds = ?, start_date = ? WHERE _id = ?',
      [
        input.typeId,
        input.metricWeight,
        Math.round(input.reps),
        input.unit,
        input.title,
        input.targetDate,
        input.distanceMetres,
        Math.round(input.durationSeconds),
        input.startDate,
        id,
      ],
    ),
  );
}

export function deleteGoal(db: AppDatabase, id: number): void {
  db.mutate(() => db.run('DELETE FROM Goal WHERE _id = ?', [id]));
}
