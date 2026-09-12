import type { AppDatabase } from '../store';
import { CommentOwnerType } from '../constants';

export function getSetComment(db: AppDatabase, setId: number): { id: number; comment: string } | undefined {
  const r = db.get<{ _id: number; comment: string }>(
    'SELECT _id, comment FROM Comment WHERE owner_type_id = ? AND owner_id = ? ORDER BY _id DESC LIMIT 1',
    [CommentOwnerType.TRAINING_LOG_SET, setId],
  );
  return r ? { id: r._id, comment: r.comment } : undefined;
}

/** Create, replace or (when empty) delete the comment for a set. */
export function setSetComment(db: AppDatabase, setId: number, comment: string): void {
  db.mutate(() => {
    const text = comment.trim();
    db.run('DELETE FROM Comment WHERE owner_type_id = ? AND owner_id = ?', [CommentOwnerType.TRAINING_LOG_SET, setId]);
    if (!text) return;
    const date = db.get<{ date: string }>('SELECT date FROM training_log WHERE _id = ?', [setId])?.date ?? '';
    db.run('INSERT INTO Comment (date, owner_type_id, owner_id, comment) VALUES (?, ?, ?, ?)', [
      date,
      CommentOwnerType.TRAINING_LOG_SET,
      setId,
      text,
    ]);
  });
}

export function getWorkoutComment(db: AppDatabase, date: string): string | null {
  const r = db.get<{ comment: string }>('SELECT comment FROM WorkoutComment WHERE date = ? ORDER BY _id DESC LIMIT 1', [
    date,
  ]);
  return r?.comment ?? null;
}

export function setWorkoutComment(db: AppDatabase, date: string, comment: string): void {
  db.mutate(() => {
    db.run('DELETE FROM WorkoutComment WHERE date = ?', [date]);
    const text = comment.trim();
    if (text) db.run('INSERT INTO WorkoutComment (date, comment) VALUES (?, ?)', [date, text]);
  });
}
