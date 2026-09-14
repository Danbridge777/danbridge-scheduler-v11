# 20.26.326 — recovery follow-up

Production remains 322. Staging 326 Hosting was deployed on 2026-09-15 (Taiwan time). No Functions, Rules, IAM or production data writes occurred.

## Changes

- Builds on 325's frame-independent schedule persistence and sanitized App Check rejection observer.
- Exact classification of the captured retryable Enterprise attestation rejection, without recording the raw message or tokens.
- Failed acknowledgement retains unread state and shows validated SDK retry duration.
- A user-initiated same-origin new-tab recovery link preserves the old page and unsaved work. It does not reset the SDK, automatically retry, copy credentials/query/fragment, or weaken validation. A new normal attestation and acknowledgement are still required.

## Evidence

- Complete npm test lifecycle: 1,463 executions, 1,453 passed, zero failed, ten environmental skips. Log: `/private/tmp/danbridge-326-regression.log`. Executions are not a count of unique real-browser cases.
- Targeted observer/acknowledgement suite: 25/25 passed, including recovery URL isolation, original response identity, no replay, cooldown preservation, and failure remaining unread.
- Staging deployed assets: 355/355 SHA-256 values match. `/private/tmp/danbridge-326-staging-assets.json`.
- Safari AA original failed page retained. A clean same-account tab acknowledged the cancellation at 17:54:01.076 UTC, completing the four-recipient cancellation acknowledgements documented in the 325 report.
- AA then used the normal update UI. It correctly refused while a notification dialog was open; after that dialog was deferred, the update loaded actual scripts stamped 20.26.326 (verified in Safari, not inferred from the URL).
- On 326, AA acknowledged the test's original added notification. Independent cloud read-back at 18:06:20 UTC confirms `acknowledgedAt=2026-09-14T18:06:01.474Z`. The lesson remains deleted; no other notification was bulk-acknowledged.
- Native Safari synthetic fixture: failed acknowledgement showed the actual recovery link with zero writes/unread. Clicking it opened a separate localhost root tab; closing that tab returned to the untouched original fixture (still zero writes/unread). After simulated service recovery, a normal acknowledgement produced exactly one successful write and hid the notice. Both temporary tabs were closed. This is recovery-UI verification, not live Google failure injection.

## Remaining boundary

The 401's service rejection is now captured and same-account recovery verified. The underlying reason that the original page's reCAPTCHA execution kept producing failed attestations is not proven. The historical 403 is a separate unclassified incident. These results do not establish permanent zero-error authentication or full production acceptance. This report does not claim production publication.
