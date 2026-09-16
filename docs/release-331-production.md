# Production 20.26.331 — 2026-09-16

## Released scope

Source commit: c4cc739. Firebase Hosting only, project danbridge-d8877. Deployment completed successfully. No business-record edit, Firestore Rules deployment, or existing scheduler/sync Functions deployment was performed in this release.

- Backup listing distinguishes incomplete, invalid, sealed and legacy-verified backups; a sealed manifest does not claim freshly verified restore contents.
- Read-only data-integrity diagnostics identify orphan/duplicate group roster references and invalid ownership branches without rewriting records.
- Sanitized App Check rejection diagnostics survive reload, bounded to eight entries. This is diagnostic hardening, not a claim to resolve historical 401/403 causes.
- Frontend runtime URLs and worker build consistently identify 20.26.331.

The separately deployed database backup service is documented in database-backup-activation-20260916.md. It was not redeployed by this Hosting release.

## Verification

- Full npm test: 1,506 passed, 0 failed, 10 skipped.
- Desktop Chromium/WebKit billing, LINE preview, payroll, defect repair and draft durability: 54 passed.
- Desktop Chromium/WebKit public entry and record-plan worker: 78 passed, 0 failed, 2 platform-inapplicable skips.
- Static validation: 150 local references, 600 JavaScript files, 364 HTML IDs; passed.
- Production readback: all 357 public assets matched source SHA-256; zero mismatches.
- Production runtime: control active, safety active, writeAllowed true; owner health healthy at 2026-09-16T06:45:02.985Z.
- Unchanged Rules: 44c05b87-192b-43c0-aae0-48a5436be790.
- Unchanged active backend revisions: productiontrustedoperation-00009-cij and productionscheduleroperation-00010-fip.
- Fresh background production browser tab loaded firebase-auth-and-cloud-sync.module.js?v=20.26.331, recovered the existing Daniel session, displayed the owner dashboard and “正式逐筆同步已就緒。” No lesson was created, modified or deleted for this smoke check; existing user tabs were not refreshed.

## Explicit limits

Skipped tests are not counted as passed. This release did not repeat all four real Google accounts, perform a real cloud restore, prove one year of elapsed retention, or establish the historical App Check 401/403 root cause. The synthetic 30,000-lesson/365-day backup reconstruction test is not a real cloud restore. No new latency or 120 Hz guarantee is made. Existing open tabs are not claimed to have been forcibly upgraded. GitHub push is not evidenced by this release record.
