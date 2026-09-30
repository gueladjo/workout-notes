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
| `backup.test.ts`                   | export -> open -> export byte identity, restore with snapshot, rejection of non-backups and of a damaged backup (intact header and schema page, `training_log` root page overwritten: `openBackup` refuses it and `restoreBackup` leaves the stored database, the snapshots and the live data untouched), legacy-shaped and newer backups still reconciling through `openBackup`, file naming, CSV layout, snapshot pruning, the backup handle closed when the flush before a restore fails                                                                                                                                                         |
| `recovery.test.ts`                 | start-up recovery: `openStoredDatabase` wraps garbage, a table shadowed by a view and a database with damaged data pages in `UnreadableDatabaseError` carrying the bytes; `recoverFromSnapshot` and `rollbackToSnapshot` refuse an unreadable or damaged snapshot without writing or pruning anything, and otherwise keep the replaced database as a snapshot; `startFresh`                                                                                                                                                                                                                                                                         |
| `download.test.ts`                 | Web Share wrapper: shared vs cancelled share sheet (an AbortError is not a backup)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `reminder.test.ts`                 | backup reminder rule (14-day threshold, first-use clock, snooze) and its localStorage bookkeeping                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `instance.test.ts`                 | single-instance lock with fake Web Locks and BroadcastChannels: a new window gets the lock only after the running one's takeover handler and held work (recovery writes) finish, no held work may start afterwards, a takeover requested before the handler exists runs once it is registered, a third window that asks while the second is still queued (the first still flushing, or still draining held work) gets the lock from the second, two windows starting together leave the later one running, a window that asked and was closed before its turn is not handed over to, with the fake's grant/release log showing one holder at a time |
| `store.test.ts`                    | transaction rollback, `run()` outside `mutate()` refused, single notification per outer mutation, debounced persist, retry after failure, `close()` for a handover (earlier changes written, new ones refused, nothing written afterwards, a failed last write reported with the bytes still exportable)                                                                                                                                                                                                                                                                                                                                            |
| `graphs.test.ts`                   | progress-graph series: workouts with no set under the estimated 1RM rep cap, or without a timed set for speed/pace, get no point instead of a 0; display conversion of series values (pace as minutes per km or mile, speed, distance, weight, time); axis labels (`formatGraphAxisValue`, `tickDecimals`: m:ss with tenths under a second of spacing, signed below zero, decimals from the tick spacing) and point values (`formatGraphValue`)                                                                                                                                                                                                     |
| `wake-lock.test.ts`                | `keepScreenOn()` with a fake WakeLock and document: a sentinel granted after stop() or while one is held is released, re-acquire after the page was hidden, no request while hidden, a denied request is survived                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `records.test.ts`, `dates.test.ts` | domain maths: Brzycki, PR selection, actual/estimated rep maxes, date arithmetic and week starts, durations                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `format.test.ts`                   | stat formatting (speed, pace per km or mile), `parseDecimal`, and the shared set editor's draft (`parseSetField`, `setDraftFrom`, `readSetDraft`): malformed, negative, non-finite and bad hh / mm / ss text refused, decimal comma, blank and 0 saved as 0, an untouched field saving the stored value back exactly (20 kg shown as 44.09 lbs, a mile shown as 1, fractional seconds), a typed distance taking the display unit                                                                                                                                                                                                                    |

Sample data comes from `tests/helpers/sample.ts` (`seedSampleWorkouts`), which is also what
`npm run make-fixture` writes to `tests/fixtures/generated/sample.fitnotes`.
`tests/helpers/corrupt.ts` (`damageTableRootPage`) copies a database with one table's root page
overwritten: header and schema intact, data pages damaged, the case `checkIntegrity` exists for.

## End-to-end tests (`tests/e2e/smoke.spec.ts`)

The journeys that matter for a local-first app:

1. log a set, reload, the set is still there (IndexedDB persistence + PR trophy); a weight typed
   with a decimal comma (`82,5`, what a comma-region decimal keypad types) saves as 82.5 and the
   +/- buttons step from it (`parseDecimal` in `src/ui/format.ts`); a separate test taps the
   trophy and expects the 5RM record history on Records,
2. restore the generated `.fitnotes` fixture through the file chooser, verify counts and a
   restored workout, then export a backup and check it is a SQLite file with FitNotes' file name,
3. reload offline after the service worker is active,
4. create a distance goal under Imperial, switch to Metric and save the goal untouched: it keeps its
   unit and distance after a reload,
5. two windows: the second takes the database over from a running first one, and from one stuck on
   the Recovery screen; three windows: with the first window's IndexedDB opens held back by the
   test so its handover stays in flight, a third window opened while the second is still queued
   gets the database (and the first window's set) after the second,
6. a stored database whose data pages are damaged behind an intact header reaches the Recovery
   screen instead of a blank app, and restoring the "Before restore" snapshot from there brings the
   earlier set back,
7. change an exercise's type: the history loses the dropped fields, Settings lists the snapshot
   taken first, and rolling back to it brings them back; saved together with a weight unit change,
   the snapshot is listed too,
8. the shared set editors (`shared set editors` describe block): Edit Sets on the History tab
   refuses malformed and negative values with the Track tab's toast and the stored set is unchanged
   after a reload, a decimal-comma edit saves and survives a reload, Copy Sets refuses a negative
   value; a predefined set saved with a blank weight stores 0 (the copy-previous placeholder), the
   predefined sets editor and Log All refuse a negative value writing nothing, and Log All then logs
   a corrected one; Edit Set on the History tab steps the weight and reps like the Track tab, saves
   the note, refuses a malformed weight writing nothing, and its Delete removes the set.

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
