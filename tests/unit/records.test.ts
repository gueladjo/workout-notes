import { describe, expect, it } from 'vitest';
import { actualRepMaxes, estimatedOneRepMax, estimatedRepMaxes, personalRecordSetIds, weightForReps } from '../../src/domain/records';

describe('Brzycki 1RM', () => {
  it('matches the formula and its inverse', () => {
    expect(estimatedOneRepMax(100, 1)).toBe(100);
    expect(estimatedOneRepMax(100, 5)).toBeCloseTo(112.5, 5);
    expect(weightForReps(112.5, 5)).toBeCloseTo(100, 5);
    expect(estimatedOneRepMax(100, 0)).toBe(0);
    expect(estimatedOneRepMax(100, 40)).toBe(0);
  });
});

describe('personal records', () => {
  const sets = [
    { id: 1, date: '2026-01-01', weight: 100, reps: 5 },
    { id: 2, date: '2026-01-05', weight: 100, reps: 5 }, // tie: earlier keeps the record
    { id: 3, date: '2026-01-05', weight: 105, reps: 3 },
    { id: 4, date: '2026-01-09', weight: 110, reps: 5 },
    { id: 5, date: '2026-01-09', weight: 90, reps: 8 },
    { id: 6, date: '2026-01-09', weight: 0, reps: 0 },
  ];
  it('flags the heaviest set per exact rep count, earliest on ties', () => {
    expect([...personalRecordSetIds(sets)].sort()).toEqual([3, 4, 5]);
  });
  it('computes actual rep maxes with superseding by higher rep counts', () => {
    const rows = actualRepMaxes(sets, 10);
    const byReps = new Map(rows.map((r) => [r.reps, r]));
    expect(byReps.get(5)?.weight).toBe(110);
    expect(byReps.get(5)?.superseded).toBe(false);
    // 3RM: 105 actual but 110 for 5 reps supersedes it
    expect(byReps.get(3)?.weight).toBe(110);
    expect(byReps.get(3)?.superseded).toBe(true);
    expect(byReps.get(8)?.weight).toBe(90);
    expect(byReps.get(9)).toBeUndefined();
  });
  it('estimates rep maxes from the best set and honours the rep limit', () => {
    const est = estimatedRepMaxes(sets);
    expect(est.source?.id).toBe(4);
    expect(est.oneRepMax).toBeCloseTo(estimatedOneRepMax(110, 5), 5);
    expect(est.rows[0]).toEqual({ reps: 1, weight: est.oneRepMax });
    const limited = estimatedRepMaxes([{ id: 1, date: '2026-01-01', weight: 50, reps: 30 }, { id: 2, date: '2026-01-01', weight: 100, reps: 5 }], 10);
    expect(limited.source?.id).toBe(2);
  });
});
