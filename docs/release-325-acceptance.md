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

- The historical first App Check HTTP 403 root cause remains unknown. A different HTTP 401 rejection was subsequently reproduced, as detailed below. The observer preserves sanitized evidence; it is not a proven root-cause fix.
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

## Continued recovery acceptance (2026-09-15, Taiwan time)

- The same existing Daniel page also retained exchange 401 errors from 14:49:59 and 14:50:29 UTC. On a normal acknowledgement retry, without first reloading/resetting that page, Safari Network recorded exchange HTTP 200 (208ms). Independent Firestore read-back confirmed Daniel's cancellation acknowledgement at `2026-09-14T17:11:01.450Z`. Exchange duration is not total synchronization latency.
- Catherine then signed in through Safari's normal saved-account chooser and acknowledged the same cancellation. Exchange HTTP 200 (283ms); cloud acknowledgement `17:21:08.288Z`.
- The authorized teacher signed in through the normal chooser and acknowledged that cancellation. Exchange HTTP 200 (324ms); cloud acknowledgement `17:27:05.581Z`.
- AA's original page was not reloaded, signed out, or reset. It recorded another exchange 401 at `17:03:12.766Z`, with SDK retry duration `42m:54s`. Subsequent throttled calls did not send another exchange. The original unread notice is preserved while waiting for the SDK deadline around 17:46:07 UTC. This is not yet a successful AA recovery.
- Read-only Cloud Monitoring descriptor queries found App Check verification metrics and reCAPTCHA assessment status metrics. The staging assessment-count query for 13:00–17:15 UTC returned no series. That absence does not establish the rejection cause.
- Added a regression using the installed SDK's actual provider/exchange/backoff implementation: two synthetic 401s enforce the original deadlines, produce no exchange before the deadline, use distinct fresh attestations on subsequent attempts, and recover only on a real simulated HTTP 200. This is a mock transport test, not a Google server root-cause proof.
- Local follow-up changes the failed-ack guidance to show a validated SDK cooldown duration instead of always telling users to reload. It does not change request execution, provider state, authentication, Rules, or retry timing. Malformed/private diagnostic text is not copied into the UI.
- Full automated regression after the guidance change: 1,460 test executions across the npm test groups, 1,450 passed, zero failed, 10 environmental skips (not a count of unique UI scenarios). Log: `/private/tmp/danbridge-325-retry-guidance-regression.log`.
- Native Safari local fixture `tests/fixtures/notification-retry-guidance.html` loads the actual acknowledgement handler with synthetic authentication/transport. Two failed clicks retained unread state and zero writes; after simulated service recovery, the third click yielded exactly one successful write and only then hid the notice. The temporary tab and localhost server were closed. This fixture is not cloud acceptance.
- The follow-up guidance/test changes remain local and unversioned for deployment. Staging remains the previously deployed 325; production remains 322. No new production release is claimed.
- Checked Firebase's official JavaScript release notes and issues #10264/#10318: 12.18/12.19 contain Safari Authentication IndexedDB/pagehide fixes. The current runtime is 12.17.1, but this trace did not establish a `Database is closing/hidden` failure as the cause of the App Check exchange 401. No speculative SDK upgrade is represented as a 401 fix. Sources: https://firebase.google.com/support/release-notes/js and https://github.com/firebase/firebase-js-sdk/issues/10318.

## Captured rejection and same-account recovery, 17:46–17:54 UTC

After the original AA page's SDK deadline elapsed, an ordinary acknowledgement again failed. Safari Network captured HTTP 401 / UNAUTHENTICATED with this exact server message: `The reCAPTCHA Enterprise token indicates a failed attestation attempt, but is retryable by calling execute() via JavaScript.` At 17:47:18 UTC the cloud still showed AA unread. This establishes retryable reCAPTCHA attestation rejection, not a notification permission denial. The underlying browser/network cause is not proven. Google's BROWSER_ERROR troubleshooting describes failed execute operations and JavaScript retry: https://docs.cloud.google.com/recaptcha/docs/troubleshoot-recaptcha-issues . The SDK already invokes execute on eligible attempts; its internal state/backoff was not changed.

The original page was preserved. A new Safari tab opened the clean staging web.app root with the same existing AA authentication. The normal acknowledgement button succeeded; independent cloud read-back at 17:54:20 confirmed AA acknowledgedAt `2026-09-14T17:54:01.076Z`. All four recipients now acknowledge that exact cancellation. No identity, Rules, IAM, or business data changes were required. This is verified fresh-page recovery, not proof the original page spontaneously recovered or all future attestation failures are eliminated.

Local follow-up adds exact-message sanitized classification and a user-initiated same-origin recovery link on failed App Check acknowledgement. It opens the root in a separate tab, with noopener/noreferrer and no query, fragment, credential or notification data. The old page and unsaved work remain. It never auto-opens/reloads, fabricates success, resets SDK state, or replays writes. The new page must pass normal App Check and the user must acknowledge again. These follow-ups require a new version stamp and staging validation before any production publication.
