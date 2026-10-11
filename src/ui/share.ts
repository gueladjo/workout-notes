/**
 * Text representation of a workout for "Share Workout". Lives next to `format.ts`: it is display
 * text, built from the same set formatting the screens use, so nothing under `domain` depends on `ui`.
 */
import type { Settings } from '@/db/repo/settings';
import type { Workout } from '@/db/types';
import { formatLongDate } from '@/domain/dates';
import { fmt, kgToDisplay } from '@/domain/units';
import { formatSet, weightUnitFor } from './format';

export function workoutToText(
  workout: Workout,
  settings: Settings,
  opts: { includeVolume?: boolean; includeSets?: boolean; selectedSetIds?: Set<number> } = {},
): string {
  const lines: string[] = [formatLongDate(workout.date), ''];
  if (workout.comment) lines.push(workout.comment, '');
  let totalSets = 0;
  let volumeKg = 0;
  for (const we of workout.exercises) {
    const sets = we.sets.filter((s) => !opts.selectedSetIds || opts.selectedSetIds.has(s.id));
    if (sets.length === 0) continue;
    lines.push(we.exercise.name);
    const wu = weightUnitFor(we.exercise, settings);
    for (const s of sets) {
      lines.push(`  ${formatSet(s, we.exercise.typeId, wu, settings)}${s.comment ? `  (${s.comment})` : ''}`);
      totalSets++;
      volumeKg += s.metricWeight * s.reps;
    }
    lines.push('');
  }
  if (opts.includeSets) lines.push(`Total Sets: ${totalSets}`);
  if (opts.includeVolume) {
    const unit = settings.metric ? 'kg' : 'lbs';
    lines.push(`Total Workout Volume: ${fmt(kgToDisplay(volumeKg, unit))} ${unit}`);
  }
  return lines.join('\n').trim() + '\n';
}
