# FlowCut proposal compliance audit

Reference reviewed: `gg sir.wps` (Midterm Project Proposal, September 16, 2026) and the user's proposal audit requirements. The `.wps` file is outside this repository. The statuses below describe code evidence in this working tree; they do not claim a production-scale deployment or research validation.

| Proposal requirement | Status | Evidence and remaining work |
| --- | --- | --- |
| Multi-shop customer queue entry, positions, service selection, barber assignment, delays, pauses, completion, cancellation | Implemented and verified | `backend/src/services/queueService.js`, `backend/src/validation/queueValidation.js`, `backend/src/models/QueueEntry.js`; backend queue tests cover delay/resume and queue actions. |
| Tenant isolation and role access for customers, barbers, shop admins, Super Admins | Implemented and verified | Auth middleware and role-scoped routes; analytics controllers use the authenticated `req.user.shopId`. |
| Concurrent queue mutation safety | Partially implemented | Mutations use conditional state changes and request idempotency in queue/barber flows. There is no broad concurrent load test, and some position allocation paths still use count-then-create logic. |
| Live waiting range from queue, service duration, barber capacity, active work, delays, and pauses | Partially implemented | `backend/src/utils/waitEstimate.js` computes a changing range, counts active work, handles no work as zero and no active barber as unavailable; assigned entries use their barber's queue. Arithmetic divides total workload across active capacity and cannot anticipate future arrivals, breaks, or unusually variable services. |
| Estimate versus actual wait evaluation | Partially implemented | `backend/src/services/queueService.js` records an initial range for new customer and walk-in entries; `backend/src/services/analyticsService.js` compares valid saved snapshots with queue-entry-to-service-start duration. Legacy visits have no snapshot and remain excluded. |
| Descriptive analytics: queue activity, completed visits, actual waits/durations, service demand, barber workload, busy periods | Implemented and verified | `backend/src/services/analyticsService.js`, `src/features/shop-admin/Analytics.jsx`; filters are shop scoped, UTC date scoped, and include service/barber filters. |
| Historical queue-size and barber-availability relationships | Partially implemented | Current queue status and current barber availability are available, but historical snapshots are not stored. The analytics API reports these research limitations instead of fabricating results. |
| Data cleaning for missing, malformed, reversed, and implausible timestamps/durations | Implemented and verified | `backend/src/services/analyticsService.js` validates wait intervals and caps implausible duration samples; corresponding analytics tests cover invalid and outlier records. |
| Analytics UI states, date filtering, empty/error handling, responsive layout | Implemented and verified | `src/features/shop-admin/Analytics.jsx` and its stylesheet use the backend filters, loading/error/empty states, and responsive chart/table layouts. Browser visual inspection was unavailable in this environment. |
| Gemini calculation of analytics metrics and chart datasets | Implemented, pending live verification | `backend/src/services/analyticsMetricService.js` sends shop-scoped aggregate inputs to Gemini for the summary cards and chart series, then validates its structured results against backend calculations. Missing configuration, rate limits, and invalid output fall back to backend calculations. No chat endpoint or assistant UI is present. |
| Descriptive/exploratory methodology; no predictive model or payments | Implemented and verified | Wait calculations are operational arithmetic, not a trained prediction model. No payment-processing feature was introduced. |
| Big-data scalability under real multi-shop production load | Unable to verify | MongoDB collections and indexes support tenant/date-scoped queries, but no production-scale dataset or load test was available. |

## Gemini diagnosis boundary

The previous committed implementation used a hand-built REST request whose endpoint and request shape appear compatible with Gemini's GenerateContent API. That code discarded provider response bodies/statuses and did not retry transient errors, so a historical failure cannot be assigned to a specific credential, quota, network, model, or request cause from repository evidence. The configured key/model completed a live request earlier in this work. A later live request reached Gemini but received HTTP 429, which indicates current rate/quota limiting; it does not indicate a missing or invalid key. The SDK now surfaces that safe status and retries transient provider errors once. Secrets and provider response bodies were not recorded.

## Environment

Copy `backend/.env.example` to `backend/.env`; set `MONGODB_URI` and `JWT_SECRET`. Set `GEMINI_API_KEY` to enable Gemini headline metric calculations; `GEMINI_MODEL` is optional and defaults to `gemini-3.8-flash`. The real `.env` is ignored by Git and must remain uncommitted.
