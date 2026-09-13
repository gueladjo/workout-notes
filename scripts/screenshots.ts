/**
 * Build the app, serve it, and screenshot the main screens on a phone-sized viewport into
 * ./screenshots (git-ignored). Restores the generated fixture so screens have data.
 *
 *   npm run screenshots            # -> screenshots/*.png
 *
 * Requires `npx playwright install chromium` once. Uses port 4174 and a separate build directory,
 * so it can run alongside `npm run test:e2e`.
 */
import { chromium, devices } from '@playwright/test';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2] ?? join(process.cwd(), 'screenshots');
const DIST = join(process.cwd(), 'node_modules', '.cache', 'workoutnotes-screenshots-dist');
const FIXTURE = join(DIST, 'sample.fitnotes');
const PORT = 4174;
mkdirSync(OUT, { recursive: true });

execFileSync('npx', ['vite', 'build', '--outDir', DIST], { stdio: 'inherit' });
execFileSync('npx', ['tsx', 'scripts/make-fixture.ts', FIXTURE], { stdio: 'inherit' });
const preview = spawn(
  'npx',
  ['vite', 'preview', '--outDir', DIST, '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
  { stdio: 'ignore' },
);
await new Promise((r) => setTimeout(r, 2500));

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'en-GB' });
const page = await ctx.newPage();
const base = `http://127.0.0.1:${PORT}/`;
const shot = (name: string) => page.screenshot({ path: join(OUT, `${name}.png`) });
const settle = () => page.waitForTimeout(350);

try {
  await page.goto(base);
  await page.getByText('Start New Workout').first().waitFor({ timeout: 30_000 });
  await shot('01-home-empty');
  await page.goto(base + '#/settings');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Restore Backup…' }).click();
  await (await chooser).setFiles(FIXTURE);
  await page.getByRole('button', { name: 'Restore', exact: true }).click();
  await page.getByText('Backup restored').waitFor({ timeout: 30_000 });
  await page.getByRole('button', { name: 'OK' }).click();
  await page.goto(base + '#/settings');
  await settle();
  await shot('02-settings');
  await page.goto(base + '#/workout/2026-09-08');
  await page.getByText('Barbell Squat').waitFor();
  await shot('03-home-workout');
  await page.goto(base + '#/exercises?date=2026-09-08');
  await page.getByText('Chest').waitFor();
  await shot('04-exercise-list');
  await page.getByRole('button', { name: 'Chest' }).click();
  await page.getByText('Flat Barbell Bench Press').waitFor();
  await shot('05-exercises-chest');
  await page.getByRole('button', { name: 'Flat Barbell Bench Press' }).first().click();
  await page.getByRole('tab', { name: 'Track' }).waitFor();
  await settle();
  await shot('06-training-track');
  await page.getByRole('tab', { name: 'History' }).click();
  await settle();
  await shot('07-training-history');
  await page.getByRole('tab', { name: 'Graph' }).click();
  await page.waitForTimeout(600);
  await shot('08-training-graph');
  await page.getByRole('button', { name: 'Records, stats and goals' }).click();
  await settle();
  await shot('09-records');
  await page.goto(base + '#/calendar?date=2026-09-08');
  await settle();
  await shot('10-calendar');
  await page.getByRole('button', { name: '2026-09-08' }).click();
  await settle();
  await shot('11-calendar-popup');
  await page.goto(base + '#/calendar?date=2026-09-08&copy=1');
  await settle();
  await page.getByRole('button', { name: '2026-09-01' }).click();
  await settle();
  await shot('11b-calendar-copy');
  await page.goto(base + '#/routine/1?date=2026-09-08');
  await settle();
  await shot('12-routine');
  await page.goto(base + '#/body');
  await settle();
  await shot('13-body');
  await page.goto(base + '#/settings');
  await settle();
  await page.locator('select').first().selectOption('1'); // Theme: Dark
  await settle();
  await page.goto(base + '#/workout/2026-09-08');
  await page.getByText('Barbell Squat').waitFor();
  await shot('14-home-dark');
  await page.goto(base + '#/train/2026-09-08/37');
  await page.getByRole('tab', { name: 'Track' }).waitFor();
  await page.getByRole('button', { name: 'Navigation panel' }).click();
  await settle();
  await shot('15-nav-panel-dark');
  console.log(`screenshots written to ${OUT}`);
} finally {
  await browser.close();
  preview.kill();
}
