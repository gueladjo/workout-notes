# AGENTS.md

WorkoutNotes is a React + TypeScript PWA whose database is a FitNotes-compatible SQLite file held in
memory by sql.js and persisted to IndexedDB. Read this file, then only the doc that matches the task.

## Invariants (do not break)

1. **No data leaves the device.** No network requests after the app shell is loaded; no analytics.
2. **The database is the FitNotes format.** Table and column names, ids and encodings in
   `src/db/schema.ts` and `src/db/constants.ts` are FitNotes' own. Never rename, retype or drop
   them; never add columns to FitNotes tables. App-only state goes in the `settings` row or in
   `localStorage`, nothing else.
3. **Every write is a transaction.** Repositories write only inside `AppDatabase.mutate()`
   (`AppDatabase.run()` throws otherwise). Do not call `db.raw.run()` from UI code.
4. **Schema changes are reconciliations, not migrations.** `ensureSchema()` must stay idempotent
   and must never delete or lower data it does not understand (unknown tables/columns, newer
   `user_version`).
5. **Destructive operations snapshot first.** Restore, rollback and delete-history call
   `saveSnapshot()` before touching the live database.
6. **Storage units are fixed.** Weight in kg (`metric_weight`), distance in metres (`distance`),
   time in seconds. Convert only at the UI edge with `src/domain/units.ts`.

## Where things live

| Task                                                         | Start here                                                                                                         |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Change a table, column, enum id or seed row                  | `src/db/schema.ts`, `src/db/constants.ts`, `src/db/seed.ts`; then [doc/fitnotes-format.md](doc/fitnotes-format.md) |
| Read/write data                                              | `src/db/repo/*.ts` (one file per concept); types in `src/db/types.ts`                                              |
| Business rules (records, graphs, stats, goals, units, dates) | `src/domain/*.ts` (pure functions, unit-tested)                                                                    |
| Screens                                                      | `src/ui/screens/*.tsx`; routes in `src/app/App.tsx`; screen map in [doc/ui.md](doc/ui.md)                          |
| Shared widgets and styles                                    | `src/ui/components/*.tsx`, `src/ui/styles.css` (all CSS lives here)                                                |
| Persistence, snapshots, backup/restore, CSV                  | `src/db/persistence.ts`, `src/backup/*.ts`; contract in [doc/storage.md](doc/storage.md)                           |
| Start-up, PWA, service worker                                | `src/app/bootstrap.ts`, `src/main.tsx`, `vite.config.ts`                                                           |
| Scripts (inspect a real backup, fixtures, icons, clean)      | `scripts/*` (run with `npm run <name>`); `npm run clean` removes node_modules and generated output                 |

Data flow: screen -> `useQuery(db => repo.x(db))` (re-runs after every mutation) -> repo SQL ->
sql.js. Writes: screen -> repo function -> `db.mutate()` -> subscribers re-query -> debounced persist.

## Validate

```bash
npm run check            # typecheck + lint + unit tests; must pass before committing
npm run test:e2e         # Playwright; installs Chromium on first run, no manual browser setup
npm run build            # must succeed; the PWA precache must include the .wasm
npm run screenshots      # phone-sized PNGs of every main screen in ./screenshots (visual check after UI work)
```

- Nothing runs automatically on push. `.github/workflows/ci.yml` runs exactly these commands plus
  `npm run format:check` and is triggered by hand (Actions > CI > Run workflow); keep them green
  locally rather than adding new validation entry points.
- Deployment is manual too: `npm run deploy` (check + build + publish `dist/` to the `gh-pages`
  branch). Never wire a deploy into a push trigger.
- Unit tests run against real sql.js databases in Node (`tests/unit`), no browser needed.
- After changing anything under `src/db`, run `npm run inspect-backup -- <real backup>` if a real
  `.fitnotes` file is available and compare with [doc/fitnotes-format.md](doc/fitnotes-format.md).
- Real backups contain personal data: never commit them (`*.fitnotes` is git-ignored except
  `tests/fixtures`). Generated fixtures come from `npm run make-fixture`.
- Completion also requires affected canonical docs updated, and no personal data, credentials,
unrelated changes, or unintended artifacts in the diff.

## Conventions

- TypeScript strict with `noUncheckedIndexedAccess`; ESLint flat config with React Compiler rules
  (no state updates inside effects: derive state during render or key the component instead).
- `useQuery(fn, deps)` compares `deps` by identity (`Object.is`): pass primitives, state or
  memoised values, never a fresh object literal (it would re-query every render).
- Screens are self-contained; dialogs live next to the screen that owns them.
- Keep FitNotes vocabulary in the UI (Track/History/Graph, Records/Stats/Goals, Log All, etc.).
- Commits: imperative subject line; body explains motivation and what was validated for
  non-trivial changes.
