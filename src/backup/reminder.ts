/**
 * Backup reminder. The database lives only in this browser's IndexedDB, so the Home screen nudges
 * the user to save a `.fitnotes` file when the last backup (or, before any backup, the first use of
 * the app) is older than `BACKUP_REMINDER_DAYS`. All of this is browser-local bookkeeping in
 * `localStorage`; nothing here touches the FitNotes database.
 */

export const BACKUP_REMINDER_DAYS = 14;
/** How long "Not now" hides the reminder. */
export const BACKUP_REMINDER_SNOOZE_DAYS = 7;

export const LAST_BACKUP_KEY = 'workoutnotes.lastBackupAt';
const FIRST_USED_KEY = 'workoutnotes.firstUsedAt';
const SNOOZED_UNTIL_KEY = 'workoutnotes.backupReminderSnoozedUntil';

const DAY_MS = 86_400_000;

export interface BackupReminderInput {
  /** ISO timestamp of the last Save/Share Backup, or null if never. */
  lastBackupAt: string | null;
  /** ISO timestamp of the first time the app looked for a reminder (start of the "never" clock). */
  firstUsedAt: string | null;
  /** ISO timestamp until which the user asked not to be reminded, or null. */
  snoozedUntil: string | null;
}

export interface BackupReminder {
  /** Whole days since the last backup, or null when there has never been one. */
  daysSinceBackup: number | null;
}

/** Pure rule: is a reminder due right now? Returns null when nothing should be shown. */
export function backupReminderDue(input: BackupReminderInput, now: Date = new Date()): BackupReminder | null {
  const snoozed = parseTime(input.snoozedUntil);
  if (snoozed !== null && snoozed > now.getTime()) return null;
  const last = parseTime(input.lastBackupAt);
  const since = last ?? parseTime(input.firstUsedAt);
  // No usable timestamp at all: the first-use clock starts now, remind later.
  if (since === null) return null;
  const days = Math.floor((now.getTime() - since) / DAY_MS);
  if (days < BACKUP_REMINDER_DAYS) return null;
  return { daysSinceBackup: last === null ? null : days };
}

/** Short human text for the banner. */
export function describeBackupAge(reminder: BackupReminder): string {
  const days = reminder.daysSinceBackup;
  if (days === null) return 'Your workouts have never been backed up.';
  const weeks = Math.floor(days / 7);
  if (weeks >= 8) {
    const months = Math.floor(days / 30);
    return `Last backup was ${months} month${months === 1 ? '' : 's'} ago.`;
  }
  return `Last backup was ${weeks} week${weeks === 1 ? '' : 's'} ago.`;
}

/** Read the reminder state from localStorage, starting the first-use clock if needed. */
export function readBackupReminder(now: Date = new Date()): BackupReminder | null {
  let firstUsedAt = safeGet(FIRST_USED_KEY);
  if (!firstUsedAt && !safeGet(LAST_BACKUP_KEY)) {
    firstUsedAt = now.toISOString();
    safeSet(FIRST_USED_KEY, firstUsedAt);
  }
  return backupReminderDue(
    { lastBackupAt: safeGet(LAST_BACKUP_KEY), firstUsedAt, snoozedUntil: safeGet(SNOOZED_UNTIL_KEY) },
    now,
  );
}

export function lastBackupAt(): string | null {
  return safeGet(LAST_BACKUP_KEY);
}

/** Record a successful Save/Share Backup; clears any snooze. */
export function markBackupSaved(now: Date = new Date()): string {
  const iso = now.toISOString();
  safeSet(LAST_BACKUP_KEY, iso);
  safeRemove(SNOOZED_UNTIL_KEY);
  return iso;
}

export function snoozeBackupReminder(now: Date = new Date()): void {
  safeSet(SNOOZED_UNTIL_KEY, new Date(now.getTime() + BACKUP_REMINDER_SNOOZE_DAYS * DAY_MS).toISOString());
}

function parseTime(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
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
    /* private mode or quota: the reminder simply cannot remember */
  }
}
function safeRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
