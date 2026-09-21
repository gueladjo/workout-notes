import { describe, expect, it } from 'vitest';
import { GraphType } from '../../src/db/constants';
import type { TrainingSet } from '../../src/db/types';
import { computeSeries } from '../../src/domain/graphs';
import { estimatedOneRepMax } from '../../src/domain/records';

let nextId = 1;
function set(date: string, fields: Partial<TrainingSet>): TrainingSet {
  return {
    id: nextId++,
    exerciseId: 1,
    date,
    metricWeight: 0,
    reps: 0,
    unit: 0,
    distanceMetres: 0,
    durationSeconds: 0,
    isPersonalRecord: false,
    isComplete: true,
    routineSetId: 0,
    ...fields,
  };
}

describe('computeSeries', () => {
  it('skips workouts with no set under the estimated 1RM rep cap', () => {
    const sets = [
      set('2026-09-01', { metricWeight: 100, reps: 1 }),
      set('2026-09-02', { metricWeight: 50, reps: 12 }),
      set('2026-09-03', { metricWeight: 80, reps: 5 }),
    ];
    const capped = computeSeries(sets, GraphType.ESTIMATED_1RM, { maxRepsFor1rm: 10 });
    expect(capped.map((p) => [p.date, p.value])).toEqual([
      ['2026-09-01', 100],
      ['2026-09-03', estimatedOneRepMax(80, 5)],
    ]);
    // No cap (0 / null): every workout has a point.
    expect(computeSeries(sets, GraphType.ESTIMATED_1RM, { maxRepsFor1rm: null }).map((p) => p.date)).toEqual([
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
    ]);
  });

  it('skips workouts without a timed set for speed and pace', () => {
    const sets = [
      set('2026-09-01', { distanceMetres: 5000, durationSeconds: 1500 }),
      set('2026-09-02', { distanceMetres: 3000, durationSeconds: 0 }),
      set('2026-09-03', { distanceMetres: 0, durationSeconds: 600 }),
    ];
    expect(computeSeries(sets, GraphType.MAX_SPEED, {}).map((p) => [p.date, p.value])).toEqual([
      ['2026-09-01', 5000 / 1500],
      ['2026-09-03', 0],
    ]);
    expect(computeSeries(sets, GraphType.MAX_PACE, {}).map((p) => [p.date, p.value])).toEqual([
      ['2026-09-01', 1500 / 5000],
    ]);
    // Distance-only graphs still plot every workout.
    expect(computeSeries(sets, GraphType.MAX_DISTANCE, {}).map((p) => p.value)).toEqual([5000, 3000, 0]);
  });
});
