import { useMemo, useState } from 'react';
import { Dialog } from './Dialog';
import { Button } from './Button';
import { Checkbox } from './Toggle';
import { useToast } from './Toast';
import { useSettings } from '@/app/hooks';
import { exerciseTypeFields, type ExerciseTypeId } from '@/db/constants';
import type { ExerciseWithCategory } from '@/db/types';
import {
  formatSet,
  parseSetField,
  readSetDraft,
  setDraftFrom,
  weightUnitFor,
  type SetDraft,
  type StoredSet,
} from '@/ui/format';
import { resolveDistanceUnit, type WeightUnit } from '@/domain/units';
import { DurationInputs } from './DurationInputs';

export interface SelectableSet {
  key: string;
  metricWeight: number;
  reps: number;
  distanceMetres: number;
  durationSeconds: number;
  unit: number;
  /** Extra payload carried through to the caller (e.g. routine set id). */
  meta?: unknown;
}

export interface SelectableExercise {
  exercise: ExerciseWithCategory;
  sets: SelectableSet[];
}

/**
 * The set a draft of the shared editor saves over `set` (key and meta kept), or null when a field
 * of the draft is invalid; without a draft the set is saved as it is. Every caller of the editor
 * must go through this before writing, so what is typed and what is saved never diverge.
 */
export function setFromDraft(
  set: SelectableSet,
  draft: SetDraft | undefined,
  weightUnit: WeightUnit,
  metric: boolean,
): SelectableSet | null {
  if (!draft) return set;
  const values = readSetDraft(set, draft, weightUnit, resolveDistanceUnit(set.unit, metric));
  return values && { ...set, ...values };
}

/**
 * "Copy Workout" / "Log All" style dialog: choose exercises and sets with checkboxes, optionally
 * edit the values, then confirm. Returns the selected (possibly edited) sets; an invalid edit of a
 * selected set is refused with the Track tab's toast and nothing is confirmed.
 */
export function SetSelectionDialog({
  open,
  onClose,
  title,
  exercises,
  confirmLabel,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  exercises: SelectableExercise[];
  confirmLabel: string;
  onConfirm: (selected: { exercise: ExerciseWithCategory; set: SelectableSet }[]) => void;
}) {
  const settings = useSettings();
  const toast = useToast();
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Map<string, SetDraft>>(new Map());
  const [editing, setEditing] = useState(false);
  const allKeys = useMemo(() => exercises.flatMap((e) => e.sets.map((s) => s.key)), [exercises]);
  // Reset the selection each time the dialog opens (state adjustment during render, per React docs).
  const [seenOpen, setSeenOpen] = useState(false);
  if (open && !seenOpen) {
    setSeenOpen(true);
    setChecked(new Set(allKeys));
    setDrafts(new Map());
    setEditing(false);
  }
  if (!open && seenOpen) setSeenOpen(false);

  const toggleSet = (key: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const toggleExercise = (ex: SelectableExercise) =>
    setChecked((prev) => {
      const next = new Set(prev);
      const all = ex.sets.every((s) => next.has(s.key));
      for (const s of ex.sets)
        if (all) next.delete(s.key);
        else next.add(s.key);
      return next;
    });

  const confirm = () => {
    const out: { exercise: ExerciseWithCategory; set: SelectableSet }[] = [];
    for (const ex of exercises) {
      const wu = weightUnitFor(ex.exercise, settings);
      for (const s of ex.sets) {
        if (!checked.has(s.key)) continue;
        const set = setFromDraft(s, drafts.get(s.key), wu, settings.metric);
        if (!set) {
          toast('Please enter valid values');
          setEditing(true);
          return;
        }
        out.push({ exercise: ex.exercise, set });
      }
    }
    onConfirm(out);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      flush
      actions={
        <>
          <Button variant="text" onClick={() => setEditing((e) => !e)}>
            {editing ? 'Done' : 'Edit'}
          </Button>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={confirm} disabled={checked.size === 0}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {exercises.length === 0 && (
        <div className="muted" style={{ padding: 16 }}>
          Nothing to select.
        </div>
      )}
      {exercises.map((ex) => {
        const wu = weightUnitFor(ex.exercise, settings);
        return (
          <div key={ex.exercise.id}>
            <button className="list__item" onClick={() => toggleExercise(ex)}>
              <Checkbox
                checked={ex.sets.every((s) => checked.has(s.key))}
                onChange={() => toggleExercise(ex)}
                label={ex.exercise.name}
              />
              <div className="list__text">
                <div className="list__primary">{ex.exercise.name}</div>
              </div>
            </button>
            {ex.sets.map((s) => {
              const draft = drafts.get(s.key);
              const cur = setFromDraft(s, draft, wu, settings.metric);
              return (
                <div key={s.key} className="set-row" style={{ paddingLeft: 40 }}>
                  <Checkbox
                    checked={checked.has(s.key)}
                    onChange={() => toggleSet(s.key)}
                    label="Include set"
                  />
                  {editing ? (
                    <SetEditor
                      typeId={ex.exercise.typeId}
                      set={s}
                      draft={draft}
                      weightUnit={wu}
                      metric={settings.metric}
                      onChange={(d) => setDrafts((m) => new Map(m).set(s.key, d))}
                    />
                  ) : (
                    <button
                      className="set-row__value"
                      style={{ textAlign: 'left', color: cur ? undefined : 'var(--color-danger)' }}
                      onClick={() => toggleSet(s.key)}
                    >
                      {cur ? formatSet(cur, ex.exercise.typeId, wu, settings) : 'Invalid values'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </Dialog>
  );
}

/**
 * Compact inline editor for a set's values in display units. The boxes show `draft`, or the stored
 * `set` until the user types; the owner keeps the draft and reads it with `readSetDraft()` /
 * `setFromDraft()` when saving. A box holding text that would be refused is marked invalid.
 */
export function SetEditor({
  typeId,
  set,
  draft,
  weightUnit,
  metric,
  onChange,
}: {
  typeId: ExerciseTypeId;
  set: StoredSet;
  draft: SetDraft | undefined;
  weightUnit: WeightUnit;
  metric: boolean;
  onChange: (next: SetDraft) => void;
}) {
  const fields = exerciseTypeFields(typeId);
  const text = draft ?? setDraftFrom(set, weightUnit, resolveDistanceUnit(set.unit, metric));
  const invalid = (value: string) => (Number.isNaN(parseSetField(value)) ? true : undefined);
  return (
    <div className="row set-editor">
      {fields.includes('weight') && (
        <input
          className="input"
          inputMode="decimal"
          aria-label="Weight"
          aria-invalid={invalid(text.weight)}
          value={text.weight}
          onChange={(e) => onChange({ ...text, weight: e.target.value })}
        />
      )}
      {fields.includes('reps') && (
        <input
          className="input"
          inputMode="numeric"
          aria-label="Reps"
          aria-invalid={invalid(text.reps)}
          value={text.reps}
          onChange={(e) => onChange({ ...text, reps: e.target.value })}
        />
      )}
      {fields.includes('distance') && (
        <input
          className="input"
          inputMode="decimal"
          aria-label="Distance"
          aria-invalid={invalid(text.distance)}
          value={text.distance}
          onChange={(e) => onChange({ ...text, distance: e.target.value })}
        />
      )}
      {fields.includes('time') && (
        <DurationInputs
          value={text.time}
          onChange={(time) => onChange({ ...text, time })}
          className="duration duration--compact"
          inputClassName="input"
        />
      )}
    </div>
  );
}
