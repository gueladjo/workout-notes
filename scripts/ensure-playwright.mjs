/**
 * Make sure the Chromium build Playwright expects is installed and can start, without any manual
 * `npx playwright install` step. Plain Node with no dependencies beyond @playwright/test.
 *
 *   npm run setup:e2e   # install what is missing (test:e2e does this automatically as well)
 *
 * Browsers go to Playwright's normal cache (or $PLAYWRIGHT_BROWSERS_PATH), so one download serves
 * every checkout. On Linux without root, missing shared libraries are downloaded from the Debian 12
 * package archive and extracted into the ignored `work/` folder; the returned environment adds them
 * to LD_LIBRARY_PATH. Anything else falls back to the usual `npx playwright install-deps chromium`.
 */
import { spawn } from 'node:child_process';
import { access, mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { delimiter, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = resolve(import.meta.dirname, '..');
export const playwrightCli = resolve(projectRoot, 'node_modules/@playwright/test/cli.js');

const platformKey = `${process.platform}-${process.arch}`;
const depsRoot = resolve(projectRoot, 'work/playwright-deps', platformKey);
const aptRoot = resolve(depsRoot, 'apt');
const libRoot = resolve(depsRoot, 'root');
const libraryDirectories = ['lib/x86_64-linux-gnu', 'usr/lib/x86_64-linux-gnu', 'usr/lib'].map((dir) =>
  resolve(libRoot, dir),
);

// Runtime packages of Playwright's Chromium on Debian 12 (subset of `playwright install-deps`).
const CHROMIUM_PACKAGES = [
  'libasound2',
  'libatk-bridge2.0-0',
  'libatk1.0-0',
  'libatspi2.0-0',
  'libcairo2',
  'libcups2',
  'libdbus-1-3',
  'libdrm2',
  'libgbm1',
  'libglib2.0-0',
  'libnspr4',
  'libnss3',
  'libpango-1.0-0',
  'libx11-6',
  'libxcb1',
  'libxcomposite1',
  'libxdamage1',
  'libxext6',
  'libxfixes3',
  'libxkbcommon0',
  'libxrandr2',
];

/** Environment for running Playwright with the project-local libraries (a no-op when none exist). */
export function playwrightEnvironment() {
  const env = { ...process.env };
  if (process.platform === 'linux') {
    env.LD_LIBRARY_PATH = [...libraryDirectories, process.env.LD_LIBRARY_PATH]
      .filter(Boolean)
      .join(delimiter);
  }
  return env;
}

function run(command, args, { capture = false } = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      env: playwrightEnvironment(),
      stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    });
    let stdout = '';
    if (capture) child.stdout.on('data', (chunk) => (stdout += chunk));
    child.on('error', rejectRun);
    child.on('exit', (code, signal) => {
      if (code === 0) resolveRun(stdout);
      else rejectRun(new Error(`${command} ${args[0]} exited with ${signal ?? `code ${code}`}`));
    });
  });
}

async function exists(path) {
  return access(path).then(
    () => true,
    () => false,
  );
}

async function chromiumExecutable() {
  const { chromium } = await import('@playwright/test');
  return chromium.executablePath();
}

async function ensureChromium(install) {
  const executable = await chromiumExecutable();
  if (await exists(executable)) return executable;
  if (!install)
    throw new Error(`Playwright's Chromium is missing at ${executable}. Run \`npm run setup:e2e\`.`);
  console.log('Downloading the Chromium build required by Playwright (one time per Playwright version)...');
  await run(process.execPath, [playwrightCli, 'install', 'chromium']);
  if (!(await exists(executable))) throw new Error(`Chromium was not installed at ${executable}.`);
  return executable;
}

async function missingSharedLibraries(executable) {
  let output;
  try {
    output = await run('ldd', [executable], { capture: true });
  } catch {
    return []; // No ldd: let Chromium itself report the problem.
  }
  const missing = output
    .split('\n')
    .map((line) => /^\s*(\S+)\s+=>\s+not found\s*$/.exec(line)?.[1])
    .filter(Boolean);
  return [...new Set(missing)];
}

async function assertRootlessDebian12() {
  const hint = 'Run `npx playwright install-deps chromium` with administrator access instead.';
  if (process.platform !== 'linux' || process.arch !== 'x64') {
    throw new Error(`Rootless library setup supports Linux x64 only. ${hint}`);
  }
  const osRelease = await readFile('/etc/os-release', 'utf8').catch(() => '');
  if (!/^ID=debian$/m.test(osRelease) || !/^VERSION_ID="?12"?$/m.test(osRelease)) {
    throw new Error(`Rootless library setup supports Debian 12 only. ${hint}`);
  }
  if (!(await exists('/usr/bin/apt-get')) || !(await exists('/usr/bin/dpkg-deb'))) {
    throw new Error(`apt-get and dpkg-deb are required. ${hint}`);
  }
}

/** Download the Chromium runtime packages without root and unpack them under work/. */
export async function prepareLocalLibraries() {
  await assertRootlessDebian12();
  const lists = resolve(aptRoot, 'lists');
  const archives = resolve(aptRoot, 'archives');
  await Promise.all([
    mkdir(resolve(lists, 'partial'), { recursive: true }),
    mkdir(resolve(archives, 'partial'), { recursive: true }),
  ]);
  const aptOptions = [
    '-o',
    'Debug::NoLocking=1',
    '-o',
    `Dir::State::lists=${lists}`,
    '-o',
    `Dir::Cache=${aptRoot}`,
    '-o',
    `Dir::Cache::archives=${archives}`,
    '-o',
    'APT::Get::List-Cleanup=0',
  ];
  await run('apt-get', [...aptOptions, 'update']);
  await run('apt-get', [
    ...aptOptions,
    '--download-only',
    '--no-install-recommends',
    '-y',
    'install',
    ...CHROMIUM_PACKAGES,
  ]);

  await rm(libRoot, { recursive: true, force: true });
  await mkdir(libRoot, { recursive: true });
  const packages = (await readdir(archives)).filter((name) => name.endsWith('.deb')).sort();
  if (packages.length === 0) throw new Error('apt-get did not download any packages.');
  for (const name of packages) await run('dpkg-deb', ['--extract', resolve(archives, name), libRoot]);
}

/**
 * Check (and with `install`, repair) the Playwright browser setup.
 * Returns the environment `playwright test` must run with.
 */
export async function ensurePlaywright({ install = false } = {}) {
  const executable = await ensureChromium(install);
  if (process.platform !== 'linux') return playwrightEnvironment();

  const missing = await missingSharedLibraries(executable);
  if (missing.length === 0) return playwrightEnvironment();
  if (!install) {
    throw new Error(
      `Chromium cannot start, missing libraries: ${missing.join(', ')}. Run \`npm run setup:e2e\`.`,
    );
  }
  console.log(`Chromium needs ${missing.join(', ')}; preparing project-local copies under work/...`);
  await prepareLocalLibraries();
  const remaining = await missingSharedLibraries(executable);
  if (remaining.length > 0) throw new Error(`Chromium still lacks ${remaining.join(', ')}.`);
  console.log('Project-local Chromium libraries are ready.');
  return playwrightEnvironment();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await ensurePlaywright({ install: true });
  console.log('Playwright is ready: run `npm run test:e2e`.');
}
