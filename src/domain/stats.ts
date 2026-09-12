/**
 * Exercise statistics for a period (the "Stats" tab) and goal progress.
 */
import { GoalType, exerciseTypeHas } from '@/db/constants';
import type { Goal, TrainingSet } from '@/db/types';
import { estimatedOneRepMax } from './records';

export interface StatItem {
  label: string;
  /** Raw value in storage units; `kind` tells the UI how to format it. */
  value: number;
  kind: 'weight' | 'reps' | 'distance' | 'time' | 'count' | 'speed' | 'pace';
  date?: string;
  set?: TrainingSet;
}

export function exerciseStats(sets: readonly TrainingSet[], typeId: number): StatItem[] {
  const items: StatItem[] = [];
  const w = exerciseTypeHas(typeId, 'weight');
  const r = exerciseTypeHas(typeId, 'reps');
  const d = exerciseTypeHas(typeId, 'distance');
  const t = exerciseTypeHas(typeId, 'time');
  const dates = new Set(sets.map((s) => s.date));
  items.push({ label: 'Workouts', value: dates.size, kind: 'count' });
  items.push({ label: 'Sets', value: sets.length, kind: 'count' });
  const maxBy = (f: (s: TrainingSet) => number): TrainingSet | undefined => {
    let best: TrainingSet | undefined;
    let bv = -Infinity;
    for (const s of sets) {
      const v = f(s);
      if (v > bv) {
        bv = v;
        best = s;
      }
    }
    return best;
  };
  if (w) {
    const b = maxBy((s) => s.metricWeight);
    if (b) items.push({ label: 'Max Weight', value: b.metricWeight, kind: 'weight', date: b.date, set: b });
  }
  if (w && r) {
    const b = maxBy((s) => estimatedOneRepMax(s.metricWeight, s.reps));
    if (b) items.push({ label: 'Max Estimated 1RM', value: estimatedOneRepMax(b.metricWeight, b.reps), kind: 'weight', date: b.date, set: b });
    items.push({ label: 'Total Volume', value: sets.reduce((a, s) => a + s.metricWeight * s.reps, 0), kind: 'weight' });
    const byDate = new Map<string, number>();
    for (const s of sets) byDate.set(s.date, (byDate.get(s.date) ?? 0) + s.metricWeight * s.reps);
    let bestDate = '';
    let bestVol = -1;
    for (const [date, vol] of byDate) {
      if (vol > bestVol) {
        bestVol = vol;
        bestDate = date;
      }
    }
    if (bestDate) items.push({ label: 'Max Workout Volume', value: bestVol, kind: 'weight', date: bestDate });
  }
  if (r) {
    items.push({ label: 'Total Reps', value: sets.reduce((a, s) => a + s.reps, 0), kind: 'reps' });
    const b = maxBy((s) => s.reps);
    if (b) items.push({ label: 'Max Reps', value: b.reps, kind: 'reps', date: b.date, set: b });
  }
  if (d) {
    items.push({ label: 'Total Distance', value: sets.reduce((a, s) => a + s.distanceMetres, 0), kind: 'distance' });
    const b = maxBy((s) => s.distanceMetres);
    if (b) items.push({ label: 'Max Distance', value: b.distanceMetres, kind: 'distance', date: b.date, set: b });
  }
  if (t) {
    items.push({ label: 'Total Time', value: sets.reduce((a, s) => a + s.durationSeconds, 0), kind: 'time' });
    const b = maxBy((s) => s.durationSeconds);
    if (b) items.push({ label: 'Max Time', value: b.durationSeconds, kind: 'time', date: b.date, set: b });
  }
  if (d && t) {
    const b = maxBy((s) => (s.durationSeconds > 0 ? s.distanceMetres / s.durationSeconds : -1));
    if (b && b.durationSeconds > 0)
      items.push({ label: 'Max Speed', value: b.distanceMetres / b.durationSeconds, kind: 'speed', date: b.date, set: b });
  }
  return items;
}

export interface GoalProgress {
  /** Current best value in storage units (kg / reps / metres / seconds). */
  current: number;
  target: number;
  /** 0..1 */
  fraction: number;
  kind: StatItem['kind'];
  achieved: boolean;
}

/** Current progress towards a goal, considering sets from the goal's start date onward. */
export function goalProgress(goal: Goal, sets: readonly TrainingSet[]): GoalProgress {
  const relevant = goal.startDate ? sets.filter((s) => s.date >= goal.startDate!) : sets;
  const byDate = new Map<string, TrainingSet[]>();
  for (const s of relevant) byDate.set(s.date, [...(byDate.get(s.date) ?? []), s]);
  const max = (f: (s: TrainingSet) => number) => relevant.reduce((m, s) => Math.max(m, f(s)), 0);
  const sum = (f: (s: TrainingSet) => number) => relevant.reduce((m, s) => m + f(s), 0);
  const maxWorkout = (f: (day: TrainingSet[]) => number) => [...byDate.values()].reduce((m, day) => Math.max(m, f(day)), 0);
  let current = 0;
  let target = 0;
  let kind: StatItem['kind'] = 'weight';
  switch (goal.typeId) {
    case GoalType.MAX_WEIGHT:
      current = max((s) => s.metricWeight);
      target = goal.metricWeight;
      break;
    case GoalType.MAX_REPS:
      current = max((s) => s.reps);
      target = goal.reps;
      kind = 'reps';
      break;
    case GoalType.TOTAL_VOLUME:
      current = sum((s) => s.metricWeight * s.reps);
      target = goal.metricWeight;
      break;
    case GoalType.TOTAL_REPS:
      current = sum((s) => s.reps);
      target = goal.reps;
      kind = 'reps';
      break;
    case GoalType.MAX_DISTANCE:
      current = max((s) => s.distanceMetres);
      target = goal.distanceMetres;
      kind = 'distance';
      break;
    case GoalType.MAX_DURATION:
      current = max((s) => s.durationSeconds);
      target = goal.durationSeconds;
      kind = 'time';
      break;
    case GoalType.TOTAL_DISTANCE:
      current = sum((s) => s.distanceMetres);
      target = goal.distanceMetres;
      kind = 'distance';
      break;
    case GoalType.TOTAL_DURATION:
      current = sum((s) => s.durationSeconds);
      target = goal.durationSeconds;
      kind = 'time';
      break;
    case GoalType.MAX_WEIGHT_AND_REPS:
      // Best weight lifted for at least the target reps.
      current = relevant.filter((s) => s.reps >= goal.reps).reduce((m, s) => Math.max(m, s.metricWeight), 0);
      target = goal.metricWeight;
      break;
    case GoalType.ESTIMATED_1RM:
      current = max((s) => estimatedOneRepMax(s.metricWeight, s.reps));
      target = goal.metricWeight;
      break;
    case GoalType.MAX_VOLUME:
      current = max((s) => s.metricWeight * s.reps);
      target = goal.metricWeight;
      break;
    case GoalType.MAX_WORKOUT_VOLUME:
      current = maxWorkout((day) => day.reduce((a, s) => a + s.metricWeight * s.reps, 0));
      target = goal.metricWeight;
      break;
    case GoalType.MAX_WORKOUT_REPS:
      current = maxWorkout((day) => day.reduce((a, s) => a + s.reps, 0));
      target = goal.reps;
      kind = 'reps';
      break;
    case GoalType.MAX_WORKOUT_DISTANCE:
      current = maxWorkout((day) => day.reduce((a, s) => a + s.distanceMetres, 0));
      target = goal.distanceMetres;
      kind = 'distance';
      break;
    case GoalType.MAX_WORKOUT_DURATION:
      current = maxWorkout((day) => day.reduce((a, s) => a + s.durationSeconds, 0));
      target = goal.durationSeconds;
      kind = 'time';
      break;
  }
  const fraction = target > 0 ? Math.min(1, current / target) : 0;
  return { current, target, fraction, kind, achieved: target > 0 && current >= target };
}

/** Goal types applicable to an exercise type. */
export function goalTypesForExercise(typeId: number): number[] {
  const w = exerciseTypeHas(typeId, 'weight');
  const r = exerciseTypeHas(typeId, 'reps');
  const d = exerciseTypeHas(typeId, 'distance');
  const t = exerciseTypeHas(typeId, 'time');
  const out: number[] = [];
  if (w && r) out.push(GoalType.MAX_WEIGHT_AND_REPS, GoalType.ESTIMATED_1RM);
  if (w) out.push(GoalType.MAX_WEIGHT);
  if (r) out.push(GoalType.MAX_REPS, GoalType.TOTAL_REPS, GoalType.MAX_WORKOUT_REPS);
  if (w && r) out.push(GoalType.MAX_VOLUME, GoalType.MAX_WORKOUT_VOLUME, GoalType.TOTAL_VOLUME);
  if (d) out.push(GoalType.MAX_DISTANCE, GoalType.TOTAL_DISTANCE, GoalType.MAX_WORKOUT_DISTANCE);
  if (t) out.push(GoalType.MAX_DURATION, GoalType.TOTAL_DURATION, GoalType.MAX_WORKOUT_DURATION);
  return out;
}
