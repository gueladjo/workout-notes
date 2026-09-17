/**
 * Supersets / circuits. A WorkoutGroup belongs to a workout date (or to a routine section when
 * `routine_section_id` is set and `date` is empty). WorkoutGroupExercise links exercises to it.
 */
import type { AppDatabase } from '../store';
import type { WorkoutGroup } from '../types';

interface GroupRow {
  _id: number;
  name: string;
  date: string;
  colour: number;
  routine_section_id: number | null;
  auto_jump_enabled: number;
}

export function toGroup(r: GroupRow): WorkoutGroup {
  return {
    id: r._id,
    name: r.name,
    date: r.date,
    colour: r.colour,
    routineSectionId: r.routine_section_id,
    autoJumpEnabled: r.auto_jump_enabled !== 0,
  };
}

export interface GroupWithExercises extends WorkoutGroup {
  exerciseIds: number[];
}

export function listGroups(db: AppDatabase, date: string): GroupWithExercises[] {
  const groups = db
    .all<GroupRow>('SELECT * FROM WorkoutGroup WHERE date = ? ORDER BY _id ASC', [date])
    .map(toGroup);
  return groups.map((g) => ({
    ...g,
    exerciseIds: db
      .all<{ exercise_id: number }>(
        'SELECT exercise_id FROM WorkoutGroupExercise WHERE workout_group_id = ? AND date = ? ORDER BY _id ASC',
        [g.id, date],
      )
      .map((r) => r.exercise_id),
  }));
}

export function listRoutineSectionGroups(db: AppDatabase, sectionId: number): GroupWithExercises[] {
  const groups = db
    .all<GroupRow>('SELECT * FROM WorkoutGroup WHERE routine_section_id = ? AND date = ? ORDER BY _id ASC', [
      sectionId,
      '',
    ])
    .map(toGroup);
  return groups.map((g) => ({
    ...g,
    exerciseIds: db
      .all<{ exercise_id: number }>(
        'SELECT exercise_id FROM WorkoutGroupExercise WHERE workout_group_id = ? ORDER BY _id ASC',
        [g.id],
      )
      .map((r) => r.exercise_id),
  }));
}

export function getGroup(db: AppDatabase, id: number): GroupWithExercises | undefined {
  const r = db.get<GroupRow>('SELECT * FROM WorkoutGroup WHERE _id = ?', [id]);
  if (!r) return undefined;
  return {
    ...toGroup(r),
    exerciseIds: db
      .all<{ exercise_id: number }>(
        'SELECT exercise_id FROM WorkoutGroupExercise WHERE workout_group_id = ? ORDER BY _id ASC',
        [id],
      )
      .map((x) => x.exercise_id),
  };
}

export function groupForExercise(
  db: AppDatabase,
  date: string,
  exerciseId: number,
): GroupWithExercises | undefined {
  const r = db.get<{ workout_group_id: number }>(
    'SELECT workout_group_id FROM WorkoutGroupExercise WHERE date = ? AND exercise_id = ? ORDER BY _id DESC LIMIT 1',
    [date, exerciseId],
  );
  return r ? getGroup(db, r.workout_group_id) : undefined;
}

export function createGroup(
  db: AppDatabase,
  input: {
    date: string;
    routineSectionId?: number | null;
    name: string;
    colour: number;
    exerciseIds: number[];
  },
): number {
  return db.mutate(() => {
    db.run(
      'INSERT INTO WorkoutGroup (name, date, colour, routine_section_id, auto_jump_enabled) VALUES (?, ?, ?, ?, 1)',
      [input.name.trim(), input.date, input.colour, input.routineSectionId ?? null],
    );
    const id = Number(db.scalar('SELECT last_insert_rowid()'));
    setGroupExercises(db, id, input.exerciseIds);
    return id;
  });
}

export function updateGroup(
  db: AppDatabase,
  id: number,
  patch: { name?: string; colour?: number; exerciseIds?: number[]; autoJumpEnabled?: boolean },
): void {
  db.mutate(() => {
    if (patch.name !== undefined)
      db.run('UPDATE WorkoutGroup SET name = ? WHERE _id = ?', [patch.name.trim(), id]);
    if (patch.colour !== undefined)
      db.run('UPDATE WorkoutGroup SET colour = ? WHERE _id = ?', [patch.colour, id]);
    if (patch.autoJumpEnabled !== undefined)
      db.run('UPDATE WorkoutGroup SET auto_jump_enabled = ? WHERE _id = ?', [
        patch.autoJumpEnabled ? 1 : 0,
        id,
      ]);
    if (patch.exerciseIds) setGroupExercises(db, id, patch.exerciseIds);
  });
}

function setGroupExercises(db: AppDatabase, groupId: number, exerciseIds: number[]): void {
  const g = db.get<GroupRow>('SELECT * FROM WorkoutGroup WHERE _id = ?', [groupId]);
  if (!g) return;
  db.run('DELETE FROM WorkoutGroupExercise WHERE workout_group_id = ?', [groupId]);
  for (const exerciseId of exerciseIds) {
    // An exercise can only be in one group per workout / section.
    if (g.date)
      db.run('DELETE FROM WorkoutGroupExercise WHERE date = ? AND exercise_id = ?', [g.date, exerciseId]);
    else if (g.routine_section_id !== null)
      db.run(
        'DELETE FROM WorkoutGroupExercise WHERE routine_section_id = ? AND exercise_id = ? AND date = ?',
        [g.routine_section_id, exerciseId, ''],
      );
    db.run(
      'INSERT INTO WorkoutGroupExercise (exercise_id, date, routine_section_id, workout_group_id) VALUES (?, ?, ?, ?)',
      [exerciseId, g.date, g.routine_section_id ?? 0, groupId],
    );
  }
}

export function removeExerciseFromGroup(db: AppDatabase, groupId: number, exerciseId: number): void {
  db.mutate(() => {
    db.run('DELETE FROM WorkoutGroupExercise WHERE workout_group_id = ? AND exercise_id = ?', [
      groupId,
      exerciseId,
    ]);
    const remaining = Number(
      db.scalar('SELECT COUNT(*) FROM WorkoutGroupExercise WHERE workout_group_id = ?', [groupId]),
    );
    if (remaining === 0) db.run('DELETE FROM WorkoutGroup WHERE _id = ?', [groupId]);
  });
}

/**
 * Drop workout groups that no longer contain any exercise (optionally only on one date). Used by
 * every path that removes group membership so empty groups do not linger and inflate "Group N"
 * naming. Must be called inside a mutation.
 */
export function deleteEmptyGroups(db: AppDatabase, date?: string): void {
  const dateClause = date === undefined ? '' : ' AND date = ?';
  db.run(
    `DELETE FROM WorkoutGroup WHERE _id NOT IN (SELECT workout_group_id FROM WorkoutGroupExercise)${dateClause}`,
    date === undefined ? [] : [date],
  );
}

export function deleteGroup(db: AppDatabase, groupId: number): void {
  db.mutate(() => {
    db.run('DELETE FROM WorkoutGroupExercise WHERE workout_group_id = ?', [groupId]);
    db.run('DELETE FROM WorkoutGroup WHERE _id = ?', [groupId]);
  });
}

/** FitNotes' default group colours, cycling for successive groups. */
export const GROUP_COLOURS = [
  -13330213, -1618884, -14176672, -812014, -7453523, -11226442, -1671646, -13877680,
];

export function nextGroupName(db: AppDatabase, date: string): string {
  const n = Number(db.scalar('SELECT COUNT(*) FROM WorkoutGroup WHERE date = ?', [date]));
  return `Group ${n + 1}`;
}
