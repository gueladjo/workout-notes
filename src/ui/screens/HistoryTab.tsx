import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDb, useQuery } from '@/app/db-context';
import { useSettings } from '@/app/hooks';
import { copySets, exerciseHistory, getWorkout, updateSet } from '@/db/repo/workouts';
import type { ExerciseWithCategory, TrainingSetWithComment } from '@/db/types';
import { formatSet, formatWeightValue, weightUnitFor } from '@/ui/format';
import { formatLongDate, formatDuration } from '@/domain/dates';
import { estimatedOneRepMax } from '@/domain/records';
import { exerciseTypeHas } from '@/db/constants';
import { fmt, metresToDisplay, resolveDistanceUnit, distanceUnitShort, speed, paceSecondsPerUnit } from '@/domain/units';
import { Icon } from '@/ui/components/Icon';
import { Dialog } from '@/ui/components/Dialog';
import { Button } from '@/ui/components/Button';
import { WorkoutView } from '@/ui/components/WorkoutView';
import { SetSelectionDialog, SetEditor, type SelectableExercise, type SelectableSet } from '@/ui/components/SetSelectionDialog';
import { useToast } from '@/ui/components/Toast';
import { EmptyState } from '@/ui/components/EmptyState';

/** Training History tab: every past workout of the exercise, with quick stats and edit/copy actions. */
export function HistoryTab({ exercise, date, readOnly }: { exercise: ExerciseWithCategory; date: string; readOnly?: boolean }) {
  const db = useDb();
  const navigate = useNavigate();
  const toast = useToast();
  const settings = useSettings();
  const history = useQuery((d) => exerciseHistory(d, exercise.id), [exercise.id]);
  const wu = weightUnitFor(exercise, settings);
  const [dayDialog, setDayDialog] = useState<string | null>(null);
  const [setDialog, setSetDialog] = useState<TrainingSetWithComment | null>(null);
  const [viewDate, setViewDate] = useState<string | null>(null);
  const [copyDate, setCopyDate] = useState<string | null>(null);
  const [editDate, setEditDate] = useState<string | null>(null);
  const viewWorkout = useQuery((d) => (viewDate ? getWorkout(d, viewDate) : null), [viewDate]);

  const daySets = history.find((h) => h.date === dayDialog)?.sets ?? [];
  const isStrength = exerciseTypeHas(exercise.typeId, 'weight') && exerciseTypeHas(exercise.typeId, 'reps');
  const isCardio = exerciseTypeHas(exercise.typeId, 'distance') && exerciseTypeHas(exercise.typeId, 'time');

  const copySelectable: SelectableExercise[] = useMemo(() => {
    const src = history.find((h) => h.date === copyDate);
    if (!src) return [];
    return [{ exercise, sets: src.sets.map((s) => ({ key: String(s.id), metricWeight: s.metricWeight, reps: s.reps, distanceMetres: s.distanceMetres, durationSeconds: s.durationSeconds, unit: s.unit })) }];
  }, [history, copyDate, exercise]);

  if (history.length === 0) return <EmptyState title="No history yet" message="Sets you record will appear here, grouped by workout." />;

  return (
    <div className="screen__content">
      <div className="container">
        <div className="list">
          {history.map((h) => (
            <div key={h.date}>
              <button className="history-date" onClick={() => setDayDialog(h.date)}>
                <span style={{ flex: 1 }}>{formatLongDate(h.date)}</span>
                {h.date === date && <span className="chip chip--active">Current</span>}
              </button>
              {h.sets.map((s, i) => (
                <div key={s.id}>
                  <button className="set-row" onClick={() => setSetDialog(s)}>
                    <span className="set-row__index">{i + 1}</span>
                    <span className="set-row__value">{formatSet(s, exercise.typeId, wu, settings)}</span>
                    {s.comment && <Icon name="comment" size={18} className="faint" />}
                    {s.isPersonalRecord && settings.trackPersonalRecords && <Icon name="trophy" size={18} className="trophy" />}
                  </button>
                  {s.comment && <div className="set-row__comment">{s.comment}</div>}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Workout-day quick stats */}
      <Dialog
        open={dayDialog !== null}
        onClose={() => setDayDialog(null)}
        title={dayDialog ? formatLongDate(dayDialog) : ''}
        actions={
          <>
            <Button variant="text" onClick={() => { setViewDate(dayDialog); setDayDialog(null); }}>
              View Workout
            </Button>
            {!readOnly && (
              <>
                <Button variant="text" onClick={() => { setEditDate(dayDialog); setDayDialog(null); }}>
                  Edit Sets
                </Button>
                <Button variant="text" onClick={() => { setCopyDate(dayDialog); setDayDialog(null); }}>
                  Copy Sets
                </Button>
              </>
            )}
          </>
        }
      >
        <div className="stack">
          <div className="row row--between"><span className="muted">Sets</span><b>{daySets.length}</b></div>
          {isStrength && (
            <>
              <div className="row row--between"><span className="muted">Total Volume</span><b>{formatWeightValue(daySets.reduce((a, s) => a + s.metricWeight * s.reps, 0), wu)}</b></div>
              <div className="row row--between"><span className="muted">Total Reps</span><b>{daySets.reduce((a, s) => a + s.reps, 0)}</b></div>
            </>
          )}
          {isCardio && (
            <>
              <div className="row row--between"><span className="muted">Total Distance</span><b>{formatDist(daySets.reduce((a, s) => a + s.distanceMetres, 0), daySets[0]?.unit ?? 0, settings.metric)}</b></div>
              <div className="row row--between"><span className="muted">Total Duration</span><b>{formatDuration(daySets.reduce((a, s) => a + s.durationSeconds, 0))}</b></div>
            </>
          )}
        </div>
      </Dialog>

      {/* Single-set quick stats */}
      <Dialog
        open={setDialog !== null}
        onClose={() => setSetDialog(null)}
        title={setDialog ? formatSet(setDialog, exercise.typeId, wu, settings) : ''}
        actions={
          !readOnly && (
            <>
              <Button variant="text" onClick={() => { const s = setDialog; setSetDialog(null); if (s) setEditDate(s.date); }}>
                Edit Set
              </Button>
              <Button
                variant="text"
                onClick={() => {
                  if (setDialog) {
                    copySets(db, [{ exerciseId: exercise.id, metricWeight: setDialog.metricWeight, reps: setDialog.reps, distanceMetres: setDialog.distanceMetres, durationSeconds: setDialog.durationSeconds, unit: setDialog.unit }], date);
                    toast('Set copied to current workout');
                  }
                  setSetDialog(null);
                }}
              >
                Copy Set
              </Button>
            </>
          )
        }
      >
        {setDialog && (
          <div className="stack">
            <div className="muted">{formatLongDate(setDialog.date)}</div>
            {isStrength && (
              <>
                <div className="row row--between"><span className="muted">Estimated 1RM</span><b>{formatWeightValue(estimatedOneRepMax(setDialog.metricWeight, setDialog.reps), wu)}</b></div>
                <div className="row row--between"><span className="muted">Volume</span><b>{formatWeightValue(setDialog.metricWeight * setDialog.reps, wu)}</b></div>
              </>
            )}
            {isCardio && setDialog.durationSeconds > 0 && (
              <>
                <div className="row row--between"><span className="muted">Speed</span><b>{fmt(speed(setDialog.distanceMetres, setDialog.durationSeconds, resolveDistanceUnit(setDialog.unit, settings.metric)), 2)} {distanceUnitShort(resolveDistanceUnit(setDialog.unit, settings.metric))}/h</b></div>
                <div className="row row--between"><span className="muted">Pace</span><b>{formatDuration(paceSecondsPerUnit(setDialog.distanceMetres, setDialog.durationSeconds, resolveDistanceUnit(setDialog.unit, settings.metric)))} /{distanceUnitShort(resolveDistanceUnit(setDialog.unit, settings.metric))}</b></div>
              </>
            )}
            {setDialog.comment && <div className="set-row__comment" style={{ padding: 0 }}>{setDialog.comment}</div>}
          </div>
        )}
      </Dialog>

      {/* View full workout */}
      <Dialog open={viewDate !== null} onClose={() => setViewDate(null)} title={viewDate ? formatLongDate(viewDate) : ''} flush wide actions={<Button variant="text" onClick={() => setViewDate(null)}>Close</Button>}>
        {viewWorkout && <WorkoutView workout={viewWorkout} onExerciseClick={(id) => { setViewDate(null); navigate(`/exercise/${id}/overview?date=${viewDate}`); }} />}
      </Dialog>

      {/* Copy sets from a past workout */}
      <SetSelectionDialog
        open={copyDate !== null}
        onClose={() => setCopyDate(null)}
        title={copyDate ? `Copy sets from ${formatLongDate(copyDate)}` : ''}
        exercises={copySelectable}
        confirmLabel="Copy"
        onConfirm={(sel) => {
          copySets(db, sel.map(({ set }) => ({ exerciseId: exercise.id, ...set })), date);
          toast(`Copied ${sel.length} set${sel.length === 1 ? '' : 's'}`);
        }}
      />

      {/* Edit sets of a past workout */}
      <EditSetsDialog open={editDate !== null} onClose={() => setEditDate(null)} exercise={exercise} sets={history.find((h) => h.date === editDate)?.sets ?? []} date={editDate} />
    </div>
  );
}

function formatDist(metres: number, unit: number, metric: boolean): string {
  const du = resolveDistanceUnit(unit, metric);
  return `${fmt(metresToDisplay(metres, du))} ${distanceUnitShort(du)}`;
}

/** Edit multiple sets of one workout day at once. */
export function EditSetsDialog({ open, onClose, exercise, sets, date }: { open: boolean; onClose: () => void; exercise: ExerciseWithCategory; sets: TrainingSetWithComment[]; date: string | null }) {
  const db = useDb();
  const settings = useSettings();
  const toast = useToast();
  const wu = weightUnitFor(exercise, settings);
  const [edits, setEdits] = useState<Map<number, SelectableSet>>(new Map());
  const [seen, setSeen] = useState(false);
  if (open && !seen) { setSeen(true); setEdits(new Map()); }
  if (!open && seen) setSeen(false);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={date ? `Edit sets · ${formatLongDate(date)}` : 'Edit sets'}
      wide
      actions={
        <>
          <Button variant="text" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => {
              for (const [id, v] of edits) updateSet(db, id, { metricWeight: v.metricWeight, reps: v.reps, distanceMetres: v.distanceMetres, durationSeconds: v.durationSeconds, unit: v.unit });
              toast('Sets updated');
              onClose();
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="stack">
        {sets.map((s, i) => (
          <div key={s.id} className="row">
            <span className="set-row__index">{i + 1}</span>
            <SetEditor typeId={exercise.typeId} value={edits.get(s.id) ?? { key: String(s.id), metricWeight: s.metricWeight, reps: s.reps, distanceMetres: s.distanceMetres, durationSeconds: s.durationSeconds, unit: s.unit }} weightUnit={wu} metric={settings.metric} onChange={(v) => setEdits((m) => new Map(m).set(s.id, v))} />
          </div>
        ))}
      </div>
    </Dialog>
  );
}
