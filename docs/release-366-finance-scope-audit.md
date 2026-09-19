# 20.26.366–367 financial scope verification

Date: 2026-09-20 (Asia/Taipei)

Production baseline: `bec7986` / 20.26.365. Backend/derived-view rollout 366 completed; front-end 367 adds the post-publication campus reminder correction. No formal business records or role permissions were changed by this release.

## Confirmed requirements

- Daniel remains Owner. Every existing financial branch **filter** offers 河西一路, 美術東四路, 全部校區, 未歸屬. Assignment fields do not offer a fictitious “all” assignment.
- Bonus means the existing overtime addition, not a new compensation formula.
- Fixed monthly salary is calculated once. Allocate its cost by that month's unique formal lesson count and **billing ownership**, not attendance campus, lesson duration or number of children in a group.
- No-lesson fixed salary has no timetable ownership evidence and is allocated to unassigned rather than inferred from teacher assignments.

## Implemented

- Left-aligned titles/month controls/toolbars in all four finance panes; aligned controls and responsive grids.
- Visible KPI branch selector; synchronized finance, KPI, collections and expenses scopes. Dashboard scope stays independent.
- All includes unassigned expenses (previously excluded).
- Explicit month arguments to finance calculations no longer get overridden by the currently open finance month.
- Shared fixed salary allocation, deterministic cent remainder, group-count and duplicate-ID tests, matching settlement/finance costs.
- KPI follows billing ownership and counts actual group members rather than the roster container as one child.
- Fixed-salary leave calculations distinguish full-pay, half-pay and unpaid categories; chronological annual sick/hospital/menstrual allowance handling; conflicting/unknown types require review and cannot lock a monthly settlement.
- Annual export labels its selected scope and preserves cents; monthly Excel/CSV also preserve cents. Monetary display no longer hides cent allocations.
- Branch financial projection obtains teacher cost fields according to lesson billing ownership rather than classroom attendance.

## Evidence

- Final `npm test`: 1,600 passing, 0 failed, 11 skipped. An earlier final run caught the deployment validator's old exact CSP/MIME contract; updated that exact contract and reran successfully, without disabling validation.
- Native Firestore emulator scoped payroll/teacher leave runtime: 16 pass, 0 failed, 0 skipped.
- Relevant billing/LINE/month/pricing browser suite: 53 passing, 1 skipped. WebKit real clipboard case is skipped; do not count it as successful real clipboard testing.
- Version 367 financial scope/UI/export and Hosting-security suite: 80 passing across eight browser/viewport configurations, including monthly cent exports. Desktop Chromium/WebKit finance subset rerun after the last pending-state reminder guard: 16 pass.
- Actual Hosting CSP/MIME configuration: 4 browser passes. Security/deploy-target tests: 16 pass.
- Cloud read-only integration: monthly scoped queries equal full authoritative source for staging 263 lessons and production 1,344 lessons. Daniel/Catherine/AA Art Museum results match; AA Hexi and teacher financial access denied. Administrative diagnostic, not a substitute for real browser authentication.
- Actual Safari staging checks: AA protected campus finance succeeds with no edit controls; Catherine four finance panes share scope; Daniel remains Owner and has all four scope choices; Zhang Yi loads the teacher timetable without a company finance entry. All four authenticated. Existing notifications deferred, not acknowledged/deleted.
- Some combined shell commands failed to launch browsers under the sandbox. Separate approved `npm run test:e2e ...` commands ran successfully. Launch failures are not application assertion passes.

## Reproduced release blocker — corrected with assertion retained

`tests/e2e/finance-scope-reconciliation.spec.js`, test:

`release gate: branch fixed-pay cost includes hidden ownership denominator and approved leave`

Original failing desktop Chromium result (now reconciles correctly):

| Synthetic Art Museum scope | Owner expected | Branch received |
| --- | ---: | ---: |
| Payroll | 21,750 | 30,083.33 |
| Net profit | -20,100 | -28,433.33 |

Root causes:

1. `projectProductionBranchAccessDb` filters schedule rows to permitted attendance campuses. An unassigned-attendance lesson can be absent from the branch view even though its count is required to allocate a teacher's full monthly salary.
2. `subscribeTeacherLeaves` deliberately does not expose the Owner's leave feed to branch managers. Calculating a complete teacher salary from that incomplete client data omits approved leave adjustments.

Correction: authenticated and App-Check-protected read-only endpoints use a consistent authoritative monthly snapshot and the same shared formula as Owner. They return only permitted campus allocations, not foreign lesson IDs, full salary denominators or private leave details. Revoked/teacher/foreign-scope reads are rejected. Clients discard stale-account responses, refresh after approved/cancelled leave and focus, and show pending/error instead of guessed salary. Server role producers and derived views are published along with Hosting.

The original failing assertion remains and passes. Staging date index is READY; production already had it. Staging derived views were refreshed with readback and unchanged access identities, zero business writes.

## Safari compatibility fixes

Live Safari reported CSP refusal of Google's reCAPTCHA Enterprise script and nosniff refusal of the shared leave calculator served as text/plain. Exact documented reCAPTCHA paths were added to CSP, and the exact `.cjs` calculator route now serves JavaScript MIME. App Check, nosniff and role enforcement remain enabled. [Google CSP guidance](https://docs.cloud.google.com/recaptcha/docs/faq). This diagnoses these concrete failures, not every historical 401/403 or network interruption.

## Production publication progress

- Five required Functions deployed successfully and ACTIVE; existing `published-v1` transport retained.
- Derived publication: 7 role views (5 teachers, 2 branch managers), 1,344 lesson metadata rows verified; 4 derived writes, zero formal record writes, zero permission changes. Atomic publication and readback audit passed at source revision 2785.
- Hosting 366: all 366 public assets matched local SHA-256, live JavaScript MIME and CSP checked. Runtime active; five Functions ACTIVE; no Firestore Rules deployment.
- Fresh production Safari AA and Daniel September Art Museum revenue, payroll, expenses and net profit match exactly. No production mutation test or notification acknowledgement was performed.
- This production smoke caught an out-of-scope unassigned-tuition reminder visible to AA. Front-end 367 clears/hides that Owner-only reminder, including pending/error state and account transitions. Assertions added and passed; formulas/backend are unchanged from 366.
- Staging 367 AA native Safari reload and financial read passed with the Owner-only reminder absent. Final full unit suite remains 1,600 pass / 0 fail / 11 skipped after release-version assertions were updated.
- Final production 367 read-only asset audit: all 366 public assets match local SHA-256, zero mismatches, zero data writes. Runtime control/safety are active with writes allowed; the latest recorded Owner health check is healthy. Firestore Rules remain unchanged.
- Final production 367 Safari AA fresh login/reload completed. September revenue, payroll, expenses and profit exactly match the previously verified Daniel campus view; the campus selector is locked to Art Museum, the Owner-only unassigned-tuition reminder is absent, and no verification-pending state remains. Initial full-role verification exceeded 20 seconds before completing safely; this is not a three-second cold-login claim.
- That reload's console contained a 401 for Google's `/recaptcha/enterprise/pat` endpoint, not a denied application financial read. The protected payroll read subsequently completed successfully. This observation does not classify every historical 401/403 as harmless or prove all authentication root causes resolved.

## Other review limits

- The existing company formula for leave's hourly base (monthly salary divided by monthly configured workday hours) was retained. This is not a legal certification of the employment contract, holiday treatment, insurance offsets, overtime law or hourly workers' paid-leave rights.
- Current statutory category reference checked: [Ministry of Labor leave/pay summary](https://www.mol.gov.tw/1607/28162/28166/28218/28226/81499/) and its linked PDF. The fixed-salary tests cover the implemented categories, not every possible statutory employment case.
- Do not overwrite previously locked settlements. Existing adjustment/history mechanisms remain intact.
- No synthetic records were written to staging or production; fixtures ran in isolated local browser memory.
- No universal three-second cloud completion or sustained 120 Hz guarantee is made. Cold authentication/verification can take longer; pending state remains explicit. Endpoint limits fail closed, never silently truncate financial results.
- Listed cases and regression tests are not a proof of all possible future inputs or all historical acceptance tasks. Production asset/backend readback and browser smoke remain separate publication gates.
