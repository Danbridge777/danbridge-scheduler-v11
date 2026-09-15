# Release 20.26.330 — verified repair scope

On 2026-09-15 the user explicitly requested publication of the verified repairs, accepting that the historical App Check 401/403 root cause remains unestablished. This supersedes the pending release-condition decision recorded chronologically in release-327-report-acceptance.md.

Included: queued-operation preservation while rendering is suspended; notification failure retention and guarded recovery; scoped, authenticated and App Check-enforced lesson-report read/write endpoint; teacher report hydration; stable service-worker registration and guarded update handling. No access-rule relaxation, risk-threshold change, bulk business-data rewrite or credential/cache clearing is included.

Acceptance evidence is recorded in release-327-report-acceptance.md: native staging AA, Daniel, Catherine and teacher notification readbacks, consecutive eight-lesson copy/move/undo/redo/delete, report persistence, and stable worker activation after ordinary Safari restart. All eight disposable lessons are soft-deleted. All 357 public staging assets match local SHA-256. Full regression and release-target validation exited zero; targeted final report/App Check suite passed 61 tests with zero failures or skips.

Limits: historical attestation rejections are not diagnosed; recovery success does not prove their cause. The one-year live restore drill and universal latency/frame-rate guarantees are not claimed. Post-publication production verification must be recorded separately below.

## Publication

Pending production endpoint and Hosting deployment and readback. Source release alone is not deployment evidence.
