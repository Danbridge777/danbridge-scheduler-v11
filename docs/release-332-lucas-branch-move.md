# Release 20.26.332 — scoped campus timetable moves

## Scope

- Lucas remains a read-only branch manager for `art_museum` (美術東四路), with a separate `canMoveSchedule` capability. No employee is promoted to Owner or general scheduler.
- The server reads the capability and campus from current companyAccess inside the write transaction. The client cannot supply its own permission.
- Moves may change date/start/end/room, preserve duration and cannot add/delete lessons, reassign teacher/student, change attendance/revenue campus, prices, payment state or report data.
- Existing teacher filter is visible for branch managers; it uses the server-scoped branch data.
- A separate durable move journal uses the existing atomic scheduler transaction and published role receipts. Student mutations are excluded. Remote additions/deletions, stale snapshots, retry identities and full branch financial views are preserved.
- Other companyAccess fields and Firestore Rules are not changed. Permission enablement is an exact one-field patch with an update-time precondition and readback.

## Evidence before release

- Chromium and WebKit: 18 browser tests passed, including actual pointer moves three times, teacher filtering, campus-only options, revoked capability, existing Owner/AA/teacher controls and module parsing.
- Firestore emulator: branch capability/self-escalation/direct-write rejection, published transaction/receipt/notification and original AA atomic workflow tests: 3 passed, 0 failed.
- Native staging Firestore: the production runtime executed against only a new synthetic namespace. Move succeeded; five intended recipients had one notification each; replay did not duplicate; out-of-campus, duration change, deletion and revoked scope were rejected. Namespace `workspace-280-683ec50d-b5df-4abc-b784-8dad6ca0e182` was removed and its root absence verified. No existing staging or production business records were changed by this test.
- Controller unit tests include concurrent remote add/delete and finance updates, stale snapshot rejection, and continuing moves after the receipt.
- Source validation: 150 local references, 607 JavaScript files and 364 HTML IDs passed. Locked dependency installation audit reported zero vulnerabilities.

## Explicit limits

The browser tests use isolated identities; the native staging transaction test uses administrative transport and synthetic roles. Neither is claimed as Lucas's real Google/App Check sign-in. Lucas's private Google account was not accessed. Historical App Check 401/403 root cause, one-year elapsed retention, 120 Hz and new latency guarantees are not part of this change. Skipped tests are not counted as passing. Existing unsaved employee tabs are not forcibly refreshed.

## Production publication — 2026-09-17

- Complete `npm test`: 1,529 cases, 1,519 passed, 0 failed, 10 skipped.
- Hosting 20.26.332 published to staging and production; all 358 public assets on each matched the local source SHA-256, zero mismatches.
- `productionSchedulerOperation` active revision: `productionscheduleroperation-00011-san`, updated `2026-09-17T07:32:40.736782847Z`.
- Unchanged Owner backend: `productiontrustedoperation-00009-cij`. Unchanged Rules: `44c05b87-192b-43c0-aae0-48a5436be790`.
- Production authority control and safety remained active, writeAllowed true; health readback was healthy.
- Published-production asset browser smoke: Chromium/WebKit each passed the teacher-filter and three-pointer-move case with isolated browser data. No business writes from browser smoke.
- Lucas's `canMoveSchedule` was enabled at `2026-09-17T07:35:06.795975Z`. Exact identity, branch manager role, `art_museum`, teacher binding and readOnly true were re-read. The first comparator rejected nested JSON ordering; a historical read at `2026-09-17T07:32:00Z` and canonical field hashes confirmed **only canMoveSchedule changed**, no other field differences. The one-field PATCH was not repeated. The administrative verification utility was updated to use canonical comparison.
- Existing employee pages are not forcibly reloaded. Lucas should reopen/update normally to load the new capability and frontend.
