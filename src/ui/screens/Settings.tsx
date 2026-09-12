import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDb, useQuery } from '@/app/db-context';
import { useSql } from '@/app/sql-context';
import { useSettings } from '@/app/hooks';
import { updateSettings } from '@/db/repo/settings';
import { recalculatePersonalRecords } from '@/db/repo/records';
import { deleteWorkoutHistory, exercisesWithHistory } from '@/db/repo/workouts';
import { AppTheme, HomeScreenCategoryVisibility, HomeScreenSetLimitType } from '@/db/constants';
import { listSnapshots, readBlob, saveSnapshot, storageStatus, type StoredFileMeta } from '@/db/persistence';
import {
  BackupError,
  backupFileName,
  exportBackupBlob,
  restoreBackup,
  summarize,
  type RestoreSummary,
} from '@/backup/fitnotes';
import { pickFile, shareOrDownload, downloadBlob } from '@/backup/download';
import { bodyTrackerCsv, csvFileName, workoutCsv } from '@/backup/csv';
import { ensureSchema } from '@/db/schema';
import { TopBar } from '@/ui/components/TopBar';
import { Button } from '@/ui/components/Button';
import { ToggleRow } from '@/ui/components/Toggle';
import { Dialog, ConfirmDialog } from '@/ui/components/Dialog';
import { Icon } from '@/ui/components/Icon';
import { useToast } from '@/ui/components/Toast';
import { formatShortDate } from '@/domain/dates';

const LAST_BACKUP_KEY = 'workoutnotes.lastBackupAt';

export function SettingsScreen() {
  const db = useDb();
  const SQL = useSql();
  const navigate = useNavigate();
  const toast = useToast();
  const settings = useSettings();
  const counts = useQuery((d) => summarize(d));
  const [busy, setBusy] = useState<string | null>(null);
  const [restoreResult, setRestoreResult] = useState<RestoreSummary | null>(null);
  const [pendingRestore, setPendingRestore] = useState<{ name: string; bytes: Uint8Array } | null>(null);
  const [snapshots, setSnapshots] = useState<StoredFileMeta[]>([]);
  const [rollback, setRollback] = useState<StoredFileMeta | null>(null);
  const [storage, setStorage] = useState<{ persisted: boolean; usage?: number; quota?: number } | null>(null);
  const [deleteHistoryOpen, setDeleteHistoryOpen] = useState(false);
  const [lastBackup, setLastBackup] = useState<string | null>(() => safeGet(LAST_BACKUP_KEY));

  useEffect(() => {
    void listSnapshots().then(setSnapshots);
    void storageStatus().then(setStorage);
  }, [restoreResult]);

  const exportBackup = async (mode: 'save' | 'share') => {
    setBusy('Preparing backup…');
    try {
      await db.flush();
      const blob = exportBackupBlob(db);
      const name = backupFileName();
      const result =
        mode === 'share'
          ? await shareOrDownload(blob, name, 'FitNotes backup')
          : (downloadBlob(blob, name), 'downloaded');
      const now = new Date().toISOString();
      safeSet(LAST_BACKUP_KEY, now);
      setLastBackup(now);
      toast(result === 'shared' ? 'Backup shared' : `Saved ${name}`);
    } finally {
      setBusy(null);
    }
  };

  const chooseRestore = async () => {
    const file = await pickFile('.fitnotes,application/octet-stream,application/x-sqlite3,*/*');
    if (file) setPendingRestore(file);
  };

  const doRestore = async () => {
    if (!pendingRestore) return;
    setBusy('Restoring backup…');
    try {
      const result = await restoreBackup(db, SQL, pendingRestore.bytes);
      setRestoreResult(result);
    } catch (err) {
      toast(
        err instanceof BackupError
          ? err.message
          : `Restore failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setBusy(null);
      setPendingRestore(null);
    }
  };

  const doRollback = async () => {
    if (!rollback) return;
    setBusy('Restoring snapshot…');
    try {
      const bytes = await readBlob(rollback.key);
      if (!bytes) throw new Error('Snapshot not found');
      await saveSnapshot(db.export(), 'Before rollback');
      const next = new SQL.Database(bytes);
      ensureSchema(next);
      await db.replaceDatabase(next);
      toast('Snapshot restored');
      setRestoreResult(null);
      setSnapshots(await listSnapshots());
    } catch (err) {
      toast(`Rollback failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(null);
      setRollback(null);
    }
  };

  const exportCsv = async (kind: 'workout' | 'body') => {
    const csv = kind === 'workout' ? workoutCsv(db) : bodyTrackerCsv(db);
    const blob = new Blob([csv], { type: 'text/csv' });
    await shareOrDownload(
      blob,
      csvFileName(kind),
      kind === 'workout' ? 'Workout export' : 'Body tracker export',
    );
  };

  return (
    <div className="screen">
      <TopBar back title="Settings" />
      <div className="screen__content">
        <div className="container">
          <div className="list__header">General</div>
          <div className="list">
            <SelectRow
              label="Theme"
              value={settings.appTheme}
              options={[
                [AppTheme.LIGHT, 'Light'],
                [AppTheme.DARK, 'Dark'],
              ]}
              onChange={(v) => updateSettings(db, { appTheme: v })}
            />
            <SelectRow
              label="Unit System"
              value={settings.metric ? 1 : 0}
              options={[
                [1, 'Metric (kg)'],
                [0, 'Imperial (lbs)'],
              ]}
              onChange={(v) => updateSettings(db, { metric: v === 1 })}
            />
            <SelectRow
              label="Calendar Week Start"
              value={settings.firstDayOfWeek}
              options={[
                [2, 'Monday'],
                [7, 'Saturday'],
                [1, 'Sunday'],
              ]}
              onChange={(v) => updateSettings(db, { firstDayOfWeek: v })}
            />
            <NumberRow
              label={`Default Weight Increment (${settings.metric ? 'kg' : 'lbs'})`}
              value={settings.weightIncrement}
              onChange={(v) => updateSettings(db, { weightIncrement: v })}
            />
          </div>
          <div className="list__header">Home Screen</div>
          <div className="list">
            <SelectRow
              label="Sets to display"
              value={settings.homeScreenLimitValue}
              options={Array.from({ length: 10 }, (_, i) => [i + 1, String(i + 1)] as [number, string])}
              onChange={(v) => updateSettings(db, { homeScreenLimitValue: v })}
            />
            <SelectRow
              label="Which sets"
              value={settings.homeScreenLimitType}
              options={[
                [HomeScreenSetLimitType.FIRST, 'First sets'],
                [HomeScreenSetLimitType.LAST, 'Last sets'],
              ]}
              onChange={(v) => updateSettings(db, { homeScreenLimitType: v })}
            />
            <SelectRow
              label="Exercise category"
              value={settings.homeScreenCategoryVisibility}
              options={[
                [HomeScreenCategoryVisibility.NONE, 'Hidden'],
                [HomeScreenCategoryVisibility.NAME, 'Name'],
                [HomeScreenCategoryVisibility.NAME_AND_COLOUR, 'Name and colour'],
              ]}
              onChange={(v) => updateSettings(db, { homeScreenCategoryVisibility: v })}
            />
            <ToggleRow
              label="Skip Empty Dates"
              description="Previous/next jump straight to workouts"
              checked={settings.homeScreenSkipEmptyDates}
              onChange={(v) => updateSettings(db, { homeScreenSkipEmptyDates: v })}
            />
          </div>
          <div className="list__header">Training</div>
          <div className="list">
            <ToggleRow
              label="Track Personal Records"
              description="Show a trophy on record sets"
              checked={settings.trackPersonalRecords}
              onChange={(v) => updateSettings(db, { trackPersonalRecords: v })}
            />
            <ToggleRow
              label="Mark Sets Complete"
              description="Show a checkbox next to each set"
              checked={settings.markSetsComplete}
              onChange={(v) => updateSettings(db, { markSetsComplete: v })}
            />
            <ToggleRow
              label="Auto-Select Next Set"
              description="After updating a pre-planned set, select the next one"
              checked={settings.autoSelectNextSet}
              onChange={(v) => updateSettings(db, { autoSelectNextSet: v })}
            />
            <ToggleRow
              label="Keep Screen On"
              description="Prevent sleep on the Training Screen (where the browser supports it)"
              checked={settings.keepScreenOn}
              onChange={(v) => updateSettings(db, { keepScreenOn: v })}
            />
          </div>

          <div className="list__header">Data</div>
          <div className="list">
            <div className="toggle" style={{ display: 'block' }}>
              <div className="list__primary">Backup</div>
              <div className="list__secondary" style={{ marginBottom: 10 }}>
                Save all your data as a FitNotes backup file (.fitnotes). It can be restored here or in
                FitNotes for Android.
                {lastBackup
                  ? ` Last backup: ${formatShortDate(lastBackup.slice(0, 10))}.`
                  : ' No backup saved yet.'}
              </div>
              <div className="row">
                <Button
                  variant="outline"
                  icon="download"
                  onClick={() => exportBackup('save')}
                  style={{ flex: 1 }}
                >
                  Save Backup
                </Button>
                <Button icon="share" onClick={() => exportBackup('share')} style={{ flex: 1 }}>
                  Share Backup
                </Button>
              </div>
            </div>
            <div className="toggle" style={{ display: 'block' }}>
              <div className="list__primary">Restore</div>
              <div className="list__secondary" style={{ marginBottom: 10 }}>
                Restore a FitNotes backup. Current data is replaced (a rollback snapshot is kept on this
                device).
              </div>
              <Button variant="outline" icon="upload" block onClick={chooseRestore}>
                Restore Backup…
              </Button>
            </div>
            {snapshots.length > 0 && (
              <div className="toggle" style={{ display: 'block' }}>
                <div className="list__primary">Rollback snapshots</div>
                <div className="list__secondary">Automatic copies taken before restores.</div>
                {snapshots.map((s) => (
                  <div key={s.key} className="row row--between" style={{ padding: '6px 0' }}>
                    <span style={{ fontSize: 14 }}>
                      {s.label} · {new Date(s.savedAt).toLocaleString()} · {(s.size / 1024).toFixed(0)} KB
                    </span>
                    <Button variant="text" onClick={() => setRollback(s)}>
                      Restore
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <div className="toggle" style={{ display: 'block' }}>
              <div className="list__primary">Spreadsheet Export</div>
              <div className="list__secondary" style={{ marginBottom: 10 }}>
                CSV files for spreadsheets. CSV cannot be restored; use Backup for that.
              </div>
              <div className="row">
                <Button variant="outline" onClick={() => exportCsv('workout')} style={{ flex: 1 }}>
                  Workouts CSV
                </Button>
                <Button variant="outline" onClick={() => exportCsv('body')} style={{ flex: 1 }}>
                  Body Tracker CSV
                </Button>
              </div>
            </div>
            <button
              className="toggle"
              onClick={() => {
                recalculatePersonalRecords(db);
                toast('Personal records recalculated');
              }}
            >
              <div className="list__text">
                <div className="list__primary">Calculate Personal Records</div>
                <div className="list__secondary">Recompute record flags for all exercises</div>
              </div>
            </button>
            <button className="toggle" onClick={() => setDeleteHistoryOpen(true)}>
              <div className="list__text">
                <div className="list__primary">Delete Workout History</div>
                <div className="list__secondary">Remove workouts while keeping exercises and routines</div>
              </div>
              <Icon name="chevronRight" className="faint" />
            </button>
            <button className="toggle" onClick={() => navigate('/settings/database')}>
              <div className="list__text">
                <div className="list__primary">Database</div>
                <div className="list__secondary">
                  {counts.exercises} exercises · {counts.workouts} workouts · {counts.sets} sets
                </div>
              </div>
              <Icon name="chevronRight" className="faint" />
            </button>
            <div className="toggle" style={{ display: 'block' }}>
              <div className="list__primary">Storage</div>
              <div className="list__secondary">
                {storage
                  ? storage.persisted
                    ? 'Persistent storage granted. '
                    : 'Persistent storage not granted; the browser may evict data under pressure. '
                  : ''}
                {storage?.usage !== undefined ? `Using ${(storage.usage / 1024 / 1024).toFixed(1)} MB` : ''}
                {storage?.quota ? ` of ${(storage.quota / 1024 / 1024).toFixed(0)} MB.` : ''}
                {db.lastPersistError ? ` Last save failed: ${db.lastPersistError}` : ''}
              </div>
            </div>
          </div>
          <div className="muted" style={{ fontSize: 12, textAlign: 'center', padding: 12 }}>
            WorkoutNotes · all data stays on this device
          </div>
        </div>
      </div>

      <Dialog open={busy !== null} onClose={() => {}} title={busy ?? ''}>
        <div className="spinner" />
      </Dialog>
      <ConfirmDialog
        open={pendingRestore !== null}
        onClose={() => setPendingRestore(null)}
        title="Restore backup?"
        message={`Restore "${pendingRestore?.name}"? All data currently in WorkoutNotes will be replaced. A snapshot of the current data is kept for rollback.`}
        confirmLabel="Restore"
        danger
        onConfirm={() => void doRestore()}
      />
      <ConfirmDialog
        open={rollback !== null}
        onClose={() => setRollback(null)}
        title="Restore snapshot?"
        message="The current data will be replaced by the snapshot (a new snapshot of the current data is taken first)."
        confirmLabel="Restore"
        danger
        onConfirm={() => void doRollback()}
      />
      <Dialog
        open={restoreResult !== null}
        onClose={() => setRestoreResult(null)}
        title="Backup restored"
        actions={
          <Button
            onClick={() => {
              setRestoreResult(null);
              navigate('/');
            }}
          >
            OK
          </Button>
        }
      >
        {restoreResult && (
          <div className="stack">
            <div className="row row--between">
              <span className="muted">Exercises</span>
              <b>{restoreResult.exercises}</b>
            </div>
            <div className="row row--between">
              <span className="muted">Workouts</span>
              <b>{restoreResult.workouts}</b>
            </div>
            <div className="row row--between">
              <span className="muted">Sets</span>
              <b>{restoreResult.sets}</b>
            </div>
            <div className="row row--between">
              <span className="muted">Routines</span>
              <b>{restoreResult.routines}</b>
            </div>
            <div className="row row--between">
              <span className="muted">Body measurements</span>
              <b>{restoreResult.measurements}</b>
            </div>
            {(restoreResult.schema.createdTables.length > 0 ||
              restoreResult.schema.addedColumns.length > 0 ||
              restoreResult.schema.migrations.length > 0) && (
              <div className="muted" style={{ fontSize: 12 }}>
                Schema updated:{' '}
                {[
                  ...restoreResult.schema.createdTables,
                  ...restoreResult.schema.addedColumns,
                  ...restoreResult.schema.migrations,
                ].join(', ')}
              </div>
            )}
          </div>
        )}
      </Dialog>
      <DeleteHistoryDialog open={deleteHistoryOpen} onClose={() => setDeleteHistoryOpen(false)} />
    </div>
  );
}

function SelectRow<T extends number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <label className="toggle" style={{ cursor: 'pointer' }}>
      <div className="list__text">
        <div className="list__primary">{label}</div>
      </div>
      <select
        className="select"
        style={{ width: 'auto', minHeight: 36, padding: '4px 8px' }}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) as T)}
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

function NumberRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const [text, setText] = useState(String(value));
  return (
    <label className="toggle">
      <div className="list__text">
        <div className="list__primary">{label}</div>
      </div>
      <input
        className="input"
        style={{ width: 90, minHeight: 36, padding: '4px 8px', textAlign: 'right' }}
        inputMode="decimal"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const n = Number(text);
          if (Number.isFinite(n) && n > 0) onChange(n);
          else setText(String(value));
        }}
      />
    </label>
  );
}

function DeleteHistoryDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const db = useDb();
  const toast = useToast();
  const exercises = useQuery((d) => exercisesWithHistory(d));
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [exerciseId, setExerciseId] = useState<number | 'all'>('all');
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <Dialog
        open={open && !confirm}
        onClose={onClose}
        title="Delete Workout History"
        actions={
          <>
            <Button variant="text" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => setConfirm(true)}>
              Delete…
            </Button>
          </>
        }
      >
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
          Deletes sets (and their comments) in the range. Leave dates empty for all time. Exercises, routines
          and measurements are kept.
        </p>
        <div className="grid-2">
          <label className="field">
            <span className="field__label">From</span>
            <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="field">
            <span className="field__label">To</span>
            <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
        <label className="field">
          <span className="field__label">Exercise</span>
          <select
            className="select"
            value={exerciseId}
            onChange={(e) => setExerciseId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
          >
            <option value="all">All exercises</option>
            {exercises.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
      </Dialog>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Really delete workout history?"
        message="This cannot be undone (a rollback snapshot is taken first)."
        confirmLabel="Delete"
        danger
        onConfirm={() => {
          void (async () => {
            await saveSnapshot(db.export(), 'Before deleting history');
            const n = deleteWorkoutHistory(db, {
              from: from || undefined,
              to: to || undefined,
              exerciseIds: exerciseId === 'all' ? undefined : [exerciseId],
            });
            toast(`Deleted ${n} sets`);
            onClose();
          })();
        }}
      />
    </>
  );
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}
