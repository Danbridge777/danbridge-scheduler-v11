# Production recovery and maintenance

## Scope

This runbook applies only to project `danbridge-d8877`, database `(default)`, region `asia-east1`. It never uses or modifies macOS Time Machine.

## Required Firestore controls

The production database must report all of the following before a release is accepted:

- `deleteProtectionState: DELETE_PROTECTION_ENABLED`
- `pointInTimeRecoveryEnablement: POINT_IN_TIME_RECOVERY_ENABLED`
- `versionRetentionPeriod: 604800s`

Readback command:

```sh
gcloud firestore databases describe --database='(default)' --project=danbridge-d8877 --format='yaml(name,type,locationId,deleteProtectionState,pointInTimeRecoveryEnablement,earliestVersionTime,versionRetentionPeriod)'
```

Enable command (run once, then use the readback command again):

```sh
gcloud firestore databases update --database='(default)' --project=danbridge-d8877 --enable-pitr --delete-protection --quiet
```

Never disable delete protection as part of an ordinary release. A restore is always created as a separate database first; it never overwrites `(default)`.

## Production runtime identity

Both protected backends run as `danbridge-production-runtime@danbridge-d8877.iam.gserviceaccount.com`.

- The runtime service account has only `roles/datastore.user` at the production project level.
- Daniel (`a0965487920@gmail.com`) has `roles/iam.serviceAccountUser` on this one service account so the two functions can be deployed with that runtime identity.
- `productionTrustedOperation` additionally requires a verified Firebase Owner session, a valid App Check token, and a limited-use replay-protected token.
- `productionDailyMaintenance` is the only scheduled function using this identity.

The function source fixes both function names and their runtime service account. Do not reuse this service account for unrelated services.

## Daily maintenance receipt

`productionDailyMaintenance` runs at 03:17 Asia/Taipei and applies these bounded retention rules:

- `errorEvents`: 30 days
- read schedule notifications: 30 days
- unread schedule notifications: 90 days

Each successful run writes a verified daily receipt under `companies/danbridge/maintenanceRuns/{YYYY-MM-DD}` and the latest verified state under `companies/danbridge/systemHealth/maintenance`. A same-day retry safely replaces that day's receipt. The Owner health center displays the receipt and raises an alert when no verified run is seen for more than 36 hours.

## Restore drill

1. Select a timestamp from the protected window.
2. Clone to a new database ID whose name contains `restore-drill`; never target `(default)`.
3. Run record counts, role privacy checks, record hash reconstruction, and read-only UI acceptance against the clone.
4. Record the result. Keep production untouched.
5. Removal of the temporary drill database is a separate destructive operation and requires explicit confirmation at that time.
