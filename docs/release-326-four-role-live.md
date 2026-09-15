# 326 four-role live acceptance — 2026-09-15 Taiwan

In progress. Production remains 322. This record separates live Safari evidence from synthetic failure tests and older-version observations.

## Disposable data

`AUDIT326-FOURROLE-AA-20260915`, lesson `lsn_69253a01-9b05-41d1-b759-146a9090ac98`, staging only, STAGING_SHADOW_STUDENT / STAGING_SHADOW_TEACHER. Must clean up through the UI after acceptance; preserve audit/tombstone history.

## Live sequence

- AA on verified 326: selected existing test student, automatic teacher/time defaults populated. Saved 2026-09-15 16:00–16:30. Cloud read 18:33:30 UTC: exactly one active lesson, revision 1. At that first read notices were not yet returned; not counted as successful delivery.
- Cloud read 18:34:53 UTC: four separate added notices exist for AA, Daniel, Catherine and the authorized teacher.
- Teacher's existing page received the new lesson and notice without refresh. Normal acknowledgement confirmed in cloud at 18:35:52.628 UTC. This page originated on 325, so this is cross-version receiving evidence, not final 326 teacher acceptance.
- Teacher then used normal reload/update after deferring the old test notification. Latest-version acceptance continues below.
- After update, teacher UI opened the exact 2026-09-15 test lesson in the course-report dialog, not the owner scheduling editor. Exact title/date/time were visible; only report status/content/homework/feedback/note and report actions were exposed. Script version still needs explicit read-back for this refreshed teacher page.
- During the attempt to fill/save this report, native Safari control timed out. A subsequent state read timed out and reset the control session; reconnecting by Safari bundle ID also timed out. No successful save is claimed. Independent GET of `companies/danbridge/lessonReports/lsn_69253a01-9b05-41d1-b759-146a9090ac98` at 18:45:56 UTC returned not found. Lesson remains active at revision 1; no blind resubmission or direct database cleanup was performed.
- While browser control was unavailable, current 326 App Check/token/callable/acknowledgement tests completed: 36 passed, zero failed/skipped (`/private/tmp/danbridge-326-four-role-auth-regression.log`). These include synthetic 401/403 and preserve original SDK backoff; they are not real four-account attestations.
- The exact deployed Rules source, pinned to SHA `f76e51ec1eb6508d191244ad0c25775909c2d3644f2f571e00c041e7cf01b619`, again passed compiled scope/write-denial/revocation/anonymous checks in localhost Firestore Emulator (one test, no skips). Expected permission-denied cases passed. No Rules deployment or cloud writes (`/private/tmp/danbridge-326-four-role-rules.log`). Emulator stopped normally.
- Requested restoration of Safari computer-control connection via the in-turn user-input UI. Authentication need not be repeated. One explicitly named staging test lesson remains for continuation and eventual atomic UI cleanup; production is untouched.

## Gates still pending in this sequence

## Resumption check — 2026-09-15

- Native Safari reconnect now explicitly reports: "The Mac is locked and automatic unlock could not unlock it." This is a new observed blocker, distinct from the prior control-connection timeouts. No sign-out, reload, browser restart or forced close was attempted.
- Reran `node --test tests/app-check-exchange-observer.test.mjs tests/app-check-limited-use-token.test.mjs tests/notification-ack-error-recovery.test.mjs`: 30 passed, 0 failed, 0 skipped. These are synthetic SDK/transport and handler checks, not a substitute for four-role live verification.
- Requested manual Mac unlock. No code change or production release was performed during this resumption. The outstanding staging test remains pending UI verification and cleanup; its cloud state was not reread in this resumption.

## Outstanding live gates

- Final 326 teacher UI/version, own lesson visibility and restrictions.
- Daniel and Catherine 326 login, edits, cloud result, role scope and acknowledgement.
- AA continuous/multi-selection editing and cloud results.
- All four final cancellation acknowledgements, deleted test data verified independently.
- Real 401/403 failures, if reproduced, remain failures until recovered and recorded. Synthetic status handling cannot establish real Google attestation reliability or historical root cause.
