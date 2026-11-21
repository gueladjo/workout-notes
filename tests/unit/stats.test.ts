import { describe, expect, it } from 'vitest';
import { ExerciseType, GoalType } from '../../src/db/constants';
import type { Goal, TrainingSet } from '../../src/db/types';
import { estimatedOneRepMax } from '../../src/domain/records';
import { exerciseStats, goalProgress } from '../../src/domain/stats';

function set(partial: Partial<TrainingSet> & Pick<TrainingSet, 'id' | 'date'>): TrainingSet {
  return {
    exerciseId: 1,
    metricWeight: 0,
    reps: 0,
    unit: 0,
    distanceMetres: 0,
    durationSeconds: 0,
    isPersonalRecord: false,
    isComplete: false,
    routineSetId: 0,
    ...partial,
  };
}

describe('exerciseStats', () => {
  const highRepOutlier = set({ id: 1, date: '2026-09-01', metricWeight: 50, reps: 30 }); // Brzycki ~257.1 kg
  const heavySet = set({ id: 2, date: '2026-09-04', metricWeight: 100, reps: 5 }); // Brzycki 112.5 kg

  it('includes all sets in Max Estimated 1RM when no rep cap is set', () => {
    const stats = exerciseStats([highRepOutlier, heavySet], ExerciseType.WEIGHT_AND_REPS);
    const orm = stats.find((s) => s.label === 'Max Estimated 1RM');
    expect(orm?.set?.id).toBe(1);
    expect(orm?.value).toBeCloseTo(estimatedOneRepMax(50, 30), 5);
  });

  it('honours maxRepsFor1rm and omits Max Estimated 1RM when every set exceeds the cap', () => {
    const capped = exerciseStats([highRepOutlier, heavySet], ExerciseType.WEIGHT_AND_REPS, 10);
    const orm = capped.find((s) => s.label === 'Max Estimated 1RM');
    expect(orm?.set?.id).toBe(2);
    expect(orm?.value).toBeCloseTo(112.5, 5);
    const allOverCap = exerciseStats([highRepOutlier], ExerciseType.WEIGHT_AND_REPS, 10);
    expect(allOverCap.find((s) => s.label === 'Max Estimated 1RM')).toBeUndefined();
    expect(allOverCap.find((s) => s.label === 'Max Weight')?.value).toBe(50);
  });
});

describe('goalProgress', () => {
  const goal: Goal = {
    id: 1,
    typeId: GoalType.ESTIMATED_1RM,
    exerciseId: 1,
    metricWeight: 200,
    reps: 0,
    distanceMetres: 0,
    durationSeconds: 0,
    unit: 0,
    title: null,
    targetDate: null,
    startDate: null,
    sortOrder: 0,
  };
  const sets = [
    set({ id: 1, date: '2026-09-01', metricWeight: 50, reps: 30 }),
    set({ id: 2, date: '2026-09-04', metricWeight: 100, reps: 5 }),
  ];

  it('honours maxRepsFor1rm for Estimated 1RM goals', () => {
    expect(goalProgress(goal, sets).achieved).toBe(true);
    const capped = goalProgress(goal, sets, 10);
    expect(capped.achieved).toBe(false);
    expect(capped.current).toBeCloseTo(112.5, 5);
    expect(goalProgress(goal, [sets[0]!], 10).current).toBe(0);
  });
});
