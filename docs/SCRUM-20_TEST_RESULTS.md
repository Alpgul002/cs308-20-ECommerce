# SCRUM-20 verification

Executed 2026-11-27 on Windows with Node.js 24 and the committed lockfile.

| Check | Actual result |
| --- | --- |
| New `scrum20.api.test.js` before error-adapter fix | 6 failed, reproducing dropped metadata |
| All frontend tests after fix | 36 passed: 30 retained + 6 new isolated unit tests |
| All backend tests | 305 passed: 303 retained + 2 SCRUM-19 integration tests |
| Full Playwright browser suite after final merge correction | 16 passed: 12 retained + 4 SCRUM-19 browser tests |
| Production Vite build | Passed |
| Git whitespace/conflict check | Passed |

Final suite total: **357 passing tests**. This is the whole integrated suite, not
357 tests newly written by this contributor. New work in these two Jira tasks:
**6 unit tests, 2 backend integration tests and 4 browser tests**. Report them separately.

The unit cases verify stock-conflict items, changed totals including zero, original
versus replayed decline, field validation, protected Error identity/status, and
backward-compatible message-only failures. Seven retained API-helper cases cover
timeouts, cancellation, network/proxy errors, cookies/cache and JSON serialization.

Sources were compared against the documented implemented contracts. Unimplemented
delivery, PDF/email and moderation routes remain explicitly proposed. Passing
these checks is not team agreement or a completed progress-demo purchase UI.
