# Backup coverage and incremental cost estimate — 2026-09-16

Update: the user subsequently approved this plan. Activation and its remaining verification limits are recorded in [database-backup-activation-20260916.md](database-backup-activation-20260916.md). The estimate below is preserved as the pre-approval record, not the current activation status.

Status: estimate only. User requested a price estimate before approving activation. No new backup schedule, bucket, export job, retention policy or paid service was enabled. Production remains 20.26.330.

## Read-only observations

- Production default database, asia-east1: reported data plus index storage 354,585,337 bytes (0.330233 GiB), latest inspected Monitoring sample at approximately 06:12 UTC.
- Point-in-time recovery and deletion protection are enabled. Backup schedules API returned no schedules and no further page.
- Application sharded backup manifests: 12, newest 2026-09-14. Manifest metadata is not a complete restore verification.
- Existing application snapshot cleanup uses 30-day retention. This is backup retention, not automatic deletion of actual lessons.
- No complete one-year cloud restore drill has been performed in this round. A local synthetic 30,000-lesson/365-day chunk roundtrip test passed; that is not a substitute for a cloud restore drill.

## Proposed coverage, subject to approval

1. Daily managed Firestore backup retained for 30 days.
2. Monthly export to a private same-region Standard Cloud Storage bucket, retaining 13 monthly snapshots.
3. Backup freshness monitoring and a separately authorized isolated restore drill.

This provides daily recovery points for the recent month and monthly recovery points across a year once accumulated. It does not provide every day's recovery point for a year and cannot recreate backups from before activation.

## Storage estimate

Official Google Cloud Billing catalog, USD, Taiwan (asia-east1), checked 2026-09-16:

| Component | SKU | Unit price | Estimated steady-state monthly storage |
| --- | --- | --- | --- |
| Firestore daily backups, 30 copies | 0A94-ECDB-52F3 | $0.035/GiB-month | 0.330233 × 30 × $0.035 = $0.346745 |
| Regional Standard Storage, 13 monthly exports | BAE2-255B-64A7 | $0.020/GiB-month | 0.330233 × 13 × $0.020 = $0.085861 |
| Storage subtotal | | | **approximately $0.43/month** |

Assumptions: database size stays constant; each export is modeled using the current data-plus-index size. Actual export and managed backup sizes may differ; this is not a quoted bill. Full retention accumulates over time.

Additional charges are not included in that subtotal: export document reads, object operations, scheduler/runtime, temporary restore database storage and import writes, any network transfer, taxes and data growth. Catalog Taiwan standard document read SKU 28B9-8D93-5BC1 has a paid tier of $0.0345 per 100,000 reads. Export document count has not been measured; existing project free quotas are not assumed available.

For budgeting only, reserve **US$1–3/month incremental** at the present scale, excluding a separately estimated restore drill. This is not a guaranteed maximum or an enforced spending cap. Existing application/PITR charges are outside this incremental estimate. Alerts alone would not stop charges.

Sources:

- https://cloud.google.com/firestore/pricing
- https://cloud.google.com/storage/pricing
- https://firebase.google.com/docs/firestore/disaster-recovery
- https://docs.cloud.google.com/firestore/native/docs/manage-data/export-import

## Separate code hardening progress

Candidate 20.26.331 is on staging only. Changes correct backup-list status, add non-mutating roster/ownership integrity diagnostics, and retain sanitized App Check failure evidence across reloads. These do not establish the historical 401/403 root cause.

- Full npm test command exited successfully before final version replacement and new-suite integration; no aggregate count asserted.
- Final App Check/backup regression suite: 43 passed, zero failed or skipped.
- Billing, payroll, integrity and draft persistence browser regressions: 54 passed across Chromium and WebKit.
- Project validation, diff whitespace check and dependency audit passed.
- Staging deployed public asset verifier exited zero, release 20.26.331, zero data writes.
- Four real Google-account acceptance cases and full cloud restore validation are not claimed completed in this round.

Approval remains required before activating the proposed paid backup resources. No production deployment occurred in this round.
