/**
 * Delete generated files and folders so the checkout is back to what git tracks.
 * Plain Node with no dependencies: it must keep working after node_modules is gone.
 *
 *   npm run clean                 # everything below, including node_modules
 *   npm run clean -- --keep-deps  # same, but keep node_modules (faster reinstall not needed)
 *   npm run clean -- --dry-run    # only print what would be removed
 */
import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const GENERATED = [
  'dist', // vite build
  'dev-dist', // vite-plugin-pwa dev service worker
  'playwright-report',
  'test-results',
  'coverage',
  'screenshots', // npm run screenshots
  'tests/fixtures/generated', // npm run make-fixture
];
const DEPENDENCIES = ['node_modules'];

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const keepDeps = args.has('--keep-deps');
const targets = keepDeps ? GENERATED : [...GENERATED, ...DEPENDENCIES];
const root = resolve(import.meta.dirname, '..');

let removed = 0;
for (const target of targets) {
  const path = resolve(root, target);
  if (!existsSync(path)) continue;
  console.log(`${dryRun ? 'would remove' : 'removing'} ${target}`);
  if (!dryRun) rmSync(path, { recursive: true, force: true });
  removed++;
}
console.log(removed === 0 ? 'nothing to clean' : `${dryRun ? 'would remove' : 'removed'} ${removed} item(s)`);
if (!keepDeps && !dryRun) console.log('run `npm ci` to reinstall dependencies');
