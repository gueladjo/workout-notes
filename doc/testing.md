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

| File                               | Covers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema.test.ts`                   | DDL matches the canonical column lists, seeds, `ensureSchema` upgrade of an old-shaped backup (added columns, BodyWeight and legacy comment migrations with kg to lbs for an imperial backup, version stamp), idempotence, deleted migrated rows staying deleted, migrations only into tables it created, never downgrading, backup validation                                                                                                                                                                                                                                                                                                      |
| `workouts.test.ts`                 | repositories: sets/comments/PR flags (tied records re-awarded after moves and re-orders), pre-fill, workout dates, re-ordering keeps comments, copy/move/delete, supersets, exercises (type change: cleared fields, goals, the rollback snapshot written first and nothing changed when it cannot be written; unit change), categories, settings round trip, routines (planned sets, logging, copy), measurements                                                                                                                                                                                                                                   |
| `routines.test.ts`                 | predefined sets keep their ids, and so the `training_log` links planning fills blanks from, across an unchanged save, value edits and reorders; additions insert, removals delete only their row, copying a routine allocates rows of its own, an id of another routine exercise or one given twice is refused with nothing written, a column the app does not know survives on retained rows                                                                                                                                                                                                                                                       |
| `backup.test.ts`                   | export -> open -> export byte identity, restore with snapshot, rejection of non-backups and of a damaged backup (intact header and schema page, `training_log` root page overwritten: `openBackup` refuses it and `restoreBackup` leaves the stored database, the snapshots and the live data untouched), legacy-shaped and newer backups still reconciling through `openBackup`, file naming, CSV layout, snapshot pruning, the backup handle closed when the flush before a restore fails, a restore whose data is live but could not be saved reported as such (`persistError`)                                                                  |
| `recovery.test.ts`                 | start-up recovery: `openStoredDatabase` wraps garbage, a table shadowed by a view and a database with damaged data pages in `UnreadableDatabaseError` carrying the bytes; `recoverFromSnapshot` and `rollbackToSnapshot` refuse an unreadable or damaged snapshot without writing or pruning anything, and otherwise keep the replaced database as a snapshot; `startFresh`                                                                                                                                                                                                                                                                         |
| `download.test.ts`                 | Web Share wrapper: shared vs cancelled share sheet (an AbortError is not a backup)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `reminder.test.ts`                 | backup reminder rule (14-day threshold, first-use clock, snooze) and its localStorage bookkeeping                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `instance.test.ts`                 | single-instance lock with fake Web Locks and BroadcastChannels: a new window gets the lock only after the running one's takeover handler and held work (recovery writes) finish, no held work may start afterwards, a takeover requested before the handler exists runs once it is registered, a third window that asks while the second is still queued (the first still flushing, or still draining held work) gets the lock from the second, two windows starting together leave the later one running, a window that asked and was closed before its turn is not handed over to, with the fake's grant/release log showing one holder at a time |
| `store.test.ts`                    | transaction rollback, `run()` outside `mutate()` refused, single notification per outer mutation, debounced persist, retry after failure, persist subscribers told when saving starts failing and when it works again, `replaceDatabase()` adopting the new database and resolving with the error when saving it fails, `close()` for a handover (earlier changes written, new ones refused, nothing written afterwards, a failed last write reported with the bytes still exportable)                                                                                                                                                              |
| `graphs.test.ts`                   | progress-graph series: workouts with no set under the estimated 1RM rep cap, or without a timed set for speed/pace, get no point instead of a 0; display conversion of series values (pace as minutes per km or mile, speed, distance, weight, time); axis labels (`formatGraphAxisValue`, `tickDecimals`: m:ss with tenths under a second of spacing, signed below zero, decimals from the tick spacing) and point values (`formatGraphValue`)                                                                                                                                                                                                     |
| `wake-lock.test.ts`                | `keepScreenOn()` with a fake WakeLock and document: a sentinel granted after stop() or while one is held is released, re-acquire after the page was hidden, no request while hidden, a denied request is survived                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `records.test.ts`, `dates.test.ts` | domain maths: Brzycki, PR selection, actual/estimated rep maxes, date arithmetic and week starts, durations                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `format.test.ts`                   | stat formatting (speed, pace per km or mile), `parseDecimal`, and the shared set editor's draft (`parseSetField`, `setDraftFrom`, `readSetDraft`): malformed, negative, non-finite and bad hh / mm / ss text refused, decimal comma, blank and 0 saved as 0, an untouched field saving the stored value back exactly (20 kg shown as 44.09 lbs, a mile shown as 1, fractional seconds), a typed distance taking the display unit                                                                                                                                                                                                                    |

Sample data comes from `tests/helpers/sample.ts` (`seedSampleWorkouts`), which is also what
`npm run make-fixture` writes to `tests/fixtures/generated/sample.fitnotes`.
`tests/helpers/corrupt.ts` (`damageTableRootPage`) copies a database with one table's root page
overwritten: header and schema intact, data pages damaged, the case `checkIntegrity` exists for.

## End-to-end tests (`tests/e2e/smoke.spec.ts`)

One spec against the production build, on Playwright's Pixel 7 profile with the `en-GB` locale (a
fresh database starts in kilograms unless the locale is `en-US`, see `defaultMetric` in
`src/app/recovery.ts`). The tests fall into these groups; the test names are the full list.

- **Persistence and recovery:** log a set, reload, it is still there (IndexedDB plus the PR trophy);
  a stored database with damaged data pages behind an intact header reaches the Recovery screen
  instead of a blank app, and restoring the "Before restore" snapshot from there brings the earlier
  set back; the app loads offline once the service worker is active; while every IndexedDB write
  fails a banner follows the user to every screen and Settings > Storage says the same, its Save
  Backup carries the unsaved set, and once writes work again the banner goes and the set survives a
  reload.
- **Backup and restore:** restore the generated `.fitnotes` fixture through the file chooser, check
  the counts and a restored workout, then export a backup and check it is a SQLite file with
  FitNotes' file name; a file the browser cannot read is reported in a toast and Restore stays
  usable; the Home backup reminder appears and goes once a backup is saved; the "last backup" note
  shows its local calendar day; the Default Weight Increment box shows a restored value and a
  focus and blur does not write the old one back.
- **One instance at a time:** a second tab takes the database over from a running first one, and
  from one on the Recovery screen; with the first window's IndexedDB opens held back by the test so
  its handover stays in flight, a third window opened while the second is still queued gets the
  database (and the first window's set) after the second.
- **Rollback snapshots:** changing an exercise's type takes a snapshot that brings the cleared
  values back, also when saved together with a weight unit change; resetting a measurement takes one
  too; Delete Workout History lists its snapshot without leaving Settings.
- **Set entry rules** (the `shared set editors` block and the Track tab tests): a weight typed with a
  decimal comma (`82,5`, what a comma-region decimal keypad types) saves as 82.5 and the +/- buttons
  step from it (`parseDecimal` in `src/ui/format.ts`); a cardio set in metres with the hh / mm / ss
  boxes; Update keeps the exact weight of an untouched lbs field; Edit Sets and Copy Sets refuse
  malformed and negative values with the Track tab's toast and the stored set survives a reload; a
  blank predefined set saves as 0 (the copy-previous placeholder) and the predefined sets editor and
  Log All refuse a negative value writing nothing; Edit Set steps like the Track tab, keeps the note,
  refuses a malformed weight and deletes the set; the X in Edit Sets drops a set on Save but not on
  Cancel; a goal refuses an invalid target instead of saving 0; a distance goal created under
  Imperial keeps its unit and distance when saved untouched under Metric; a measurement goal typed
  with a unit change is saved as typed; a body measurement record refuses a blank value (a typed 0
  saves).
- **Screens and navigation:** press-and-hold drag reorders sets on the Track tab; superset groups
  from the Training screen and from the routine editor; skipping predefined sets keeps the exercise
  and editing then offers Cancel only; a swipe inside a Home dialog does not change the day it
  writes to, and a dialog closed by the date moving on does not reopen on the way back; Exercise
  Overview history is read-only; the Exercise List's History entry opens the tracked day's History
  tab; the set-row trophy opens that rep count's record history; Stats' Workout period shows and
  computes the same date; Copy Previous Workout picks the workout on the calendar first, and
  entering copy mode by URL forgets the day tapped in the popup; the custom unit dialog starts
  empty and the Calendar exercise filter shows the current filter when reopened; the body graph day
  popup hides disabled measurements; the graph y-axis shows time ticks as minutes:seconds; Log All
  on today returns to the Home route.
- **Content Security Policy:** the built page carries the policy (`connect-src 'self'`); one test
  logs a set and saves a backup under it and fails on any violation logged to the console.

## Visual checks

`npm run screenshots` builds the app, serves it on port 4174, restores the generated fixture and
writes phone-sized screenshots of every main screen (light and dark) to `./screenshots`
(git-ignored). Look at them after UI changes; the script is also the quickest way to see a screen
with data without clicking through the app. It launches Playwright's Chromium directly, so run
`npm run setup:e2e` (or `npm run test:e2e`) once on a new machine first.

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
