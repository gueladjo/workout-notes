/**
 * Personal-record flags on training_log rows. FitNotes recalculates them whenever a workout
 * changes; we do the same per exercise (cheap: one query per exercise).
 */
import type { AppDatabase } from '../store';
import { ExerciseType } from '../constants';
import { personalRecordSetIds } from '@/domain/records';

/** Recompute `is_personal_record` for one exercise (or all weight+reps exercises when omitted). */
export function recalculatePersonalRecords(db: AppDatabase, exerciseId?: number): void {
  db.mutate(() => {
    const ids =
      exerciseId !== undefined
        ? [exerciseId]
        : db.all<{ _id: number }>('SELECT _id FROM exercise').map((r) => r._id);
    for (const id of ids) {
      const type = db.get<{ exercise_type_id: number }>('SELECT exercise_type_id FROM exercise WHERE _id = ?', [id]);
      if (!type) continue;
      if (type.exercise_type_id !== ExerciseType.WEIGHT_AND_REPS) {
        db.run('UPDATE training_log SET is_personal_record = 0, is_personal_record_first = 0 WHERE exercise_id = ? AND is_personal_record != 0', [id]);
        continue;
      }
      const sets = db.all<{ _id: number; date: string; metric_weight: number; reps: number; is_personal_record: number }>(
        'SELECT _id, date, metric_weight, reps, is_personal_record FROM training_log WHERE exercise_id = ? ORDER BY date ASC, _id ASC',
        [id],
      );
      const records = personalRecordSetIds(
        sets.map((s) => ({ id: s._id, date: s.date, weight: Number(s.metric_weight), reps: s.reps })),
      );
      for (const s of sets) {
        const should = records.has(s._id) ? 1 : 0;
        if ((s.is_personal_record ? 1 : 0) !== should) {
          db.run('UPDATE training_log SET is_personal_record = ?, is_personal_record_first = ? WHERE _id = ?', [
            should,
            should,
            s._id,
          ]);
        }
      }
    }
  });
}
