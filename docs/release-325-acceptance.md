# 20.26.325 acceptance — 2026-09-14

## Scope

Frontend-only candidate based on production commit `9d68198`. Functions, Firestore Rules, IAM, billing calculations and business schema are unchanged. This release adds sanitized first App Check rejection diagnostics and makes schedule persistence independent of a suspended animation frame. It does not disable App Check or reset SDK backoff.

## Verified

- Full automated lifecycle: 1,443 tests, 1,433 passed, zero failed, 10 environment-dependent skips. Skips are not counted as passes. Log: `/private/tmp/danbridge-325-final-regression.log`.
- Actual-function rendering/persistence tests: 8 passed, including a suspended frame, subsequent mutations, no duplicate save when frames resume, visible-section rendering and render failure.
- Staging Hosting deployed 325; 355/355 browser asset SHA-256 values matched the isolated candidate.
- Safari: Daniel, Catherine, AA and the authorized teacher successfully entered staging. Each acknowledged an actual schedule notification; independent read-only cloud queries confirmed the respective acknowledgement.
- Safari 324: AA created, edited twice and deleted one disposable lesson. Catherine created eight weekly lessons; AA copied three and moved six by 30 minutes. Read-back confirmed dates, times, revisions and all four notification recipients. All 12 disposable lessons were subsequently deleted through the UI; tombstones and audit history remain.
- Safari 325: Daniel saved `AUDIT325-SAFARI-DANIEL-FRAME` from the dashboard and immediately switched to AA's tab. The cloud contained exactly one lesson, and AA received its lesson and notification without refreshing. Daniel then deleted it and immediately switched tabs again. At 14:00:39 UTC the cloud showed zero active / one deleted record, revision 2; four cancellation notifications existed. AA's existing page removed the lesson and displayed its cancellation. This test lesson is cleaned up.
- Pre-release production read-back at 14:53:45 UTC: 1,244 active lessons, revision 948, seven role projections consistent, business-data hash unchanged from this session's baseline. This verification made zero production writes.

## Not established

- The historical first App Check HTTP 403 root cause remains unknown; no fresh exchange rejection was reproduced in this Safari run. The new observer preserves sanitized evidence for a future rejection, not a proven root-cause fix.
- Some staging first loads exceeded 20 seconds before recovering. This is not a passed latency result.
- This run does not prove every possible UI scenario, permanent 120 Hz, an unconditional 2.5-second bound, or a year of elapsed cloud retention. Earlier capacity/restore evidence is separate from these UI tests.
- Native transaction tests and production publication/read-back are recorded below only after their results are known.

## Additional native transaction regression

Local Firestore Emulator run completed: 15 passed, zero failures or skips. Both compact and compatibility modes exercised repeated 40-record create/move/copy/delete transactions, exact role views, four-recipient notifications, replay protection, interrupted preparation, access revocation and teacher leave writes. Synthetic namespaces were removed. This is localhost evidence, not cloud latency or a real user's Google/App Check authentication test. Log: `/private/tmp/danbridge-325-native-regression.log`.
