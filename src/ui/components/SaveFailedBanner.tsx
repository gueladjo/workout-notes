import { useState } from 'react';
import { useDb, usePersistError } from '@/app/db-context';
import { prepareBackup } from '@/backup/fitnotes';
import { shareOrDownload } from '@/backup/download';
import { markBackupSaved } from '@/backup/reminder';
import { Button, IconButton } from './Button';
import { useToast } from './Toast';

/**
 * Shown on every screen while saving to this device fails (`AppDatabase.lastPersistError`): the
 * changes then live only in memory and are lost if the system ends the app, so the way out (a
 * backup file) is offered right here instead of only in Settings > Storage. Making the backup
 * retries the save first (`prepareBackup`); the banner goes away by itself once a save succeeds. Closing it hides it
 * until saving has worked again and then fails anew.
 */
export function SaveFailedBanner() {
  const db = useDb();
  const toast = useToast();
  const error = usePersistError();
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!error && dismissed) setDismissed(false);
  if (!error || dismissed) return null;

  const saveBackup = async () => {
    setBusy(true);
    try {
      const { blob, name, persistError } = await prepareBackup(db);
      const result = await shareOrDownload(blob, name, 'FitNotes backup');
      if (result === 'cancelled') return;
      markBackupSaved();
      toast(
        (result === 'shared' ? 'Backup shared' : `Saved ${name}`) +
          (persistError ? '' : '. Saving to this device works again.'),
      );
    } catch (err) {
      toast(`Backup failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="save-failed" role="alert">
      <div className="save-failed__text">
        Changes are not being saved on this device ({error}). Save a backup to keep them.
      </div>
      <Button variant="text" onClick={() => void saveBackup()} disabled={busy}>
        Save Backup
      </Button>
      <IconButton icon="close" label="Hide until saving fails again" onClick={() => setDismissed(true)} />
    </div>
  );
}
