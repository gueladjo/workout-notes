import type { Workout } from '@/db/types';
import { useSettings } from '@/app/hooks';
import { formatSet, weightUnitFor } from '@/ui/format';
import { androidColourToHex } from '@/domain/colour';
import { Icon } from './Icon';

/** Read-only rendering of a workout (calendar popup, history "View Workout"). */
export function WorkoutView({
  workout,
  onExerciseClick,
  showCategory,
}: {
  workout: Workout;
  onExerciseClick?: (exerciseId: number) => void;
  showCategory?: boolean;
}) {
  const settings = useSettings();
  if (workout.exercises.length === 0 && !workout.comment) {
    return (
      <div className="muted" style={{ padding: 16 }}>
        No workout recorded on this date.
      </div>
    );
  }
  return (
    <div className="workout-view">
      {workout.comment && <div className="workout-view__comment">{workout.comment}</div>}
      {workout.exercises.map((we) => (
        <div key={we.exercise.id} className="workout-view__exercise">
          {we.group && (
            <span className="group-bar" style={{ background: androidColourToHex(we.group.colour) }} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <button
              className="workout-view__name"
              onClick={onExerciseClick ? () => onExerciseClick(we.exercise.id) : undefined}
              disabled={!onExerciseClick}
            >
              {showCategory && (
                <span
                  className="dot"
                  style={{ background: androidColourToHex(we.exercise.categoryColour) }}
                />
              )}
              {we.exercise.name}
            </button>
            <ul className="workout-view__sets">
              {we.sets.map((s) => (
                <li key={s.id}>
                  <span>
                    {formatSet(s, we.exercise.typeId, weightUnitFor(we.exercise, settings), settings)}
                  </span>
                  {s.isPersonalRecord && settings.trackPersonalRecords && (
                    <Icon name="trophy" size={16} className="trophy" />
                  )}
                  {s.comment && <Icon name="comment" size={16} className="muted" />}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ))}
    </div>
  );
}
