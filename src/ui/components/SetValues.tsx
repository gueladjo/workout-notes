import type { ExerciseTypeId } from '@/db/constants';
import type { Settings } from '@/db/repo/settings';
import type { TrainingSet } from '@/db/types';
import type { WeightUnit } from '@/domain/units';
import { formatSet, setValueColumns } from '@/ui/format';

/**
 * A logged set as FitNotes shows it: one column per value, big number with a small unit
 * ("100 kg", "5 reps"). The accessible name stays the plain "100 kg × 5 reps" text.
 */
export function SetValues({
  set,
  typeId,
  weightUnit,
  settings,
  small,
}: {
  set: Pick<TrainingSet, 'metricWeight' | 'reps' | 'distanceMetres' | 'durationSeconds' | 'unit'>;
  typeId: ExerciseTypeId;
  weightUnit: WeightUnit;
  settings: Settings;
  small?: boolean;
}) {
  const columns = setValueColumns(set, typeId, weightUnit, settings);
  return (
    <span
      className={`set-values${small ? ' set-values--small' : ''}`}
      aria-label={formatSet(set, typeId, weightUnit, settings)}
    >
      {columns.map((c, i) => (
        <span key={i} className="set-value" aria-hidden="true">
          <span className="set-value__num">{c.value}</span>
          {c.unit && <span className="set-value__unit">{c.unit}</span>}
        </span>
      ))}
    </span>
  );
}
