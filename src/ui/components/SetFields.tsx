import { useSettings } from '@/app/hooks';
import { exerciseTypeFields } from '@/db/constants';
import type { Exercise } from '@/db/types';
import { resolveDistanceUnit, type WeightUnit } from '@/domain/units';
import {
  parseSetField,
  readSetDraft,
  setDraftFrom,
  weightUnitFor,
  type SetDraft,
  type StoredSet,
} from '@/ui/format';
import { NumberField, DistanceField, DurationField } from './NumberField';

/** What a set dialog holds for one set: the text of its boxes, its distance unit and its note. */
export interface SetEdit {
  draft: SetDraft;
  unit: number;
  notes: string;
}

/** The edit a dialog starts from for a stored set: its boxes as `setDraftFrom` shows them, its note. */
export function setEditFrom(
  set: StoredSet & { comment?: string | null },
  weightUnit: WeightUnit,
  metric: boolean,
): SetEdit {
  const unit = resolveDistanceUnit(set.unit, metric);
  return { draft: setDraftFrom(set, weightUnit, unit), unit, notes: set.comment ?? '' };
}

/** The values an edit saves over `set` (see `readSetDraft`), or null when a box must be refused. */
export function readSetEdit(
  set: StoredSet,
  edit: SetEdit,
  weightUnit: WeightUnit,
  metric: boolean,
): StoredSet | null {
  return readSetDraft(set, edit.draft, weightUnit, resolveDistanceUnit(edit.unit, metric));
}

/**
 * One set's boxes as FitNotes' set dialogs show them: the Track tab's fields (label over a
 * -/value/+ row stepping by the exercise's increment, distance with its unit, hh / mm / ss) and,
 * with `notes`, a Notes box for the set comment. A box whose text would be refused on save is
 * marked invalid. Every set dialog (Edit Set, Edit Sets, Copy Sets, Copy Workout, Log All and a
 * routine's predefined sets) is built from it.
 */
export function SetFields({
  exercise,
  edit,
  onChange,
  notes,
}: {
  exercise: Pick<Exercise, 'typeId' | 'weightIncrement' | 'weightUnitId'>;
  edit: SetEdit;
  onChange: (next: SetEdit) => void;
  notes?: boolean;
}) {
  const settings = useSettings();
  const wu = weightUnitFor(exercise, settings);
  const fields = exerciseTypeFields(exercise.typeId);
  const draft = (p: Partial<SetDraft>) => onChange({ ...edit, draft: { ...edit.draft, ...p } });
  const invalid = (text: string) => Number.isNaN(parseSetField(text));
  return (
    <div className="dialog-fields">
      {fields.includes('weight') && (
        <NumberField
          label={`Weight (${wu})`}
          value={edit.draft.weight}
          invalid={invalid(edit.draft.weight)}
          onChange={(weight) => draft({ weight })}
          step={exercise.weightIncrement ?? settings.weightIncrement}
        />
      )}
      {fields.includes('distance') && (
        <DistanceField
          value={edit.draft.distance}
          unit={edit.unit}
          invalid={invalid(edit.draft.distance)}
          onChange={(distance, unit) => onChange({ ...edit, unit, draft: { ...edit.draft, distance } })}
        />
      )}
      {fields.includes('reps') && (
        <NumberField
          label="Reps"
          value={edit.draft.reps}
          invalid={invalid(edit.draft.reps)}
          onChange={(reps) => draft({ reps })}
          step={1}
          decimals={0}
          inputMode="numeric"
        />
      )}
      {fields.includes('time') && (
        <DurationField value={edit.draft.time} onChange={(time) => draft({ time })} />
      )}
      {notes && (
        <input
          className="dialog-fields__input"
          value={edit.notes}
          placeholder="Notes …"
          aria-label="Notes"
          onChange={(e) => onChange({ ...edit, notes: e.target.value })}
        />
      )}
    </div>
  );
}
