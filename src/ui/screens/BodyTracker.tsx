import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useDb, useQuery } from '@/app/db-context';
import { useSettings } from '@/app/hooks';
import {
  addRecord,
  createMeasurement,
  createMeasurementUnit,
  deleteMeasurement,
  deleteRecord,
  getMeasurement,
  latestRecord,
  listMeasurementUnits,
  listMeasurements,
  listRecords,
  reorderMeasurements,
  resetMeasurement,
  updateMeasurement,
  updateRecord,
} from '@/db/repo/measurements';
import { MeasurementGoalType } from '@/db/constants';
import { updateSettings } from '@/db/repo/settings';
import { saveSnapshot } from '@/db/persistence';
import type { MeasurementRecord, MeasurementWithUnit } from '@/db/types';
import {
  daysBetween,
  formatLongDate,
  formatShortDate,
  formatTimeShort,
  nowTime,
  relativeDays,
  todayIso,
} from '@/domain/dates';
import { fmt, measurementUnitFactor } from '@/domain/units';
import { trendLine } from '@/domain/graphs';
import { TopBar } from '@/ui/components/TopBar';
import { Tabs } from '@/ui/components/Tabs';
import { Button, IconButton } from '@/ui/components/Button';
import { Icon } from '@/ui/components/Icon';
import { Dialog, ConfirmDialog } from '@/ui/components/Dialog';
import { LineChart } from '@/ui/components/LineChart';
import { MenuButton } from '@/ui/components/Menu';
import { EmptyState } from '@/ui/components/EmptyState';
import { Checkbox } from '@/ui/components/Toggle';
import { useToast } from '@/ui/components/Toast';
import { parseDecimal } from '@/ui/format';

type Tab = 'track' | 'history' | 'graph';

/** Body Tracker: Track / History / Graph tabs over enabled measurements. */
export function BodyTrackerScreen() {
  const navigate = useNavigate();
  const [search, setSearch] = useSearchParams();
  const tab = (search.get('tab') as Tab) || 'track';
  return (
    <div className="screen">
      <TopBar
        back
        title="Body Tracker"
        actions={
          <IconButton
            icon="edit"
            label="Configure measurements"
            primary
            onClick={() => navigate('/body/measurements')}
          />
        }
      />
      <Tabs
        tabs={[
          { id: 'track', label: 'Track' },
          { id: 'history', label: 'History' },
          { id: 'graph', label: 'Graph' },
        ]}
        value={tab}
        onChange={(t) => setSearch({ tab: t }, { replace: true })}
      />
      {tab === 'track' && <TrackTab />}
      {tab === 'history' && <HistoryTab />}
      {tab === 'graph' && <GraphTab />}
    </div>
  );
}

function deltaColour(delta: number, goalType: number): string {
  if (delta === 0) return 'var(--color-text-muted)';
  if (goalType === MeasurementGoalType.INCREASE)
    return delta > 0 ? 'var(--color-success)' : 'var(--color-danger)';
  if (goalType === MeasurementGoalType.DECREASE)
    return delta < 0 ? 'var(--color-success)' : 'var(--color-danger)';
  return 'var(--color-text-muted)';
}

function TrackTab() {
  const measurements = useQuery((d) => listMeasurements(d, true));
  const latest = useQuery(
    (d) => new Map(measurements.map((m) => [m.id, listRecords(d, m.id).slice(-2)])),
    [measurements],
  );
  const [recording, setRecording] = useState<MeasurementWithUnit | null>(null);
  return (
    <div className="screen__content">
      <div className="container">
        {measurements.length === 0 && (
          <EmptyState
            title="No measurements enabled"
            message="Tap the pencil to enable or create measurements."
          />
        )}
        <div className="list">
          {measurements.map((m) => {
            const recs = latest.get(m.id) ?? [];
            const last = recs[recs.length - 1];
            const prev = recs.length > 1 ? recs[0] : undefined;
            const delta = last && prev ? last.value - prev.value : 0;
            return (
              <button key={m.id} className="list__item" onClick={() => setRecording(m)}>
                <div className="list__text">
                  <div className="list__primary">{m.name}</div>
                  <div className="list__secondary">{last ? relativeDays(last.date) : 'Not recorded yet'}</div>
                </div>
                {last && (
                  <div style={{ textAlign: 'right' }}>
                    <div className="stat-row__value">
                      {fmt(last.value)} {m.unitShort}
                    </div>
                    {prev && (
                      <div style={{ fontSize: 12, color: deltaColour(delta, m.goalType) }}>
                        {delta > 0 ? '▲' : delta < 0 ? '▼' : '='} {fmt(Math.abs(delta))} {m.unitShort}
                      </div>
                    )}
                  </div>
                )}
                <Icon name="chevronRight" className="faint" />
              </button>
            );
          })}
        </div>
      </div>
      <RecordDialog open={recording !== null} onClose={() => setRecording(null)} measurement={recording} />
    </div>
  );
}

function RecordDialog({
  open,
  onClose,
  measurement,
  record,
}: {
  open: boolean;
  onClose: () => void;
  measurement: MeasurementWithUnit | null;
  record?: MeasurementRecord;
}) {
  const db = useDb();
  const toast = useToast();
  const last = useQuery((d) => (measurement ? latestRecord(d, measurement.id) : undefined), [measurement]);
  const [value, setValue] = useState('');
  const [date, setDate] = useState(todayIso());
  const [time, setTime] = useState(nowTime());
  const [comment, setComment] = useState('');
  const [seen, setSeen] = useState(false);
  // The value field shows the stored value rounded to three decimals (a converted 80 kg reads
  // 176.37 lbs); remember it so a field the user did not touch saves the stored value back exactly
  // instead of its rounding.
  const [shown, setShown] = useState<{ text: string; value: number } | null>(null);
  if (open && !seen) {
    setSeen(true);
    const from = record ?? last;
    const text = from ? fmt(from.value, 3) : '';
    setShown(from ? { text, value: from.value } : null);
    setValue(text);
    setDate(record?.date ?? todayIso());
    setTime(record?.time ?? nowTime());
    setComment(record?.comment ?? '');
  }
  if (!open && seen) setSeen(false);
  if (!measurement) return null;
  const save = () => {
    const v = shown && value === shown.text ? shown.value : parseDecimal(value);
    if (!Number.isFinite(v)) return toast('Enter a value');
    const t = time.length === 5 ? `${time}:00` : time;
    if (record) updateRecord(db, record.id, { value: v, date, time: t, comment });
    else addRecord(db, { measurementId: measurement.id, value: v, date, time: t, comment });
    onClose();
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={measurement.name}
      actions={
        <>
          {record && (
            <Button
              variant="danger-text"
              onClick={() => {
                deleteRecord(db, record.id);
                onClose();
              }}
            >
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
      <div className="grid-2">
        <label className="field">
          <span className="field__label">Date</span>
          <input
            className="input"
            type="date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field__label">Time</span>
          <input
            className="input"
            type="time"
            value={time.slice(0, 5)}
            onChange={(e) => e.target.value && setTime(e.target.value)}
          />
        </label>
      </div>
      <label className="field">
        <span className="field__label">Value ({measurement.unitShort || 'no unit'})</span>
        <input
          className="input"
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
          onFocus={(e) => e.target.select()}
          style={{ fontSize: 22, textAlign: 'center' }}
        />
      </label>
      <label className="field">
        <span className="field__label">Comment</span>
        <input className="input" value={comment} onChange={(e) => setComment(e.target.value)} />
      </label>
    </Dialog>
  );
}

function HistoryTab() {
  const measurements = useQuery((d) => listMeasurements(d, true));
  const [filter, setFilter] = useState<number | 'all'>('all');
  const records = useQuery(
    (d) =>
      filter === 'all'
        ? listRecords(d).filter((r) => measurements.some((m) => m.id === r.measurementId))
        : listRecords(d, filter),
    [filter, measurements],
  );
  const [editing, setEditing] = useState<MeasurementRecord | null>(null);
  const byDate = useMemo(() => {
    const m = new Map<string, MeasurementRecord[]>();
    for (const r of records) m.set(r.date, [...(m.get(r.date) ?? []), r]);
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [records]);
  const prevValue = (r: MeasurementRecord) => {
    const same = records.filter((x) => x.measurementId === r.measurementId);
    const i = same.findIndex((x) => x.id === r.id);
    return i > 0 ? same[i - 1] : undefined;
  };
  return (
    <div className="screen__content">
      <div className="container">
        <select
          className="select"
          value={filter}
          onChange={(e) => setFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
          style={{ marginBottom: 12 }}
          aria-label="Measurement"
        >
          <option value="all">All measurements</option>
          {measurements.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        {byDate.length === 0 && <EmptyState title="No measurements recorded" />}
        {byDate.map(([date, recs]) => (
          <div key={date} className="list">
            <div className="history-date">{formatLongDate(date)}</div>
            {recs.map((r) => {
              const m = measurements.find((x) => x.id === r.measurementId);
              const prev = prevValue(r);
              const delta = prev ? r.value - prev.value : 0;
              return (
                <button key={r.id} className="stat-row" onClick={() => setEditing(r)}>
                  <span>
                    <div>{m?.name}</div>
                    <div className="stat-row__date">
                      {formatTimeShort(r.time)}
                      {r.comment ? ` · ${r.comment}` : ''}
                    </div>
                  </span>
                  <span style={{ textAlign: 'right' }}>
                    <div className="stat-row__value">
                      {fmt(r.value)} {m?.unitShort}
                    </div>
                    {prev && (
                      <div style={{ fontSize: 12, color: deltaColour(delta, m?.goalType ?? 0) }}>
                        {delta >= 0 ? '+' : ''}
                        {fmt(delta)} {m?.unitShort}
                      </div>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <RecordDialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        measurement={measurements.find((m) => m.id === editing?.measurementId) ?? null}
        record={editing ?? undefined}
      />
    </div>
  );
}

function GraphTab() {
  const db = useDb();
  const settings = useSettings();
  const measurements = useQuery((d) => listMeasurements(d, true));
  const [id, setId] = useState<number>(measurements[0]?.id ?? 0);
  const measurement = measurements.find((m) => m.id === id) ?? measurements[0];
  const records = useQuery((d) => (measurement ? listRecords(d, measurement.id) : []), [measurement?.id]);
  const [selected, setSelected] = useState<number | null>(null);
  const [showDay, setShowDay] = useState<string | null>(null);
  const dayRecords = useQuery(
    (d) => (showDay ? listRecords(d).filter((r) => r.date === showDay) : []),
    [showDay],
  );
  const origin = records[0]?.date ?? todayIso();
  const points = records.map((r) => ({
    x: daysBetween(origin, r.date) + (Number(r.time.slice(0, 2)) || 0) / 24,
    y: r.value,
    label: formatShortDate(r.date),
  }));
  const trend = settings.graphShowTrendLine
    ? trendLine(
        records.map((r) => ({ date: r.date, value: r.value })),
        (d) => daysBetween(origin, d),
      )
    : null;
  const sel = selected !== null ? records[selected] : undefined;
  if (!measurement) return <EmptyState title="No measurements enabled" />;
  return (
    <div className="screen__content">
      <div className="row" style={{ padding: '10px 12px 8px' }}>
        <select
          className="select"
          value={measurement.id}
          onChange={(e) => {
            setId(Number(e.target.value));
            setSelected(null);
          }}
          aria-label="Measurement"
          style={{ flex: 1 }}
        >
          {measurements.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
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
          ]}
        />
      </div>
      <div className="container" style={{ paddingTop: 0 }}>
        <LineChart
          points={points}
          selectedIndex={selected}
          onSelect={setSelected}
          showPoints={settings.graphShowPoints}
          trend={trend}
          yFromZero={settings.graphStartAtZero}
          goal={measurement.goalType === MeasurementGoalType.SPECIFIC ? measurement.goalValue : null}
          formatY={(v, decimals) => fmt(v, decimals)}
        />
        {records.length > 0 && (
          <div className="point-details">
            <IconButton
              icon="chevronLeft"
              label="Previous point"
              onClick={() => setSelected((i) => (i === null ? records.length - 1 : Math.max(0, i - 1)))}
            />
            <button
              className="point-details__body"
              onClick={() => sel && setShowDay(sel.date)}
              disabled={!sel}
            >
              {sel ? (
                <>
                  <div className="point-details__value">
                    {fmt(sel.value)} {measurement.unitShort}
                  </div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {formatLongDate(sel.date)} {formatTimeShort(sel.time)}
                  </div>
                </>
              ) : (
                <div className="muted">Tap a point for details · {records.length} records</div>
              )}
            </button>
            <IconButton
              icon="chevronRight"
              label="Next point"
              onClick={() => setSelected((i) => (i === null ? 0 : Math.min(records.length - 1, i + 1)))}
            />
          </div>
        )}
        {measurement.goalType === MeasurementGoalType.SPECIFIC && (
          <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>
            Goal: {fmt(measurement.goalValue)} {measurement.unitShort} (dashed line)
          </div>
        )}
      </div>
      <Dialog
        open={showDay !== null}
        onClose={() => setShowDay(null)}
        title={showDay ? formatLongDate(showDay) : ''}
        flush
        actions={
          <Button variant="text" onClick={() => setShowDay(null)}>
            Close
          </Button>
        }
      >
        {dayRecords.map((r) => {
          const m = measurements.find((x) => x.id === r.measurementId);
          return (
            <div key={r.id} className="stat-row">
              <span>{m?.name ?? '?'}</span>
              <span className="stat-row__value">
                {fmt(r.value)} {m?.unitShort}
              </span>
            </div>
          );
        })}
      </Dialog>
    </div>
  );
}

/** Measurements configuration: enable/disable, create, edit, reorder. */
export function MeasurementsScreen() {
  const db = useDb();
  const navigate = useNavigate();
  const measurements = useQuery((d) => listMeasurements(d));
  return (
    <div className="screen">
      <TopBar
        back
        title="Measurements"
        actions={
          <IconButton
            icon="add"
            label="New measurement"
            primary
            onClick={() => navigate('/body/measurement/new')}
          />
        }
      />
      <div className="screen__content">
        <div className="container">
          <div className="list">
            {measurements.map((m, i) => (
              <div key={m.id} className="list__item" style={{ padding: '4px 6px 4px 14px' }}>
                <button
                  className="list__text"
                  style={{ textAlign: 'left', padding: '8px 0' }}
                  onClick={() => navigate(`/body/measurement/${m.id}`)}
                >
                  <div className="list__primary">{m.name}</div>
                  <div className="list__secondary">
                    {m.unitLong || 'No unit'}
                    {m.custom ? ' · custom' : ''}
                  </div>
                </button>
                <IconButton
                  icon="arrowUp"
                  label="Move up"
                  small
                  disabled={i === 0}
                  onClick={() => {
                    const ids = measurements.map((x) => x.id);
                    [ids[i - 1], ids[i]] = [ids[i]!, ids[i - 1]!];
                    reorderMeasurements(db, ids);
                  }}
                />
                <IconButton
                  icon="arrowDown"
                  label="Move down"
                  small
                  disabled={i === measurements.length - 1}
                  onClick={() => {
                    const ids = measurements.map((x) => x.id);
                    [ids[i + 1], ids[i]] = [ids[i]!, ids[i + 1]!];
                    reorderMeasurements(db, ids);
                  }}
                />
                <Checkbox
                  checked={m.enabled}
                  onChange={(v) => updateMeasurement(db, m.id, { enabled: v })}
                  label={`Enable ${m.name}`}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** New / edit measurement (name, unit, goal). Default measurements cannot be renamed or deleted. */
export function MeasurementEditorScreen() {
  const db = useDb();
  const navigate = useNavigate();
  const toast = useToast();
  const params = useParams();
  const id = params.id ? Number(params.id) : undefined;
  const existing = useQuery((d) => (id ? getMeasurement(d, id) : undefined), [id]);
  const units = useQuery((d) => listMeasurementUnits(d));
  const [name, setName] = useState(existing?.name ?? '');
  const [unitId, setUnitId] = useState<number>(existing?.unitId ?? 0);
  const [goalType, setGoalType] = useState<number>(existing?.goalType ?? MeasurementGoalType.NONE);
  const storedGoal = existing?.goalValue ? String(existing.goalValue) : '';
  const [goalValue, setGoalValue] = useState(storedGoal);
  const [unitDialog, setUnitDialog] = useState(false);
  const [confirm, setConfirm] = useState<'reset' | 'delete' | null>(null);
  const [unitChange, setUnitChange] = useState(false);
  const hasValues = useQuery((d) => (id ? latestRecord(d, id) !== undefined : false), [id]);
  const isDefault = existing ? !existing.custom : false;
  const unitShort = (unitId: number) => units.find((u) => u.id === unitId)?.shortName ?? '';
  // Recorded values are in the measurement's unit: switching between convertible units asks
  // whether to convert them or keep the numbers, as the exercise editor does for weights.
  const factor =
    existing && unitId !== existing.unitId ? measurementUnitFactor(existing.unitId, unitId) : null;
  // The target is typed in the selected unit and saved as typed. Left untouched, it is still the
  // stored goal in the stored unit, which is kept and converts (or not) with the records.
  const keepGoal =
    goalType === MeasurementGoalType.SPECIFIC && goalValue === storedGoal && (existing?.goalValue ?? 0) > 0;
  const save = (convertValues?: boolean) => {
    if (!name.trim() && !isDefault) return toast('Enter a name');
    const gv = goalType === MeasurementGoalType.SPECIFIC ? parseDecimal(goalValue) : 0;
    // A specific goal without a positive target is refused rather than saved as 0.
    if (goalType === MeasurementGoalType.SPECIFIC && !(Number.isFinite(gv) && gv > 0))
      return toast('Enter a goal value');
    if (id && existing) {
      if (factor !== null && convertValues === undefined && (hasValues || keepGoal))
        return setUnitChange(true);
      updateMeasurement(db, id, {
        name: isDefault ? undefined : name,
        unitId,
        goalType,
        goalValue: keepGoal ? undefined : gv,
        convertValuesOnUnitChange: convertValues,
      });
    } else createMeasurement(db, { name, unitId, goalType, goalValue: gv });
    navigate(-1);
  };
  return (
    <div className="screen">
      <TopBar
        back
        title={id ? 'Edit Measurement' : 'New Measurement'}
        actions={<IconButton icon="save" label="Save" primary onClick={() => save()} />}
      />
      <div className="screen__content">
        <div className="container">
          <div className="card" style={{ padding: 14 }}>
            <label className="field">
              <span className="field__label">Name</span>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isDefault}
                autoFocus={!id}
              />
            </label>
            <div className="field">
              <span className="field__label">Unit</span>
              <div className="row">
                <select className="select" value={unitId} onChange={(e) => setUnitId(Number(e.target.value))}>
                  <option value={0}>None</option>
                  {units
                    .filter((u) => u.longName)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.longName} ({u.shortName})
                      </option>
                    ))}
                </select>
                <IconButton icon="add" label="Custom unit" onClick={() => setUnitDialog(true)} />
              </div>
            </div>
            <label className="field">
              <span className="field__label">Goal</span>
              <select
                className="select"
                value={goalType}
                onChange={(e) => setGoalType(Number(e.target.value))}
              >
                <option value={MeasurementGoalType.NONE}>None</option>
                <option value={MeasurementGoalType.INCREASE}>Increase</option>
                <option value={MeasurementGoalType.DECREASE}>Decrease</option>
                <option value={MeasurementGoalType.SPECIFIC}>Specific value</option>
              </select>
            </label>
            {goalType === MeasurementGoalType.SPECIFIC && (
              <label className="field">
                <span className="field__label">Target value ({unitShort(unitId) || 'no unit'})</span>
                <input
                  className="input"
                  inputMode="decimal"
                  value={goalValue}
                  onChange={(e) => setGoalValue(e.target.value)}
                />
              </label>
            )}
          </div>
          <Button block large onClick={() => save()}>
            Save
          </Button>
          {id && (
            <div className="stack" style={{ marginTop: 16 }}>
              <Button block variant="outline" onClick={() => setConfirm('reset')}>
                Reset (delete all values)
              </Button>
              {!isDefault && (
                <Button block variant="danger" onClick={() => setConfirm('delete')}>
                  Delete measurement
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
      {/* Mounted only while open so a new unit starts from blank fields every time. */}
      {unitDialog && <UnitDialog open onClose={() => setUnitDialog(false)} onCreated={setUnitId} />}
      <Dialog
        open={unitChange}
        onClose={() => setUnitChange(false)}
        title="Change unit"
        actions={
          <>
            <Button variant="text" onClick={() => setUnitChange(false)}>
              Cancel
            </Button>
            <Button variant="outline" onClick={() => save(false)}>
              Just change unit
            </Button>
            <Button onClick={() => save(true)}>Convert values</Button>
          </>
        }
      >
        <p>
          <b>Convert existing values</b>: 80 {existing && unitShort(existing.unitId)} becomes{' '}
          {fmt(80 * (factor ?? 1))} {unitShort(unitId)}
          {keepGoal ? ', the goal too' : ''}.
        </p>
        <p>
          <b>Just change unit</b>: 80 {existing && unitShort(existing.unitId)} becomes 80 {unitShort(unitId)}.
        </p>
      </Dialog>
      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm === 'delete' ? 'Delete measurement?' : 'Reset measurement?'}
        message={
          (confirm === 'delete'
            ? 'The measurement and all recorded values will be deleted'
            : 'All recorded values will be deleted') + ' (a rollback snapshot is taken first).'
        }
        confirmLabel={confirm === 'delete' ? 'Delete' : 'Reset'}
        danger
        onConfirm={() => {
          if (!id || !confirm) return;
          // ConfirmDialog closes (confirm -> null) right after onConfirm, so keep the action.
          const action = confirm;
          const label = existing?.name ?? `#${id}`;
          void (async () => {
            try {
              await saveSnapshot(
                db.export(),
                `Before ${action === 'delete' ? 'deleting' : 'resetting'} measurement "${label}"`,
              );
            } catch (err) {
              toast(`Nothing deleted: snapshot failed (${err instanceof Error ? err.message : String(err)})`);
              return;
            }
            if (action === 'delete') {
              deleteMeasurement(db, id);
              toast(`Deleted ${label}`);
              navigate(-1);
            } else {
              resetMeasurement(db, id);
              toast(`Reset ${label}`);
            }
          })();
        }}
      />
    </div>
  );
}

function UnitDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const db = useDb();
  const [long, setLong] = useState('');
  const [short, setShort] = useState('');
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Custom unit"
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!long.trim()}
            onClick={() => {
              onCreated(createMeasurementUnit(db, long, short || long));
              onClose();
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <label className="field">
        <span className="field__label">Name</span>
        <input
          className="input"
          value={long}
          onChange={(e) => setLong(e.target.value)}
          placeholder="Kilocalories"
        />
      </label>
      <label className="field">
        <span className="field__label">Short name</span>
        <input
          className="input"
          value={short}
          onChange={(e) => setShort(e.target.value)}
          placeholder="kcal"
        />
      </label>
    </Dialog>
  );
}
