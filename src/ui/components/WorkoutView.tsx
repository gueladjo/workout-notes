import type { Workout } from '@/db/types';
import { useSettings } from '@/app/hooks';
import { setValueColumns, weightUnitFor } from '@/ui/format';
import { androidColourToHex } from '@/domain/colour';
import { Icon } from './Icon';

/**
 * Read-only rendering of a workout (calendar popup, history "View Workout"), laid out like
 * FitNotes' workout dialog: uppercase exercise name over an accent rule, then one row per set
 * with its values as right-aligned number/unit columns.
 */
export function WorkoutView({
  workout,
  onExerciseClick,
}: {
  workout: Workout;
  onExerciseClick?: (exerciseId: number) => void;
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
      {workout.exercises.map((we) => {
        // Icons get a fixed slot for the whole exercise so its value columns stay aligned.
        const hasIcons = we.sets.some(
          (s) => (s.isPersonalRecord && settings.trackPersonalRecords) || s.comment,
        );
        return (
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
                {we.exercise.name}
              </button>
              <ul className="workout-view__sets">
                {we.sets.map((s) => (
                  <li key={s.id}>
                    <span className="set-values">
                      {setValueColumns(
                        s,
                        we.exercise.typeId,
                        weightUnitFor(we.exercise, settings),
                        settings,
                      ).map((c, i) => (
                        <span key={i} className="set-value">
                          <span className="set-value__num">{c.value}</span>
                          {c.unit && <span className="set-value__unit">{c.unit}</span>}
                        </span>
                      ))}
                    </span>
                    {hasIcons && (
                      <span className="set-row__trophy">
                        {s.isPersonalRecord && settings.trackPersonalRecords && (
                          <Icon name="trophy" size={16} className="trophy" />
                        )}
                        {s.comment && <Icon name="comment" size={16} className="muted" />}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        );
      })}
    </div>
  );
}
