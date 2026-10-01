import { useMemo, useState } from 'react';
import { Dialog } from './Dialog';
import { Button } from './Button';
import { Checkbox } from './Toggle';
import { useToast } from './Toast';
import { SetFields, readSetEdit, setEditFrom, type SetEdit } from './SetFields';
import { useSettings } from '@/app/hooks';
import type { ExerciseWithCategory } from '@/db/types';
import { formatSet, weightUnitFor } from '@/ui/format';
import type { WeightUnit } from '@/domain/units';

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
 * The set an edit (`SetFields`) saves over `set` (key and meta kept), or null when a box of the
 * edit must be refused; without an edit the set is saved as it is. Every caller of the fields must
 * go through this before writing, so what is typed and what is saved never diverge.
 */
export function setFromEdit(
  set: SelectableSet,
  edit: SetEdit | undefined,
  weightUnit: WeightUnit,
  metric: boolean,
): SelectableSet | null {
  if (!edit) return set;
  const values = readSetEdit(set, edit, weightUnit, metric);
  return values && { ...set, ...values };
}

/**
 * "Copy Workout" / "Log All" style dialog: choose exercises and sets with checkboxes (FitNotes'
 * list of "60 kg × 8 reps" rows), or with Edit, one "SET n" section per set with its boxes
 * (`SetFields`) to change the values first, then confirm. Returns the selected (possibly edited)
 * sets; an invalid edit of a selected set is refused with the Track tab's toast and nothing is
 * confirmed.
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
  const [edits, setEdits] = useState<Map<string, SetEdit>>(new Map());
  const [editing, setEditing] = useState(false);
  const allKeys = useMemo(() => exercises.flatMap((e) => e.sets.map((s) => s.key)), [exercises]);
  // Reset the selection each time the dialog opens (state adjustment during render, per React docs).
  const [seenOpen, setSeenOpen] = useState(false);
  if (open && !seenOpen) {
    setSeenOpen(true);
    setChecked(new Set(allKeys));
    setEdits(new Map());
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
        const set = setFromEdit(s, edits.get(s.key), wu, settings.metric);
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
            {ex.sets.map((s, i) => {
              const edit = edits.get(s.key);
              const cur = setFromEdit(s, edit, wu, settings.metric);
              return editing ? (
                <section key={s.key} className="set-dialog__section">
                  <div className="set-dialog__section-head">
                    <Checkbox
                      checked={checked.has(s.key)}
                      onChange={() => toggleSet(s.key)}
                      label={`Include set ${i + 1}`}
                    />
                    <span className="set-dialog__section-name">Set {i + 1}</span>
                  </div>
                  <SetFields
                    exercise={ex.exercise}
                    edit={edit ?? setEditFrom(s, wu, settings.metric)}
                    onChange={(e) => setEdits((m) => new Map(m).set(s.key, e))}
                  />
                </section>
              ) : (
                <div key={s.key} className="set-row" style={{ paddingLeft: 40 }}>
                  <Checkbox
                    checked={checked.has(s.key)}
                    onChange={() => toggleSet(s.key)}
                    label={`Include set ${i + 1}`}
                  />
                  <button
                    className="set-row__value"
                    style={{ textAlign: 'left', color: cur ? undefined : 'var(--color-danger)' }}
                    onClick={() => toggleSet(s.key)}
                  >
                    {cur ? formatSet(cur, ex.exercise.typeId, wu, settings) : 'Invalid values'}
                  </button>
                </div>
              );
            })}
          </div>
        );
      })}
    </Dialog>
  );
}
