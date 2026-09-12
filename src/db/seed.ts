/**
 * Default content of a fresh FitNotes database (verified against FitNotes 25.1).
 */
import type { Database } from './sqlite';
import { run } from './sqlite';
import { ExerciseType } from './constants';

/** [name, colour] in the order FitNotes inserts them (ids 1..8). */
export const DEFAULT_CATEGORIES: [string, number][] = [
  ['Shoulders', -7453523],
  ['Triceps', -14176672],
  ['Biceps', -812014],
  ['Chest', -4179669],
  ['Back', -14057287],
  ['Legs', -11226442],
  ['Abs', -13877680],
  ['Cardio', -8418163],
];

/** [name, category id, exercise type id] */
export const DEFAULT_EXERCISES: [string, number, number][] = [
  ['Overhead Press', 1, 0],
  ['Seated Dumbbell Press', 1, 0],
  ['Lateral Dumbbell Raise', 1, 0],
  ['Front Dumbbell Raise', 1, 0],
  ['Push Press', 1, 0],
  ['Behind The Neck Barbell Press', 1, 0],
  ['Hammer Strength Shoulder Press', 1, 0],
  ['Seated Dumbbell Lateral Raise', 1, 0],
  ['Lateral Machine Raise', 1, 0],
  ['Rear Delt Dumbbell Raise', 1, 0],
  ['Rear Delt Machine Fly', 1, 0],
  ['Arnold Dumbbell Press', 1, 0],
  ['One-Arm Standing Dumbbell Press', 1, 0],
  ['Cable Face Pull', 1, 0],
  ['Log Press', 1, 0],
  ['Smith Machine Overhead Press', 1, 0],
  ['Close Grip Barbell Bench Press', 2, 0],
  ['V-Bar Push Down', 2, 0],
  ['Parallel Bar Triceps Dip', 2, 0],
  ['Lying Triceps Extension', 2, 0],
  ['Rope Push Down', 2, 0],
  ['Cable Overhead Triceps Extension', 2, 0],
  ['EZ-Bar Skullcrusher', 2, 0],
  ['Dumbbell Overhead Triceps Extension', 2, 0],
  ['Ring Dip', 2, 0],
  ['Smith Machine Close Grip Bench Press', 2, 0],
  ['Barbell Curl', 3, 0],
  ['EZ-Bar Curl', 3, 0],
  ['Dumbbell Curl', 3, 0],
  ['Seated Incline Dumbbell Curl', 3, 0],
  ['Seated Machine Curl', 3, 0],
  ['Dumbbell Hammer Curl', 3, 0],
  ['Cable Curl', 3, 0],
  ['EZ-Bar Preacher Curl', 3, 0],
  ['Dumbbell Concentration Curl', 3, 0],
  ['Dumbbell Preacher Curl', 3, 0],
  ['Flat Barbell Bench Press', 4, 0],
  ['Flat Dumbbell Bench Press', 4, 0],
  ['Incline Barbell Bench Press', 4, 0],
  ['Decline Barbell Bench Press', 4, 0],
  ['Incline Dumbbell Bench Press', 4, 0],
  ['Flat Dumbbell Fly', 4, 0],
  ['Incline Dumbbell Fly', 4, 0],
  ['Cable Crossover', 4, 0],
  ['Incline Hammer Strength Chest Press', 4, 0],
  ['Decline Hammer Strength Chest Press', 4, 0],
  ['Seated Machine Fly', 4, 0],
  ['Deadlift', 5, 0],
  ['Pull Up', 5, 0],
  ['Chin Up', 5, 0],
  ['Neutral Chin Up', 5, 0],
  ['Dumbbell Row', 5, 0],
  ['Barbell Row', 5, 0],
  ['Pendlay Row', 5, 0],
  ['Lat Pulldown', 5, 0],
  ['Hammer Strength Row', 5, 0],
  ['Seated Cable Row', 5, 0],
  ['T-Bar Row', 5, 0],
  ['Barbell Shrug', 5, 0],
  ['Machine Shrug', 5, 0],
  ['Straight-Arm Cable Pushdown', 5, 0],
  ['Rack Pull', 5, 0],
  ['Good Morning', 5, 0],
  ['Barbell Squat', 6, 0],
  ['Barbell Front Squat', 6, 0],
  ['Leg Press', 6, 0],
  ['Leg Extension Machine', 6, 0],
  ['Seated Leg Curl Machine', 6, 0],
  ['Standing Calf Raise Machine', 6, 0],
  ['Donkey Calf Raise', 6, 0],
  ['Barbell Calf Raise', 6, 0],
  ['Barbell Glute Bridge', 6, 0],
  ['Glute-Ham Raise', 6, 0],
  ['Lying Leg Curl Machine', 6, 0],
  ['Romanian Deadlift', 6, 0],
  ['Stiff-Legged Deadlift', 6, 0],
  ['Sumo Deadlift', 6, 0],
  ['Seated Calf Raise Machine', 6, 0],
  ['Ab-Wheel Rollout', 7, 0],
  ['Cable Crunch', 7, 0],
  ['Crunch', 7, 0],
  ['Crunch Machine', 7, 0],
  ['Decline Crunch', 7, 0],
  ['Dragon Flag', 7, 0],
  ['Hanging Knee Raise', 7, 0],
  ['Hanging Leg Raise', 7, 0],
  ['Plank', 7, ExerciseType.WEIGHT_AND_TIME],
  ['Side Plank', 7, ExerciseType.WEIGHT_AND_TIME],
  ['Cycling', 8, ExerciseType.DISTANCE_AND_TIME],
  ['Walking', 8, ExerciseType.DISTANCE_AND_TIME],
  ['Rowing Machine', 8, ExerciseType.DISTANCE_AND_TIME],
  ['Stationary Bike', 8, ExerciseType.DISTANCE_AND_TIME],
  ['Swimming', 8, ExerciseType.DISTANCE_AND_TIME],
  ['Running (Treadmill)', 8, ExerciseType.DISTANCE_AND_TIME],
  ['Running (Outdoor)', 8, ExerciseType.DISTANCE_AND_TIME],
  ['Elliptical Trainer', 8, ExerciseType.DISTANCE_AND_TIME],
];

/** MeasurementUnit rows: [id, type, long name, short name]. type 0 = weight, 1 = length, 2 = percent, 3 = none. */
export const DEFAULT_MEASUREMENT_UNITS: [number, number, string, string][] = [
  [1, 0, 'Kilograms', 'kgs'],
  [2, 0, 'Pounds', 'lbs'],
  [3, 1, 'Centimetres', 'cm'],
  [4, 1, 'Inches', 'in'],
  [5, 2, 'Percent', '%'],
  [6, 3, '', ''],
];

export const MEASUREMENT_UNIT_TYPE = { WEIGHT: 0, LENGTH: 1, PERCENT: 2, NONE: 3 } as const;

/** Default Measurement rows in FitNotes order (ids 1..15). Only the first two are enabled. */
export const DEFAULT_MEASUREMENTS: { name: string; unitType: number; enabled: boolean }[] = [
  { name: 'Bodyweight', unitType: 0, enabled: true },
  { name: 'Body Fat', unitType: 2, enabled: true },
  { name: 'Neck', unitType: 1, enabled: false },
  { name: 'Shoulders', unitType: 1, enabled: false },
  { name: 'Chest', unitType: 1, enabled: false },
  { name: 'Waist', unitType: 1, enabled: false },
  { name: 'Hips', unitType: 1, enabled: false },
  { name: 'Upper Arm (Right)', unitType: 1, enabled: false },
  { name: 'Upper Arm (Left)', unitType: 1, enabled: false },
  { name: 'Forearm (Right)', unitType: 1, enabled: false },
  { name: 'Forearm (Left)', unitType: 1, enabled: false },
  { name: 'Thigh (Right)', unitType: 1, enabled: false },
  { name: 'Thigh (Left)', unitType: 1, enabled: false },
  { name: 'Calf (Right)', unitType: 1, enabled: false },
  { name: 'Calf (Left)', unitType: 1, enabled: false },
];

export function seedMeasurementUnits(db: Database): void {
  for (const [id, type, long, short] of DEFAULT_MEASUREMENT_UNITS) {
    run(db, 'INSERT OR IGNORE INTO MeasurementUnit (_id, type, long_name, short_name) VALUES (?, ?, ?, ?)', [
      id,
      type,
      long,
      short,
    ]);
  }
}

export function seedMeasurements(db: Database, metric: boolean): void {
  DEFAULT_MEASUREMENTS.forEach((m, i) => {
    const unitId = m.unitType === 0 ? (metric ? 1 : 2) : m.unitType === 1 ? (metric ? 3 : 4) : 5;
    run(
      db,
      'INSERT INTO Measurement (_id, name, unit_id, goal_type, goal_value, custom, enabled, sort_order) VALUES (?, ?, ?, 0, 0, 0, ?, ?)',
      [i + 1, m.name, unitId, m.enabled ? 1 : 0, i + 1],
    );
  });
}

export function seedDefaults(db: Database, metric: boolean): void {
  DEFAULT_CATEGORIES.forEach(([name, colour], i) => {
    run(db, 'INSERT INTO Category (_id, name, colour, sort_order) VALUES (?, ?, ?, ?)', [
      i + 1,
      name,
      colour,
      i + 1,
    ]);
  });
  for (const [name, categoryId, typeId] of DEFAULT_EXERCISES) {
    run(db, 'INSERT INTO exercise (name, category_id, exercise_type_id) VALUES (?, ?, ?)', [
      name,
      categoryId,
      typeId,
    ]);
  }
  seedMeasurementUnits(db);
  seedMeasurements(db, metric);
  run(
    db,
    'INSERT INTO settings (metric, first_day_of_week, weight_increment, track_personal_records) VALUES (?, 2, 2.5, 1)',
    [metric ? 1 : 0],
  );
}
