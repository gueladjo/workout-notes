import { describe, expect, it } from 'vitest';
import { DistanceUnit, GraphType } from '../../src/db/constants';
import type { TrainingSet } from '../../src/db/types';
import { computeSeries, graphDisplayValue } from '../../src/domain/graphs';
import { formatDuration } from '../../src/domain/dates';
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

describe('graphDisplayValue', () => {
  it('shows pace as minutes per distance unit, lower for a faster run', () => {
    const run = (metres: number, seconds: number) =>
      computeSeries(
        [set('2026-09-01', { distanceMetres: metres, durationSeconds: seconds })],
        GraphType.MAX_PACE,
        {},
      )[0]!.value;
    const fiveK = run(5000, 1800);
    const perKm = graphDisplayValue(GraphType.MAX_PACE, fiveK, 'kg', DistanceUnit.KILOMETRES);
    const perMile = graphDisplayValue(GraphType.MAX_PACE, fiveK, 'kg', DistanceUnit.MILES);
    expect(perKm).toBeCloseTo(6, 9);
    expect(formatDuration(perKm * 60)).toBe('6:00');
    expect(formatDuration(perMile * 60)).toBe('9:39');
    expect(
      graphDisplayValue(GraphType.MAX_PACE, run(5000, 1500), 'kg', DistanceUnit.KILOMETRES),
    ).toBeLessThan(perKm);
    // The other conversions: kg -> lbs, m -> km, m/s -> km/h, s -> min.
    expect(graphDisplayValue(GraphType.MAX_WEIGHT, 100, 'lbs', DistanceUnit.KILOMETRES)).toBeCloseTo(
      220.46,
      2,
    );
    expect(graphDisplayValue(GraphType.TOTAL_DISTANCE, 5000, 'kg', DistanceUnit.KILOMETRES)).toBe(5);
    expect(graphDisplayValue(GraphType.MAX_SPEED, 5000 / 1800, 'kg', DistanceUnit.KILOMETRES)).toBeCloseTo(
      10,
      9,
    );
    expect(graphDisplayValue(GraphType.TOTAL_TIME, 1800, 'kg', DistanceUnit.KILOMETRES)).toBe(30);
  });
});
