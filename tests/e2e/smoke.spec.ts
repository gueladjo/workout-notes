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

test('accepts a decimal comma, as typed on a comma-region decimal keypad', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Start New Workout' }).click();
  await page.getByRole('button', { name: 'Chest' }).click();
  await page.getByRole('button', { name: 'Flat Barbell Bench Press' }).first().click();
  const weight = page.getByRole('textbox', { name: /^Weight/ });
  await weight.fill('82,5');
  await page.getByRole('textbox', { name: 'Reps', exact: true }).fill('5');
  await page.getByTestId('save-set').click();
  await expect(
    page.getByTestId('set-list').getByRole('button', { name: 'Set 1: 82.5 kg × 5 reps' }),
  ).toBeVisible();
  // The +/- buttons step from the typed value instead of from 0.
  await weight.fill('82,5');
  await page.getByRole('button', { name: /^Increase Weight/ }).click();
  await expect(weight).toHaveValue('85');
});

test('logs a cardio set in metres with the hh / mm / ss time boxes', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Start New Workout' }).click();
  await page.getByRole('button', { name: 'Cardio' }).click();
  await page.getByRole('button', { name: 'Cycling' }).first().click();
  await expect(page.getByRole('tab', { name: 'Track' })).toBeVisible();
  // Metres by default, as in FitNotes; the time boxes take digits only (phone keypads have no colon).
  await expect(page.getByLabel('Distance unit')).toHaveValue('2');
  await page.getByRole('textbox', { name: 'Distance', exact: true }).fill('5000');
  await page.getByRole('textbox', { name: 'Minutes' }).fill('25');
  await page.getByRole('textbox', { name: 'Seconds' }).fill('30');
  await page.getByTestId('save-set').click();
  const row = page.getByTestId('set-list').getByRole('button', { name: 'Set 1: 5000 m × 25:30' });
  await expect(row).toBeVisible();
  // Selecting the set fills the boxes back in.
  await row.click();
  await expect(page.getByRole('textbox', { name: 'Hours' })).toHaveValue('');
  await expect(page.getByRole('textbox', { name: 'Minutes' })).toHaveValue('25');
  await expect(page.getByRole('textbox', { name: 'Seconds' })).toHaveValue('30');
});

test('reports a backup file the browser cannot read and stays usable', async ({ page }) => {
  await openApp(page);
  await page.goto('/#/settings');
  // iOS Safari fails to read a cloud file that is not on the device yet: make every read fail.
  await page.evaluate(() => {
    File.prototype.arrayBuffer = () =>
      Promise.reject(new DOMException('The requested file could not be read', 'NotReadableError'));
  });
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Restore Backup…' }).click();
  await (await chooser).setFiles(FIXTURE);
  await expect(page.getByRole('status')).toContainText('Could not read "sample.fitnotes"');
  await expect(page.getByRole('button', { name: 'Restore', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Restore Backup…' })).toBeEnabled();
});

test('reorders sets on the Track tab with press-and-hold drag', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Start New Workout' }).click();
  await page.getByRole('button', { name: 'Chest' }).click();
  await page.getByRole('button', { name: 'Flat Barbell Bench Press' }).first().click();
  const weight = page.getByRole('textbox', { name: /^Weight/ });
  const reps = page.getByRole('textbox', { name: 'Reps', exact: true });
  await weight.fill('100');
  await reps.fill('5');
  await page.getByTestId('save-set').click();
  await weight.fill('80');
  await reps.fill('8');
  await page.getByTestId('save-set').click();
  const list = page.getByTestId('set-list');
  await expect(list.getByRole('button', { name: 'Set 2: 80 kg × 8 reps' })).toBeVisible();
  // Hold the second set, then drag it over the first and release.
  const from = await list.getByRole('button', { name: 'Set 2: 80 kg × 8 reps' }).boundingBox();
  const to = await list.getByRole('button', { name: 'Set 1: 100 kg × 5 reps' }).boundingBox();
  if (!from || !to) throw new Error('set rows not laid out');
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(600);
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect(list.getByRole('button', { name: 'Set 1: 80 kg × 8 reps' })).toBeVisible();
  await expect(list.getByRole('button', { name: 'Set 2: 100 kg × 5 reps' })).toBeVisible();
  // The release did not also select the dragged set.
  await expect(page.getByTestId('save-set')).toBeVisible();
  // The arrows keep the moved set selected, so it can be moved again without re-tapping it.
  await list.getByRole('button', { name: 'Set 1: 80 kg × 8 reps' }).click();
  await page.getByRole('button', { name: 'Move set down' }).click();
  await expect(list.getByRole('button', { name: 'Set 2: 80 kg × 8 reps' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: 'Move set up' })).toBeEnabled();
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

test('a distance goal keeps its distance when saved after a change of unit system', async ({ page }) => {
  await openApp(page);
  await page.goto('/#/settings');
  await page.getByLabel('Unit System').selectOption({ label: 'Imperial (lbs)' });
  // Reach Cycling's goals through the Track screen, whose URL carries the exercise id.
  await page.goto('/#/');
  await page.getByRole('button', { name: 'Start New Workout' }).click();
  await page.getByRole('button', { name: 'Cardio' }).click();
  await page.getByRole('button', { name: 'Cycling' }).first().click();
  await expect(page.getByRole('tab', { name: 'Track' })).toBeVisible();
  const exerciseId = /\/train\/[^/]+\/(\d+)/.exec(page.url())?.[1];
  const goals = `/#/exercise/${exerciseId}/records?tab=goals`;
  await page.goto(goals);
  await page.getByRole('button', { name: 'Add goal' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Type').selectOption({ label: 'Max Distance' });
  await dialog.getByLabel('Distance (mi)').fill('1');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Max Distance: 1 mi')).toBeVisible();
  // Metric now; opening the goal shows it in its own unit and saving it changes nothing.
  await page.goto('/#/settings');
  await page.getByLabel('Unit System').selectOption({ label: 'Metric (kg)' });
  await page.goto(goals);
  await page.getByRole('button', { name: /Max Distance: 1 mi/ }).click();
  await expect(dialog.getByLabel('Distance (mi)')).toHaveValue('1');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Max Distance: 1 mi')).toBeVisible();
  await page.waitForTimeout(1200);
  await page.reload();
  await expect(page.getByText('Max Distance: 1 mi')).toBeVisible({ timeout: 30_000 });
});

test('a second tab takes the database over and the first one stops', async ({ page, context }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Start New Workout' }).click();
  await page.getByRole('button', { name: 'Chest' }).click();
  await page.getByRole('button', { name: 'Flat Barbell Bench Press' }).first().click();
  await page.getByRole('textbox', { name: /^Weight/ }).fill('100');
  await page.getByRole('textbox', { name: 'Reps', exact: true }).fill('5');
  await page.getByTestId('save-set').click();
  // Open a second tab straight away: the first must flush its (still debounced) set and stop.
  const second = await context.newPage();
  await second.goto('/');
  await expect(page.getByText('WorkoutNotes is open in another window')).toBeVisible({ timeout: 30_000 });
  await expect(second.getByRole('button', { name: 'Flat Barbell Bench Press 100 kg × 5 reps' })).toBeVisible({
    timeout: 30_000,
  });
  // Taking it back reloads the first tab where it was (the Track tab) and stops the second one.
  await page.getByRole('button', { name: 'Use WorkoutNotes here' }).click();
  await expect(
    page.getByTestId('set-list').getByRole('button', { name: 'Set 1: 100 kg × 5 reps' }),
  ).toBeVisible({
    timeout: 30_000,
  });
  await expect(second.getByText('WorkoutNotes is open in another window')).toBeVisible({ timeout: 30_000 });
});

test('a window on the Recovery screen hands the database over to a new one', async ({ page, context }) => {
  await openApp(page);
  // Replace the stored database with garbage, then reload into the Recovery screen.
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('workoutnotes', 1);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const tx = req.result.transaction('blobs', 'readwrite');
          tx.objectStore('blobs').put(new Uint8Array(4096).fill(0x41), 'main');
          tx.onerror = () => reject(tx.error);
          tx.oncomplete = () => {
            req.result.close();
            resolve();
          };
        };
      }),
  );
  await page.reload();
  await expect(page.getByText('WorkoutNotes could not open its database')).toBeVisible({ timeout: 30_000 });
  // A second window must not wait for the first one to close: it gets the lock and the same screen.
  const second = await context.newPage();
  await second.goto('/');
  await expect(page.getByText('WorkoutNotes is open in another window')).toBeVisible({ timeout: 30_000 });
  await expect(second.getByText('WorkoutNotes could not open its database')).toBeVisible({ timeout: 30_000 });
  await second.getByRole('button', { name: 'Start with an empty database' }).click();
  await expect(second.getByText('Start New Workout').first()).toBeVisible({ timeout: 30_000 });
});

test('ships a Content Security Policy that the app runs cleanly under', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', (msg) => {
    if (/Content.Security.Policy/i.test(msg.text())) violations.push(msg.text());
  });
  await openApp(page);
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain("connect-src 'self'");
  // Exercise the WASM database, styles and a download under the policy.
  await page.getByRole('button', { name: 'Start New Workout' }).click();
  await page.getByRole('button', { name: 'Chest' }).click();
  await page.getByRole('button', { name: 'Flat Barbell Bench Press' }).first().click();
  await page.getByRole('textbox', { name: /^Weight/ }).fill('100');
  await page.getByRole('textbox', { name: 'Reps', exact: true }).fill('5');
  await page.getByTestId('save-set').click();
  await expect(
    page.getByTestId('set-list').getByRole('button', { name: 'Set 1: 100 kg × 5 reps' }),
  ).toBeVisible();
  await page.goto('/#/settings');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save Backup' }).click();
  expect((await download).suggestedFilename()).toMatch(/^FitNotes_Backup_.*\.fitnotes$/);
  expect(violations).toEqual([]);
});

test('works offline after the first load (service worker)', async ({ page, context }) => {
  await openApp(page);
  await page.waitForFunction(() => navigator.serviceWorker?.controller !== null, null, { timeout: 30_000 });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('Start New Workout').first()).toBeVisible({ timeout: 30_000 });
  await context.setOffline(false);
});

test('reminds about backups on Home and stops once one is saved', async ({ page }) => {
  // Pretend the last backup was three weeks ago.
  const threeWeeksAgo = new Date(Date.now() - 21 * 86_400_000).toISOString();
  await page.addInitScript((iso) => localStorage.setItem('workoutnotes.lastBackupAt', iso), threeWeeksAgo);
  await openApp(page);
  // An empty database is not worth nagging about.
  await expect(page.getByRole('status')).toHaveCount(0);
  await page.goto('/#/settings');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Restore Backup…' }).click();
  await (await chooser).setFiles(FIXTURE);
  await page.getByRole('button', { name: 'Restore', exact: true }).click();
  await expect(page.getByText('Backup restored')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'OK' }).click();

  await page.goto('/#/workout/2026-09-08');
  await expect(page.getByText('Barbell Squat').first()).toBeVisible();
  const reminder = page.getByRole('status');
  await expect(reminder).toContainText('Last backup was 3 weeks ago.');
  await reminder.getByRole('button', { name: 'Back up' }).click();
  await expect(page).toHaveURL(/#\/settings$/);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save Backup' }).click();
  await download;
  await page.goto('/#/workout/2026-09-08');
  await expect(page.getByText('Barbell Squat').first()).toBeVisible();
  await expect(page.getByRole('status')).toHaveCount(0);
});
