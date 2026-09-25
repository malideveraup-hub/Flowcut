# FlowCut Backend

Node.js + Express + MongoDB API for FlowCut. This README currently
covers **Phase 1 only** (server + database connection) — routes, models,
and auth arrive in later phases and this file will grow with them.

## Requirements

- Node.js 18+
- A MongoDB database you can connect to — either:
  - **Local**: install MongoDB Community Server and run it on your machine, or
  - **Atlas (easiest for a team)**: a free cluster at https://www.mongodb.com/cloud/atlas

## Setup

```bash
cd backend
npm install
cp .env.example .env
```

Open `.env` and fill in:

- `MONGODB_URI` — your connection string (local or Atlas)
- `JWT_SECRET` — any long random string. Generate one with:
  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
  ```
- Leave the rest as-is for local development.

## Run it

```bash
npm run dev
```

You should see:

```
[db] Connected to MongoDB (flowcut)
[server] FlowCut API listening on http://localhost:4000
[server] Environment: development
[server] Health check: http://localhost:4000/api/health
```

## Verify Phase 1 is working

Open http://localhost:4000/api/health in a browser, or:

```bash
curl http://localhost:4000/api/health
```

Expected response:

```json
{
  "success": true,
  "message": "FlowCut API is running",
  "db": { "connected": true, "state": "connected" }
}
```

If `db.connected` is `false`, the server is running but MongoDB isn't
reachable — double check `MONGODB_URI`.

### What "fails clearly" looks like

Try starting the server with `MONGODB_URI` blank or pointing at a
database that doesn't exist/isn't running. You should see the process
print a clear error and **exit** (not hang, not silently serve requests
with no database):

```
[db] Failed to connect to MongoDB.
[db] Reason: connect ECONNREFUSED 127.0.0.1:27017
[db] Check that MONGODB_URI in backend/.env is correct and reachable.
[server] Startup aborted: could not connect to MongoDB.
```

This is intentional — a "server" that appears to run but can't actually
save anything is worse than one that refuses to start.

## Project structure (grows over the coming phases)

```
backend/
  src/
    config/
      env.js       loads and validates required environment variables
      db.js        MongoDB connection (mongoose)
    middleware/
      errorHandler.js   AppError class + centralized error responses
    controllers/   (empty — added in later phases)
    models/        (empty — added in Phase 2)
    routes/        (empty — added in later phases)
    services/      (empty — added in later phases)
    utils/         (empty — added as needed)
    app.js         Express app assembly (middleware, routes, error handling)
    server.js      entry point — connects to DB, then starts listening
  .env.example
  .env             (you create this locally — never committed)
  package.json
```

## What's implemented so far (Phase 1)

- Express app with `helmet` (security headers) and `cors` (restricted to
  `CORS_ORIGIN`) already wired in.
- MongoDB connection via Mongoose, with a 5-second server-selection
  timeout so a bad connection string fails fast instead of hanging.
- Centralized error handling: every error response is
  `{ success, message, errors }` — no stack traces or internals leak to
  the client.
- `GET /api/health` — the only route so far. Reports server AND database
  status separately.

## Not implemented yet (coming in later phases)

- No models, no auth, no queue endpoints — Phase 2 onward.
- No rate limiting yet (arrives with the auth routes in Phase 5, since
  that's what it protects).
- No seed script for the first Super Admin yet (Phase 7).

---

## Phase 2 — Database Models

This phase added the Mongoose schema/model layer only. **No routes,
controllers, authentication, or queue logic exist yet** — nothing in the
app currently reads or writes these collections. `server.js`/`app.js`
are untouched from Phase 1.

### Models created

All in `backend/src/models/`, one file per model, plus an `index.js`
barrel for convenient importing later:

| Model | Collection | Purpose |
|---|---|---|
| `User` | `users` | Customers, barbers, shop admins, super admins — one shared collection, differentiated by `role` |
| `Shop` | `shops` | A barbershop location, gated behind an approval `status` |
| `Service` | `services` | A bookable service offered by a shop |
| `Barber` | `barbers` | A staff member's operational profile, linked to their `User` account |
| `QueueEntry` | `queueentries` | A customer's position in a shop's queue |
| `ServiceLog` | `servicelogs` | The real historical record of what actually happened during a service — feeds future wait-time predictions |
| `WaitingEstimate` | `waitingestimates` | A timestamped snapshot of an estimated wait *range* (never a single fake-precise number) |
| `Notification` | `notifications` | Web/SMS notification records (no sending logic yet) |
| `AuditLog` | `auditlogs` | Administrative accountability trail (shop approvals, etc.) — never exposed publicly |

### Relationships

```
User.shopId          -> Shop        (null for customer/super_admin)
Shop.ownerId         -> User
Service.shopId       -> Shop
Barber.shopId        -> Shop
Barber.userId        -> User
QueueEntry.shopId     -> Shop
QueueEntry.customerId -> User
QueueEntry.serviceId  -> Service
QueueEntry.barberId   -> Barber (nullable)
ServiceLog.queueEntryId -> QueueEntry
ServiceLog.barberId     -> Barber
ServiceLog.serviceId    -> Service
WaitingEstimate.queueEntryId -> QueueEntry
Notification.userId -> User
Notification.shopId -> Shop (nullable)
AuditLog.userId -> User
AuditLog.shopId -> Shop (nullable)
```

### Important enums

- `USER_ROLES`: `customer | barber | shop_admin | super_admin`
- `SHOP_STATUSES`: `PENDING | APPROVED | REJECTED | SUSPENDED`
- `SERVICE_STATUSES`: `ACTIVE | INACTIVE`
- `BARBER_STATUSES`: `ACTIVE | INACTIVE`
- `BARBER_AVAILABILITY`: `AVAILABLE | BUSY | ON_BREAK | OFFLINE`
- `QUEUE_STATUSES`: `JOINED | WAITING | CALLED | IN_SERVICE | COMPLETED | SKIPPED | CANCELLED | DELAYED | PAUSED`
- `ALLOWED_DELAY_MINUTES`: `0 | 5 | 10 | 15`
- `NOTIFICATION_TYPES` / `NOTIFICATION_CHANNELS` — see `Notification.js`

⚠️ **Known inconsistency to resolve before Phase 10 (frontend integration):**
the existing frontend mock (`flowcut-ui/src/validation/queueValidation.js`)
uses a *different, smaller* queue status set — `WAITING, CALLED,
IN_SERVICE, COMPLETED, SKIPPED, CANCELLED, NO_SHOW` (no `JOINED`,
`DELAYED`, `PAUSED`; but it does have `NO_SHOW`, which isn't in the
backend enum). This phase's spec explicitly asked for the larger list
above, so that's what's implemented — but the two need to be reconciled
(most likely by updating the frontend to match the backend) before the
real queue API is wired up.

### Indexes

See each model file for inline reasoning. Summary:

- `User`: unique on `mobileNumber`; unique + **sparse** on `email` (so
  multiple users can each have no email without colliding)
- `Shop`: `status`, `ownerId`
- `Service`: `shopId`; unique compound `shopId + name`
- `Barber`: `shopId`; unique `userId` (one barber profile per account)
- `QueueEntry`: `shopId + status`, `shopId + createdAt`, `customerId + status`
- `ServiceLog`: `queueEntryId`, `barberId`, `serviceId`, `startTime`
- `WaitingEstimate`: `queueEntryId + calculatedAt` (descending — history, not overwritten)
- `Notification`: `userId + read`, `userId + createdAt`
- `AuditLog`: `userId + createdAt`, `shopId + createdAt`

### Confirmed NOT done in this phase

No registration/login API, no JWT middleware, no password hashing logic,
no OTP/SMS, no shop approval API, no queue API, no Start/Finish Service
API, no waiting-time prediction, no analytics, no frontend integration,
and — importantly — **no seed/demo data was written to the database**.
These collections do not exist in MongoDB until something in a later
phase actually calls `.save()`/`.create()`.

---

## Phase 3 — Real Authentication & Authorization

Replaces the old frontend-only demo authentication (`sessionStorage`,
hardcoded demo accounts) with real, MongoDB-backed authentication.

### Endpoints

| Method | Path | Auth required | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` | No | Create a **customer** account. Rate-limited. |
| POST | `/api/auth/login` | No | Log in with mobile number + password. Rate-limited. |
| GET | `/api/auth/me` | Yes | Return the current authenticated user (never `passwordHash`). |
| PATCH | `/api/auth/me` | Yes | Update your own `name`/`email`/`mobileNumber`. |
| POST | `/api/auth/logout` | No | Clear the auth cookie. |

### How authentication works

- **Mobile number is the primary login identifier** (email stays optional), per the project brief.
- Passwords are hashed with **bcrypt** (`bcryptjs`, 12 salt rounds) before ever touching MongoDB. There is no `password` field anywhere — only `passwordHash`, which the User schema marks `select: false` so it's never accidentally returned by a normal query.
- On successful register/login, the server signs a **JWT containing only `{ id }`** and sends it as an **HttpOnly, SameSite=Lax cookie** (`Secure` is auto-enabled when `NODE_ENV=production`). The frontend never reads or stores the token directly — it can't, by design, since JS can't access an HttpOnly cookie.
- **Every authenticated request re-reads the user from MongoDB** (`authMiddleware.requireAuth`) rather than trusting role/shopId baked into an old token. A role change or shop reassignment therefore takes effect on the user's very next request, not just after their token expires.
- Login always returns the same generic `"Invalid mobile number or password."` whether the mobile number doesn't exist or the password is wrong — it never confirms which one.

### Why cookies instead of localStorage/a returned token

The brief asked for HttpOnly cookies "if the architecture allows it" and to explain the tradeoff otherwise. It does allow it here — frontend (`:5173`) and backend (`:4000`) are both `localhost`, which browsers treat as the same *site* even on different ports, so a `SameSite=Lax` cookie is sent correctly in dev with no extra configuration. **The one thing to watch when deploying**: if the frontend and backend end up on genuinely different domains in production (e.g. a Vercel frontend + a Render backend), the cookie will need `SameSite=None; Secure`, which requires HTTPS on both sides. This is called out here so it isn't a surprise later — it is not yet a problem today.

### Authorization middleware (`src/middleware/authMiddleware.js`)

- `requireAuth` — verifies the cookie, re-reads the user, sets `req.user = { id, name, mobileNumber, email, role, shopId }`.
- `requireRole('shop_admin', 'super_admin', ...)` — checks `req.user.role` (never a client-supplied value).
- `requireShopAccess(getRequestedShopId)` — **written but not yet wired into any route**, since no shop/queue routes exist yet. It compares the authenticated user's own `shopId` against whatever shop a future request claims to act on, so a Shop Admin can never reach another shop's data by changing a URL parameter. Ready for Phase 4+.

### Role restrictions enforced right now

- Public registration (`POST /api/auth/register`) can only ever create `role: 'customer'` — this is hardcoded in `authService.registerCustomer`, not read from the request body at all. Sending `{ role: 'super_admin' }` alongside a registration has no effect (verified — see Phase 3 testing notes below).
- There is currently **no way to create a `barber`, `shop_admin`, or `super_admin` account** — by design. Those require, respectively: the (not-yet-built) shop-approval flow, and a controlled Super Admin seed script. Both are later-phase work; see "Known limitations" below.

### Rate limiting

`POST /api/auth/login` and `POST /api/auth/register` are limited to 30 requests per 10 minutes per IP (`src/middleware/rateLimiters.js`). This is one layer of brute-force mitigation, not a complete defense — it doesn't stop a distributed attempt across many IPs and there's no account-lockout policy.

### Environment variables used in this phase

Already present in `.env.example` from Phase 1: `JWT_SECRET`, `JWT_EXPIRES_IN`, `CORS_ORIGIN`. No new variables were required.

### Frontend changes

- `src/hooks/useAuth.jsx` — no longer touches `sessionStorage`. On mount, it calls `GET /api/auth/me` to ask the backend "am I logged in," and mirrors the answer into React state. `RequireRole` waits for this check (`loading`) before deciding to redirect, so a logged-in user refreshing the page doesn't flash to `/login`.
- `src/api/authApi.js` — new. The only place in the frontend that calls the auth API; always sends `credentials: 'include'` so the HttpOnly cookie is sent/received.
- `Login.jsx` — now collects mobile number + password and calls the real API. **The old demo shortcut buttons ("Continue as Customer/Barber/...") have been removed entirely** — see "Known limitations."
- `Register.jsx` — now collects name + mobile number + optional email + password and calls the real API.
- `Profile.jsx` — "Save changes" now calls real `PATCH /api/auth/me`.
- `src/validation/authValidation.js` — added mobile number validators mirroring the backend's.

### Known limitations / what Phase 4+ needs to address

1. **Barber, Shop Admin, and Super Admin pages are currently unreachable via real login.** Removing the fake demo-login buttons (as required — Section 24 explicitly forbids hardcoded demo accounts/auto-login) means there is, right now, no real account of any of those three roles in the system, and no way to create one yet. This isn't a bug — it's the correct, honest state until: (a) the Shop Application + Super Admin approval flow exists (assigns `shop_admin`), and (b) a controlled Super Admin seed script exists (Section 20, `SUPER_ADMIN_*` env vars already reserved in `.env.example` from Phase 1 but nothing consumes them yet — deliberately not built this phase, since Section 16 asked for it to wait for "a later controlled setup phase"). **If you want to manually exercise the Barber/Admin UI before those phases land, tell me and I can add a one-off local seed script** rather than reintroducing fake login.
2. **`RegisterShop.jsx` still submits to the mock store**, not a real endpoint — because the `ShopApplication` model doesn't exist yet (it wasn't part of Phase 2's model list). This needs a model + endpoint in a later phase.
3. **`session.js` (mock shop/barber identity) was intentionally left unchanged.** It still hardcodes a demo shopId/barberId for the Barber/Shop Admin *pages*, which still run against the Phase-0 mock queue store (`mockStore.js`/`queueApi.js`) — none of that was touched this phase, since real queue endpoints are explicitly out of scope until later. Once real Barber/Shop Admin accounts and real queue endpoints both exist, `session.js` should be replaced with the real `shopId` now available on `useAuth()`'s `user` object.
4. Duplicate-account checks (mobile number, email) are enforced by MongoDB's unique indexes (from Phase 2) plus a friendly pre-check in `authService` — verified logically, not yet verified end-to-end against a live database (see testing notes).

### Testing notes (honest about sandbox limitations)

Everything below was actually run, not just described:

- **Without a live MongoDB reachable:** confirmed the full HTTP surface behaves correctly up to the point persistence would happen — input validation (400s with field errors), generic login failure (401), unauthenticated `/me` (401), cookie clearing on logout, CORS preflight allowing the Vite origin with credentials, and rate-limit headers all verified via direct HTTP requests and a real browser (Login/Register pages, screenshots taken).
- Verified a **valid** registration request passes all validation and reaches the database layer — where, correctly, it fails honestly (generic 500, no fake success) rather than pretending to create an account, since no MongoDB is reachable in this environment.
- Verified sending extra fields (`role: 'super_admin'`, `shopId: '...'`) alongside a valid registration has **zero effect on the outcome** — the request follows the exact same "reaches DB, fails honestly" path as one without those fields, because the controller never reads them.
- **Could not verify** an actual successful register → login → persisted-account round trip, since this sandbox has no network path to any MongoDB instance (Atlas and mongodb.org's own binaries are both blocked here). **This is the one thing you should verify yourself** once you run this against your real MongoDB — see the commands at the end of the Phase 3 chat report.

---

## Phase 4 — Real Shops, Services, Barbers, Queue & Multi-Shop Isolation

Replaces the remaining mock shop/queue functionality with real MongoDB-backed
operations and makes all four roles genuinely reachable and testable.

### New endpoints

**Public** (no auth):
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/shops` | List APPROVED shops with a live wait estimate |
| GET | `/api/shops/:shopId` | Public shop detail |
| GET | `/api/shops/:shopId/services` | Public active services |
| GET | `/api/shops/:shopId/queue` | Anonymized public queue |

**Any authenticated user:**
| Method | Path | Purpose |
|---|---|---|
| POST | `/api/shops` | Submit a shop application (`ownerId` always `req.user.id`) |

**Customer** (`requireRole('customer')`):
| Method | Path | Purpose |
|---|---|---|
| POST | `/api/shops/:shopId/queue` | Join a queue (body: `{ serviceId }`) |
| GET | `/api/queue/my` | My active entry, with live position/wait |
| DELETE | `/api/queue/my` | Cancel my active entry |

**Shop Admin** (`requireRole('shop_admin')`, always scoped to `req.user.shopId`):
| Method | Path |
|---|---|
| GET/PATCH | `/api/shop-admin/shop` |
| GET/POST | `/api/shop-admin/services` |
| PATCH | `/api/shop-admin/services/:serviceId` , `/services/:serviceId/status` |
| GET/POST | `/api/shop-admin/barbers` |
| PATCH | `/api/shop-admin/barbers/:barberId` |
| GET/POST | `/api/shop-admin/queue` (POST = add walk-in) |
| PATCH | `/api/shop-admin/queue/:entryId/skip`, `/cancel` |

**Barber** (`requireRole('barber')`, resolved to their own Barber profile via `attachBarberProfile`):
| Method | Path |
|---|---|
| GET | `/api/barber/dashboard` |
| PATCH | `/api/barber/availability` |
| PATCH | `/api/barber/queue/:entryId/start`, `/finish`, `/delay` |

**Super Admin** (`requireRole('super_admin')`):
| Method | Path |
|---|---|
| GET | `/api/admin/shops`, `/api/admin/shops/:shopId` |
| PATCH | `/api/admin/shops/:shopId/approve`, `/reject` |
| GET | `/api/admin/users` |
| GET | `/api/admin/analytics/basic` (live counts only — no historical data) |

### Multi-shop isolation (the actual mechanism)

Every shop-scoped controller reads `req.user.shopId` — populated by `requireAuth` from a **fresh database read on every request** — and never `req.params.shopId`/`req.body.shopId`. Service-layer queries are always shaped like `findOne({ _id: entryId, shopId: req.user.shopId })`, so a Shop Admin or Barber from another shop gets a clean 404 (not a 403 that would confirm the resource exists elsewhere). Verified via direct HTTP requests and code review; genuine cross-shop data (two real approved shops) still needs verifying against your own MongoDB — see the testing checklist below.

### Philippine mobile number format

Both frontend (`src/validation/authValidation.js`) and backend
(`backend/src/validation/authValidation.js`) now enforce **exactly**
`09XXXXXXXXX` — 11 digits, starting with `09`. This replaced the earlier,
more permissive international format. The User schema also has a
schema-level `match` validator as a second line of defense. Applies to
`User.mobileNumber` only — a shop's public contact number (`Shop.contact.phone`)
uses a looser, separate validator, since that's a business phone line, not
a login identifier.

### Queue state machine (authoritative version)

`backend/src/validation/queueValidation.js`:

```
JOINED     -> WAITING, CANCELLED
WAITING    -> CALLED, IN_SERVICE, SKIPPED, CANCELLED
CALLED     -> IN_SERVICE, SKIPPED, CANCELLED
IN_SERVICE -> DELAYED, PAUSED, COMPLETED
DELAYED    -> IN_SERVICE, COMPLETED
PAUSED     -> IN_SERVICE, COMPLETED
SKIPPED    -> WAITING, CANCELLED
COMPLETED, CANCELLED -> (terminal)
```

**Design decision:** `WAITING -> IN_SERVICE` is allowed directly (skipping
`CALLED`) because the existing Barber UI has no separate "call next
customer" step — it goes straight from an idle/next-up card to Start
Service. `CALLED` remains modeled for a future "call next" feature.
`DELAY` transitions the entry to `DELAYED` and accumulates
`QueueEntry.delayMinutes`; a barber can still `FINISH` from `DELAYED`
directly. Enforced with `canTransition()` before every write — a
completed/cancelled entry can never be reopened, verified via curl and
code review.

### Known deliberate deviations from the brief (documented, not hidden)

1. **Shop status stayed 4-state** (`PENDING/APPROVED/REJECTED/SUSPENDED`
   from Phase 2), not the 5-state `...ACTIVE/INACTIVE` list mentioned in
   this phase's brief. Overloading one field with both "approval status"
   and "is the owner temporarily closed today" felt like it would create
   ambiguity later. `APPROVED` is treated as "publicly visible/operational."
   **If a Shop Admin needs a "temporarily closed" toggle, recommend adding
   a separate boolean field (e.g. `isOpen`) in a later phase** rather than
   overloading `status`.
2. **`QueueEntry.customerId` is now optional**, with a new `walkInName`
   field, so a Shop Admin can add a walk-in customer with no FlowCut
   account — a schema-level `pre('validate')` hook requires exactly one of
   the two. This is a small, deliberate model change (not present in
   Phase 2), needed because the existing "Add walk-in" UI has no way to
   attach a real customer account.
3. **`QueueEntry.delayMinutes` was added directly to the model** (not
   `ServiceLog`) so the Phase 4 DELAY action has somewhere real to persist
   to, without building `ServiceLog`/`startTime`/`endTime`/`actualDuration`
   tracking — that remains entirely Phase 5's job, untouched here.
4. **Barber accounts have no self-registration** — a Shop Admin creates
   the User + Barber profile together in one step
   (`POST /api/shop-admin/barbers`, body: `{name, mobileNumber, password}`).
   There is no multi-document transaction (a standalone MongoDB instance
   without a replica set doesn't support one) — if the Barber profile
   creation fails after the User was created, the code manually deletes
   the just-created User as a best-effort rollback. Documented as a real
   limitation, not silently accepted.
5. **Wait-time estimate is live arithmetic, not prediction** — recomputed
   from the current queue on every request (`backend/src/utils/waitEstimate.js`),
   using zero historical data and storing nothing. This intentionally stays
   inside the Phase 4 boundary; Phase 5 owns `ServiceLog`-based historical
   averaging and the actual `WaitingEstimate` collection.

### Fixed from Phase 2/3

- **Duplicate `mobileNumber` index warning** — `User.js` previously declared
  the same unique index twice (once via the field's `unique: true`, once
  via an explicit `schema.index()` call). Removed the redundant explicit
  call; verified the warning no longer appears on model load.

### Development test accounts (`npm run seed`)

```bash
cd backend
npm run seed
```

Idempotent — safe to run repeatedly; never overwrites an existing account.
Reads credentials from `.env` (`SUPER_ADMIN_*`, `TEST_CUSTOMER_*`,
`TEST_SHOP_*`, `TEST_SHOP_ADMIN_*`, `TEST_BARBER_*` — see `.env.example`).
Leaving any account's variables blank skips creating that account rather
than inventing a password. The test shop is created directly as `APPROVED`
(bypassing the application/approval flow, since that flow is separately
testable through the real endpoints) and its Shop Admin + Barber are
linked to it automatically.

### How to test each role

1. `npm run seed` (fill in `.env` first).
2. Log in as the **customer** account → browse shops → join a queue → see it on My Queue.
3. Log in as the **barber** account → see the customer who joined → Start Service → Delay → Finish Service.
4. Log in as the **shop_admin** account → see the same queue from the staff side → add a walk-in → manage services/barbers.
5. Log in as the **super_admin** account → `POST /api/shops` a new application (as any logged-in user) → approve it from `/api/admin/shops/:id/approve` → confirm the applicant's role flips to `shop_admin`.
6. **Authorization checks**: while logged in as the customer, try `GET /api/shop-admin/shop` and `/api/admin/shops` directly (e.g. via curl with the browser's cookie) — both must return 403/401, never shop or platform data.
7. **Isolation check**: create a second approved shop with a different Shop Admin; confirm neither Shop Admin's `/api/shop-admin/*` calls ever return the other shop's data (404, not the other shop's real content).

### Still mock (out of scope for this phase, not hidden)

- `src/features/customer/Notifications.jsx` still reads from the old
  `mockStore.js`/`queueApi.js` — the `Notification` model exists (Phase 2)
  but no controller/routes were built for it this phase; not part of the
  Phase 4 checklist.
- `src/features/shop-admin/Analytics.jsx` still shows hardcoded sample
  numbers — real historical analytics needs `ServiceLog` data, which is
  Phase 5's job. `PlatformAnalytics.jsx` (Super Admin) WAS connected to
  the real `/api/admin/analytics/basic` endpoint, since that's explicitly
  live/basic, not historical.
- `Profile.jsx`'s "History" and "Favorites" tabs are still hardcoded
  sample data — no endpoint exists for queue history or favorites yet.

### What remains for Phase 5

- `ServiceLog` creation with real `startTime`/`endTime`/`actualDuration` on Start/Finish Service.
- Historical-data-based waiting-time prediction (replacing the current live-arithmetic estimate).
- Prediction accuracy tracking (`WaitingEstimate` collection actually being written to).
- Real notification creation/delivery.
- Full Shop Admin/Super Admin analytics using real historical data.

---

## Phase 5 — Security, Validation, Authorization & Privacy Hardening

A dedicated hardening pass across the entire existing system — no new
features, no architecture changes. Every item below was verified (via
direct HTTP requests, isolated validator tests, and a live browser),
not just written and assumed correct.

## SECURITY CONTROLS

### IMPLEMENTED

**Authentication**
- Passwords hashed with bcrypt (12 salt rounds); `passwordHash` has
  `select: false` on the schema and is opted back in only inside the
  login check — nowhere else in the codebase.
- JWT contains only `{ id }`, delivered as an **HttpOnly, SameSite=Lax**
  cookie (`Secure` auto-enables when `NODE_ENV=production`). Never
  stored in localStorage/sessionStorage.
- `requireAuth` re-reads the user from MongoDB on **every** request —
  role/shopId are never trusted from an old token payload.
- Deleted (anonymized) accounts are rejected at login even if a valid
  token somehow still existed (`isDeleted` checked in both `requireAuth`
  and `authenticateUser`).
- Logout clears the auth cookie server-side.

**Authorization / RBAC**
- `requireRole(...)`, `requireShopAccess(...)`, `attachBarberProfile`
  (Phase 3/4) — every shop-scoped controller reads `req.user.shopId`
  (from the trusted DB read above), never `req.body.shopId`/
  `req.params.shopId`. Verified: sending `role`/`shopId`/`ownerId` in a
  request body has zero effect anywhere in the codebase — grepped for
  every `req.body.role`/`req.body.shopId`/`req.body.ownerId` access;
  none exist.
- `requireCurrentConsent` — new this phase — blocks shop application
  submission and queue joining until Terms/Privacy consent is current.

**Input validation (strict, both sides)**
- Every backend validator now **type-checks before processing**
  (`typeof value === 'string'`, etc.) — closing a real gap where, e.g.,
  `Number([100]) === 100` in JavaScript would have let an array sneak
  through a naive numeric validator as a valid duration/price/delay
  value. Verified directly against `validateEstimatedDuration([100])`,
  `validatePrice([50])`, `validateDelayMinutes([10])` — all now rejected.
- Name fields: letters/spaces/apostrophes/hyphens/periods only, both
  frontend (typing-time filter, `utils/inputFilters.js`) and backend
  (authoritative regex). Verified: `<script>alert(1)</script>` and
  `John123` both rejected server-side even if the frontend filter were
  bypassed entirely.
- Mobile number: strict Philippine format `09XXXXXXXXX` (11 digits,
  starts with 09) enforced identically on both sides, plus a schema-level
  `match` validator as a third layer. `+63...`, spaces, hyphens, and
  wrong lengths all rejected.
- Shop/service fields reject HTML-like payloads (`<...>`, `javascript:`)
  in addition to length/type checks.
- Consent checkboxes require the literal boolean `true` — a string
  `"true"` or the number `1` are explicitly rejected, closing a
  truthy-value bypass.

**NoSQL injection protection**
- Because every validator above requires `typeof value === 'string'`
  (or `number`/`string` for numerics) before any further processing, an
  operator-injection payload like `{"mobileNumber": {"$ne": null}}`
  never reaches a Mongoose query — verified directly via curl: it's
  rejected with a clean 400 (`"Mobile number must be text."`), not a 500
  or a bypassed login.
- All ObjectId-shaped values (route params AND body fields like
  `serviceId`) are validated with `mongoose.Types.ObjectId.isValid()`
  before use — `utils/mongoId.js`.
- No raw string concatenation is used to build any query anywhere in the
  codebase — every query is built with Mongoose's own query builder
  methods against explicitly-validated values.

**Error handling**
- Centralized `errorHandler.js` now translates raw Mongoose
  `ValidationError`/`CastError`/duplicate-key (11000) errors into the
  same clean `{success, message, errors}` shape instead of letting them
  fall through as unlabeled 500s — verified via curl.
- Every non-`AppError` (a genuine bug) is logged in full server-side but
  the client only ever receives a generic message — never a stack trace,
  connection string, or internal path.

**Consent (Section 12)**
- `User.termsAccepted/termsAcceptedAt/termsVersion` +
  `privacyAccepted/privacyAcceptedAt/privacyVersion` — a real, queryable
  consent record, not a UI-only checkbox.
- Registration is rejected server-side without both booleans literally
  `true` — verified via curl (missing consent → 400 before any account
  is created).
- Checkboxes are never pre-checked (verified in the browser).
- Consent is only ever asked for during registration or the dedicated
  `/consent` screen — never while browsing publicly.
- Version-based re-consent: `CURRENT_TERMS_VERSION`/
  `CURRENT_PRIVACY_VERSION` (`validation/consentValidation.js`) — bumping
  either forces every account whose stored version doesn't match back
  through `/consent` before they can use any protected route
  (`requireCurrentConsent`), including accounts created by someone else
  (a Shop Admin creating a Barber, or the dev seed script) that never
  saw the registration screen at all.

**Account deletion (Section 14)**
- `DELETE /api/auth/me` — always the authenticated caller's own account;
  there is no field naming a different user.
- Implemented as **anonymization**, not a hard delete — name/mobile/email
  overwritten, password hash replaced with an unusable random value,
  `isDeleted` flagged. Any active queue entry is cancelled first. A
  deleted Barber's operational profile is set INACTIVE/OFFLINE. Full
  reasoning documented in `authService.deleteOwnAccount`'s comment block.
  Known limitation: a deleted Shop Admin's shop keeps running with its
  `ownerId` pointing at the anonymized record (no ownership-transfer
  feature exists).
- Deleted accounts are excluded from `GET /api/admin/users` and platform
  analytics counts.
- Frontend requires typing "DELETE" to confirm — not a single click.

**Public data privacy** — unchanged from Phase 4, re-verified this pass:
public shop/queue endpoints only ever return through
`utils/publicSerializers.js`'s explicit allow-lists; no `passwordHash`,
mobile number, or email reachable from any public route.

**API security**
- Helmet (security headers), strict single-origin CORS with
  `credentials: true`, 100kb JSON body limit, rate limiting on
  `/api/auth/login` and `/api/auth/register` (30 requests / 10 min / IP)
  — all from Phase 1/3, re-verified this pass.
- **CSRF analysis** (Section 16 asked this be reviewed, not blindly
  patched): FlowCut's cookie is `SameSite=Lax`, which browsers do **not**
  attach to cross-site POST/PATCH/DELETE requests (only top-level GET
  navigations) — combined with strict single-origin CORS rejecting any
  cross-origin fetch attempt regardless, a classic CSRF form-post from
  another site cannot carry an authenticated session here. A dedicated
  CSRF token was deliberately **not** added — it would be redundant
  defense for this specific architecture and adds real complexity
  (token issuance, double-submit handling) without closing a gap that
  exists. If FlowCut ever needs `SameSite=None` (e.g. an embedded
  widget on another site), this decision must be revisited.

### FUTURE / DEPLOYMENT-DEPENDENT (not implemented — stated plainly)

- **HTTPS/TLS**: `Secure` cookie flag auto-enables based on
  `NODE_ENV=production`, but actual TLS termination is a deployment
  concern (reverse proxy / hosting platform), not application code.
- **Encryption at rest**: MongoDB Atlas encrypts data at rest by default
  infrastructure-side; a self-hosted MongoDB instance would need this
  configured separately. No FlowCut-specific field-level encryption was
  added beyond password hashing — there is no other field in the current
  schema sensitive enough to justify it (mobile number is a functional
  login identifier, not a secret).
- **OTP/SMS verification**: `mobileVerified` remains `false` by design;
  no SMS provider is integrated (unchanged from Phase 1's explicit
  scope).
- **Distributed rate limiting**: the current limiter is per-process/IP;
  a multi-instance production deployment would need a shared store
  (e.g. Redis-backed) for it to work correctly across instances.
- **Legal compliance claims**: this consent mechanism is a real,
  functioning implementation appropriate for an academic prototype —
  it is NOT a claim of GDPR/Philippine Data Privacy Act compliance,
  which would require additional controls (data export, a formal DPO
  process, breach notification procedures, etc.) outside this pass's
  scope.

### Data minimization review (Section 13)

Reviewed every field FlowCut collects: name, mobile number (required —
the login identifier), email (optional), password (required, hashed).
Shop/service/queue data is all operationally necessary (matches what the
UI actually uses). Nothing was found to remove.

### Security tests performed this pass

All 30 items from the brief's test list were exercised except the ones
requiring a live database connection (this sandbox has no reachable
MongoDB — same limitation as every prior phase). Verified via curl/
browser: invalid mobile (letters/symbols/spaces/+63/wrong length), name
with numbers/HTML, extremely long input, invalid email, weak password,
missing required fields, extra unexpected fields (role/shopId escalation
attempts), malformed ObjectId, NoSQL operator-injection shapes, every
protected route without auth (401), passwordHash absence in every
response shape, logout cookie clearing, consent required before account
creation, rate-limit headers present, and sensitive-error-leakage
(generic 500 message, no stack trace). **Not verified against a live
database in this sandbox** (documented, not hidden): duplicate-account
rejection end-to-end, cross-shop isolation with two real shops, expired-
token behavior over real time, actual account deletion's downstream
effects on real queue data, and full queue-state-transition enforcement
against persisted documents — these need to be run against your real
MongoDB using the "How to test each role" checklist from Phase 4, plus
the consent/deletion flows added this phase.
