import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDb, useQuery } from '@/app/db-context';
import { useRouteDate, useSettings } from '@/app/hooks';
import { listCategories } from '@/db/repo/categories';
import {
  allSetsForExercise,
  copySets,
  exercisesWithHistory,
  getWorkout,
  workoutDates,
} from '@/db/repo/workouts';
import { updateSettings } from '@/db/repo/settings';
import { androidColourToHex } from '@/domain/colour';
import { addDays, formatLongDate, formatMediumDate, todayIso } from '@/domain/dates';
import { displayToKg, kgToDisplay, fmt } from '@/domain/units';
import { formatSet, weightUnitFor } from '@/ui/format';
import { TopBar } from '@/ui/components/TopBar';
import { IconButton, Button } from '@/ui/components/Button';
import { MenuButton } from '@/ui/components/Menu';
import { MonthGrid, type DayMarker } from '@/ui/components/MonthGrid';
import { Dialog } from '@/ui/components/Dialog';
import { SetSelectionDialog, type SelectableExercise } from '@/ui/components/SetSelectionDialog';
import { WorkoutView } from '@/ui/components/WorkoutView';
import { Checkbox } from '@/ui/components/Toggle';
import { Icon } from '@/ui/components/Icon';
import { useToast } from '@/ui/components/Toast';
import type { Workout } from '@/db/types';

interface ExerciseFilter {
  exerciseId: number;
  minWeightKg: number;
  minReps: number;
}

/**
 * Calendar: Month View and List View of past workouts with category / exercise filters.
 * With `?copy=1` it is the first step of Copy Workout (as in FitNotes): tapping a workout opens
 * the set-selection dialog and the chosen sets are copied to the route date.
 */
export function CalendarScreen() {
  const db = useDb();
  const navigate = useNavigate();
  const toast = useToast();
  const settings = useSettings();
  const routeDate = useRouteDate();
  const [search] = useSearchParams();
  const copyMode = search.get('copy') === '1';
  const [view, setView] = useState<'month' | 'list'>('month');
  const [month, setMonth] = useState(routeDate);
  const [selected, setSelected] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<Set<number>>(new Set());
  const [matchAll, setMatchAll] = useState(false);
  const [exerciseFilter, setExerciseFilter] = useState<ExerciseFilter | null>(null);
  const [filterDialog, setFilterDialog] = useState(false);
  const [listOpen, setListOpen] = useState(false);

  const categories = useQuery((d) => listCategories(d));
  const colourOf = useMemo(() => new Map(categories.map((c) => [c.id, c.colour])), [categories]);
  const dates = useQuery((d) => workoutDates(d));
  const exerciseDates = useQuery(
    (d) => {
      if (!exerciseFilter) return null;
      const ok = new Set<string>();
      for (const s of allSetsForExercise(d, exerciseFilter.exerciseId)) {
        if (s.metricWeight >= exerciseFilter.minWeightKg - 1e-9 && s.reps >= exerciseFilter.minReps)
          ok.add(s.date);
      }
      return ok;
    },
    [exerciseFilter],
  );

  const markers = useMemo(() => {
    const m = new Map<string, DayMarker>();
    for (const [date, cats] of dates) {
      if (categoryFilter.size) {
        const has = (id: number) => cats.includes(id);
        if (matchAll ? ![...categoryFilter].every(has) : ![...categoryFilter].some(has)) continue;
      }
      if (exerciseDates && !exerciseDates.has(date)) continue;
      m.set(date, { colours: cats.map((id) => colourOf.get(id) ?? 0) });
    }
    return m;
  }, [dates, categoryFilter, matchAll, exerciseDates, colourOf]);
  const filteredDates = useMemo(() => [...markers.keys()].sort(), [markers]);
  const filtering = categoryFilter.size > 0 || exerciseFilter !== null;

  const selectedWorkout = useQuery((d) => (selected ? getWorkout(d, selected) : null), [selected]);
  const selectable: SelectableExercise[] = useMemo(
    () =>
      (selectedWorkout?.exercises ?? []).map((we) => ({
        exercise: we.exercise,
        sets: we.sets.map((s) => ({
          key: String(s.id),
          metricWeight: s.metricWeight,
          reps: s.reps,
          distanceMetres: s.distanceMetres,
          durationSeconds: s.durationSeconds,
          unit: s.unit,
        })),
      })),
    [selectedWorkout],
  );
  // In copy mode only days that hold a workout can be chosen.
  const pick = (iso: string) => {
    if (copyMode && !markers.has(iso)) return;
    setSelected(iso);
  };
  const jump = (dir: -1 | 1) => {
    const cur = selected ?? month;
    const next =
      dir === 1 ? filteredDates.find((d) => d > cur) : [...filteredDates].reverse().find((d) => d < cur);
    if (next) {
      setSelected(next);
      setMonth(next);
    }
  };

  const monthMenu = [
    {
      label: 'Workout Panel',
      checked: settings.calendarNavigationBar && false,
      onSelect: () => setListOpen(true),
    },
    {
      label: 'Category Dots',
      checked: settings.calendarCategoryDots,
      onSelect: () => updateSettings(db, { calendarCategoryDots: !settings.calendarCategoryDots }),
    },
    {
      label: 'Navigation Bar',
      checked: settings.calendarNavigationBar,
      onSelect: () => updateSettings(db, { calendarNavigationBar: !settings.calendarNavigationBar }),
    },
  ];
  const listMenu = [
    {
      label: 'Category Dots',
      checked: settings.calendarHistoryCategoryDots,
      onSelect: () =>
        updateSettings(db, { calendarHistoryCategoryDots: !settings.calendarHistoryCategoryDots }),
    },
    {
      label: 'Category Names',
      checked: settings.calendarHistoryCategoryNames,
      onSelect: () =>
        updateSettings(db, { calendarHistoryCategoryNames: !settings.calendarHistoryCategoryNames }),
    },
    {
      label: 'Sets',
      checked: settings.calendarHistorySets,
      onSelect: () => updateSettings(db, { calendarHistorySets: !settings.calendarHistorySets }),
    },
  ];

  return (
    <div className="screen">
      <TopBar
        leadingIcon="menu"
        leadingLabel="Calendar menu"
        onLeading={() => setDrawer(true)}
        title={view === 'month' ? 'Calendar' : 'Workout List'}
        subtitle={
          filtering ? `${filteredDates.length} workouts (filtered)` : `${filteredDates.length} workouts`
        }
        actions={
          <>
            <IconButton
              icon="today"
              label="Today"
              onClick={() => {
                setMonth(todayIso());
                if (!copyMode) setSelected(todayIso());
              }}
            />
            <MenuButton items={view === 'month' ? monthMenu.slice(1) : listMenu} />
          </>
        }
      />
      {copyMode && (
        <div className="banner banner--prompt" role="status">
          Select the workout you would like to copy
        </div>
      )}
      {view === 'month' ? (
        <>
          <div className="screen__content">
            <div className="container">
              <div className="card" style={{ paddingBottom: 4 }}>
                <MonthGrid
                  month={month}
                  onMonthChange={setMonth}
                  selected={selected ?? undefined}
                  onSelect={pick}
                  markers={markers}
                  weekStart={settings.firstDayOfWeek}
                  showDots={settings.calendarCategoryDots}
                />
              </div>
              {filtering && (
                <div className="banner" style={{ margin: '0 0 12px' }}>
                  <Icon name="filter" size={18} />
                  <span style={{ flex: 1 }}>Filter active</span>
                  <Button
                    variant="text"
                    onClick={() => {
                      setCategoryFilter(new Set());
                      setExerciseFilter(null);
                    }}
                  >
                    Reset
                  </Button>
                </div>
              )}
            </div>
          </div>
          {settings.calendarNavigationBar && (
            <div
              className="home-nav"
              style={{
                borderTop: '1px solid var(--color-border)',
                borderBottom: 'none',
                paddingBottom: 'var(--safe-bottom)',
              }}
            >
              <IconButton icon="chevronLeft" label="Previous workout" primary onClick={() => jump(-1)} />
              <button className="home-nav__date" onClick={() => setView('list')}>
                <div className="home-nav__title">{filteredDates.length} workouts</div>
                <div className="home-nav__sub">{selected ? formatMediumDate(selected) : 'Tap to list'}</div>
              </button>
              <IconButton icon="chevronRight" label="Next workout" primary onClick={() => jump(1)} />
            </div>
          )}
        </>
      ) : (
        <ListView dates={filteredDates} onOpen={pick} />
      )}

      {/* Copy Workout: choose the sets of the tapped workout, then copy them to the route date. */}
      <SetSelectionDialog
        open={copyMode && selected !== null}
        onClose={() => setSelected(null)}
        title={selected ? `Copy from ${formatLongDate(selected)}` : 'Copy'}
        exercises={selectable}
        confirmLabel="Copy"
        onConfirm={(sel) => {
          copySets(
            db,
            sel.map(({ exercise, set }) => ({ exerciseId: exercise.id, ...set })),
            routeDate,
          );
          toast(`Copied ${sel.length} set${sel.length === 1 ? '' : 's'}`);
          navigate(routeDate === todayIso() ? '/' : `/workout/${routeDate}`, { replace: true });
        }}
      />

      {/* Workout popup */}
      <Dialog
        open={!copyMode && selected !== null}
        onClose={() => setSelected(null)}
        title={selected ? formatLongDate(selected) : ''}
        flush
        wide
        actions={
          <>
            <Button
              variant="text"
              onClick={() => {
                if (selected) navigate(selected === todayIso() ? '/' : `/workout/${selected}`);
              }}
            >
              Open
            </Button>
            <Button variant="text" onClick={() => setSelected(null)}>
              Close
            </Button>
          </>
        }
      >
        {selectedWorkout && (
          <WorkoutView
            workout={selectedWorkout}
            onExerciseClick={(id) => navigate(`/exercise/${id}/overview?date=${selected}`)}
            showCategory={settings.calendarHistoryCategoryDots}
          />
        )}
      </Dialog>

      {/* Navigation drawer: views + filters */}
      {drawer && (
        <>
          <div className="drawer-backdrop" onClick={() => setDrawer(false)} />
          <nav className="drawer" aria-label="Calendar navigation">
            <div className="drawer__header">Calendar</div>
            <button
              className={`list__item${view === 'month' ? ' list__item--selected' : ''}`}
              onClick={() => {
                setView('month');
                setDrawer(false);
              }}
            >
              <Icon name="calendar" />
              <div className="list__text">Month View</div>
            </button>
            <button
              className={`list__item${view === 'list' ? ' list__item--selected' : ''}`}
              onClick={() => {
                setView('list');
                setDrawer(false);
              }}
            >
              <Icon name="list" />
              <div className="list__text">List View</div>
            </button>
            <div className="list__header" style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{ flex: 1 }}>Category filter</span>
              <MenuButton
                small
                items={[
                  { label: 'Match All', checked: matchAll, onSelect: () => setMatchAll(true) },
                  { label: 'Match Any', checked: !matchAll, onSelect: () => setMatchAll(false) },
                ]}
              />
            </div>
            {categories.map((c) => (
              <button
                key={c.id}
                className="list__item"
                onClick={() =>
                  setCategoryFilter((cur) => {
                    const n = new Set(cur);
                    if (n.has(c.id)) n.delete(c.id);
                    else n.add(c.id);
                    return n;
                  })
                }
              >
                <Checkbox
                  checked={categoryFilter.has(c.id)}
                  onChange={() =>
                    setCategoryFilter((cur) => {
                      const n = new Set(cur);
                      if (n.has(c.id)) n.delete(c.id);
                      else n.add(c.id);
                      return n;
                    })
                  }
                  label={c.name}
                />
                <span className="swatch" style={{ background: androidColourToHex(c.colour) }} />
                <div className="list__text">{c.name}</div>
              </button>
            ))}
            <div className="list__header">Exercise filter</div>
            <button
              className="list__item"
              onClick={() => {
                setDrawer(false);
                setFilterDialog(true);
              }}
            >
              <Icon name="filter" />
              <div className="list__text">{exerciseFilter ? 'Edit exercise filter' : 'Exercise Filter'}</div>
            </button>
            {(categoryFilter.size > 0 || exerciseFilter) && (
              <button
                className="list__item"
                onClick={() => {
                  setCategoryFilter(new Set());
                  setExerciseFilter(null);
                }}
              >
                <Icon name="close" />
                <div className="list__text">Reset filters</div>
              </button>
            )}
          </nav>
        </>
      )}
      <ExerciseFilterDialog
        open={filterDialog}
        onClose={() => setFilterDialog(false)}
        current={exerciseFilter}
        onApply={setExerciseFilter}
      />
      <Dialog
        open={listOpen}
        onClose={() => setListOpen(false)}
        title="Workouts"
        flush
        actions={
          <Button variant="text" onClick={() => setListOpen(false)}>
            Close
          </Button>
        }
      >
        {filteredDates
          .slice()
          .reverse()
          .map((d) => (
            <button
              key={d}
              className="list__item"
              onClick={() => {
                setListOpen(false);
                setSelected(d);
                setMonth(d);
              }}
            >
              {formatMediumDate(d)}
            </button>
          ))}
      </Dialog>
    </div>
  );
}

function ListView({ dates, onOpen }: { dates: string[]; onOpen: (date: string) => void }) {
  const settings = useSettings();
  const [limit, setLimit] = useState(30);
  const recent = useMemo(() => dates.slice().reverse().slice(0, limit), [dates, limit]);
  const workouts = useQuery((d) => recent.map((date) => getWorkout(d, date)), [recent]);
  const colourOf = useQuery((d) => new Map(listCategories(d).map((c) => [c.id, c.colour])));
  return (
    <div className="screen__content">
      <div className="container">
        {workouts.length === 0 && (
          <div className="empty">
            <div className="empty__title">No workouts</div>
          </div>
        )}
        {workouts.map((w: Workout) => (
          <button
            key={w.date}
            className="card"
            style={{ width: '100%', textAlign: 'left', padding: 14 }}
            onClick={() => onOpen(w.date)}
          >
            <div className="row row--between" style={{ marginBottom: 6 }}>
              <b>{formatLongDate(w.date)}</b>
              <span className="muted" style={{ fontSize: 13 }}>
                {w.exercises.reduce((n, e) => n + e.sets.length, 0)} sets
              </span>
            </div>
            {w.comment && (
              <div className="muted" style={{ fontSize: 13, marginBottom: 6 }}>
                {w.comment}
              </div>
            )}
            {w.exercises.map((we) => (
              <div key={we.exercise.id} style={{ marginBottom: 4 }}>
                <div className="row" style={{ gap: 6 }}>
                  {settings.calendarHistoryCategoryDots && (
                    <span
                      className="dot"
                      style={{ background: androidColourToHex(we.exercise.categoryColour) }}
                    />
                  )}
                  <span>{we.exercise.name}</span>
                  {!settings.calendarHistorySets && (
                    <span className="muted" style={{ fontSize: 13 }}>
                      · {we.sets.length} sets
                    </span>
                  )}
                </div>
                {settings.calendarHistorySets && (
                  <div
                    className="muted"
                    style={{ fontSize: 13, paddingLeft: settings.calendarHistoryCategoryDots ? 14 : 0 }}
                  >
                    {we.sets
                      .map((s) =>
                        formatSet(s, we.exercise.typeId, weightUnitFor(we.exercise, settings), settings),
                      )
                      .join(', ')}
                  </div>
                )}
              </div>
            ))}
            {settings.calendarHistoryCategoryNames && (
              <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                {[...new Set(w.exercises.map((e) => e.exercise.categoryId))].map((id) => {
                  const ex = w.exercises.find((e) => e.exercise.categoryId === id)!.exercise;
                  return (
                    <span
                      key={id}
                      className="chip"
                      style={{ color: androidColourToHex(colourOf.get(id) ?? 0) }}
                    >
                      {ex.categoryName}
                    </span>
                  );
                })}
              </div>
            )}
          </button>
        ))}
        {dates.length > limit && (
          <Button block variant="outline" onClick={() => setLimit((l) => l + 30)}>
            Show more
          </Button>
        )}
      </div>
    </div>
  );
}

function ExerciseFilterDialog({
  open,
  onClose,
  current,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  current: ExerciseFilter | null;
  onApply: (f: ExerciseFilter | null) => void;
}) {
  const settings = useSettings();
  const exercises = useQuery((d) => exercisesWithHistory(d));
  const [exerciseId, setExerciseId] = useState<number>(current?.exerciseId ?? exercises[0]?.id ?? 0);
  const [minWeight, setMinWeight] = useState(
    current ? fmt(kgToDisplay(current.minWeightKg, settings.metric ? 'kg' : 'lbs')) : '',
  );
  const [minReps, setMinReps] = useState(current ? String(current.minReps || '') : '');
  const unit = settings.metric ? 'kg' : 'lbs';
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Exercise Filter"
      actions={
        <>
          <Button
            variant="text"
            onClick={() => {
              onApply(null);
              onClose();
            }}
          >
            Reset
          </Button>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (exerciseId)
                onApply({
                  exerciseId,
                  minWeightKg: displayToKg(Number(minWeight) || 0, unit),
                  minReps: Number(minReps) || 0,
                });
              onClose();
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <label className="field">
        <span className="field__label">Exercise</span>
        <select className="select" value={exerciseId} onChange={(e) => setExerciseId(Number(e.target.value))}>
          {exercises.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </label>
      <div className="grid-2">
        <label className="field">
          <span className="field__label">Min weight ({unit})</span>
          <input
            className="input"
            inputMode="decimal"
            value={minWeight}
            onChange={(e) => setMinWeight(e.target.value)}
            placeholder="Any"
          />
        </label>
        <label className="field">
          <span className="field__label">Min reps</span>
          <input
            className="input"
            inputMode="numeric"
            value={minReps}
            onChange={(e) => setMinReps(e.target.value)}
            placeholder="Any"
          />
        </label>
      </div>
    </Dialog>
  );
}

export { addDays };
