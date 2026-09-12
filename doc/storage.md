# Storage, backup and restore

## Where data lives

| What               | Where                                                | Notes                                                                             |
| ------------------ | ---------------------------------------------------- | --------------------------------------------------------------------------------- |
| Live database      | IndexedDB `workoutnotes` / store `blobs`, key `main` | Full SQLite file as `Uint8Array`                                                  |
| Rollback snapshots | same store, keys `snapshot:<ISO time>`               | Kept: newest `MAX_SNAPSHOTS` (5)                                                  |
| Metadata           | store `meta`                                         | `{ key, savedAt, label, size }`, lets the UI list snapshots without loading bytes |
| Last backup time   | `localStorage` `workoutnotes.lastBackupAt`           | Cosmetic only                                                                     |

Everything else (settings included) is inside the SQLite database.

## When the database is written

`AppDatabase` marks itself dirty on every `mutate()` and persists the full database bytes:

- 400 ms after the last change (debounced),
- immediately on `visibilitychange` -> hidden and on `pagehide` (mobile browsers suspend tabs),
- immediately after a restore or rollback,
- on `flush()` before exports.

A failed persist keeps the dirty flag and records `lastPersistError` (shown in Settings > Storage);
the next change or flush retries. `export()` must not be called inside a transaction because sql.js
closes and reopens the database to export it.

At start-up `bootstrap()` requests persistent storage (`navigator.storage.persist()`), which stops
browsers from evicting the origin under storage pressure. iOS grants it automatically for
home-screen apps; Chrome grants it to installed apps and engaged sites.

## Backup file contract

- **Export**: the live bytes, named `FitNotes_Backup_YYYY_MM_DD_HH_MM_SS.fitnotes` like FitNotes'
  "Include Timestamp" option. Delivered through the Web Share API (files) when available (home-screen
  iOS/Android), otherwise as a download.
- **Restore** (`src/backup/fitnotes.ts`):
  1. The bytes must start with the SQLite header and open; `Category`, `exercise` and
     `training_log` must exist (`validateBackupDatabase`).
  2. `ensureSchema()` reconciles the file with the current FitNotes schema (see
     [fitnotes-format.md](fitnotes-format.md#schema-reconciliation)). The input bytes are never
     modified; the app works on a copy.
  3. The current database is written to a snapshot labelled "Before restore".
  4. The new database replaces the live one and is persisted immediately.
     A `RestoreSummary` (counts plus the schema report) is shown to the user.
- **Rollback**: Settings lists snapshots; restoring one snapshots the current database first.
- **Delete workout history** snapshots first, too.

## Failure modes and mitigations

| Risk                             | Mitigation                                                                        |
| -------------------------------- | --------------------------------------------------------------------------------- |
| Browser evicts storage           | persistent storage request; prominent Backup buttons and "last backup" note       |
| Tab killed before debounce fires | flush on hide/pagehide; at most a few hundred ms of work lost                     |
| Corrupt or wrong file restored   | header/table validation, transaction-wrapped reconciliation, snapshot before swap |
| Bug in a migration               | `ensureSchema` only adds; unknown data untouched; snapshots for rollback          |
| Two tabs open                    | not supported; the last writer wins. The installed PWA is single-instance.        |

## Size expectations

`training_log` rows are ~60 bytes; 20k sets plus indexes is well under 5 MB. Persisting the whole
file each time is therefore cheap; if this ever matters, the place to change is `AppDatabase.flush()`.
