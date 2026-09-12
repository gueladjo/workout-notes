import { useMemo, useState } from 'react';
import { Dialog } from './Dialog';
import { Button } from './Button';
import { Checkbox } from './Toggle';
import { useSettings } from '@/app/hooks';
import { exerciseTypeFields, type ExerciseTypeId } from '@/db/constants';
import type { ExerciseWithCategory } from '@/db/types';
import { formatSet, weightUnitFor } from '@/ui/format';
import {
  displayToKg,
  displayToMetres,
  kgToDisplay,
  metresToDisplay,
  resolveDistanceUnit,
  fmt,
} from '@/domain/units';
import { formatDuration, parseDuration } from '@/domain/dates';

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
 * "Copy Workout" / "Log All" style dialog: choose exercises and sets with checkboxes, optionally
 * edit the values, then confirm. Returns the selected (possibly edited) sets.
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
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [edited, setEdited] = useState<Map<string, SelectableSet>>(new Map());
  const [editing, setEditing] = useState(false);
  const allKeys = useMemo(() => exercises.flatMap((e) => e.sets.map((s) => s.key)), [exercises]);
  // Reset the selection each time the dialog opens (state adjustment during render, per React docs).
  const [seenOpen, setSeenOpen] = useState(false);
  if (open && !seenOpen) {
    setSeenOpen(true);
    setChecked(new Set(allKeys));
    setEdited(new Map());
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
    for (const ex of exercises)
      for (const s of ex.sets)
        if (checked.has(s.key)) out.push({ exercise: ex.exercise, set: edited.get(s.key) ?? s });
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
              const cur = edited.get(s.key) ?? s;
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
                      value={cur}
                      weightUnit={wu}
                      metric={settings.metric}
                      onChange={(v) => setEdited((m) => new Map(m).set(s.key, v))}
                    />
                  ) : (
                    <button
                      className="set-row__value"
                      style={{ textAlign: 'left' }}
                      onClick={() => toggleSet(s.key)}
                    >
                      {formatSet(cur, ex.exercise.typeId, wu, settings)}
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

/** Compact inline editor for a set's values in display units. */
export function SetEditor({
  typeId,
  value,
  weightUnit,
  metric,
  onChange,
}: {
  typeId: ExerciseTypeId;
  value: SelectableSet;
  weightUnit: 'kg' | 'lbs';
  metric: boolean;
  onChange: (next: SelectableSet) => void;
}) {
  const fields = exerciseTypeFields(typeId);
  const du = resolveDistanceUnit(value.unit, metric);
  return (
    <div className="row" style={{ flex: 1, gap: 6 }}>
      {fields.includes('weight') && (
        <input
          className="input"
          inputMode="decimal"
          aria-label="Weight"
          defaultValue={fmt(kgToDisplay(value.metricWeight, weightUnit))}
          onChange={(e) =>
            onChange({ ...value, metricWeight: displayToKg(Number(e.target.value) || 0, weightUnit) })
          }
        />
      )}
      {fields.includes('reps') && (
        <input
          className="input"
          inputMode="numeric"
          aria-label="Reps"
          defaultValue={value.reps}
          onChange={(e) => onChange({ ...value, reps: Number(e.target.value) || 0 })}
        />
      )}
      {fields.includes('distance') && (
        <input
          className="input"
          inputMode="decimal"
          aria-label="Distance"
          defaultValue={fmt(metresToDisplay(value.distanceMetres, du))}
          onChange={(e) =>
            onChange({ ...value, distanceMetres: displayToMetres(Number(e.target.value) || 0, du), unit: du })
          }
        />
      )}
      {fields.includes('time') && (
        <input
          className="input"
          inputMode="numeric"
          aria-label="Time"
          defaultValue={formatDuration(value.durationSeconds)}
          onChange={(e) => {
            const secs = parseDuration(e.target.value);
            if (Number.isFinite(secs)) onChange({ ...value, durationSeconds: secs });
          }}
        />
      )}
    </div>
  );
}
