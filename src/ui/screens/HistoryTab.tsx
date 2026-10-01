import { Fragment, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDb, useQuery } from '@/app/db-context';
import { useSettings } from '@/app/hooks';
import { copySets, deleteSet, exerciseHistory, getWorkout, updateSet } from '@/db/repo/workouts';
import { setSetComment } from '@/db/repo/comments';
import type { Settings } from '@/db/repo/settings';
import type { ExerciseWithCategory, TrainingSetWithComment } from '@/db/types';
import { formatSet, formatWeightValue, setValueColumns, weightUnitFor, type StoredSet } from '@/ui/format';
import { formatLongDate, formatWeekdayDate, formatDuration } from '@/domain/dates';
import { estimatedOneRepMax } from '@/domain/records';
import { exerciseTypeFields, exerciseTypeHas, type ExerciseTypeId } from '@/db/constants';
import {
  fmt,
  metresToDisplay,
  resolveDistanceUnit,
  distanceUnitShort,
  speed,
  paceSecondsPerUnit,
  paceDistanceUnit,
  type WeightUnit,
} from '@/domain/units';
import { Icon } from '@/ui/components/Icon';
import { Dialog } from '@/ui/components/Dialog';
import { Button, IconButton } from '@/ui/components/Button';
import { SetFields, readSetEdit, setEditFrom, type SetEdit } from '@/ui/components/SetFields';
import { WorkoutView } from '@/ui/components/WorkoutView';
import { SetSelectionDialog, type SelectableExercise } from '@/ui/components/SetSelectionDialog';
import { useToast } from '@/ui/components/Toast';
import { EmptyState } from '@/ui/components/EmptyState';
import { SetValues } from '@/ui/components/SetValues';

/**
 * Training History tab: every past workout of the exercise, with quick stats and edit/copy actions.
 * `readOnly` (Exercise Overview) keeps the stats and View Workout but hides Edit/Copy, because there
 * `date` is only the day the screen was opened from, not a workout being tracked.
 */
export function HistoryTab({
  exercise,
  date,
  readOnly,
}: {
  exercise: ExerciseWithCategory;
  date: string;
  readOnly?: boolean;
}) {
  const db = useDb();
  const navigate = useNavigate();
  const toast = useToast();
  const settings = useSettings();
  const history = useQuery((d) => exerciseHistory(d, exercise.id), [exercise.id]);
  const wu = weightUnitFor(exercise, settings);
  const [dayDialog, setDayDialog] = useState<string | null>(null);
  const [setDialog, setSetDialog] = useState<TrainingSetWithComment | null>(null);
  const [editSet, setEditSet] = useState<TrainingSetWithComment | null>(null);
  const [viewDate, setViewDate] = useState<string | null>(null);
  const [copyDate, setCopyDate] = useState<string | null>(null);
  const [editDate, setEditDate] = useState<string | null>(null);
  const viewWorkout = useQuery((d) => (viewDate ? getWorkout(d, viewDate) : null), [viewDate]);

  const daySets = history.find((h) => h.date === dayDialog)?.sets ?? [];
  const dayStats = dayDialog ? dayStatsOf(daySets, exercise.typeId, wu, settings) : [];
  const isStrength = exerciseTypeHas(exercise.typeId, 'weight') && exerciseTypeHas(exercise.typeId, 'reps');
  const isCardio = exerciseTypeHas(exercise.typeId, 'distance') && exerciseTypeHas(exercise.typeId, 'time');
  // Speed and pace of the tapped set: per km / per mile even when the set was logged in m / ft.
  const paceUnit = paceDistanceUnit(resolveDistanceUnit(setDialog?.unit ?? 0, settings.metric));
  // The tapped set's quick stats, laid out as FitNotes does: a bold label over its value.
  const stats: { label: string; value: string }[] = [];
  if (setDialog) {
    if (isStrength)
      stats.push(
        {
          label: 'Estimated 1RM',
          value: formatWeightValue(estimatedOneRepMax(setDialog.metricWeight, setDialog.reps), wu),
        },
        { label: 'Total Volume', value: formatWeightValue(setDialog.metricWeight * setDialog.reps, wu) },
      );
    if (isCardio && setDialog.durationSeconds > 0)
      stats.push(
        {
          label: 'Speed',
          value: `${fmt(speed(setDialog.distanceMetres, setDialog.durationSeconds, paceUnit), 2)} ${distanceUnitShort(paceUnit)}/h`,
        },
        {
          label: 'Pace',
          value: `${formatDuration(paceSecondsPerUnit(setDialog.distanceMetres, setDialog.durationSeconds, paceUnit))} /${distanceUnitShort(paceUnit)}`,
        },
      );
  }

  const copySelectable: SelectableExercise[] = useMemo(() => {
    const src = history.find((h) => h.date === copyDate);
    if (!src) return [];
    return [
      {
        exercise,
        sets: src.sets.map((s) => ({
          key: String(s.id),
          metricWeight: s.metricWeight,
          reps: s.reps,
          distanceMetres: s.distanceMetres,
          durationSeconds: s.durationSeconds,
          unit: s.unit,
        })),
      },
    ];
  }, [history, copyDate, exercise]);

  if (history.length === 0)
    return (
      <EmptyState title="No history yet" message="Sets you record will appear here, grouped by workout." />
    );

  return (
    <div className="screen__content">
      <div className="container">
        {history.map((h) => (
          <div key={h.date}>
            <button className="history-day" onClick={() => setDayDialog(h.date)}>
              <span style={{ flex: 1 }}>{formatLongDate(h.date)}</span>
              {h.date === date && <span className="chip chip--active">Current</span>}
            </button>
            {h.sets.map((s, i) => (
              <div key={s.id}>
                <button
                  className="set-row set-row--history"
                  aria-label={`Set ${i + 1}: ${formatSet(s, exercise.typeId, wu, settings)}`}
                  onClick={() => setSetDialog(s)}
                >
                  <span className="set-row__trophy" aria-hidden="true">
                    {s.isPersonalRecord && settings.trackPersonalRecords && (
                      <Icon name="trophy" size={18} className="trophy" />
                    )}
                    {s.comment && <Icon name="comment" size={18} className="faint" />}
                  </span>
                  <SetValues set={s} typeId={exercise.typeId} weightUnit={wu} settings={settings} />
                </button>
                {s.comment && <div className="set-row__comment">{s.comment}</div>}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Workout-day popup as in FitNotes: the date as the heading, the day's totals and best sets,
          then View Workout, Edit Sets and Copy Sets as icon rows. */}
      <Dialog
        open={dayDialog !== null}
        onClose={() => setDayDialog(null)}
        title={dayDialog ? formatWeekdayDate(dayDialog) : ''}
        flush
      >
        <div className="set-dialog__stats">
          {dayStats.map((s) => (
            <div key={s.label}>
              <div className="set-dialog__label">{s.label}</div>
              <div className="set-dialog__value">
                {s.value}
                {s.set && (
                  <span className="set-dialog__ref">
                    {' '}
                    ({formatSet(s.set, exercise.typeId, wu, settings)})
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="set-dialog__menu">
          <button
            className="list__item"
            onClick={() => {
              setViewDate(dayDialog);
              setDayDialog(null);
            }}
          >
            <Icon name="menu" />
            <span className="list__text">View Workout</span>
          </button>
          {!readOnly && (
            <>
              <button
                className="list__item"
                onClick={() => {
                  setEditDate(dayDialog);
                  setDayDialog(null);
                }}
              >
                <Icon name="edit" />
                <span className="list__text">Edit Sets</span>
              </button>
              <button
                className="list__item"
                onClick={() => {
                  setCopyDate(dayDialog);
                  setDayDialog(null);
                }}
              >
                <Icon name="copy" />
                <span className="list__text">Copy Sets</span>
              </button>
            </>
          )}
        </div>
      </Dialog>

      {/* Single-set popup as in FitNotes: the set as the heading, its quick stats, then Edit Set and
          Copy Set as icon rows (Exercise Overview gets a Close button instead). */}
      <Dialog
        open={setDialog !== null}
        onClose={() => setSetDialog(null)}
        title={
          setDialog && (
            <SetTitle set={setDialog} typeId={exercise.typeId} weightUnit={wu} settings={settings} />
          )
        }
        flush
        actions={
          readOnly ? (
            <Button variant="text" onClick={() => setSetDialog(null)}>
              Close
            </Button>
          ) : undefined
        }
      >
        {setDialog && (
          <>
            {(stats.length > 0 || setDialog.comment) && (
              <div className="set-dialog__stats">
                {stats.map((s) => (
                  <div key={s.label}>
                    <div className="set-dialog__label">{s.label}</div>
                    <div className="set-dialog__value">{s.value}</div>
                  </div>
                ))}
                {setDialog.comment && (
                  <div>
                    <div className="set-dialog__label">Notes</div>
                    <div className="set-dialog__comment">{setDialog.comment}</div>
                  </div>
                )}
              </div>
            )}
            {!readOnly && (
              <div className="set-dialog__menu">
                <button
                  className="list__item"
                  onClick={() => {
                    const s = setDialog;
                    setSetDialog(null);
                    setEditSet(s);
                  }}
                >
                  <Icon name="edit" />
                  <span className="list__text">Edit Set</span>
                </button>
                <button
                  className="list__item"
                  onClick={() => {
                    copySets(
                      db,
                      [
                        {
                          exerciseId: exercise.id,
                          metricWeight: setDialog.metricWeight,
                          reps: setDialog.reps,
                          distanceMetres: setDialog.distanceMetres,
                          durationSeconds: setDialog.durationSeconds,
                          unit: setDialog.unit,
                        },
                      ],
                      date,
                    );
                    toast('Set copied to current workout');
                    setSetDialog(null);
                  }}
                >
                  <Icon name="copy" />
                  <span className="list__text">Copy Set</span>
                </button>
              </div>
            )}
          </>
        )}
      </Dialog>

      {/* Edit one set (FitNotes' Edit Set dialog); mounted only while open so it starts from the set. */}
      {editSet && (
        <EditSetDialog key={editSet.id} exercise={exercise} set={editSet} onClose={() => setEditSet(null)} />
      )}

      {/* View full workout */}
      <Dialog
        open={viewDate !== null}
        onClose={() => setViewDate(null)}
        title={viewDate ? formatWeekdayDate(viewDate) : ''}
        flush
        actions={
          <Button variant="text" onClick={() => setViewDate(null)}>
            Close
          </Button>
        }
      >
        {viewWorkout && (
          <WorkoutView
            workout={viewWorkout}
            onExerciseClick={(id) => {
              setViewDate(null);
              navigate(`/exercise/${id}/overview?date=${viewDate}`);
            }}
          />
        )}
      </Dialog>

      {/* Copy sets from a past workout */}
      <SetSelectionDialog
        open={copyDate !== null}
        onClose={() => setCopyDate(null)}
        title={copyDate ? `Copy sets from ${formatLongDate(copyDate)}` : ''}
        exercises={copySelectable}
        confirmLabel="Copy"
        onConfirm={(sel) => {
          copySets(
            db,
            sel.map(({ set }) => ({ exerciseId: exercise.id, ...set })),
            date,
          );
          toast(`Copied ${sel.length} set${sel.length === 1 ? '' : 's'}`);
        }}
      />

      {/* Edit the sets of a past workout (FitNotes' Edit Sets); mounted only while open. */}
      {editDate && (
        <EditSetsDialog
          key={editDate}
          exercise={exercise}
          sets={history.find((h) => h.date === editDate)?.sets ?? []}
          onClose={() => setEditDate(null)}
        />
      )}
    </div>
  );
}

function formatDist(metres: number, unit: number, metric: boolean): string {
  const du = resolveDistanceUnit(unit, metric);
  return `${fmt(metresToDisplay(metres, du))} ${distanceUnitShort(du)}`;
}

interface DayStat {
  label: string;
  value: string;
  /** The set that achieved a "Max" stat, shown beside the value. */
  set?: TrainingSetWithComment;
}

/**
 * A workout day's stats as FitNotes lists them: Total Sets, then Total Reps / Volume (or Distance /
 * Duration), then the best set by estimated 1RM, weight, reps and volume (or distance and
 * duration), each with the set that achieved it. The first of equal sets wins.
 */
function dayStatsOf(
  sets: TrainingSetWithComment[],
  typeId: ExerciseTypeId,
  weightUnit: WeightUnit,
  settings: Settings,
): DayStat[] {
  const fields = exerciseTypeFields(typeId);
  const reps = fields.includes('reps');
  const strength = fields.includes('weight') && reps;
  const distance = fields.includes('distance');
  const time = fields.includes('time');
  const sum = (f: (s: TrainingSetWithComment) => number) => sets.reduce((a, s) => a + f(s), 0);
  const best = (f: (s: TrainingSetWithComment) => number) =>
    sets.reduce<TrainingSetWithComment | undefined>((b, s) => (b && f(b) >= f(s) ? b : s), undefined);
  const oneRm = (s: TrainingSetWithComment) => estimatedOneRepMax(s.metricWeight, s.reps);
  const volume = (s: TrainingSetWithComment) => s.metricWeight * s.reps;
  const dist = (metres: number, unit: number) => formatDist(metres, unit, settings.metric);
  const stats: DayStat[] = [
    { label: 'Total Sets', value: `${sets.length} set${sets.length === 1 ? '' : 's'}` },
  ];
  if (reps) stats.push({ label: 'Total Reps', value: `${sum((s) => s.reps)} reps` });
  if (strength) stats.push({ label: 'Total Volume', value: formatWeightValue(sum(volume), weightUnit) });
  if (distance)
    stats.push({
      label: 'Total Distance',
      value: dist(
        sum((s) => s.distanceMetres),
        sets[0]?.unit ?? 0,
      ),
    });
  if (time) stats.push({ label: 'Total Duration', value: formatDuration(sum((s) => s.durationSeconds)) });
  const max = (
    label: string,
    f: (s: TrainingSetWithComment) => number,
    format: (s: TrainingSetWithComment) => string,
  ) => {
    const set = best(f);
    if (set) stats.push({ label, value: format(set), set });
  };
  if (strength) {
    max('Max Estimated 1RM', oneRm, (s) => formatWeightValue(oneRm(s), weightUnit));
    max(
      'Max Weight',
      (s) => s.metricWeight,
      (s) => formatWeightValue(s.metricWeight, weightUnit),
    );
  }
  if (reps)
    max(
      'Max Reps',
      (s) => s.reps,
      (s) => `${s.reps} reps`,
    );
  if (strength) max('Max Volume', volume, (s) => formatWeightValue(volume(s), weightUnit));
  if (distance)
    max(
      'Max Distance',
      (s) => s.distanceMetres,
      (s) => dist(s.distanceMetres, s.unit),
    );
  if (time)
    max(
      'Max Duration',
      (s) => s.durationSeconds,
      (s) => formatDuration(s.durationSeconds),
    );
  return stats;
}

/**
 * A set as the heading of FitNotes' set popup: big numbers with small units, the "×" between the
 * weight / distance and the reps / time, as `formatSet` writes it.
 */
function SetTitle({
  set,
  typeId,
  weightUnit,
  settings,
}: {
  set: StoredSet;
  typeId: ExerciseTypeId;
  weightUnit: WeightUnit;
  settings: Settings;
}) {
  const columns = setValueColumns(set, typeId, weightUnit, settings);
  const firstGroup = exerciseTypeFields(typeId).filter((f) => f === 'weight' || f === 'distance').length;
  return (
    <span className="set-dialog__title">
      {columns.map((c, i) => (
        <Fragment key={i}>
          {i > 0 && <span className="set-dialog__sep">{i === firstGroup ? '×' : '·'}</span>}
          <span className="set-dialog__num">{c.value}</span>
          {c.unit && <span className="set-dialog__unit">{c.unit}</span>}
        </Fragment>
      ))}
    </span>
  );
}

/**
 * FitNotes' Edit Set dialog for one set of the history: its boxes (`SetFields`, with its note) and Cancel /
 * Delete / Save. Follows the shared set editor's rules (`readSetDraft`): an untouched field saves
 * its stored value back exactly, and a malformed, negative or non-finite value is refused with the
 * Track tab's toast, nothing written. Delete removes the set at once, as the Track tab's does.
 * Mounted only while open, so its fields start from `set`.
 */
export function EditSetDialog({
  exercise,
  set,
  onClose,
}: {
  exercise: ExerciseWithCategory;
  set: TrainingSetWithComment;
  onClose: () => void;
}) {
  const db = useDb();
  const settings = useSettings();
  const toast = useToast();
  const wu = weightUnitFor(exercise, settings);
  const [edit, setEdit] = useState(() => setEditFrom(set, wu, settings.metric));
  const save = () => {
    const values = readSetEdit(set, edit, wu, settings.metric);
    if (!values) return toast('Please enter valid values');
    // One transaction for the values and the note (nested `mutate` calls share it).
    db.mutate(() => {
      updateSet(db, set.id, values);
      if (edit.notes.trim() !== (set.comment ?? '')) setSetComment(db, set.id, edit.notes);
    });
    toast('Set updated');
    onClose();
  };
  const remove = () => {
    deleteSet(db, set.id);
    toast('Set deleted');
    onClose();
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title="Edit Set"
      flush
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="text" onClick={remove}>
            Delete
          </Button>
          <Button variant="text" onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <SetFields exercise={exercise} edit={edit} onChange={setEdit} notes />
    </Dialog>
  );
}

/**
 * FitNotes' Edit Sets dialog for one workout day: a scrolling list of "SET n" sections, each with
 * the set's boxes (`SetFields`) and an X that drops the set. Nothing is written until Save, which
 * updates the sets touched and their notes and deletes the dropped ones in one transaction; a box
 * that must be refused (see `readSetDraft`) stops the whole save with the Track tab's toast. Cancel
 * forgets it all. Mounted only while open, so it starts from the sets as stored.
 */
export function EditSetsDialog({
  exercise,
  sets,
  onClose,
}: {
  exercise: ExerciseWithCategory;
  sets: TrainingSetWithComment[];
  onClose: () => void;
}) {
  const db = useDb();
  const settings = useSettings();
  const toast = useToast();
  const wu = weightUnitFor(exercise, settings);
  const [edits, setEdits] = useState<Map<number, SetEdit>>(new Map());
  const [dropped, setDropped] = useState<Set<number>>(new Set());
  const kept = sets.filter((s) => !dropped.has(s.id));
  const save = () => {
    const updates: { set: TrainingSetWithComment; edit: SetEdit; values: StoredSet }[] = [];
    for (const set of kept) {
      const edit = edits.get(set.id);
      if (!edit) continue;
      const values = readSetEdit(set, edit, wu, settings.metric);
      if (!values) return toast('Please enter valid values');
      updates.push({ set, edit, values });
    }
    if (updates.length > 0 || dropped.size > 0)
      db.mutate(() => {
        for (const { set, edit, values } of updates) {
          updateSet(db, set.id, values);
          if (edit.notes.trim() !== (set.comment ?? '')) setSetComment(db, set.id, edit.notes);
        }
        for (const id of dropped) deleteSet(db, id);
      });
    toast('Sets updated');
    onClose();
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title="Edit Sets"
      flush
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="text" onClick={save}>
            Save
          </Button>
        </>
      }
    >
      {kept.length === 0 && (
        <div className="muted" style={{ padding: 16 }}>
          All sets removed. Save to delete them.
        </div>
      )}
      {kept.map((s, i) => (
        <section key={s.id} className="set-dialog__section">
          <div className="set-dialog__section-head">
            <span className="set-dialog__section-name">Set {i + 1}</span>
            <IconButton
              icon="close"
              label={`Remove set ${i + 1}`}
              small
              onClick={() => setDropped((d) => new Set(d).add(s.id))}
            />
          </div>
          <SetFields
            exercise={exercise}
            edit={edits.get(s.id) ?? setEditFrom(s, wu, settings.metric)}
            onChange={(e) => setEdits((m) => new Map(m).set(s.id, e))}
            notes
          />
        </section>
      ))}
    </Dialog>
  );
}
