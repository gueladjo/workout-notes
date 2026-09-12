/**
 * `npm run test:e2e [-- playwright args]`: install or repair Playwright's Chromium if needed
 * (see ensure-playwright.mjs), then run the end-to-end suite with the environment it requires.
 */
import { spawn } from 'node:child_process';
import { ensurePlaywright, playwrightCli, projectRoot } from './ensure-playwright.mjs';

const env = await ensurePlaywright({ install: true });
const child = spawn(process.execPath, [playwrightCli, 'test', ...process.argv.slice(2)], {
  cwd: projectRoot,
  env,
  stdio: 'inherit',
});
child.on('exit', (code, signal) => {
  process.exitCode = signal ? 1 : (code ?? 1);
});
