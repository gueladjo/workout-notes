# Testing

## Commands

| Command                           | What it runs                                                                            |
| --------------------------------- | --------------------------------------------------------------------------------------- |
| `npm run check`                   | `tsc --noEmit`, `eslint .`, `vitest run` — the pre-commit gate                          |
| `npm test` / `npm run test:watch` | unit tests only                                                                         |
| `npm run test:e2e`                | Playwright against `vite preview` of a fresh production build (mobile Chromium profile) |
| `npm run build`                   | production build; fails loudly if the PWA plugin or WASM asset is misconfigured         |

### Playwright browser setup

`npm run test:e2e` runs `scripts/run-e2e.mjs`, which calls `scripts/ensure-playwright.mjs` before
starting Playwright, so no manual `npx playwright install` is needed:

- If the Chromium build for the installed Playwright version is missing, it is downloaded into
  Playwright's normal cache (`~/.cache/ms-playwright`, or `$PLAYWRIGHT_BROWSERS_PATH`), shared by
  every checkout on the machine.
- On Linux, `ldd` checks that Chromium's shared libraries resolve. If some are missing and the box
  is Debian 12 x64 without root (WSL, containers), the packages are downloaded with
  `apt-get --download-only`, unpacked with `dpkg-deb` into the git-ignored `work/` folder, and
  Playwright runs with `LD_LIBRARY_PATH` pointing at them. Elsewhere the script stops with the
  usual `npx playwright install-deps chromium` instruction.
- `npm run setup:e2e` performs only this preparation. CI installs system libraries as root with
  `npx playwright install --with-deps chromium` and then runs the same `npm run test:e2e`.

Pass Playwright arguments after `--`, e.g. `npm run test:e2e -- --headed` or a spec path.
`npm run clean` removes `work/`.

## Unit tests (`tests/unit`)

They run in Node against real sql.js databases created by `createEmptyDatabase()`; no browser, no
mocks of the database. `fake-indexeddb` stands in for IndexedDB in persistence/backup tests.

| File                               | Covers                                                                                                                                                                                                                                                                                                   |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema.test.ts`                   | DDL matches the canonical column lists, seeds, `ensureSchema` upgrade of an old-shaped backup (added columns, BodyWeight and legacy comment migrations, version stamp), idempotence, deleted migrated rows staying deleted, migrations only into tables it created, never downgrading, backup validation |
| `workouts.test.ts`                 | repositories: sets/comments/PR flags, pre-fill, workout dates, re-ordering keeps comments, copy/move/delete, supersets, exercises (type change, unit change), categories, settings round trip, routines (planned sets, logging, copy), measurements                                                      |
| `backup.test.ts`                   | export -> open -> export byte identity, restore with snapshot, rejection of non-backups, file naming, CSV layout, snapshot pruning                                                                                                                                                                       |
| `download.test.ts`                 | Web Share wrapper: shared vs cancelled share sheet (an AbortError is not a backup)                                                                                                                                                                                                                       |
| `reminder.test.ts`                 | backup reminder rule (14-day threshold, first-use clock, snooze) and its localStorage bookkeeping                                                                                                                                                                                                        |
| `instance.test.ts`                 | single-instance lock with fake Web Locks and BroadcastChannels: a new window gets the lock only after the running one's takeover handler and held work (recovery writes) finish, no held work may start afterwards, a takeover requested before the handler exists runs once it is registered            |
| `store.test.ts`                    | transaction rollback, `run()` outside `mutate()` refused, single notification per outer mutation, debounced persist, retry after failure, `close()` for a handover (earlier changes written, new ones refused, nothing written afterwards, a failed last write reported with the bytes still exportable) |
| `graphs.test.ts`                   | progress-graph series: workouts with no set under the estimated 1RM rep cap, or without a timed set for speed/pace, get no point instead of a 0; display conversion of series values (pace as minutes per km or mile, speed, distance, weight, time)                                                     |
| `records.test.ts`, `dates.test.ts` | domain maths: Brzycki, PR selection, actual/estimated rep maxes, date arithmetic and week starts, durations                                                                                                                                                                                              |

Sample data comes from `tests/helpers/sample.ts` (`seedSampleWorkouts`), which is also what
`npm run make-fixture` writes to `tests/fixtures/generated/sample.fitnotes`.

## End-to-end tests (`tests/e2e/smoke.spec.ts`)

The journeys that matter for a local-first app:

1. log a set, reload, the set is still there (IndexedDB persistence + PR trophy),
2. restore the generated `.fitnotes` fixture through the file chooser, verify counts and a
   restored workout, then export a backup and check it is a SQLite file with FitNotes' file name,
3. reload offline after the service worker is active,
4. create a distance goal under Imperial, switch to Metric and save the goal untouched: it keeps its
   unit and distance after a reload,
5. two windows: the second takes the database over from a running first one, and from one stuck on
   the Recovery screen.

## Visual checks

`npm run screenshots` builds the app, serves it on port 4174, restores the generated fixture and
writes phone-sized screenshots of every main screen (light and dark) to `./screenshots`
(git-ignored). Look at them after UI changes; the script is also the quickest way to see a screen
with data without clicking through the app.

## Manual checks on devices

Before a release, on an iPhone (Safari, then Add to Home Screen) and an Android phone (Chrome,
install):

- Start the installed app in airplane mode; log a set; kill and relaunch; the set is present.
- Settings > Share Backup opens the share sheet with a `.fitnotes` file; Save Backup downloads.
- Restore a real FitNotes backup; Settings > Database shows expected counts; History/Graph/Records
  of a long-used exercise look right; distances show the unit used on Android.
- Export from WorkoutNotes and restore into FitNotes on Android (the one path that cannot be
  automated here). Report discrepancies in [fitnotes-format.md](fitnotes-format.md#open-questions).

## Inspecting a real backup

`npm run inspect-backup -- FitNotes_Backup.fitnotes [--samples]` prints `user_version`, every
table with its columns and row counts, differences from the canonical schema, and the distance
units in use. Real backups are personal data: keep them outside the repository (`*.fitnotes` is
git-ignored).
