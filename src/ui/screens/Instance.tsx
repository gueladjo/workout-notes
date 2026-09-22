import { useState } from 'react';
import type { AppDatabase } from '@/db/store';
import { backupFileName, exportBackupBlob } from '@/backup/fitnotes';
import { downloadBlob } from '@/backup/download';
import { Button } from '@/ui/components/Button';

/**
 * Screens shown outside the app while another instance (tab, window or installed app) is
 * involved: waiting for it to hand over, or after it took over (see `src/app/instance.ts`).
 */
export function WaitingForInstanceScreen() {
  return (
    <div className="screen">
      <div className="screen__content">
        <div className="container">
          <div className="empty">
            <div className="spinner" aria-label="Loading" />
            <div className="empty__title" style={{ marginTop: 16 }}>
              Waiting for the other WorkoutNotes window to save…
            </div>
            <div>If it does not finish, close the other tab or the installed app.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * `app` is the closed database of this window: when its last save failed (`unsaved`) the data only
 * exists here, so the screen offers to save it as a backup file before anything reloads.
 */
export function TakenOverScreen({ unsaved, app }: { unsaved: boolean; app: AppDatabase | null }) {
  const [saved, setSaved] = useState<string | null>(null);
  const saveCopy = () => {
    if (!app) return;
    const name = backupFileName();
    downloadBlob(exportBackupBlob(app), name);
    setSaved(name);
  };
  return (
    <div className="screen">
      <div className="screen__content">
        <div className="container">
          <div className="empty">
            <div className="empty__title">WorkoutNotes is open in another window</div>
            <div>
              {unsaved
                ? "The latest changes here could not be saved before handing over. Save a copy of this window's data to keep them; using WorkoutNotes here again loads what the other window saved."
                : 'This window handed its data over and stopped so the two cannot overwrite each other.'}
            </div>
            <div className="empty__actions">
              {unsaved && app && (
                <Button icon="download" variant="outline" onClick={saveCopy}>
                  Save a copy of this window&apos;s data
                </Button>
              )}
              <Button onClick={() => window.location.reload()}>Use WorkoutNotes here</Button>
            </div>
            {saved && (
              <div className="muted" style={{ marginTop: 16 }}>
                Saved {saved}. Restore it from Settings if the other window&apos;s data is not what you want.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
