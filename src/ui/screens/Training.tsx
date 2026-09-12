import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useDb, useQuery } from '@/app/db-context';
import { useSettings } from '@/app/hooks';
import { getExercise } from '@/db/repo/exercises';
import { addSet, deleteSet, getWorkout, listSets, previousWorkoutSets, reorderSets, setSetComplete, updateSet } from '@/db/repo/workouts';
import { setSetComment } from '@/db/repo/comments';
import { groupForExercise, type GroupWithExercises } from '@/db/repo/groups';
import type { Settings } from '@/db/repo/settings';
import { exerciseTypeFields } from '@/db/constants';
import { formatSet, weightUnitFor } from '@/ui/format';
import { displayToKg, displayToMetres, kgToDisplay, metresToDisplay, resolveDistanceUnit, ALL_DISTANCE_UNITS, distanceUnitShort, type WeightUnit } from '@/domain/units';
import { formatDuration, parseDuration, formatShortDate } from '@/domain/dates';
import { androidColourToHex } from '@/domain/colour';
import { TopBar } from '@/ui/components/TopBar';
import { Button, IconButton } from '@/ui/components/Button';
import { Icon } from '@/ui/components/Icon';
import { MenuButton } from '@/ui/components/Menu';
import { Tabs } from '@/ui/components/Tabs';
import { NumberField, formatNumber } from '@/ui/components/NumberField';
import { Checkbox } from '@/ui/components/Toggle';
import { Dialog } from '@/ui/components/Dialog';
import { useToast } from '@/ui/components/Toast';
import { CommentDialog } from './Home';
import { HistoryTab } from './HistoryTab';
import { GraphTab } from './GraphTab';
import { OneRepMaxDialog } from './Calculators';
import { GroupDialog } from './GroupDialog';
import type { ExerciseWithCategory, TrainingSetWithComment, Workout } from '@/db/types';

type Tab = 'track' | 'history' | 'graph';

/**
 * Training Screen: Track / History / Graph tabs for one exercise on one date, with the navigation
 * panel (drawer), set comments, supersets and the 1RM calculator.
 */
export function TrainingScreen() {
  const navigate = useNavigate();
  const params = useParams();
  const [search, setSearch] = useSearchParams();
  const date = params.date!;
  const exerciseId = Number(params.exerciseId);
  const exercise = useQuery((d) => getExercise(d, exerciseId), [exerciseId]);
  const tab = (search.get('tab') as Tab) || 'track';
  const setTab = (t: Tab) => setSearch({ tab: t }, { replace: true });
  const [drawer, setDrawer] = useState(false);
  const [showGroups, setShowGroups] = useState(false);
  const [oneRmSignal, setOneRmSignal] = useState(0);

  if (!exercise) return <div className="empty">Exercise not found.</div>;

  return (
    <div className="screen">
      <TopBar
        leadingIcon="menu"
        leadingLabel="Navigation panel"
        onLeading={() => setDrawer(true)}
        title={exercise.name}
        subtitle={formatShortDate(date)}
        actions={
          <>
            <IconButton icon="trophy" label="Records, stats and goals" onClick={() => navigate(`/exercise/${exerciseId}/records?date=${date}`)} />
            <IconButton icon="info" label="Exercise notes" onClick={() => navigate(`/exercise/${exerciseId}/notes`)} />
            <MenuButton
              items={[
                { label: '1RM Calculator', icon: 'calculator', onSelect: () => { setTab('track'); setOneRmSignal((n) => n + 1); } },
                { label: 'Edit Exercise', icon: 'edit', onSelect: () => navigate(`/exercise/${exerciseId}/edit?date=${date}`) },
                { label: 'Home', icon: 'home', onSelect: () => navigate(`/workout/${date}`) },
              ]}
            />
          </>
        }
      />
      <Tabs
        tabs={[
          { id: 'track', label: 'Track' },
          { id: 'history', label: 'History' },
          { id: 'graph', label: 'Graph' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'track' && <TrackTab key={`${exerciseId}:${date}`} exercise={exercise} date={date} oneRmSignal={oneRmSignal} />}
      {tab === 'history' && <HistoryTab exercise={exercise} date={date} />}
      {tab === 'graph' && <GraphTab exercise={exercise} />}
      {drawer && (
        <NavPanel
          date={date}
          currentExerciseId={exerciseId}
          onClose={() => setDrawer(false)}
          onGroups={() => {
            setDrawer(false);
            setShowGroups(true);
          }}
        />
      )}
      <GroupDialog open={showGroups} onClose={() => setShowGroups(false)} date={date} currentExerciseId={exerciseId} />
    </div>
  );
}

interface FieldValues {
  weight: string;
  reps: string;
  distance: string;
  distanceUnit: number;
  time: string;
}

function valuesFrom(
  s: { metricWeight: number; reps: number; distanceMetres: number; durationSeconds: number; unit: number } | undefined,
  wu: WeightUnit,
  settings: Settings,
): FieldValues {
  if (!s) return { weight: '', reps: '', distance: '', distanceUnit: resolveDistanceUnit(0, settings.metric), time: '' };
  const du = resolveDistanceUnit(s.unit, settings.metric);
  return {
    weight: formatNumber(kgToDisplay(s.metricWeight, wu)),
    reps: String(s.reps),
    distance: formatNumber(metresToDisplay(s.distanceMetres, du), 3),
    distanceUnit: du,
    time: s.durationSeconds ? formatDuration(s.durationSeconds) : '',
  };
}

/**
 * Track tab. Mounted with a key of exercise+date so its field state starts from the FitNotes
 * pre-fill rule (values of the first set of the last workout, or the last set logged today).
 */
function TrackTab({ exercise, date, oneRmSignal }: { exercise: ExerciseWithCategory; date: string; oneRmSignal: number }) {
  const db = useDb();
  const navigate = useNavigate();
  const toast = useToast();
  const settings = useSettings();
  const exerciseId = exercise.id;
  const sets = useQuery((d) => listSets(d, exerciseId, date), [exerciseId, date]);
  const previous = useQuery((d) => previousWorkoutSets(d, exerciseId, date), [exerciseId, date]);
  const group = useQuery((d) => groupForExercise(d, date, exerciseId), [exerciseId, date]);
  const workout = useQuery((d) => getWorkout(d, date), [date]);
  const fields = exerciseTypeFields(exercise.typeId);
  const wu = weightUnitFor(exercise, settings);
  const increment = exercise.weightIncrement ?? settings.weightIncrement;

  const [values, setValues] = useState<FieldValues>(() => valuesFrom(sets.length ? sets[sets.length - 1] : previous?.sets[0], wu, settings));
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [commentSet, setCommentSet] = useState<TrainingSetWithComment | null>(null);
  const [nextPrompt, setNextPrompt] = useState<number | null>(null);
  const [show1rm, setShow1rm] = useState(false);
  const [seenSignal, setSeenSignal] = useState(oneRmSignal);
  if (oneRmSignal !== seenSignal) {
    setSeenSignal(oneRmSignal);
    setShow1rm(true);
  }
  const set = (patch: Partial<FieldValues>) => setValues((v) => ({ ...v, ...patch }));

  const readValues = () => {
    const w = values.weight.trim() === '' ? 0 : Number(values.weight);
    const r = values.reps.trim() === '' ? 0 : Number(values.reps);
    const d = values.distance.trim() === '' ? 0 : Number(values.distance);
    const t = values.time.trim() === '' ? 0 : parseDuration(values.time);
    if ([w, r, d].some((n) => !Number.isFinite(n) || n < 0) || !Number.isFinite(t) || t < 0) {
      toast('Please enter valid values');
      return null;
    }
    const du = resolveDistanceUnit(values.distanceUnit, settings.metric);
    return {
      metricWeight: fields.includes('weight') ? displayToKg(w, wu) : 0,
      reps: fields.includes('reps') ? Math.round(r) : 0,
      distanceMetres: fields.includes('distance') ? displayToMetres(d, du) : 0,
      durationSeconds: fields.includes('time') ? Math.round(t) : 0,
      unit: fields.includes('distance') ? du : 0,
    };
  };

  const jumpWithinGroup = (g: GroupWithExercises | undefined) => {
    if (!g || !g.autoJumpEnabled || g.exerciseIds.length < 2) return;
    const i = g.exerciseIds.indexOf(exerciseId);
    const next = g.exerciseIds[(i + 1) % g.exerciseIds.length];
    if (next !== undefined && next !== exerciseId) navigate(`/train/${date}/${next}`, { replace: true });
  };

  const save = () => {
    const v = readValues();
    if (!v) return;
    addSet(db, { exerciseId, date, ...v });
    jumpWithinGroup(group);
  };
  const update = () => {
    const v = readValues();
    if (!v || selectedId === null) return;
    updateSet(db, selectedId, v);
    if (settings.autoSelectNextSet) {
      const i = sets.findIndex((s) => s.id === selectedId);
      const next = sets.slice(i + 1).find((s) => !s.isComplete);
      if (next) {
        setSelectedId(next.id);
        setValues(valuesFrom(next, wu, settings));
        return;
      }
    }
    setSelectedId(null);
  };
  const remove = () => {
    if (selectedId === null) return;
    deleteSet(db, selectedId);
    setSelectedId(null);
  };
  const clear = () => {
    setSelectedId(null);
    setValues(valuesFrom(undefined, wu, settings));
  };
  const select = (s: TrainingSetWithComment) => {
    if (selectedId === s.id) {
      setSelectedId(null);
      return;
    }
    setSelectedId(s.id);
    setValues(valuesFrom(s, wu, settings));
  };
  const toggleComplete = (s: TrainingSetWithComment) => {
    setSetComplete(db, s.id, !s.isComplete);
    if (s.isComplete) return;
    const allDone = sets.every((x) => x.id === s.id || x.isComplete);
    if (allDone) {
      const ids = workout.exercises.map((e) => e.exercise.id);
      const next = ids[ids.indexOf(exerciseId) + 1];
      if (next !== undefined) setNextPrompt(next);
    } else jumpWithinGroup(group);
  };
  const moveSet = (dir: -1 | 1) => {
    if (selectedId === null) return;
    const ids = sets.map((s) => s.id);
    const i = ids.indexOf(selectedId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    reorderSets(db, ids);
    setSelectedId(null); // ids change on reorder
  };
  const selectedIndex = sets.findIndex((s) => s.id === selectedId);

  return (
    <div className="screen__content">
      <div className="track-fields">
        {fields.includes('weight') && <NumberField label={`Weight (${wu})`} value={values.weight} onChange={(v) => set({ weight: v })} step={increment} name="weight" />}
        {fields.includes('reps') && <NumberField label="Reps" value={values.reps} onChange={(v) => set({ reps: v })} step={1} decimals={0} inputMode="numeric" name="reps" />}
      </div>
      {(fields.includes('distance') || fields.includes('time')) && (
        <div className="track-fields" style={{ paddingTop: 0 }}>
          {fields.includes('distance') && (
            <div className="numfield">
              <NumberField label="Distance" value={values.distance} onChange={(v) => set({ distance: v })} step={settings.metric ? 0.5 : 0.25} decimals={3} name="distance" />
              <select className="select" style={{ minHeight: 36, padding: '4px 8px' }} value={values.distanceUnit} onChange={(e) => set({ distanceUnit: Number(e.target.value) })} aria-label="Distance unit">
                {ALL_DISTANCE_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {distanceUnitShort(u)}
                  </option>
                ))}
              </select>
            </div>
          )}
          {fields.includes('time') && <DurationField value={values.time} onChange={(v) => set({ time: v })} />}
        </div>
      )}
      <div className="track-actions">
        {selectedId === null ? (
          <>
            <Button large onClick={save} data-testid="save-set">
              Save
            </Button>
            <Button large variant="outline" onClick={clear}>
              Clear
            </Button>
          </>
        ) : (
          <>
            <Button large onClick={update}>
              Update
            </Button>
            <Button large variant="danger" onClick={remove}>
              Delete
            </Button>
          </>
        )}
      </div>
      {selectedId !== null && sets.length > 1 && (
        <div className="row" style={{ justifyContent: 'center', gap: 4, paddingBottom: 6 }}>
          <span className="muted" style={{ fontSize: 13 }}>
            Set {selectedIndex + 1} of {sets.length}
          </span>
          <IconButton icon="arrowUp" label="Move set up" small disabled={selectedIndex <= 0} onClick={() => moveSet(-1)} />
          <IconButton icon="arrowDown" label="Move set down" small disabled={selectedIndex >= sets.length - 1} onClick={() => moveSet(1)} />
        </div>
      )}
      <div className="container" style={{ paddingTop: 0 }}>
        <div className="list" data-testid="set-list">
          {sets.length === 0 && (
            <div className="muted" style={{ padding: 16, textAlign: 'center' }}>
              {previous ? `Last workout: ${formatShortDate(previous.date)} · ${previous.sets.length} sets` : 'No sets yet. Enter your first set and tap Save.'}
            </div>
          )}
          {sets.map((s, i) => (
            <div key={s.id}>
              <div className={`set-row${s.id === selectedId ? ' set-row--selected' : ''}${s.isComplete && settings.markSetsComplete ? ' set-row--complete' : ''}`}>
                {settings.markSetsComplete && <Checkbox checked={s.isComplete} onChange={() => toggleComplete(s)} label="Set complete" />}
                <IconButton icon={s.comment ? 'comment' : 'commentOutline'} label={s.comment ? 'View comment' : 'Add comment'} small primary={!!s.comment} onClick={() => setCommentSet(s)} />
                <button className="set-row__value" style={{ textAlign: 'left' }} onClick={() => select(s)}>
                  <span className="set-row__index" style={{ display: 'inline-block', marginRight: 8 }}>
                    {i + 1}
                  </span>
                  {formatSet(s, exercise.typeId, wu, settings)}
                </button>
                {s.isPersonalRecord && settings.trackPersonalRecords && (
                  <IconButton icon="trophy" label="Personal record" small className="trophy" onClick={() => navigate(`/exercise/${exerciseId}/records?date=${date}&reps=${s.reps}`)} />
                )}
              </div>
              {s.comment && <div className="set-row__comment">{s.comment}</div>}
            </div>
          ))}
        </div>
      </div>
      <CommentDialog open={commentSet !== null} onClose={() => setCommentSet(null)} title="Set Comment" initial={commentSet?.comment ?? ''} onSave={(text) => commentSet && setSetComment(db, commentSet.id, text)} />
      <OneRepMaxDialog open={show1rm} onClose={() => setShow1rm(false)} weightUnit={wu} initialWeight={values.weight} initialReps={values.reps} />
      <Dialog
        open={nextPrompt !== null}
        onClose={() => setNextPrompt(null)}
        title="All sets complete"
        actions={
          <>
            <Button variant="text" onClick={() => setNextPrompt(null)}>
              Stay
            </Button>
            <Button
              onClick={() => {
                const next = nextPrompt;
                setNextPrompt(null);
                if (next !== null) navigate(`/train/${date}/${next}`, { replace: true });
              }}
            >
              Next exercise
            </Button>
          </>
        }
      >
        Jump to the next exercise in this workout?
      </Dialog>
    </div>
  );
}

/** Time entry as h:mm:ss with +/- one minute buttons. */
export function DurationField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const adjust = (delta: number) => {
    const cur = value.trim() === '' ? 0 : parseDuration(value);
    const next = Math.max(0, (Number.isFinite(cur) ? cur : 0) + delta);
    onChange(formatDuration(next));
  };
  return (
    <div className="numfield">
      <div className="numfield__row">
        <button className="numfield__btn" onClick={() => adjust(-60)} aria-label="Decrease time">
          <Icon name="remove" />
        </button>
        <input className="numfield__input" inputMode="numeric" value={value} placeholder="0:00" aria-label="Time" onChange={(e) => onChange(e.target.value)} onFocus={(e) => e.target.select()} />
        <button className="numfield__btn" onClick={() => adjust(60)} aria-label="Increase time">
          <Icon name="add" />
        </button>
      </div>
      <div className="numfield__label">Time (h:mm:ss)</div>
    </div>
  );
}

/** Navigation Panel: the exercises of this workout, plus Add Exercise / Add To Group / Home. */
function NavPanel({ date, currentExerciseId, onClose, onGroups }: { date: string; currentExerciseId: number; onClose: () => void; onGroups: () => void }) {
  const navigate = useNavigate();
  const settings = useSettings();
  const workout: Workout = useQuery((d) => getWorkout(d, date), [date]);
  const inGroup = workout.exercises.find((e) => e.exercise.id === currentExerciseId)?.group;
  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <nav className="drawer" aria-label="Workout navigation">
        <div className="drawer__header">{formatShortDate(date)}</div>
        <div style={{ flex: 1 }}>
          {workout.exercises.map((we) => {
            const done = we.sets.filter((s) => s.isComplete).length;
            return (
              <button
                key={we.exercise.id}
                className={`list__item${we.exercise.id === currentExerciseId ? ' list__item--selected' : ''}`}
                onClick={() => {
                  onClose();
                  navigate(`/train/${date}/${we.exercise.id}`, { replace: true });
                }}
              >
                <span className="group-bar" style={{ background: we.group ? androidColourToHex(we.group.colour) : 'transparent', minHeight: 24 }} />
                <div className="list__text">
                  <div className="list__primary">{we.exercise.name}</div>
                </div>
                <span className="list__meta">{settings.markSetsComplete ? `${done}/${we.sets.length}` : `${we.sets.length} set${we.sets.length === 1 ? '' : 's'}`}</span>
              </button>
            );
          })}
        </div>
        <div style={{ borderTop: '1px solid var(--color-divider)' }}>
          <button className="list__item" onClick={() => navigate(`/exercises?date=${date}`)}>
            <Icon name="add" style={{ color: 'var(--color-primary)' }} />
            <div className="list__text">Add Exercise</div>
          </button>
          <button className="list__item" onClick={onGroups}>
            <Icon name="group" />
            <div className="list__text">{inGroup ? 'Edit Group' : 'Add To Group'}</div>
          </button>
          <button className="list__item" onClick={() => navigate(`/workout/${date}`)}>
            <Icon name="home" />
            <div className="list__text">Home</div>
          </button>
        </div>
      </nav>
    </>
  );
}
