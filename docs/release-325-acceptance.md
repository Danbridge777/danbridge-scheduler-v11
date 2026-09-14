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

## Exact deployed Rules verification

The legacy 278 patch-based helper rejected the current source with `Production Rules baseline drift` before exercising permissions. A separate, explicit hash-pinned read-only helper was added: it reads the current release, requires its exact reviewed SHA-256 and does not patch it. Current source `44c05b87-192b-43c0-aae0-48a5436be790`, SHA-256 `f76e51ec1eb6508d191244ad0c25775909c2d3644f2f571e00c041e7cf01b619`, passed the compiled role-chunk test on localhost. Teacher, scheduler and branch scopes, unpublished/foreign parts, forged client writes, revocation and anonymous requests were exercised. No Rules deployment occurred.

## Publication blocked by newly reproduced security failure

Before publication, AA's acknowledgement of the 325 cancellation failed and remained unread in the cloud. Safari's existing 324 page recorded a real App Check exchange rejection at `2026-09-14T14:49:53.288Z`: HTTP 401, `UNAUTHENTICATED`, unclassified message, online true, document hidden, elapsed 6065ms. Further ordinary retries were rejected and entered the SDK's increasing backoff. This is not the historical 403 and does not establish its root cause. Production remains 322; 325 is not published to production while this acceptance failure is unresolved. No SDK backoff was cleared and no security protection was reduced.

The observed endpoint is the SDK's official `content-firebaseappcheck.googleapis.com` Enterprise exchange. A read-only query of staging App Check/reCAPTCHA audit logs from 14:45 UTC returned zero entries and no next page. Safari retained sanitized diagnostic records, but its Network panel did not retain the failed response body. A temporary debugger breakpoint/read-only watch was attempted; inspecting the message could not be completed (clipboard read timed out). The breakpoint and watch were removed and execution resumed, confirmed by the debugger returning to its running state. The inspector was closed; the failure evidence was not cleared. A 15:00:34 UTC cloud read confirmed the test lesson is still deleted and AA's cancellation notice is unread. No successful acknowledgement is claimed for this last case.
