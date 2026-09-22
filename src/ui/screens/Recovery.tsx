import { useEffect, useState } from 'react';
import {
  defaultMetric,
  recoverFromSnapshot,
  startFresh,
  unreadableFileName,
  UNREADABLE_LABEL,
  type UnreadableDatabaseError,
} from '@/app/recovery';
import { holdInstanceLock } from '@/app/instance';
import { listSnapshots, type StoredFileMeta } from '@/db/persistence';
import { downloadBlob } from '@/backup/download';
import { Button } from '@/ui/components/Button';

/**
 * Shown instead of the app when the stored database cannot be opened. Rendered outside the router
 * and the database providers, so it only uses plain state. Every action keeps the unreadable bytes
 * as a snapshot before replacing them, and runs under the instance lock so another window that
 * takes over meanwhile waits for it (see `src/app/instance.ts`).
 */
export function RecoveryScreen({
  error,
  onRecovered,
}: {
  error: UnreadableDatabaseError;
  onRecovered: () => void;
}) {
  const [snapshots, setSnapshots] = useState<StoredFileMeta[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void listSnapshots()
      .then((all) => setSnapshots(all.filter((s) => s.label !== UNREADABLE_LABEL)))
      .catch(() => setSnapshots([]));
  }, []);

  const attempt = (label: string, fn: () => Promise<void>) => {
    void (async () => {
      setBusy(true);
      setStatus(`${label}…`);
      try {
        await holdInstanceLock(fn);
        onRecovered();
      } catch (err) {
        setStatus(`${label} failed: ${err instanceof Error ? err.message : String(err)}`);
        setBusy(false);
      }
    })();
  };

  const save = () => {
    const bytes = error.bytes;
    const blob = new Blob(
      [bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer],
      {
        type: 'application/octet-stream',
      },
    );
    const name = unreadableFileName();
    downloadBlob(blob, name);
    setStatus(`Saved ${name}`);
  };

  return (
    <div className="screen">
      <div className="screen__content">
        <div className="container">
          <div className="empty">
            <div className="empty__title">WorkoutNotes could not open its database</div>
            <div>{error.message}</div>
            <div className="muted" style={{ marginTop: 12 }}>
              Your data is still on this device ({(error.bytes.byteLength / 1024).toFixed(0)} KB). Save a copy
              first, then restore a rollback snapshot or start again. Whatever you choose, the unreadable file
              is kept as a snapshot.
            </div>
            <div className="empty__actions">
              <Button icon="download" onClick={save} disabled={busy}>
                Save the unreadable database file
              </Button>
              {snapshots.map((s) => (
                <Button
                  key={s.key}
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    attempt('Restoring snapshot', () => recoverFromSnapshot(error.SQL, s.key, error.bytes))
                  }
                >
                  Restore snapshot: {s.label} · {new Date(s.savedAt).toLocaleString()}
                </Button>
              ))}
              <Button
                variant="danger"
                disabled={busy}
                onClick={() =>
                  attempt('Starting fresh', () => startFresh(error.SQL, error.bytes, defaultMetric()))
                }
              >
                Start with an empty database
              </Button>
            </div>
            {status && (
              <div className="muted" style={{ marginTop: 16 }}>
                {status}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
