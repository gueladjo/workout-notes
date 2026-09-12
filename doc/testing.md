# Testing

## Commands

| Command | What it runs |
| --- | --- |
| `npm run check` | `tsc --noEmit`, `eslint .`, `vitest run` — the pre-commit gate |
| `npm test` / `npm run test:watch` | unit tests only |
| `npm run test:e2e` | Playwright against `vite preview` of a fresh production build (mobile Chromium profile) |
| `npm run build` | production build; fails loudly if the PWA plugin or WASM asset is misconfigured |

Playwright needs a browser once: `npx playwright install chromium` (add `--with-deps` on a bare
Linux box).

## Unit tests (`tests/unit`)

They run in Node against real sql.js databases created by `createEmptyDatabase()`; no browser, no
mocks of the database. `fake-indexeddb` stands in for IndexedDB in persistence/backup tests.

| File | Covers |
| --- | --- |
| `schema.test.ts` | DDL matches the canonical column lists, seeds, `ensureSchema` upgrade of an old-shaped backup (added columns, BodyWeight and legacy comment migrations, version stamp), idempotence, never downgrading, backup validation |
| `workouts.test.ts` | repositories: sets/comments/PR flags, pre-fill, workout dates, re-ordering keeps comments, copy/move/delete, supersets, exercises (type change, unit change), categories, settings round trip, routines (planned sets, logging, copy), measurements |
| `backup.test.ts` | export -> open -> export byte identity, restore with snapshot, rejection of non-backups, file naming, CSV layout, snapshot pruning |
| `store.test.ts` | transaction rollback, `run()` outside `mutate()` refused, single notification per outer mutation, debounced persist, retry after failure |
| `records.test.ts`, `dates.test.ts` | domain maths: Brzycki, PR selection, actual/estimated rep maxes, date arithmetic and week starts, durations |

Sample data comes from `tests/helpers/sample.ts` (`seedSampleWorkouts`), which is also what
`npm run make-fixture` writes to `tests/fixtures/generated/sample.fitnotes`.

## End-to-end tests (`tests/e2e/smoke.spec.ts`)

The journeys that matter for a local-first app:

1. log a set, reload, the set is still there (IndexedDB persistence + PR trophy),
2. restore the generated `.fitnotes` fixture through the file chooser, verify counts and a
   restored workout, then export a backup and check it is a SQLite file with FitNotes' file name,
3. reload offline after the service worker is active.

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
