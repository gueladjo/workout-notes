/**
 * Spreadsheet export in FitNotes' CSV layouts.
 */
import type { AppDatabase } from '@/db/store';
import { getSettings } from '@/db/repo/settings';
import {
  kgToDisplay,
  metresToDisplay,
  resolveDistanceUnit,
  resolveWeightUnit,
  distanceUnitShort,
  fmt,
} from '@/domain/units';
import { formatDuration } from '@/domain/dates';
import { CommentOwnerType } from '@/db/constants';

function csvEscape(v: string | number): string {
  const s = String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function workoutCsv(db: AppDatabase): string {
  const settings = getSettings(db);
  const unitLabel = settings.metric ? 'kgs' : 'lbs';
  const rows = db.all<{
    date: string;
    exercise: string;
    category: string;
    metric_weight: number;
    reps: number;
    distance: number;
    unit: number;
    duration_seconds: number;
    weight_unit_id: number;
    comment: string | null;
  }>(
    `SELECT t.date, e.name AS exercise, c.name AS category, t.metric_weight, t.reps, t.distance, t.unit, t.duration_seconds, e.weight_unit_id, co.comment
     FROM training_log t INNER JOIN exercise e ON e._id = t.exercise_id LEFT JOIN Category c ON c._id = e.category_id
     LEFT JOIN Comment co ON co.owner_id = t._id AND co.owner_type_id = ${CommentOwnerType.TRAINING_LOG_SET}
     ORDER BY t.date ASC, t._id ASC`,
  );
  const lines = [`Date,Exercise,Category,Weight (${unitLabel}),Reps,Distance,Distance Unit,Time,Comment`];
  for (const r of rows) {
    const wu = resolveWeightUnit(r.weight_unit_id, settings.metric);
    const weight = Number(r.metric_weight)
      ? fmt(kgToDisplay(Number(r.metric_weight), wu === 'kg' ? 'kg' : 'lbs'), 3)
      : '';
    const du = resolveDistanceUnit(r.unit, settings.metric);
    const distance = Number(r.distance) ? fmt(metresToDisplay(Number(r.distance), du), 3) : '';
    const time = Number(r.duration_seconds) ? formatDuration(Number(r.duration_seconds)) : '';
    lines.push(
      [
        r.date,
        r.exercise,
        r.category,
        weight,
        r.reps || '',
        distance,
        distance ? distanceUnitShort(du) : '',
        time,
        r.comment ?? '',
      ]
        .map(csvEscape)
        .join(','),
    );
  }
  return lines.join('\n') + '\n';
}

export function bodyTrackerCsv(db: AppDatabase): string {
  const rows = db.all<{
    date: string;
    time: string;
    name: string;
    value: number;
    unit: string;
    comment: string | null;
  }>(
    `SELECT mr.date, mr.time, m.name, mr.value, COALESCE(mu.short_name, '') AS unit, mr.comment
     FROM MeasurementRecord mr INNER JOIN Measurement m ON m._id = mr.measurement_id LEFT JOIN MeasurementUnit mu ON mu._id = m.unit_id
     ORDER BY mr.date ASC, mr.time ASC, mr._id ASC`,
  );
  const lines = ['Date,Time,Measurement,Value,Unit,Comment'];
  for (const r of rows)
    lines.push(
      [r.date, r.time, r.name, fmt(Number(r.value), 3), r.unit, r.comment ?? ''].map(csvEscape).join(','),
    );
  return lines.join('\n') + '\n';
}

export function csvFileName(kind: 'workout' | 'body', now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}_${p(now.getMonth() + 1)}_${p(now.getDate())}_${p(now.getHours())}_${p(now.getMinutes())}_${p(now.getSeconds())}`;
  return kind === 'workout' ? `FitNotes_Export_${stamp}.csv` : `FitNotes_BodyTracker_Export_${stamp}.csv`;
}
