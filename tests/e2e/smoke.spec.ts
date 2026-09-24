import { test, expect, type Locator, type Page } from '@playwright/test';
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

async function restoreFixture(page: Page) {
  await page.goto('/#/settings');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Restore Backup…' }).click();
  await (await chooser).setFiles(FIXTURE);
  await page.getByRole('button', { name: 'Restore', exact: true }).click();
  await expect(page.getByText('Backup restored')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'OK' }).click();
}

/** Horizontal touch swipe starting at the middle of `target` (Home reads touches[0] / changedTouches[0]). */
async function swipe(target: Locator, dx: number) {
  const box = await target.boundingBox();
  if (!box) throw new Error('swipe target not laid out');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const start = { identifier: 1, clientX: x, clientY: y };
  const end = { identifier: 1, clientX: x + dx, clientY: y };
  await target.dispatchEvent('touchstart', { touches: [start], changedTouches: [start] });
  await target.dispatchEvent('touchend', { touches: [], changedTouches: [end] });
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
  // The History set dialog shows speed and pace per km, not per metre.
  await page.getByRole('tab', { name: 'History' }).click();
  await page.getByRole('button', { name: 'Set 1: 5000 m × 25:30' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('11.76 km/h')).toBeVisible();
  await expect(dialog.getByText('5:06 /km')).toBeVisible();
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

test('creates a superset group from the Training screen', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Start New Workout' }).click();
  await page.getByRole('button', { name: 'Chest' }).click();
  await page.getByRole('button', { name: 'Flat Barbell Bench Press' }).first().click();
  await expect(page.getByRole('tab', { name: 'Track' })).toBeVisible();
  // A logged set makes the exercise part of today's workout, and so of the group's exercise list.
  await page.getByRole('textbox', { name: /^Weight/ }).fill('100');
  await page.getByRole('textbox', { name: 'Reps', exact: true }).fill('5');
  await page.getByTestId('save-set').click();
  await page.getByRole('button', { name: 'Navigation panel' }).click();
  await page.getByRole('button', { name: 'Add To Group' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('No groups in this workout yet')).toBeVisible();
  await dialog.getByRole('button', { name: 'New Group' }).click();
  // The editor replaces the list, and the list comes back with the new group after Save.
  await expect(dialog.getByLabel('Name')).toHaveValue('Group 1');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog.getByText('Group 1')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Edit group' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Navigation panel' }).click();
  await expect(page.getByRole('button', { name: 'Edit Group' })).toBeVisible();
});

test('creates a superset group in the routine editor', async ({ page }) => {
  await openApp(page);
  await page.goto('/#/routine/new');
  await page.getByLabel('Name').fill('Push Pull');
  await page.getByRole('button', { name: 'Save' }).last().click();
  await expect(page.getByText('Edit mode')).toBeVisible();
  await page.getByPlaceholder('Day name (e.g. Push, Monday…)').fill('Push');
  await page.getByRole('button', { name: 'Create day' }).click();
  await page.getByRole('button', { name: 'Add exercise to day' }).click();
  await page.getByRole('button', { name: 'Chest' }).click();
  await page.getByRole('button', { name: 'Flat Barbell Bench Press' }).first().click();
  // Back in the editor: skip the predefined-sets dialog the picker opened.
  await page.getByRole('dialog').getByRole('button', { name: 'Skip' }).click();
  await page.getByRole('button', { name: /^Flat Barbell Bench Press/ }).click();
  await page.getByRole('menuitem', { name: 'Add To Group' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'New Group' }).click();
  // Closing the list by code must not close the whole group dialog with it.
  await expect(dialog.getByLabel('Name')).toHaveValue('Group 1');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog.getByText('Group 1')).toBeVisible();
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('a swipe inside a Home dialog does not change the day it writes to', async ({ page }) => {
  await openApp(page);
  await restoreFixture(page);
  await page.goto('/#/workout/2026-09-08');
  await expect(page.getByText('Deload next week')).toBeVisible();
  await page.getByRole('button', { name: 'More options' }).click();
  await page.getByRole('menuitem', { name: 'Comment Workout' }).click();
  const comment = page.getByRole('dialog').getByRole('textbox');
  await expect(comment).toHaveValue('Deload next week');
  // A thumb dragging sideways over the text must not move the page to the next day.
  await swipe(comment, -120);
  await expect(page).toHaveURL(/#\/workout\/2026-09-08$/);
  await comment.fill('Deload next week, felt strong');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Deload next week, felt strong')).toBeVisible();
  // The 9th (no workout) did not receive the comment.
  await page.goto('/#/workout/2026-09-09');
  await expect(page.getByText('No workout')).toBeVisible();
  await expect(page.getByText('Deload next week, felt strong')).toHaveCount(0);
  // Move Workout: a swipe inside the date picker does not change the workout being moved.
  await page.goto('/#/workout/2026-09-08');
  await page.getByRole('button', { name: 'More options' }).click();
  await page.getByRole('menuitem', { name: 'Move Workout' }).click();
  await swipe(page.getByRole('dialog'), -120);
  await expect(page).toHaveURL(/#\/workout\/2026-09-08$/);
  await page.getByRole('button', { name: 'Cancel' }).click();
  // A swipe on the page itself still changes the day.
  await swipe(page.getByText('Deload next week, felt strong'), -120);
  await expect(page).toHaveURL(/#\/workout\/2026-09-09$/);
});

test('Exercise Overview history is read-only and never copies into the viewed day', async ({ page }) => {
  await openApp(page);
  await restoreFixture(page);
  // The overview is reached from a workout popup; its date is the day looked at, not a workout being tracked.
  await page.goto('/#/calendar?date=2026-09-08');
  await page.getByRole('button', { name: '2026-09-08' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Flat Barbell Bench Press' }).click();
  await expect(page).toHaveURL(/#\/exercise\/\d+\/overview\?date=2026-09-08$/);
  const dialog = page.getByRole('dialog');
  // A set of an older workout: quick stats open, but nothing can be edited or copied.
  await page.getByRole('button', { name: 'Set 1: 60 kg × 10 reps' }).click();
  await expect(dialog.getByText('Estimated 1RM')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Copy Set' })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Edit Set' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toHaveCount(0);
  // The day popup keeps View Workout only.
  await page.getByRole('button', { name: /1 September 2026/ }).click();
  await expect(dialog.getByRole('button', { name: 'View Workout' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Copy Sets' })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Edit Sets' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  // The viewed workout is untouched.
  await page.goto('/#/workout/2026-09-08');
  await expect(page.getByText('2 exercises · 3 sets')).toBeVisible();
});

test('resetting a measurement takes a rollback snapshot first', async ({ page }) => {
  await openApp(page);
  await page.goto('/#/body');
  await page.getByRole('button', { name: 'Bodyweight' }).click();
  await page
    .getByRole('dialog')
    .getByRole('textbox', { name: /^Value/ })
    .fill('80');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('80 kg')).toBeVisible();
  await page.goto('/#/body/measurement/1');
  await expect(page.getByText('Edit Measurement')).toBeVisible();
  await page.getByRole('button', { name: 'Reset (delete all values)' }).click();
  await expect(page.getByText(/a rollback snapshot is taken first/)).toBeVisible();
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Reset Bodyweight');
  await page.goto('/#/body');
  await expect(page.getByRole('button', { name: /Bodyweight/ })).toContainText('Not recorded yet');
  await page.goto('/#/settings');
  await expect(page.getByText(/Before resetting measurement "Bodyweight"/)).toBeVisible();
});

test('skipping predefined sets keeps the exercise and editing offers Cancel only', async ({ page }) => {
  await openApp(page);
  await page.goto('/#/routine/new');
  await page.getByLabel('Name').fill('PPL');
  await page.getByRole('button', { name: 'Save' }).last().click();
  await expect(page.getByText('Edit mode')).toBeVisible();
  await page.getByPlaceholder(/Day name/).fill('Push');
  await page.getByRole('button', { name: 'Create day' }).click();
  await page.getByRole('button', { name: 'Add exercise to day' }).click();
  await page.getByRole('button', { name: 'Chest' }).click();
  await page.getByRole('button', { name: 'Flat Barbell Bench Press' }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/Predefined sets · Flat Barbell Bench Press/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Skip' }).click();
  await expect(page.getByText('No predefined sets')).toBeVisible();
  // Give the exercise a set, then open the editor again: Skip is gone and Cancel keeps the set.
  await page.getByRole('button', { name: /^Flat Barbell Bench Press/ }).click();
  await page.getByRole('menuitem', { name: 'Edit Predefined Sets' }).click();
  await expect(dialog.getByRole('button', { name: 'Skip' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Add Set' }).click();
  await dialog.getByRole('textbox', { name: 'Weight' }).fill('60');
  await dialog.getByRole('textbox', { name: 'Reps' }).fill('8');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('60 kg × 8 reps')).toBeVisible();
  await page.getByRole('button', { name: /^Flat Barbell Bench Press/ }).click();
  await page.getByRole('menuitem', { name: 'Edit Predefined Sets' }).click();
  await expect(dialog.getByRole('button', { name: 'Skip' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByText('60 kg × 8 reps')).toBeVisible();
});

test('graph y-axis shows time ticks as minutes:seconds', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Start New Workout' }).click();
  await page.getByRole('button', { name: 'Cardio' }).click();
  await page.getByRole('button', { name: 'Cycling' }).first().click();
  await page.getByRole('textbox', { name: 'Distance', exact: true }).fill('5000');
  await page.getByRole('textbox', { name: 'Minutes' }).fill('25');
  await page.getByRole('textbox', { name: 'Seconds' }).fill('30');
  await page.getByTestId('save-set').click();
  await expect(
    page.getByTestId('set-list').getByRole('button', { name: 'Set 1: 5000 m × 25:30' }),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Graph' }).click();
  await page.getByLabel('Graph type').selectOption({ label: 'Max Time' });
  // Several distinct m:ss labels, not a column of "1" (the x labels share the class, hence the regex).
  const timeTicks = page.locator('text.chart__tick').filter({ hasText: /^\d+:\d\d$/ });
  await expect.poll(() => timeTicks.count()).toBeGreaterThanOrEqual(5);
  const labels = await timeTicks.allTextContents();
  expect(new Set(labels).size).toBe(labels.length);
  // The point details keep their unit-bearing format.
  await page.getByRole('button', { name: 'Next point' }).click();
  await expect(page.locator('.point-details__value')).toHaveText('25:30');
});

test('a measurement goal typed with a unit change is saved as typed', async ({ page }) => {
  await openApp(page);
  await page.goto('/#/body');
  const editor = async () => {
    await page.goto('/#/body/measurement/1');
    await expect(page.getByText('Edit Measurement')).toBeVisible();
  };
  await editor();
  await page.getByRole('combobox').first().selectOption({ label: 'Pounds (lbs)' });
  await page.getByLabel('Goal').selectOption({ label: 'Specific value' });
  await page.getByLabel('Target value (lbs)').fill('170');
  // No recorded values and a typed goal: nothing to convert, so no Change unit dialog.
  await page.getByRole('button', { name: 'Save' }).first().click();
  await expect(page.getByRole('button', { name: /Bodyweight/ })).toBeVisible();
  await editor();
  await expect(page.getByLabel('Target value (lbs)')).toHaveValue('170');
  // A recorded value makes the dialog appear; Convert values must still keep the typed goal.
  await page.goto('/#/body');
  await page.getByRole('button', { name: /Bodyweight/ }).click();
  await page
    .getByRole('dialog')
    .getByRole('textbox', { name: /^Value/ })
    .fill('176');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('176 lbs')).toBeVisible();
  await editor();
  await page.getByRole('combobox').first().selectOption({ label: 'Kilograms (kgs)' });
  await page.getByLabel('Target value (kgs)').fill('77');
  await page.getByRole('button', { name: 'Save' }).first().click();
  await page.getByRole('button', { name: 'Convert values' }).click();
  await expect(page.getByRole('button', { name: /Bodyweight/ })).toContainText('79.83 kgs');
  await editor();
  await expect(page.getByLabel('Target value (kgs)')).toHaveValue('77');
  // Left untouched, the goal converts with the values.
  await page.getByRole('combobox').first().selectOption({ label: 'Pounds (lbs)' });
  await page.getByRole('button', { name: 'Save' }).first().click();
  await expect(page.getByText(/the goal too/)).toBeVisible();
  await page.getByRole('button', { name: 'Convert values' }).click();
  await expect(page.getByRole('button', { name: /Bodyweight/ })).toContainText('176 lbs');
  await editor();
  await expect(page.getByLabel('Target value (lbs)')).toHaveValue(/^169\.7/);
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
