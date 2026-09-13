import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  BACKUP_REMINDER_DAYS,
  backupReminderDue,
  describeBackupAge,
  markBackupSaved,
  readBackupReminder,
  snoozeBackupReminder,
} from '../../src/backup/reminder';

const NOW = new Date('2026-09-13T10:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

describe('backup reminder rule', () => {
  it('is quiet while the last backup is recent', () => {
    expect(
      backupReminderDue({ lastBackupAt: daysAgo(13), firstUsedAt: null, snoozedUntil: null }, NOW),
    ).toBeNull();
  });

  it('is due once the last backup is two weeks old', () => {
    expect(
      backupReminderDue(
        { lastBackupAt: daysAgo(BACKUP_REMINDER_DAYS), firstUsedAt: null, snoozedUntil: null },
        NOW,
      ),
    ).toEqual({ daysSinceBackup: 14 });
  });

  it('counts from first use when there has never been a backup', () => {
    expect(
      backupReminderDue({ lastBackupAt: null, firstUsedAt: daysAgo(3), snoozedUntil: null }, NOW),
    ).toBeNull();
    expect(
      backupReminderDue({ lastBackupAt: null, firstUsedAt: daysAgo(20), snoozedUntil: null }, NOW),
    ).toEqual({
      daysSinceBackup: null,
    });
    expect(backupReminderDue({ lastBackupAt: null, firstUsedAt: null, snoozedUntil: null }, NOW)).toBeNull();
  });

  it('respects a snooze until it expires', () => {
    const input = { lastBackupAt: daysAgo(30), firstUsedAt: null, snoozedUntil: daysAgo(-1) };
    expect(backupReminderDue(input, NOW)).toBeNull();
    expect(backupReminderDue({ ...input, snoozedUntil: daysAgo(1) }, NOW)).toEqual({ daysSinceBackup: 30 });
  });

  it('ignores garbage timestamps', () => {
    expect(
      backupReminderDue({ lastBackupAt: 'nope', firstUsedAt: 'nope', snoozedUntil: 'nope' }, NOW),
    ).toBeNull();
  });

  it('describes the age in weeks or months', () => {
    expect(describeBackupAge({ daysSinceBackup: null })).toBe('Your workouts have never been backed up.');
    expect(describeBackupAge({ daysSinceBackup: 14 })).toBe('Last backup was 2 weeks ago.');
    expect(describeBackupAge({ daysSinceBackup: 70 })).toBe('Last backup was 2 months ago.');
  });
});

describe('backup reminder storage', () => {
  // Unit tests run in Node: stand in for the browser's localStorage.
  beforeAll(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    });
  });
  afterAll(() => vi.unstubAllGlobals());

  it('starts the first-use clock, snoozes, and clears on backup', () => {
    localStorage.clear();
    expect(readBackupReminder(NOW)).toBeNull();
    const firstUsed = localStorage.getItem('workoutnotes.firstUsedAt');
    expect(firstUsed).toBe(NOW.toISOString());

    const later = new Date(NOW.getTime() + 15 * 86_400_000);
    expect(readBackupReminder(later)).toEqual({ daysSinceBackup: null });

    snoozeBackupReminder(later);
    expect(readBackupReminder(later)).toBeNull();

    expect(markBackupSaved(later)).toBe(later.toISOString());
    expect(localStorage.getItem('workoutnotes.backupReminderSnoozedUntil')).toBeNull();
    expect(readBackupReminder(later)).toBeNull();
    expect(readBackupReminder(new Date(later.getTime() + 14 * 86_400_000))).toEqual({ daysSinceBackup: 14 });
    localStorage.clear();
  });
});
