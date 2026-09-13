import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

/**
 * The journeys that matter most for a local-first app: log a set and have it survive a reload,
 * restore a FitNotes backup, and export one.
 */

const FIXTURE = join(process.cwd(), 'tests/fixtures/generated/sample.fitnotes');

test.beforeAll(() => {
  execFileSync('npx', ['tsx', 'scripts/make-fixture.ts', FIXTURE], { stdio: 'inherit' });
});

async function openApp(page: Page) {
  await page.goto('/');
  await expect(page.getByText('Start New Workout').first()).toBeVisible({ timeout: 30_000 });
}

test('logs a set and keeps it after a reload', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Start New Workout' }).click();
  await page.getByRole('button', { name: 'Chest' }).click();
  await page.getByRole('button', { name: 'Flat Barbell Bench Press' }).first().click();
  await expect(page.getByRole('tab', { name: 'Track' })).toBeVisible();
  await page.getByRole('textbox', { name: /^Weight/ }).fill('100');
  await page.getByRole('textbox', { name: 'Reps', exact: true }).fill('5');
  await page.getByTestId('save-set').click();
  await expect(
    page.getByTestId('set-list').getByRole('button', { name: 'Set 1: 100 kg × 5 reps' }),
  ).toBeVisible();
  // The trophy shows because it is the first (record) set.
  await expect(page.getByRole('button', { name: 'Personal record' })).toBeVisible();
  // Wait for the debounced persist, then reload.
  await page.waitForTimeout(1200);
  await page.reload();
  await expect(
    page.getByTestId('set-list').getByRole('button', { name: 'Set 1: 100 kg × 5 reps' }),
  ).toBeVisible({ timeout: 30_000 });
  // Home screen shows the exercise.
  await page.getByRole('button', { name: 'Navigation panel' }).click();
  await page.getByRole('button', { name: 'Home' }).click();
  await expect(page.getByRole('button', { name: 'Flat Barbell Bench Press 100 kg × 5 reps' })).toBeVisible();
  await expect(page.getByText('1 exercise · 1 set')).toBeVisible();
});

test('restores a FitNotes backup and exports one', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'More options' }).click();
  await page.getByRole('menuitem', { name: 'Settings' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Restore Backup…' }).click();
  await (await chooser).setFiles(FIXTURE);
  await page.getByRole('button', { name: 'Restore', exact: true }).click();
  await expect(page.getByText('Backup restored')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('dialog').getByText('10', { exact: true })).toBeVisible(); // sets
  await page.getByRole('button', { name: 'OK' }).click();
  // The restored workout of 2026-09-08 is visible from the calendar.
  await page.goto('/#/workout/2026-09-08');
  await expect(page.getByText('Deload next week')).toBeVisible();
  await expect(page.getByRole('button', { name: /85 kg × 5 reps/ })).toBeVisible();

  // Export produces a SQLite file with the FitNotes header.
  await page.goto('/#/settings');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save Backup' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^FitNotes_Backup_\d{4}_\d{2}_\d{2}_\d{2}_\d{2}_\d{2}\.fitnotes$/);
  const path = await file.path();
  const bytes = readFileSync(path);
  expect(bytes.subarray(0, 15).toString()).toBe('SQLite format 3');
});

test('Copy Previous Workout picks the workout on the calendar first', async ({ page }) => {
  await openApp(page);
  await page.goto('/#/settings');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Restore Backup…' }).click();
  await (await chooser).setFiles(FIXTURE);
  await page.getByRole('button', { name: 'Restore', exact: true }).click();
  await expect(page.getByText('Backup restored')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'OK' }).click();

  // An empty day after the last workout offers Copy Previous Workout.
  await page.goto('/#/workout/2026-09-10');
  await page.getByRole('button', { name: 'Copy Previous Workout' }).click();
  // First step: the calendar asks which workout to copy.
  await expect(page.getByText('Select the workout you would like to copy')).toBeVisible();
  // Days without a workout do nothing.
  await page.getByRole('button', { name: '2026-09-09' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // Tapping a workout opens the set-selection dialog.
  await page.getByRole('button', { name: '2026-09-08' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Copy from')).toBeVisible();
  await dialog.getByRole('button', { name: 'Copy', exact: true }).click();
  await expect(page.getByText('Copied 3 sets')).toBeVisible();
  // Back on the target day with the copied sets.
  await expect(page).toHaveURL(/#\/workout\/2026-09-10$/);
  await expect(page.getByText('2 exercises · 3 sets')).toBeVisible();
  await expect(page.getByRole('button', { name: /Flat Barbell Bench Press 85 kg × 5 reps/ })).toBeVisible();
});

test('works offline after the first load (service worker)', async ({ page, context }) => {
  await openApp(page);
  await page.waitForFunction(() => navigator.serviceWorker?.controller !== null, null, { timeout: 30_000 });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('Start New Workout').first()).toBeVisible({ timeout: 30_000 });
  await context.setOffline(false);
});
