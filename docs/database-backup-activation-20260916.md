# Production database backup activation — 2026-09-16

User approved the incremental US$1–3/month planning estimate and the daily-30/monthly-13 plan. This is not a spending cap. A full isolated restore drill remains separately scoped and was not performed here.

## Enabled resources

- Project: `danbridge-d8877`; database: `(default)`; region: `asia-east1`.
- Managed daily backup schedule: `9f4d9dcd-9d8d-4993-b44f-8250178bf1f0`, retention `2592000s` (30 days), created `2026-09-16T06:30:44.403723Z`. The first managed daily backup had not yet appeared at verification; creation time is managed by Google, not the application guard's cron.
- Private bucket: `gs://danbridge-d8877-database-backups`, Regional Standard, uniform bucket-level access and public-access prevention enforced, 7-day soft delete. No public principals were found.
- Independent function/codebase: `databaseBackupGuard` / `database-backup`; final revision `databasebackupguard-00002-san`. Deployment source generation `1789540671804794` in the function source bucket. Existing functions were not deployed.
- Guard schedule: daily 03:41 Asia/Taipei. Exports once per calendar month; daily executions verify the current export and managed backup freshness. Initial September export was run immediately. Retries resume the known operation rather than blindly creating a duplicate.
- Dedicated runtime identity: `database-backup@danbridge-d8877.iam.gserviceaccount.com`. Project custom role has only backup schedule/list, backup list, database metadata/export and operation get/list permissions. No import, restore, database deletion or document-write authority. Storage modification rights are limited to the dedicated backup bucket. Function invocation is not public.
- Keeps newest 13 verified monthly snapshots. Verifies retained metadata before removing any older completed snapshot; generation-precondition deletes prevent deleting a replaced object. This is monthly recovery coverage, not 365 daily recovery points. No old backups were deleted during activation.
- Failure email alert and missing-guard-run alert enabled for the existing project owner. The latter observes 25 hours without a successful run, sustained for one more hour, to accommodate Monitoring's window constraints. Cloud alert policy IDs: `10210094118898261707`, `12621623607007935568`. Email inbox delivery was not end-to-end tested.

## Actual first export

- Snapshot: `2026-09-16T06:31:00Z` (14:31 Taiwan time), consistent PITR export, all collection groups.
- Manifest: `manifests/2026-09.json`, generation `1789540419792778`.
- Output: `exports/2026-09/59317b0e-c7d1-47c8-9b47-abf005e4bd05/`.
- Export operation completed successfully; output prefix and positive-size overall export metadata verified.
- Export service reported 12,332 documents. This is database documents, including internal records, not a count of lessons.
- Read-back object inventory: 88 objects, 64,013,021 bytes; no pagination omitted. Metadata CRC32C: `uzW5Lg==`.
- Second execution reused the same verified export; manifest generation, object count and byte count unchanged, no re-export, zero cleanup deletions.
- Final security-patched revision 00002 was invoked again and completed at `2026-09-16T06:39:45.026Z`, still with the same single monthly manifest, 88 objects and zero cleanup deletions.
- The monthly export is a real completed backup. Its existence does not prove full application restoration, and no production import was attempted.

## Verification and isolation

- Eight backup policy/runtime tests passed, including failed exports, lost responses, duplicate runs, lease contention, incomplete metadata, scoped retention and stale daily-backup health.
- Combined backup and hardening targeted suite: 13 passed, zero failed/skipped.
- Independent service dependency audit initially identified an older transitive uuid. Applied the same `uuid: 11.1.1` security override as production, rebuilt its lockfile, audited zero vulnerabilities, and deployed revision 00002.
- Production release read-back: 20.26.330; all 357 public files match the unchanged baseline.
- Firestore Rules unchanged: `44c05b87-192b-43c0-aae0-48a5436be790`.
- Existing scheduler revision `productionscheduleroperation-00010-fip` and trusted operation revision `productiontrustedoperation-00009-cij` remain active and unchanged.
- Production safety control is active and writeAllowed; owner health was healthy at `2026-09-16T06:30:03Z`.
- No lesson, student, billing, payroll, notification, role mapping or application business-document write was made by this activation. No Hosting deployment occurred. Staging 331 hardening is separate.

## Maintenance commands

Run from this checkout:

```sh
node --test tests/database-backup-service.test.mjs
node tools/provision_database_backups.mjs
node tools/verify_database_backup_service.mjs
```

The provisioning command defaults to read-only. `--apply` changes only the explicit approved backup resources. Verification defaults to read-only; `--run` invokes the guard. Do not use a broad functions deployment: deploy only `functions:database-backup:databaseBackupGuard` with `firebase.backup.json` and the explicit production project. Backups contain sensitive business data and must remain private.

Any restore must target a separately named isolated database first, with cost approval and validation; never import directly into `(default)` to test a backup.
