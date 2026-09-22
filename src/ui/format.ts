/**
 * Human formatting of sets, weights and distances according to the exercise type and settings.
 */
import { exerciseTypeFields, type ExerciseTypeId } from '@/db/constants';
import type { Settings } from '@/db/repo/settings';
import type { Exercise, TrainingSet } from '@/db/types';
import { formatDuration } from '@/domain/dates';
import {
  displayToMetres,
  distanceUnitShort,
  fmt,
  kgToDisplay,
  metresToDisplay,
  resolveDistanceUnit,
  resolveWeightUnit,
  type WeightUnit,
} from '@/domain/units';

export interface SetValueParts {
  weight?: string;
  reps?: string;
  distance?: string;
  time?: string;
}

export function weightUnitFor(exercise: Pick<Exercise, 'weightUnitId'>, settings: Settings): WeightUnit {
  return resolveWeightUnit(exercise.weightUnitId, settings.metric);
}

export function setValueParts(
  set: Pick<TrainingSet, 'metricWeight' | 'reps' | 'distanceMetres' | 'durationSeconds' | 'unit'>,
  typeId: ExerciseTypeId,
  weightUnit: WeightUnit,
  settings: Settings,
): SetValueParts {
  const fields = exerciseTypeFields(typeId);
  const parts: SetValueParts = {};
  if (fields.includes('weight'))
    parts.weight = `${fmt(kgToDisplay(set.metricWeight, weightUnit))} ${weightUnit}`;
  if (fields.includes('reps')) parts.reps = `${set.reps} reps`;
  if (fields.includes('distance')) {
    const du = resolveDistanceUnit(set.unit, settings.metric);
    parts.distance = `${fmt(metresToDisplay(set.distanceMetres, du))} ${distanceUnitShort(du)}`;
  }
  if (fields.includes('time')) parts.time = formatDuration(set.durationSeconds);
  return parts;
}

export interface SetValueColumn {
  value: string;
  unit: string;
}

/** The values of a set as number/unit pairs in display order: weight, distance, reps, time. */
export function setValueColumns(
  set: Pick<TrainingSet, 'metricWeight' | 'reps' | 'distanceMetres' | 'durationSeconds' | 'unit'>,
  typeId: ExerciseTypeId,
  weightUnit: WeightUnit,
  settings: Settings,
): SetValueColumn[] {
  const fields = exerciseTypeFields(typeId);
  const columns: SetValueColumn[] = [];
  if (fields.includes('weight'))
    columns.push({ value: fmt(kgToDisplay(set.metricWeight, weightUnit)), unit: weightUnit });
  if (fields.includes('distance')) {
    const du = resolveDistanceUnit(set.unit, settings.metric);
    columns.push({ value: fmt(metresToDisplay(set.distanceMetres, du)), unit: distanceUnitShort(du) });
  }
  if (fields.includes('reps')) columns.push({ value: String(set.reps), unit: 'reps' });
  if (fields.includes('time')) columns.push({ value: formatDuration(set.durationSeconds), unit: '' });
  return columns;
}

/** "100 kg × 5 reps", "5 km · 25:00", ... */
export function formatSet(
  set: Pick<TrainingSet, 'metricWeight' | 'reps' | 'distanceMetres' | 'durationSeconds' | 'unit'>,
  typeId: ExerciseTypeId,
  weightUnit: WeightUnit,
  settings: Settings,
): string {
  const p = setValueParts(set, typeId, weightUnit, settings);
  const first = [p.weight, p.distance].filter(Boolean);
  const second = [p.reps, p.time].filter(Boolean);
  if (first.length && second.length) return `${first.join(' · ')} × ${second.join(' · ')}`;
  return [...first, ...second].join(' · ');
}

export function formatWeightValue(kg: number, unit: WeightUnit): string {
  return `${fmt(kgToDisplay(kg, unit))} ${unit}`;
}

export function formatStatValue(
  value: number,
  kind: 'weight' | 'reps' | 'distance' | 'time' | 'count' | 'speed' | 'pace',
  weightUnit: WeightUnit,
  settings: Settings,
): string {
  switch (kind) {
    case 'weight':
      return formatWeightValue(value, weightUnit);
    case 'reps':
      return `${fmt(value, 0)} reps`;
    case 'count':
      return fmt(value, 0);
    case 'distance': {
      const du = resolveDistanceUnit(0, settings.metric);
      return `${fmt(metresToDisplay(value, du))} ${distanceUnitShort(du)}`;
    }
    case 'time':
      return formatDuration(value);
    case 'speed': {
      const du = resolveDistanceUnit(0, settings.metric);
      return `${fmt(metresToDisplay(value, du) * 3600, 1)} ${distanceUnitShort(du)}/h`;
    }
    case 'pace': {
      // `value` is seconds per metre (see graphDisplayValue): scale to seconds per display unit.
      const du = resolveDistanceUnit(0, settings.metric);
      return `${formatDuration(displayToMetres(value, du))} /${distanceUnitShort(du)}`;
    }
  }
}
