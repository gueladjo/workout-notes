# WorkoutNotes

A local-only workout log for iPhone and Android, installable as a Progressive Web App. It is a
re-creation of [FitNotes](https://www.fitnotesapp.com/) (Android) and uses **FitNotes' own backup
format as its database**: a `.fitnotes` backup restores directly into WorkoutNotes, and a
WorkoutNotes backup restores directly into FitNotes for Android.

No account, no server, no analytics. The app is a static bundle; all data lives in the browser's
storage on your device.

## Features

- Home screen per day with previous/next navigation, exercise cards, workout comments, copy / move /
  share / delete / re-order workouts.
- Exercise list with categories, colours, favourites, search, per-exercise weight unit, all ten
  FitNotes exercise types (weight/reps, distance/time and the advanced combinations).
- Training screen with Track (weight/reps/distance/time fields, +/- increments, comments, mark sets
  complete, auto-select next set), History (quick stats, edit and copy past sets) and Graph tabs.
- Personal records (actual and estimated rep maxes, Brzycki 1RM), statistics per period, goals.
- Supersets / circuits with auto-jump between grouped exercises.
- Routines with days, predefined sets ("copy previous" blanks), groups and "Log All".
- Calendar month and list views with category dots and category / exercise filters.
- Body tracker: measurements with units and goals, history and graphs.
- Settings mirroring FitNotes (units, week start, increments, home screen options, theme).
- Backup and restore of `.fitnotes` files, CSV export, rollback snapshots before destructive
  operations, diagnostics page.

Not implemented (deliberately, see [doc/ui.md](doc/ui.md#not-implemented)): rest timer, workout
timer, plate and set calculators, analysis screens, automatic cloud backup.

## Run it

Requires Node 22.12+ (24 recommended).

```bash
npm install
npm run dev
```

Open the printed URL on your phone (same Wi-Fi) or desktop. For a production build:

```bash
npm run build
npm run preview
```

`npm run build` outputs a static site in `dist/` that can be hosted on any static host
(GitHub Pages, Cloudflare Pages, a folder on a NAS). Hash-based routing means no server-side
rewrite rules are needed and the app works from any sub-path.

### Install on a phone

- **iPhone / iPad**: open the site in Safari, Share, "Add to Home Screen". Launch from the icon;
  it runs full-screen and offline.
- **Android**: open in Chrome, use the "Install app" prompt or menu entry.

Installed apps get a larger, more durable storage quota than a browser tab. Still: **export a
backup regularly** (Settings > Backup). Browser storage is not a backup.

### Bring your FitNotes data

Settings > Restore Backup, pick the `FitNotes_Backup_….fitnotes` file. To go back to Android,
Settings > Save/Share Backup and restore the file in FitNotes.

## Develop

```bash
npm run check        # typecheck + lint + unit tests (run before committing)
npm run test:e2e     # Playwright smoke tests against the production build (needs `npx playwright install chromium` once)
npm run inspect-backup -- path/to/backup.fitnotes   # print schema and counts of a real backup
npm run make-fixture                                 # write tests/fixtures/generated/sample.fitnotes
npm run make-icons                                   # regenerate public/icons
```

Documentation for contributors and coding agents:

- [AGENTS.md](AGENTS.md): invariants, where things live, how to validate a change.
- [doc/architecture.md](doc/architecture.md): stack, layers and the main design decisions.
- [doc/fitnotes-format.md](doc/fitnotes-format.md): the `.fitnotes` SQLite schema and encodings.
- [doc/storage.md](doc/storage.md): persistence, snapshots, backup and restore contract.
- [doc/ui.md](doc/ui.md): screen map versus FitNotes and what is intentionally missing.
- [doc/testing.md](doc/testing.md): test suites, fixtures and manual device checks.

## Status

Feature-complete first version. The schema and encodings were verified against FitNotes 25.1, but
restoring a WorkoutNotes-created backup into Android FitNotes has not yet been exercised on a real
device; see the open items in [doc/fitnotes-format.md](doc/fitnotes-format.md#open-questions).
