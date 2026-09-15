# Release 20.26.330 — verified repair scope

On 2026-09-15 the user explicitly requested publication of the verified repairs, accepting that the historical App Check 401/403 root cause remains unestablished. This supersedes the pending release-condition decision recorded chronologically in release-327-report-acceptance.md.

Included: queued-operation preservation while rendering is suspended; notification failure retention and guarded recovery; scoped, authenticated and App Check-enforced lesson-report read/write endpoint; teacher report hydration; stable service-worker registration and guarded update handling. No access-rule relaxation, risk-threshold change, bulk business-data rewrite or credential/cache clearing is included.

Acceptance evidence is recorded in release-327-report-acceptance.md: native staging AA, Daniel, Catherine and teacher notification readbacks, consecutive eight-lesson copy/move/undo/redo/delete, report persistence, and stable worker activation after ordinary Safari restart. All eight disposable lessons are soft-deleted. All 357 public staging assets match local SHA-256. Full regression and release-target validation exited zero; targeted final report/App Check suite passed 61 tests with zero failures or skips.

Limits: historical attestation rejections are not diagnosed; recovery success does not prove their cause. The one-year live restore drill and universal latency/frame-rate guarantees are not claimed. Post-publication production verification must be recorded separately below.

## Publication

Published successfully on 2026-09-15 from source commit cf3b80e. The production report endpoint was created before the Hosting release; exact readback is ACTIVE, entryPoint productionSaveLessonReport, revision productionsavelessonreport-00001-xek, updateTime 2026-09-15T14:31:36.020352027Z, using the existing production runtime service account. Hosting published 361 files using the production-only configuration, excluding the staging acceptance page.

Post-release read-only comparison found all 357 checked public assets matching source SHA-256, zero mismatches, release 20.26.330. Runtime control and write guard remained active. Health record checked at 2026-09-15T14:30:03.143Z was healthy (this timestamp precedes the new endpoint creation; it is not a new post-deploy full health run).

Before/after exact Firestore ruleset remained 44c05b87-192b-43c0-aae0-48a5436be790. Existing productionTrustedOperation revision productiontrustedoperation-00009-cij and productionSchedulerOperation revision productionscheduleroperation-00010-fip retained their September 13 update times and ACTIVE state. No new Rules or existing scheduler backend deployment occurred.

Native Safari opened the production root using the existing AA session, observed the scheduler-only navigation and populated September calendar. An existing notification was postponed rather than marked read. The normal guarded update button then reloaded the page. After update, AA remained signed in and the September calendar populated again. Read-only native console inspection confirmed the loaded auth module URL ending in ?v=20.26.330 and stable /sw.js ACTIVE/activated with no waiting or installing worker. No production lesson/report was created, edited or deleted in this release smoke check.

The console captured an HTTP 401 for Google's reCAPTCHA enterprise/pat endpoint. This is recorded separately from an App Check token-exchange failure; no claim of an error-free network trace is made. The observed authenticated production calendar loaded successfully. Earlier native URL typing initially produced an invalid address, corrected using the exact address-field value; this was tool input, not a site failure.
