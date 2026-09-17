/**
 * Service-worker update hand-off. In `autoUpdate` mode a new version activates as soon as it is
 * downloaded, and vite-plugin-pwa would reload the page right then, dropping whatever the user was
 * typing. Instead `main.tsx` records that a reload is due and `bootstrap()` performs it the next
 * time the app is hidden, after the pending changes have been flushed.
 */
let updatePending = false;

export function markUpdatePending(): void {
  updatePending = true;
}

/** Reload now if a new version is waiting. Call only once unsaved changes are safely persisted. */
export function reloadIfUpdatePending(): void {
  if (!updatePending) return;
  updatePending = false;
  window.location.reload();
}
