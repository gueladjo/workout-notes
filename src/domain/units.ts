/**
 * Unit handling. Storage is always metric (kg, metres, seconds); the UI converts on the way in and
 * out using the exercise's weight unit (or the Unit System setting) and the set's distance unit.
 */
import {
  CM_PER_INCH,
  DISTANCE_UNIT_LABELS,
  DISTANCE_UNIT_TO_METRES,
  DistanceUnit,
  ExerciseWeightUnit,
  KG_PER_LB,
  isDistanceUnitId,
  type DistanceUnitId,
} from '@/db/constants';
import { MEASUREMENT_UNIT } from '@/db/seed';

export type WeightUnit = 'kg' | 'lbs';

export function kgToDisplay(kg: number, unit: WeightUnit): number {
  return unit === 'kg' ? kg : kg / KG_PER_LB;
}

export function displayToKg(value: number, unit: WeightUnit): number {
  return unit === 'kg' ? value : value * KG_PER_LB;
}

/** Resolve the unit an exercise displays weight in, given the settings default. */
export function resolveWeightUnit(exerciseWeightUnitId: number, settingsMetric: boolean): WeightUnit {
  if (exerciseWeightUnitId === ExerciseWeightUnit.METRIC) return 'kg';
  if (exerciseWeightUnitId === ExerciseWeightUnit.IMPERIAL) return 'lbs';
  return settingsMetric ? 'kg' : 'lbs';
}

export function metresToDisplay(metres: number, unitId: DistanceUnitId): number {
  return metres / DISTANCE_UNIT_TO_METRES[unitId];
}

export function displayToMetres(value: number, unitId: DistanceUnitId): number {
  return value * DISTANCE_UNIT_TO_METRES[unitId];
}

/** Default distance unit for a set whose `unit` column is 0/unknown. */
export function resolveDistanceUnit(unitId: number, settingsMetric: boolean): DistanceUnitId {
  if (isDistanceUnitId(unitId)) return unitId;
  return settingsMetric ? DistanceUnit.KILOMETRES : DistanceUnit.MILES;
}

export function distanceUnitShort(unitId: DistanceUnitId): string {
  return DISTANCE_UNIT_LABELS[unitId].short;
}

export function distanceUnitLong(unitId: DistanceUnitId): string {
  return DISTANCE_UNIT_LABELS[unitId].long;
}

export const ALL_DISTANCE_UNITS: DistanceUnitId[] = [
  DistanceUnit.KILOMETRES,
  DistanceUnit.MILES,
  DistanceUnit.METRES,
  DistanceUnit.FEET,
];

/** Format a number with up to `maxDecimals` decimals, trimming trailing zeros. */
export function fmt(n: number, maxDecimals = 2): string {
  if (!Number.isFinite(n)) return '0';
  const f = Math.pow(10, maxDecimals);
  const rounded = Math.round(n * f) / f;
  return String(rounded);
}

export function formatWeight(kg: number, unit: WeightUnit): string {
  return `${fmt(kgToDisplay(kg, unit))} ${unit}`;
}

export function formatDistance(metres: number, unitId: DistanceUnitId): string {
  return `${fmt(metresToDisplay(metres, unitId))} ${distanceUnitShort(unitId)}`;
}

/** Speed in unit/hour for a distance (m) covered in `seconds`. */
export function speed(metres: number, seconds: number, unitId: DistanceUnitId): number {
  if (seconds <= 0 || metres <= 0) return 0;
  return metresToDisplay(metres, unitId) / (seconds / 3600);
}

/** Pace in seconds per unit. */
export function paceSecondsPerUnit(metres: number, seconds: number, unitId: DistanceUnitId): number {
  const d = metresToDisplay(metres, unitId);
  if (d <= 0 || seconds <= 0) return 0;
  return seconds / d;
}

/**
 * Body measurements are stored in their measurement's unit, not in a fixed one. This is the factor
 * that turns a value in `fromUnitId` into `toUnitId`, or null when the two cannot be converted
 * (different kinds of unit, percent, custom units).
 */
export function measurementUnitFactor(fromUnitId: number, toUnitId: number): number | null {
  if (fromUnitId === toUnitId) return 1;
  const U = MEASUREMENT_UNIT;
  if (fromUnitId === U.KILOGRAMS && toUnitId === U.POUNDS) return 1 / KG_PER_LB;
  if (fromUnitId === U.POUNDS && toUnitId === U.KILOGRAMS) return KG_PER_LB;
  if (fromUnitId === U.CENTIMETRES && toUnitId === U.INCHES) return 1 / CM_PER_INCH;
  if (fromUnitId === U.INCHES && toUnitId === U.CENTIMETRES) return CM_PER_INCH;
  return null;
}
