import { describe, expect, it } from 'vitest';
import { DistanceUnit, GraphType } from '../../src/db/constants';
import type { TrainingSet } from '../../src/db/types';
import {
  computeSeries,
  formatGraphAxisValue,
  formatGraphValue,
  graphDisplayValue,
  tickDecimals,
} from '../../src/domain/graphs';
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

describe('formatGraphAxisValue', () => {
  it('labels time and pace ticks as minutes:seconds instead of a rounded minute count', () => {
    // A 25:30 cardio set plotted alone: ticks between 0.85x and 1.15x of 25.5 minutes.
    expect(formatGraphAxisValue(GraphType.MAX_TIME, 21.675, 0)).toBe('21:41');
    expect(formatGraphAxisValue(GraphType.TOTAL_TIME, 90, 0)).toBe('1:30:00');
    expect(formatGraphAxisValue(GraphType.MAX_PACE, 5.5, 0)).toBe('5:30');
  });

  it('keeps reps whole and gives weight and distance the decimals the tick spacing needs', () => {
    expect(formatGraphAxisValue(GraphType.MAX_REPS, 5.4, 1)).toBe('5');
    expect(formatGraphAxisValue(GraphType.TOTAL_REPS, 30.2, 1)).toBe('30');
    expect(formatGraphAxisValue(GraphType.MAX_WEIGHT, 80.3333, 1)).toBe('80.3');
    expect(formatGraphAxisValue(GraphType.WORKOUT_VOLUME, 5012.3, 0)).toBe('5012');
    expect(formatGraphAxisValue(GraphType.MAX_DISTANCE, 5.125, 2)).toBe('5.13');
    expect(formatGraphAxisValue(GraphType.MAX_SPEED, 10.05, 1)).toBe('10.1');
  });
});

describe('tickDecimals', () => {
  it('picks the decimals that put a label within a tenth of the tick spacing, at most 3', () => {
    expect(tickDecimals(250)).toBe(0);
    expect(tickDecimals(12)).toBe(0);
    expect(tickDecimals(5)).toBe(0);
    expect(tickDecimals(1.3)).toBe(1);
    expect(tickDecimals(0.65)).toBe(1);
    expect(tickDecimals(0.05)).toBe(2);
    expect(tickDecimals(0.0003)).toBe(3);
    expect(tickDecimals(0)).toBe(0);
    expect(tickDecimals(NaN)).toBe(0);
  });

  it('makes neighbouring labels of a narrow weight range distinct', () => {
    const minY = 80 - 4 * 0.15;
    const step = (4 * 1.3) / 6;
    const labels = Array.from({ length: 7 }, (_, i) =>
      formatGraphAxisValue(GraphType.MAX_WEIGHT, minY + step * i, tickDecimals(step)),
    );
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('formatGraphValue', () => {
  it('shows the point value with its unit', () => {
    expect(formatGraphValue(GraphType.MAX_PACE, 6, 'kg', DistanceUnit.KILOMETRES)).toBe('6:00 /km');
    expect(formatGraphValue(GraphType.MAX_TIME, 25.5, 'kg', DistanceUnit.KILOMETRES)).toBe('25:30');
    expect(formatGraphValue(GraphType.MAX_WEIGHT, 82.5, 'lbs', DistanceUnit.MILES)).toBe('82.5 lbs');
    expect(formatGraphValue(GraphType.TOTAL_DISTANCE, 5.125, 'kg', DistanceUnit.KILOMETRES)).toBe('5.13 km');
    expect(formatGraphValue(GraphType.MAX_SPEED, 10.04, 'kg', DistanceUnit.MILES)).toBe('10 mi/h');
    expect(formatGraphValue(GraphType.MAX_REPS, 12, 'kg', DistanceUnit.KILOMETRES)).toBe('12');
  });
});
