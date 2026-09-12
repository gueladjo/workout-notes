/**
 * Integer encodings used inside FitNotes backup files. These values were verified against the
 * FitNotes 25.1 Android app (see doc/fitnotes-format.md for the evidence and the confidence level
 * of each item). Keep every FitNotes-specific magic number here; the rest of the code imports names.
 */

/** `PRAGMA user_version` of a database created by FitNotes 25.1 (SQLiteOpenHelper version). */
export const FITNOTES_DB_VERSION = 22;

/** `exercise.exercise_type_id` */
export const ExerciseType = {
  WEIGHT_AND_REPS: 0,
  DISTANCE_AND_TIME: 1,
  WEIGHT_AND_DISTANCE: 2,
  WEIGHT_AND_TIME: 3,
  REPS_AND_DISTANCE: 4,
  REPS_AND_TIME: 5,
  WEIGHT: 6,
  REPS: 7,
  DISTANCE: 8,
  TIME: 9,
} as const;
export type ExerciseTypeId = (typeof ExerciseType)[keyof typeof ExerciseType];

export type ExerciseField = 'weight' | 'reps' | 'distance' | 'time';

const EXERCISE_TYPE_FIELDS: Record<ExerciseTypeId, ExerciseField[]> = {
  0: ['weight', 'reps'],
  1: ['distance', 'time'],
  2: ['weight', 'distance'],
  3: ['weight', 'time'],
  4: ['reps', 'distance'],
  5: ['reps', 'time'],
  6: ['weight'],
  7: ['reps'],
  8: ['distance'],
  9: ['time'],
};

export const EXERCISE_TYPE_LABELS: Record<ExerciseTypeId, string> = {
  0: 'Weight and Reps',
  1: 'Distance and Time',
  2: 'Weight and Distance',
  3: 'Weight and Time',
  4: 'Reps and Distance',
  5: 'Reps and Time',
  6: 'Weight Only',
  7: 'Reps Only',
  8: 'Distance Only',
  9: 'Time Only',
};

export const ALL_EXERCISE_TYPES: ExerciseTypeId[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

export function isExerciseTypeId(n: number): n is ExerciseTypeId {
  return Number.isInteger(n) && n >= 0 && n <= 9;
}

export function exerciseTypeFields(typeId: number): ExerciseField[] {
  return EXERCISE_TYPE_FIELDS[isExerciseTypeId(typeId) ? typeId : 0];
}

export function exerciseTypeHas(typeId: number, field: ExerciseField): boolean {
  return exerciseTypeFields(typeId).includes(field);
}

/** `exercise.weight_unit_id`: which unit the exercise displays weight in. Weight is always stored in kg. */
export const ExerciseWeightUnit = {
  DEFAULT: 0, // follow the Unit System setting
  METRIC: 1, // kg
  IMPERIAL: 2, // lbs
} as const;

/**
 * `training_log.unit` / `RoutineSectionExerciseSet.unit` / `Goal.unit`: the distance unit the value
 * was entered in. `distance` itself is always stored in metres. 0 means "not set" (weight-based sets),
 * which FitNotes resolves to the unit-system default.
 */
export const DistanceUnit = {
  METRES: 2,
  KILOMETRES: 3,
  FEET: 4,
  MILES: 5,
} as const;
export type DistanceUnitId = (typeof DistanceUnit)[keyof typeof DistanceUnit];

export const DISTANCE_UNIT_TO_METRES: Record<DistanceUnitId, number> = {
  2: 1,
  3: 1000,
  4: 0.3048,
  5: 1609.344,
};

export const DISTANCE_UNIT_LABELS: Record<DistanceUnitId, { short: string; long: string }> = {
  2: { short: 'm', long: 'Metres' },
  3: { short: 'km', long: 'Kilometres' },
  4: { short: 'ft', long: 'Feet' },
  5: { short: 'mi', long: 'Miles' },
};

export function isDistanceUnitId(n: number): n is DistanceUnitId {
  return n === 2 || n === 3 || n === 4 || n === 5;
}

/** `Comment.owner_type_id` */
export const CommentOwnerType = {
  TRAINING_LOG_SET: 1,
  /** Legacy workout comments; current versions use the WorkoutComment table. */
  WORKOUT: 2,
} as const;

/** `Goal.type_id` */
export const GoalType = {
  MAX_WEIGHT: 0,
  MAX_REPS: 1,
  TOTAL_VOLUME: 2,
  TOTAL_REPS: 3,
  MAX_DISTANCE: 4,
  MAX_DURATION: 5,
  TOTAL_DISTANCE: 6,
  TOTAL_DURATION: 7,
  MAX_WEIGHT_AND_REPS: 8,
  ESTIMATED_1RM: 9,
  MAX_VOLUME: 10,
  MAX_WORKOUT_VOLUME: 11,
  MAX_WORKOUT_REPS: 12,
  MAX_WORKOUT_DISTANCE: 13,
  MAX_WORKOUT_DURATION: 14,
} as const;
export type GoalTypeId = (typeof GoalType)[keyof typeof GoalType];

export const GOAL_TYPE_LABELS: Record<GoalTypeId, string> = {
  0: 'Max Weight',
  1: 'Max Reps',
  2: 'Total Volume',
  3: 'Total Reps',
  4: 'Max Distance',
  5: 'Max Time',
  6: 'Total Distance',
  7: 'Total Time',
  8: 'Weight and Reps',
  9: 'Estimated 1RM',
  10: 'Max Set Volume',
  11: 'Max Workout Volume',
  12: 'Max Workout Reps',
  13: 'Max Workout Distance',
  14: 'Max Workout Time',
};

/** `Measurement.goal_type` */
export const MeasurementGoalType = {
  NONE: 0,
  INCREASE: 1,
  DECREASE: 2,
  SPECIFIC: 3,
} as const;

/** `settings.app_theme_id` */
export const AppTheme = { LIGHT: 0, DARK: 1 } as const;

/** `settings.home_screen_limit_type_id` */
export const HomeScreenSetLimitType = { FIRST: 0, LAST: 1 } as const;

/** `settings.home_screen_category_visibility_id` */
export const HomeScreenCategoryVisibility = { NONE: 0, NAME: 1, NAME_AND_COLOUR: 2 } as const;

/** `settings.exercise_list_detail_type_id` */
export const ExerciseListDetailType = { NONE: 0, WORKOUT_COUNT: 1, LAST_USED: 2, BOTH: 3 } as const;

/**
 * Progress graph ids stored in `exercise.default_graph_id`. The numbering below is WorkoutNotes'
 * own (FitNotes' internal ids could not be recovered from the app); see doc/fitnotes-format.md.
 */
export const GraphType = {
  ESTIMATED_1RM: 0,
  MAX_WEIGHT: 1,
  WORKOUT_VOLUME: 2,
  TOTAL_REPS: 3,
  MAX_REPS: 4,
  WEIGHT_AND_REPS: 5,
  REP_MAXES: 6,
  MAX_DISTANCE: 7,
  MAX_TIME: 8,
  MAX_SPEED: 9,
  MAX_PACE: 10,
  TOTAL_DISTANCE: 11,
  TOTAL_TIME: 12,
} as const;
export type GraphTypeId = (typeof GraphType)[keyof typeof GraphType];

export const KG_PER_LB = 0.45359237;
