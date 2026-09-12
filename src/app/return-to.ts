/**
 * "returnTo" protocol for the exercise picker. Screens that need an exercise (the routine editor)
 * open `/exercises?returnTo=<url>`; when the user picks or creates an exercise the picker calls
 * `completeReturnTo`, which performs any insert encoded in the URL and returns where to navigate.
 *
 * Supported: `/routine/:id/edit?date=&sectionId=N` -> adds the exercise to that routine day and
 * returns to the editor with `editSets=<new routine exercise id>` so predefined sets can be set.
 */
import type { AppDatabase } from '@/db/store';
import { addSectionExercise } from '@/db/repo/routines';

export function completeReturnTo(db: AppDatabase, returnTo: string, exerciseId: number): string {
  const qIndex = returnTo.indexOf('?');
  const params = new URLSearchParams(qIndex >= 0 ? returnTo.slice(qIndex + 1) : '');
  const sectionId = Number(params.get('sectionId'));
  if (sectionId) {
    const routineExerciseId = addSectionExercise(db, sectionId, exerciseId);
    params.delete('sectionId');
    params.set('editSets', String(routineExerciseId));
    return `${qIndex >= 0 ? returnTo.slice(0, qIndex) : returnTo}?${params.toString()}`;
  }
  params.set('exerciseId', String(exerciseId));
  return `${qIndex >= 0 ? returnTo.slice(0, qIndex) : returnTo}?${params.toString()}`;
}
