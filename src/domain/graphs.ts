/**
 * Progress-graph series: one point per workout for the selected metric, computed from an exercise's
 * sets (see FitNotes "Progress Graphs" help). Values are in storage units (kg, metres, seconds);
 * the UI converts for display.
 */
import {
  DISTANCE_UNIT_TO_METRES,
  GraphType,
  type DistanceUnitId,
  type GraphTypeId,
  exerciseTypeHas,
} from '@/db/constants';
import type { TrainingSet } from '@/db/types';
import { estimatedOneRepMax } from './records';
import { kgToDisplay, metresToDisplay, type WeightUnit } from './units';

export interface GraphPoint {
  date: string;
  value: number;
  /** The set that produced the value (for "max" style graphs). */
  set?: TrainingSet;
}

export interface GraphOption {
  id: GraphTypeId;
  label: string;
  /** true when the option needs a rep-count parameter (Weight and Reps / Rep Maxes). */
  needsReps?: boolean;
}

/** Graph types applicable to an exercise type, in FitNotes' menu order. */
export function graphOptionsForType(typeId: number): GraphOption[] {
  const w = exerciseTypeHas(typeId, 'weight');
  const r = exerciseTypeHas(typeId, 'reps');
  const d = exerciseTypeHas(typeId, 'distance');
  const t = exerciseTypeHas(typeId, 'time');
  const opts: GraphOption[] = [];
  if (w && r) opts.push({ id: GraphType.ESTIMATED_1RM, label: 'Estimated 1RM' });
  if (w) opts.push({ id: GraphType.MAX_WEIGHT, label: 'Max Weight' });
  if (w && r) opts.push({ id: GraphType.WORKOUT_VOLUME, label: 'Workout Volume' });
  if (r) opts.push({ id: GraphType.TOTAL_REPS, label: 'Total Reps' });
  if (r) opts.push({ id: GraphType.MAX_REPS, label: 'Max Reps' });
  if (w && r) opts.push({ id: GraphType.WEIGHT_AND_REPS, label: 'Weight and Reps', needsReps: true });
  if (w && r) opts.push({ id: GraphType.REP_MAXES, label: 'Rep Maxes', needsReps: true });
  if (d) opts.push({ id: GraphType.MAX_DISTANCE, label: 'Max Distance' });
  if (t) opts.push({ id: GraphType.MAX_TIME, label: 'Max Time' });
  if (d && t) opts.push({ id: GraphType.MAX_SPEED, label: 'Max Speed' });
  if (d && t) opts.push({ id: GraphType.MAX_PACE, label: 'Max Pace' });
  if (d) opts.push({ id: GraphType.TOTAL_DISTANCE, label: 'Total Distance' });
  if (t) opts.push({ id: GraphType.TOTAL_TIME, label: 'Total Time' });
  return opts;
}

export function defaultGraphForType(typeId: number): GraphTypeId {
  return graphOptionsForType(typeId)[0]?.id ?? GraphType.MAX_WEIGHT;
}

function groupByDate(sets: readonly TrainingSet[]): Map<string, TrainingSet[]> {
  const m = new Map<string, TrainingSet[]>();
  for (const s of sets) {
    const list = m.get(s.date);
    if (list) list.push(s);
    else m.set(s.date, [s]);
  }
  return m;
}

/**
 * Compute the series. `repCount` applies to WEIGHT_AND_REPS (max weight for exactly that rep count)
 * and REP_MAXES (best "at least n reps" weight up to that workout, i.e. the running record).
 */
export function computeSeries(
  sets: readonly TrainingSet[],
  graph: GraphTypeId,
  opts: { repCount?: number; maxRepsFor1rm?: number | null } = {},
): GraphPoint[] {
  const byDate = groupByDate(sets);
  const dates = [...byDate.keys()].sort();
  const points: GraphPoint[] = [];
  let runningMax = 0;
  let runningSet: TrainingSet | undefined;
  for (const date of dates) {
    const day = byDate.get(date)!;
    let value = 0;
    let best: TrainingSet | undefined;
    const pick = (v: number, s: TrainingSet) => {
      if (v > value || best === undefined) {
        value = v;
        best = s;
      }
    };
    switch (graph) {
      case GraphType.ESTIMATED_1RM:
        for (const s of day) {
          if (opts.maxRepsFor1rm && s.reps > opts.maxRepsFor1rm) continue;
          pick(estimatedOneRepMax(s.metricWeight, s.reps), s);
        }
        // A workout where every set is over the rep cap has no estimate, not an estimate of 0.
        if (!best) continue;
        break;
      case GraphType.MAX_WEIGHT:
        for (const s of day) pick(s.metricWeight, s);
        break;
      case GraphType.WORKOUT_VOLUME:
        value = day.reduce((sum, s) => sum + s.metricWeight * s.reps, 0);
        break;
      case GraphType.TOTAL_REPS:
        value = day.reduce((sum, s) => sum + s.reps, 0);
        break;
      case GraphType.MAX_REPS:
        for (const s of day) pick(s.reps, s);
        break;
      case GraphType.WEIGHT_AND_REPS: {
        const rc = opts.repCount ?? 5;
        let found = false;
        for (const s of day) {
          if (s.reps === rc) {
            found = true;
            pick(s.metricWeight, s);
          }
        }
        if (!found) continue;
        break;
      }
      case GraphType.REP_MAXES: {
        const rc = opts.repCount ?? 1;
        for (const s of day) {
          if (s.reps >= rc && s.metricWeight > runningMax) {
            runningMax = s.metricWeight;
            runningSet = s;
          }
        }
        if (!runningSet) continue;
        value = runningMax;
        best = runningSet;
        break;
      }
      case GraphType.MAX_DISTANCE:
        for (const s of day) pick(s.distanceMetres, s);
        break;
      case GraphType.MAX_TIME:
        for (const s of day) pick(s.durationSeconds, s);
        break;
      case GraphType.MAX_SPEED:
        for (const s of day) if (s.durationSeconds > 0) pick(s.distanceMetres / s.durationSeconds, s);
        if (!best) continue;
        break;
      case GraphType.MAX_PACE:
        // Best pace = fewest seconds per metre; store as negative so "max" picks it, then flip.
        for (const s of day)
          if (s.distanceMetres > 0 && s.durationSeconds > 0) pick(-(s.durationSeconds / s.distanceMetres), s);
        if (!best) continue;
        value = -value;
        break;
      case GraphType.TOTAL_DISTANCE:
        value = day.reduce((sum, s) => sum + s.distanceMetres, 0);
        break;
      case GraphType.TOTAL_TIME:
        value = day.reduce((sum, s) => sum + s.durationSeconds, 0);
        break;
    }
    if (best) points.push({ date, value, set: best });
    else points.push({ date, value });
  }
  return points;
}

/**
 * A series value in the units the graph shows: weight in `weightUnit`, distance in `distanceUnit`,
 * speed in distance units per hour, pace in minutes per distance unit, time in minutes. A pace
 * series holds seconds per metre (see `computeSeries`), so a slower run is a larger value.
 */
export function graphDisplayValue(
  graph: GraphTypeId,
  value: number,
  weightUnit: WeightUnit,
  distanceUnit: DistanceUnitId,
): number {
  switch (graph) {
    case GraphType.ESTIMATED_1RM:
    case GraphType.MAX_WEIGHT:
    case GraphType.WORKOUT_VOLUME:
    case GraphType.WEIGHT_AND_REPS:
    case GraphType.REP_MAXES:
      return kgToDisplay(value, weightUnit);
    case GraphType.MAX_DISTANCE:
    case GraphType.TOTAL_DISTANCE:
      return metresToDisplay(value, distanceUnit);
    case GraphType.MAX_SPEED:
      return metresToDisplay(value, distanceUnit) * 3600;
    case GraphType.MAX_PACE:
      return (value * DISTANCE_UNIT_TO_METRES[distanceUnit]) / 60;
    case GraphType.MAX_TIME:
    case GraphType.TOTAL_TIME:
      return value / 60;
    default:
      return value;
  }
}

/** Least-squares trend line over point indexes (x = days since first point). */
export function trendLine(
  points: GraphPoint[],
  dayIndex: (date: string) => number,
): { a: number; b: number } | null {
  if (points.length < 2) return null;
  const xs = points.map((p) => dayIndex(p.date));
  const ys = points.map((p) => p.value);
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i]! - mx) * (ys[i]! - my);
    den += (xs[i]! - mx) ** 2;
  }
  if (den === 0) return null;
  const b = num / den;
  return { a: my - b * mx, b };
}
