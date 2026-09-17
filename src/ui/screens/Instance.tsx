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

export function TakenOverScreen({ unsaved }: { unsaved: boolean }) {
  return (
    <div className="screen">
      <div className="screen__content">
        <div className="container">
          <div className="empty">
            <div className="empty__title">WorkoutNotes is open in another window</div>
            <div>
              {unsaved
                ? 'The latest changes here could not be saved before handing over.'
                : 'This window handed its data over and stopped so the two cannot overwrite each other.'}
            </div>
            <div className="empty__actions">
              <Button onClick={() => window.location.reload()}>Use WorkoutNotes here</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
