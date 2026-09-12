/**
 * Typed views of the FitNotes tables. Column names are translated to camelCase at the repository
 * boundary; everything above the repositories works with these interfaces.
 */
import type { ExerciseTypeId } from './constants';

export interface Category {
  id: number;
  name: string;
  /** Android colour int (signed 32-bit ARGB). Use domain/colour.ts to convert. */
  colour: number;
  sortOrder: number;
}

export interface Exercise {
  id: number;
  name: string;
  categoryId: number;
  typeId: ExerciseTypeId;
  notes: string;
  /** Increment for the +/- buttons in the exercise's display unit; null = use the settings default. */
  weightIncrement: number | null;
  defaultGraphId: number | null;
  defaultRestTime: number | null;
  /** 0 = settings default, 1 = kg, 2 = lbs (ExerciseWeightUnit). */
  weightUnitId: number;
  isFavourite: boolean;
}

export interface ExerciseWithCategory extends Exercise {
  categoryName: string;
  categoryColour: number;
}

export interface TrainingSet {
  id: number;
  exerciseId: number;
  date: string;
  /** Always kilograms. */
  metricWeight: number;
  reps: number;
  /** Distance unit id (DistanceUnit) the distance was entered in; 0 when not applicable. */
  unit: number;
  /** Always metres. */
  distanceMetres: number;
  durationSeconds: number;
  isPersonalRecord: boolean;
  isComplete: boolean;
  routineSetId: number;
}

export interface TrainingSetWithComment extends TrainingSet {
  comment: string | null;
  commentId: number | null;
}

export interface WorkoutGroup {
  id: number;
  name: string;
  date: string;
  colour: number;
  routineSectionId: number | null;
  autoJumpEnabled: boolean;
}

/** One exercise block on the home screen / navigation panel. */
export interface WorkoutExercise {
  exercise: ExerciseWithCategory;
  sets: TrainingSetWithComment[];
  group: WorkoutGroup | null;
}

export interface Workout {
  date: string;
  exercises: WorkoutExercise[];
  comment: string | null;
  time: WorkoutTime | null;
}

export interface WorkoutTime {
  id: number;
  date: string;
  /** 'YYYY-MM-DD HH:MM:SS' local time. */
  start: string;
  end: string;
}

export interface Routine {
  id: number;
  name: string;
  notes: string;
}

export interface RoutineSection {
  id: number;
  routineId: number;
  name: string;
  sortOrder: number;
}

export interface RoutineExercise {
  id: number;
  sectionId: number;
  exerciseId: number;
  sortOrder: number;
  populateSetsType: number;
}

export interface RoutineSet {
  id: number;
  routineExerciseId: number;
  metricWeight: number;
  reps: number;
  sortOrder: number;
  distanceMetres: number;
  durationSeconds: number;
  unit: number;
}

export interface RoutineExerciseDetail extends RoutineExercise {
  exercise: ExerciseWithCategory;
  sets: RoutineSet[];
  group: WorkoutGroup | null;
}

export interface RoutineSectionDetail extends RoutineSection {
  exercises: RoutineExerciseDetail[];
}

export interface RoutineDetail extends Routine {
  sections: RoutineSectionDetail[];
}

export interface MeasurementUnit {
  id: number;
  type: number;
  longName: string;
  shortName: string;
}

export interface Measurement {
  id: number;
  name: string;
  unitId: number;
  goalType: number;
  goalValue: number;
  custom: boolean;
  enabled: boolean;
  sortOrder: number;
}

export interface MeasurementWithUnit extends Measurement {
  unitShort: string;
  unitLong: string;
}

export interface MeasurementRecord {
  id: number;
  measurementId: number;
  date: string;
  time: string;
  value: number;
  comment: string | null;
}

export interface Goal {
  id: number;
  typeId: number;
  exerciseId: number;
  metricWeight: number;
  reps: number;
  unit: number;
  title: string | null;
  targetDate: string | null;
  startDate: string | null;
  sortOrder: number;
  distanceMetres: number;
  durationSeconds: number;
}

export interface WorkoutComment {
  id: number;
  date: string;
  comment: string;
}
