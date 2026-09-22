import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDb, useQuery } from '@/app/db-context';
import { useSettings } from '@/app/hooks';
import { allSetsForExercise, getWorkout } from '@/db/repo/workouts';
import { updateSettings } from '@/db/repo/settings';
import type { ExerciseWithCategory } from '@/db/types';
import { GraphType, type GraphTypeId } from '@/db/constants';
import {
  computeSeries,
  defaultGraphForType,
  graphDisplayValue,
  graphOptionsForType,
  trendLine,
} from '@/domain/graphs';
import {
  addDays,
  addMonths,
  daysBetween,
  formatLongDate,
  formatShortDate,
  formatDuration,
  todayIso,
} from '@/domain/dates';
import { formatSet, formatWeightValue, weightUnitFor } from '@/ui/format';
import { fmt, resolveDistanceUnit, distanceUnitShort } from '@/domain/units';
import { LineChart } from '@/ui/components/LineChart';
import { IconButton, Button } from '@/ui/components/Button';
import { MenuButton } from '@/ui/components/Menu';
import { Dialog } from '@/ui/components/Dialog';
import { WorkoutView } from '@/ui/components/WorkoutView';

const PERIODS: { id: string; label: string; months: number | null }[] = [
  { id: '1m', label: '1M', months: 1 },
  { id: '3m', label: '3M', months: 3 },
  { id: '6m', label: '6M', months: 6 },
  { id: '1y', label: '1Y', months: 12 },
  { id: 'all', label: 'All', months: null },
];

/** Progress Graph tab. */
export function GraphTab({ exercise }: { exercise: ExerciseWithCategory }) {
  const db = useDb();
  const navigate = useNavigate();
  const settings = useSettings();
  const sets = useQuery((d) => allSetsForExercise(d, exercise.id), [exercise.id]);
  const options = graphOptionsForType(exercise.typeId);
  const defaultGraph = (
    exercise.defaultGraphId !== null && options.some((o) => o.id === exercise.defaultGraphId)
      ? exercise.defaultGraphId
      : defaultGraphForType(exercise.typeId)
  ) as GraphTypeId;
  const [graph, setGraph] = useState<GraphTypeId>(defaultGraph);
  const [repCount, setRepCount] = useState(5);
  const [period, setPeriod] = useState('all');
  const [custom, setCustom] = useState<{ from: string; to: string } | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [viewDate, setViewDate] = useState<string | null>(null);
  const viewWorkout = useQuery((d) => (viewDate ? getWorkout(d, viewDate) : null), [viewDate]);
  const wu = weightUnitFor(exercise, settings);
  const du = resolveDistanceUnit(0, settings.metric);

  const filtered = useMemo(() => {
    const p = PERIODS.find((x) => x.id === period);
    if (custom) return sets.filter((s) => s.date >= custom.from && s.date <= custom.to);
    if (!p || p.months === null) return sets;
    const from = addMonths(todayIso(), -p.months);
    return sets.filter((s) => s.date >= from);
  }, [sets, period, custom]);

  const series = useMemo(
    () => computeSeries(filtered, graph, { repCount, maxRepsFor1rm: settings.estimated1rmMaxReps || null }),
    [filtered, graph, repCount, settings.estimated1rmMaxReps],
  );
  const origin = series[0]?.date ?? todayIso();
  const points = series.map((p) => ({
    x: daysBetween(origin, p.date),
    y: displayValue(p.value),
    label: formatShortDate(p.date),
  }));
  const trend = settings.graphShowTrendLine
    ? trendLine(
        series.map((p) => ({ ...p, value: displayValue(p.value) })),
        (d) => daysBetween(origin, d),
      )
    : null;

  const displayValue = (v: number) => graphDisplayValue(graph, v, wu, du);
  function formatValue(v: number): string {
    const unit = distanceUnitShort(du);
    switch (graph) {
      case GraphType.ESTIMATED_1RM:
      case GraphType.MAX_WEIGHT:
      case GraphType.WORKOUT_VOLUME:
      case GraphType.WEIGHT_AND_REPS:
      case GraphType.REP_MAXES:
        return `${fmt(v, 1)} ${wu}`;
      case GraphType.MAX_DISTANCE:
      case GraphType.TOTAL_DISTANCE:
        return `${fmt(v, 2)} ${unit}`;
      case GraphType.MAX_SPEED:
        return `${fmt(v, 1)} ${unit}/h`;
      case GraphType.MAX_PACE:
        return `${formatDuration(v * 60)} /${unit}`;
      case GraphType.MAX_TIME:
      case GraphType.TOTAL_TIME:
        return formatDuration(v * 60);
      default:
        return fmt(v, 0);
    }
  }

  const sel = selected !== null ? series[selected] : undefined;
  const needsReps = options.find((o) => o.id === graph)?.needsReps;

  return (
    <div className="screen__content screen__content--flush graph-tab">
      <div className="row" style={{ padding: '10px 12px 0', gap: 6 }}>
        <select
          className="select"
          value={graph}
          onChange={(e) => {
            setGraph(Number(e.target.value) as GraphTypeId);
            setSelected(null);
          }}
          aria-label="Graph type"
          style={{ flex: 1 }}
        >
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        {needsReps && (
          <select
            className="select"
            style={{ width: 96 }}
            value={repCount}
            onChange={(e) => setRepCount(Number(e.target.value))}
            aria-label="Rep count"
          >
            {Array.from({ length: 15 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}RM
              </option>
            ))}
          </select>
        )}
        <MenuButton
          items={[
            {
              label: 'Graph Points',
              checked: settings.graphShowPoints,
              onSelect: () => updateSettings(db, { graphShowPoints: !settings.graphShowPoints }),
            },
            {
              label: 'Trend Line',
              checked: settings.graphShowTrendLine,
              onSelect: () => updateSettings(db, { graphShowTrendLine: !settings.graphShowTrendLine }),
            },
            {
              label: 'Y-Axis From 0',
              checked: settings.graphStartAtZero,
              onSelect: () => updateSettings(db, { graphStartAtZero: !settings.graphStartAtZero }),
            },
            { label: '', divider: true, onSelect: () => {} },
            { label: 'Custom date range…', icon: 'calendar', onSelect: () => setCustomOpen(true) },
          ]}
        />
      </div>
      <div className="period-chips">
        {PERIODS.map((p) => (
          <button
            key={p.id}
            className={`chip${period === p.id && !custom ? ' chip--active' : ''}`}
            onClick={() => {
              setPeriod(p.id);
              setCustom(null);
              setSelected(null);
            }}
          >
            {p.label}
          </button>
        ))}
        {custom && (
          <span className="chip chip--active">
            {formatShortDate(custom.from)} – {formatShortDate(custom.to)}
          </span>
        )}
      </div>
      <LineChart
        points={points}
        selectedIndex={selected}
        onSelect={setSelected}
        showPoints={settings.graphShowPoints}
        trend={trend}
        yFromZero={settings.graphStartAtZero}
        formatY={(v) => fmt(v, 0)}
        fill
      />
      {series.length > 0 && (
        <div className="point-details graph-tab__details">
          <IconButton
            icon="chevronLeft"
            label="Previous point"
            onClick={() => setSelected((i) => (i === null ? series.length - 1 : Math.max(0, i - 1)))}
          />
          <button
            className="point-details__body"
            onClick={() => sel && setViewDate(sel.date)}
            disabled={!sel}
          >
            {sel ? (
              <>
                <div className="point-details__value">{formatValue(displayValue(sel.value))}</div>
                {sel.set && (
                  <div className="muted" style={{ fontSize: 13 }}>
                    {formatSet(sel.set, exercise.typeId, wu, settings)}
                  </div>
                )}
                <div className="muted" style={{ fontSize: 13 }}>
                  {formatLongDate(sel.date)}
                </div>
              </>
            ) : (
              <div className="muted">
                Tap a point for details · {series.length} workout{series.length === 1 ? '' : 's'}
              </div>
            )}
          </button>
          <IconButton
            icon="chevronRight"
            label="Next point"
            onClick={() => setSelected((i) => (i === null ? 0 : Math.min(series.length - 1, i + 1)))}
          />
        </div>
      )}
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
      <CustomRangeDialog
        open={customOpen}
        onClose={() => setCustomOpen(false)}
        onApply={(from, to) => {
          setCustom({ from, to });
          setSelected(null);
        }}
      />
    </div>
  );
}

function CustomRangeDialog({
  open,
  onClose,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  onApply: (from: string, to: string) => void;
}) {
  const [from, setFrom] = useState(addDays(todayIso(), -90));
  const [to, setTo] = useState(todayIso());
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Custom date range"
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (from <= to) {
                onApply(from, to);
                onClose();
              }
            }}
          >
            Apply
          </Button>
        </>
      }
    >
      <label className="field">
        <span className="field__label">From</span>
        <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
      </label>
      <label className="field">
        <span className="field__label">To</span>
        <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </label>
    </Dialog>
  );
}

export { formatWeightValue };
