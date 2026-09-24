import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useDb, useQuery } from '@/app/db-context';
import { useRouteDate, useSettings } from '@/app/hooks';
import { getExercise } from '@/db/repo/exercises';
import { allSetsForExercise, getWorkout } from '@/db/repo/workouts';
import { createGoal, deleteGoal, listGoals, updateGoal, type GoalInput } from '@/db/repo/goals';
import { updateSettings } from '@/db/repo/settings';
import { GOAL_TYPE_LABELS, GoalType, exerciseTypeHas } from '@/db/constants';
import type { ExerciseWithCategory, Goal, TrainingSet } from '@/db/types';
import { actualRepMaxes, estimatedRepMaxes } from '@/domain/records';
import { exerciseStats, goalProgress, goalTypesForExercise } from '@/domain/stats';
import {
  addDays,
  endOfMonth,
  endOfYear,
  formatLongDate,
  formatShortDate,
  startOfMonth,
  startOfWeek,
  startOfYear,
  todayIso,
  formatDuration,
  joinDuration,
  splitDuration,
  EMPTY_DURATION,
  type DurationParts,
} from '@/domain/dates';
import {
  displayToKg,
  displayToMetres,
  distanceUnitShort,
  kgToDisplay,
  metresToDisplay,
  resolveDistanceUnit,
  fmt,
} from '@/domain/units';
import { formatSet, formatStatValue, formatWeightValue, parseDecimal, weightUnitFor } from '@/ui/format';
import { TopBar } from '@/ui/components/TopBar';
import { Tabs } from '@/ui/components/Tabs';
import { Button, IconButton } from '@/ui/components/Button';
import { Dialog, ConfirmDialog } from '@/ui/components/Dialog';
import { DurationInputs } from '@/ui/components/DurationInputs';
import { WorkoutView } from '@/ui/components/WorkoutView';
import { EmptyState } from '@/ui/components/EmptyState';
import { Icon } from '@/ui/components/Icon';
import { useToast } from '@/ui/components/Toast';

type Tab = 'records' | 'stats' | 'goals';

/** Records / Stats / Goals screen for one exercise. */
export function RecordsScreen() {
  const id = Number(useParams().id);
  const exercise = useQuery((d) => getExercise(d, id), [id]);
  const date = useRouteDate();
  const [search, setSearch] = useSearchParams();
  const tab = (search.get('tab') as Tab) || 'records';
  if (!exercise) return <div className="empty">Exercise not found.</div>;
  return (
    <div className="screen">
      <TopBar back title={exercise.name} subtitle="Records · Stats · Goals" />
      <RecordsTabs
        exercise={exercise}
        date={date}
        tab={tab}
        onTab={(t) =>
          setSearch(
            (p) => {
              p.set('tab', t);
              return p;
            },
            { replace: true },
          )
        }
      />
    </div>
  );
}

export function RecordsTabs({
  exercise,
  date,
  tab,
  onTab,
}: {
  exercise: ExerciseWithCategory;
  date: string;
  tab: Tab;
  onTab: (t: Tab) => void;
}) {
  return (
    <>
      <Tabs
        tabs={[
          { id: 'records', label: 'Records' },
          { id: 'stats', label: 'Stats' },
          { id: 'goals', label: 'Goals' },
        ]}
        value={tab}
        onChange={onTab}
      />
      {tab === 'records' && <RecordsTab exercise={exercise} />}
      {tab === 'stats' && <StatsTab exercise={exercise} date={date} />}
      {tab === 'goals' && <GoalsTab exercise={exercise} />}
    </>
  );
}

export function RecordsTab({ exercise }: { exercise: ExerciseWithCategory }) {
  const db = useDb();
  const navigate = useNavigate();
  const [search, setSearch] = useSearchParams();
  const settings = useSettings();
  const sets = useQuery((d) => allSetsForExercise(d, exercise.id), [exercise.id]);
  const [mode, setMode] = useState<'estimated' | 'actual'>('actual');
  const [limitOpen, setLimitOpen] = useState(false);
  // The rep count whose record history dialog is open lives in the URL (`?reps=N`) so the trophy on
  // a set row (Training) opens it directly; closing the dialog removes the param again.
  const historyReps = Number(search.get('reps')) || null;
  const setHistoryReps = (reps: number | null) =>
    setSearch(
      (p) => {
        if (reps === null) p.delete('reps');
        else p.set('reps', String(reps));
        return p;
      },
      { replace: true },
    );
  const wu = weightUnitFor(exercise, settings);
  const strength = exerciseTypeHas(exercise.typeId, 'weight') && exerciseTypeHas(exercise.typeId, 'reps');
  const setLike = useMemo(
    () => sets.map((s) => ({ id: s.id, date: s.date, weight: s.metricWeight, reps: s.reps })),
    [sets],
  );
  const actual = useMemo(() => actualRepMaxes(setLike), [setLike]);
  const estimated = useMemo(
    () => estimatedRepMaxes(setLike, settings.estimated1rmMaxReps || null),
    [setLike, settings.estimated1rmMaxReps],
  );
  if (!strength)
    return (
      <EmptyState title="No records" message="Personal records are tracked for Weight and Reps exercises." />
    );
  if (sets.length === 0)
    return <EmptyState title="No records yet" message="Log some sets to see your rep maxes." />;

  const prHistory = historyReps !== null ? personalRecordHistory(sets, historyReps) : [];

  return (
    <div className="screen__content">
      <div className="row" style={{ padding: '10px 12px 0', gap: 6 }}>
        <div className="row" style={{ flex: 1, gap: 6 }}>
          <button
            className={`chip${mode === 'actual' ? ' chip--active' : ''}`}
            onClick={() => setMode('actual')}
          >
            Actual
          </button>
          <button
            className={`chip${mode === 'estimated' ? ' chip--active' : ''}`}
            onClick={() => setMode('estimated')}
          >
            Estimated
          </button>
        </div>
        {mode === 'estimated' && (
          <IconButton icon="settings" label="Estimated 1RM settings" onClick={() => setLimitOpen(true)} />
        )}
      </div>
      <div className="container">
        {mode === 'estimated' ? (
          <div className="list">
            <div className="stat-row" style={{ background: 'var(--color-surface-2)' }}>
              <span>Estimated 1RM</span>
              <span className="stat-row__value">{formatWeightValue(estimated.oneRepMax, wu)}</span>
            </div>
            {estimated.source && (
              <div className="stat-row" style={{ fontSize: 13 }}>
                <span className="muted">
                  Based on{' '}
                  {formatSet(
                    sets.find((s) => s.id === estimated.source!.id)!,
                    exercise.typeId,
                    wu,
                    settings,
                  )}
                </span>
                <span className="stat-row__date">{formatShortDate(estimated.source.date)}</span>
              </div>
            )}
            {estimated.rows.slice(1).map((r) => (
              <div key={r.reps} className="stat-row">
                <span>{r.reps}RM</span>
                <span className="stat-row__value">{formatWeightValue(r.weight, wu)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="list">
            {actual.map((r) => (
              <button
                key={r.reps}
                className={`stat-row${r.superseded ? ' rm-row--faded' : ''}`}
                onClick={() => setHistoryReps(r.reps)}
              >
                <span>{r.reps}RM</span>
                <span style={{ textAlign: 'right' }}>
                  <div className="stat-row__value">{formatWeightValue(r.weight, wu)}</div>
                  {r.set && (
                    <div className="stat-row__date">
                      {formatShortDate(r.set.date)}
                      {r.superseded ? ` · ${r.set.reps} reps` : ''}
                    </div>
                  )}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      <Dialog
        open={limitOpen}
        onClose={() => setLimitOpen(false)}
        title="Estimated 1RM"
        actions={
          <Button variant="text" onClick={() => setLimitOpen(false)}>
            Done
          </Button>
        }
      >
        <label className="field">
          <span className="field__label">Ignore sets with more reps than</span>
          <select
            className="select"
            value={settings.estimated1rmMaxReps}
            onChange={(e) => updateSettings(db, { estimated1rmMaxReps: Number(e.target.value) })}
          >
            <option value={0}>Include all sets</option>
            {[5, 6, 8, 10, 12, 15, 20].map((n) => (
              <option key={n} value={n}>
                {n} reps
              </option>
            ))}
          </select>
        </label>
        <p className="muted" style={{ fontSize: 13 }}>
          High-rep sets make the Brzycki formula less accurate; 10–12 reps is a reasonable limit.
        </p>
      </Dialog>
      <Dialog
        open={historyReps !== null}
        onClose={() => setHistoryReps(null)}
        title={`${historyReps}RM history`}
        flush
        actions={
          <Button variant="text" onClick={() => setHistoryReps(null)}>
            Close
          </Button>
        }
      >
        {prHistory.map((s) => (
          <button
            key={s.id}
            className="stat-row"
            onClick={() => {
              setHistoryReps(null);
              navigate(`/exercise/${exercise.id}/overview?date=${s.date}`);
            }}
          >
            <span>{formatShortDate(s.date)}</span>
            <span className="stat-row__value">{formatWeightValue(s.metricWeight, wu)}</span>
          </button>
        ))}
      </Dialog>
    </div>
  );
}

/** Successive personal records for a rep count: each set that beat the previous best. */
function personalRecordHistory(sets: TrainingSet[], reps: number): TrainingSet[] {
  const out: TrainingSet[] = [];
  let best = -1;
  for (const s of sets) {
    if (s.reps !== reps) continue;
    if (s.metricWeight > best) {
      best = s.metricWeight;
      out.push(s);
    }
  }
  return out.reverse();
}

export function StatsTab({ exercise, date }: { exercise: ExerciseWithCategory; date: string }) {
  const navigate = useNavigate();
  const settings = useSettings();
  const sets = useQuery((d) => allSetsForExercise(d, exercise.id), [exercise.id]);
  const [period, setPeriod] = useState<'workout' | 'week' | 'month' | 'year' | 'all' | 'custom'>('all');
  const [anchor, setAnchor] = useState(date);
  const [customFrom, setCustomFrom] = useState(addDays(todayIso(), -30));
  const [customTo, setCustomTo] = useState(todayIso());
  const [viewDate, setViewDate] = useState<string | null>(null);
  const viewWorkout = useQuery((d) => (viewDate ? getWorkout(d, viewDate) : null), [viewDate]);
  const wu = weightUnitFor(exercise, settings);
  const workoutDates = useMemo(() => [...new Set(sets.map((s) => s.date))].sort().reverse(), [sets]);
  // The Workout period shows and computes the same date: the anchor (the viewed date, or one
  // picked under another period) when this exercise was trained that day, else the latest workout.
  const workoutDate = workoutDates.includes(anchor) ? anchor : (workoutDates[0] ?? anchor);

  const range = useMemo((): [string, string] => {
    switch (period) {
      case 'workout':
        return [workoutDate, workoutDate];
      case 'week': {
        const from = startOfWeek(anchor, (((settings.firstDayOfWeek - 1) % 7) + 7) % 7);
        return [from, addDays(from, 6)];
      }
      case 'month':
        return [startOfMonth(anchor), endOfMonth(anchor)];
      case 'year':
        return [startOfYear(anchor), endOfYear(anchor)];
      case 'custom':
        return [customFrom, customTo];
      default:
        return ['0000-00-00', '9999-99-99'];
    }
  }, [period, anchor, workoutDate, customFrom, customTo, settings.firstDayOfWeek]);
  const filtered = useMemo(() => sets.filter((s) => s.date >= range[0] && s.date <= range[1]), [sets, range]);
  const stats = useMemo(() => exerciseStats(filtered, exercise.typeId), [filtered, exercise.typeId]);

  return (
    <div className="screen__content">
      <div className="container">
        <div className="grid-2" style={{ marginBottom: 12 }}>
          <label className="field" style={{ marginBottom: 0 }}>
            <span className="field__label">Period</span>
            <select
              className="select"
              value={period}
              onChange={(e) => setPeriod(e.target.value as typeof period)}
            >
              <option value="workout">Workout</option>
              <option value="week">Week</option>
              <option value="month">Month</option>
              <option value="year">Year</option>
              <option value="all">All</option>
              <option value="custom">Custom</option>
            </select>
          </label>
          {period === 'workout' ? (
            <label className="field" style={{ marginBottom: 0 }}>
              <span className="field__label">Date</span>
              <select className="select" value={workoutDate} onChange={(e) => setAnchor(e.target.value)}>
                {workoutDates.map((d) => (
                  <option key={d} value={d}>
                    {formatShortDate(d)}
                  </option>
                ))}
              </select>
            </label>
          ) : period === 'custom' ? (
            <div className="field" style={{ marginBottom: 0 }}>
              <span className="field__label">Range</span>
              <div className="row">
                <input
                  className="input"
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                />
                <input
                  className="input"
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                />
              </div>
            </div>
          ) : period !== 'all' ? (
            <label className="field" style={{ marginBottom: 0 }}>
              <span className="field__label">Date</span>
              <input
                className="input"
                type="date"
                value={anchor}
                onChange={(e) => e.target.value && setAnchor(e.target.value)}
              />
            </label>
          ) : null}
        </div>
        {period !== 'all' && (
          <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
            {formatShortDate(range[0])} – {formatShortDate(range[1])}
          </div>
        )}
        <div className="list">
          {stats.map((s) => (
            <button
              key={s.label}
              className="stat-row"
              disabled={!s.date}
              onClick={() => s.date && setViewDate(s.date)}
            >
              <span>{s.label}</span>
              <span style={{ textAlign: 'right' }}>
                <div className="stat-row__value">{formatStatValue(s.value, s.kind, wu, settings)}</div>
                {s.date && <div className="stat-row__date">{formatShortDate(s.date)}</div>}
              </span>
            </button>
          ))}
        </div>
      </div>
      <Dialog
        open={viewDate !== null}
        onClose={() => setViewDate(null)}
        title={viewDate ? formatLongDate(viewDate) : ''}
        flush
        holo
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
    </div>
  );
}

export function GoalsTab({ exercise }: { exercise: ExerciseWithCategory }) {
  const db = useDb();
  const settings = useSettings();
  const goals = useQuery((d) => listGoals(d, exercise.id), [exercise.id]);
  const sets = useQuery((d) => allSetsForExercise(d, exercise.id), [exercise.id]);
  const [editing, setEditing] = useState<Goal | 'new' | null>(null);
  const [confirm, setConfirm] = useState<number | null>(null);
  const wu = weightUnitFor(exercise, settings);
  return (
    <div className="screen__content">
      <div className="container">
        {goals.length === 0 && (
          <EmptyState title="No goals yet" message="Add a goal to track your progress towards it." />
        )}
        <div className="stack">
          {goals.map((g) => {
            const p = goalProgress(g, sets);
            return (
              <button
                key={g.id}
                className="card"
                style={{ padding: 14, textAlign: 'left', width: '100%', marginBottom: 0 }}
                onClick={() => setEditing(g)}
              >
                <div className="row row--between">
                  <b>{g.title || GOAL_TYPE_LABELS[g.typeId as keyof typeof GOAL_TYPE_LABELS] || 'Goal'}</b>
                  {p.achieved && <Icon name="trophy" className="trophy" />}
                </div>
                <div className="muted" style={{ fontSize: 13 }}>
                  {GOAL_TYPE_LABELS[g.typeId as keyof typeof GOAL_TYPE_LABELS]}:{' '}
                  {goalTargetText(g, wu, settings.metric)}
                  {g.targetDate ? ` by ${formatShortDate(g.targetDate)}` : ''}
                </div>
                <div className="progress">
                  <div
                    className={`progress__bar${p.achieved ? ' progress__bar--done' : ''}`}
                    style={{ width: `${Math.round(p.fraction * 100)}%` }}
                  />
                </div>
                <div className="row row--between" style={{ fontSize: 13, marginTop: 4 }}>
                  <span>{formatStatValue(p.current, p.kind, wu, settings)}</span>
                  <span className="muted">{Math.round(p.fraction * 100)}%</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <button className="fab" aria-label="Add goal" onClick={() => setEditing('new')}>
        <Icon name="add" size={28} />
      </button>
      <GoalEditor
        open={editing !== null}
        onClose={() => setEditing(null)}
        exercise={exercise}
        goal={editing === 'new' ? null : editing}
        onSave={(input) =>
          editing === 'new' ? createGoal(db, input) : editing && updateGoal(db, editing.id, input)
        }
        onDelete={() => editing && editing !== 'new' && setConfirm(editing.id)}
      />
      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title="Delete goal?"
        confirmLabel="Delete"
        danger
        onConfirm={() => {
          if (confirm !== null) deleteGoal(db, confirm);
          setEditing(null);
        }}
      />
    </div>
  );
}

function goalTargetText(g: Goal, wu: 'kg' | 'lbs', metric: boolean): string {
  const du = resolveDistanceUnit(g.unit, metric);
  switch (g.typeId) {
    case GoalType.MAX_WEIGHT_AND_REPS:
      return `${fmt(kgToDisplay(g.metricWeight, wu))} ${wu} × ${g.reps}`;
    case GoalType.MAX_REPS:
    case GoalType.TOTAL_REPS:
    case GoalType.MAX_WORKOUT_REPS:
      return `${g.reps} reps`;
    case GoalType.MAX_DISTANCE:
    case GoalType.TOTAL_DISTANCE:
    case GoalType.MAX_WORKOUT_DISTANCE:
      return `${fmt(metresToDisplay(g.distanceMetres, du))} ${distanceUnitShort(du)}`;
    case GoalType.MAX_DURATION:
    case GoalType.TOTAL_DURATION:
    case GoalType.MAX_WORKOUT_DURATION:
      return formatDuration(g.durationSeconds);
    default:
      return `${fmt(kgToDisplay(g.metricWeight, wu))} ${wu}`;
  }
}

function GoalEditor({
  open,
  onClose,
  exercise,
  goal,
  onSave,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  exercise: ExerciseWithCategory;
  goal: Goal | null;
  onSave: (g: GoalInput) => void;
  onDelete: () => void;
}) {
  const settings = useSettings();
  const toast = useToast();
  const wu = weightUnitFor(exercise, settings);
  const types = goalTypesForExercise(exercise.typeId);
  // One unit for the field, its label and the saved row: the goal's own, so editing it after a
  // change of unit system (or an imported goal in another unit) keeps the distance it had.
  const du = resolveDistanceUnit(goal?.unit ?? 0, settings.metric);
  const [typeId, setTypeId] = useState<number>(types[0] ?? 0);
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const [distance, setDistance] = useState('');
  const [time, setTime] = useState<DurationParts>(EMPTY_DURATION);
  const [title, setTitle] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [startDate, setStartDate] = useState('');
  const [seen, setSeen] = useState(false);
  // The weight and distance fields show rounded text; remember it so a field the user did not
  // touch saves the stored value back exactly instead of its rounding.
  const [shown, setShown] = useState({ weight: '', distance: '' });
  if (open && !seen) {
    setSeen(true);
    const weightText = goal?.metricWeight ? fmt(kgToDisplay(goal.metricWeight, wu)) : '';
    const distanceText = goal?.distanceMetres ? fmt(metresToDisplay(goal.distanceMetres, du)) : '';
    setShown({ weight: weightText, distance: distanceText });
    setTypeId(goal?.typeId ?? types[0] ?? 0);
    setWeight(weightText);
    setReps(goal?.reps ? String(goal.reps) : '');
    setDistance(distanceText);
    setTime(splitDuration(goal?.durationSeconds ?? 0));
    setTitle(goal?.title ?? '');
    setTargetDate(goal?.targetDate ?? '');
    setStartDate(goal?.startDate ?? '');
  }
  if (!open && seen) setSeen(false);
  const needsWeight = [
    GoalType.MAX_WEIGHT,
    GoalType.TOTAL_VOLUME,
    GoalType.MAX_WEIGHT_AND_REPS,
    GoalType.ESTIMATED_1RM,
    GoalType.MAX_VOLUME,
    GoalType.MAX_WORKOUT_VOLUME,
  ].includes(typeId as never);
  const needsReps = [
    GoalType.MAX_REPS,
    GoalType.TOTAL_REPS,
    GoalType.MAX_WEIGHT_AND_REPS,
    GoalType.MAX_WORKOUT_REPS,
  ].includes(typeId as never);
  const needsDistance = [
    GoalType.MAX_DISTANCE,
    GoalType.TOTAL_DISTANCE,
    GoalType.MAX_WORKOUT_DISTANCE,
  ].includes(typeId as never);
  const needsTime = [GoalType.MAX_DURATION, GoalType.TOTAL_DURATION, GoalType.MAX_WORKOUT_DURATION].includes(
    typeId as never,
  );
  const save = () => {
    // A goal is its target: each field the type needs must hold a positive number. Anything else is
    // refused like a malformed set on the Track tab, instead of a typo or an emptied field saving
    // a target of 0 (unreachable, see goalProgress) over the one the goal had.
    const w = parseDecimal(weight);
    const r = Math.round(parseDecimal(reps)); // what is stored; 0.4 must not pass as "positive"
    const d = parseDecimal(distance);
    const t = joinDuration(time);
    const invalid = (needed: boolean, n: number) => needed && !(Number.isFinite(n) && n > 0);
    if (
      invalid(needsWeight, w) ||
      invalid(needsReps, r) ||
      invalid(needsDistance, d) ||
      invalid(needsTime, t)
    ) {
      toast('Please enter valid values');
      return;
    }
    onSave({
      typeId,
      exerciseId: exercise.id,
      metricWeight: !needsWeight
        ? 0
        : goal && weight === shown.weight
          ? goal.metricWeight
          : displayToKg(w, wu),
      reps: needsReps ? r : 0,
      distanceMetres: !needsDistance
        ? 0
        : goal && distance === shown.distance
          ? goal.distanceMetres
          : displayToMetres(d, du),
      durationSeconds: needsTime ? t : 0,
      unit: needsDistance ? du : 0,
      title: title.trim() || null,
      targetDate: targetDate || null,
      startDate: startDate || null,
    });
    onClose();
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={goal ? 'Edit Goal' : 'New Goal'}
      actions={
        <>
          {goal && (
            <Button variant="danger-text" onClick={onDelete}>
              Delete
            </Button>
          )}
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Save</Button>
        </>
      }
    >
      <label className="field">
        <span className="field__label">Type</span>
        <select className="select" value={typeId} onChange={(e) => setTypeId(Number(e.target.value))}>
          {types.map((t) => (
            <option key={t} value={t}>
              {GOAL_TYPE_LABELS[t as keyof typeof GOAL_TYPE_LABELS]}
            </option>
          ))}
        </select>
      </label>
      <div className="grid-2">
        {needsWeight && (
          <label className="field">
            <span className="field__label">Weight ({wu})</span>
            <input
              className="input"
              inputMode="decimal"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
          </label>
        )}
        {needsReps && (
          <label className="field">
            <span className="field__label">Reps</span>
            <input
              className="input"
              inputMode="numeric"
              value={reps}
              onChange={(e) => setReps(e.target.value)}
            />
          </label>
        )}
        {needsDistance && (
          <label className="field">
            <span className="field__label">Distance ({distanceUnitShort(du)})</span>
            <input
              className="input"
              inputMode="decimal"
              value={distance}
              onChange={(e) => setDistance(e.target.value)}
            />
          </label>
        )}
        {needsTime && (
          <div className="field field--wide">
            <span className="field__label">Time</span>
            <DurationInputs value={time} onChange={setTime} className="duration" inputClassName="input" />
          </div>
        )}
      </div>
      <label className="field">
        <span className="field__label">Title (optional)</span>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <div className="grid-2">
        <label className="field">
          <span className="field__label">Start date</span>
          <input
            className="input"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field__label">Target date</span>
          <input
            className="input"
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
          />
        </label>
      </div>
    </Dialog>
  );
}
