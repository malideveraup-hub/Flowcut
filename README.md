# FlowCut UI

A real, running React implementation of the FlowCut design system —
built from the UI/UX Design System & Specification doc. Every screen
listed there exists here as working React code with a mock backend,
not just a static mockup.

## Run it

```bash
npm install
npm run dev
```

Open the printed local URL. On `/login`, use one of the **demo
shortcuts** at the bottom of the form ("Continue as Customer / Barber
/ Shop admin / Super admin") — there's no real backend yet, so these
log you in as a fixed demo user for each role.

To build for production:

```bash
npm run build
npm run preview
```

## What's real vs. mocked

- **Real:** all React components, routing, the design-token system,
  the pixel (Customer) and clean (Barber/Admin) skins, form
  validation, and all the interactions — joining a queue, starting/
  finishing a service, adding a walk-in, approving a shop, etc. all
  actually mutate shared state and re-render every affected screen.
- **Mocked:** the backend. `src/api/mockStore.js` is an in-memory
  store standing in for MongoDB, and `src/api/queueApi.js` is the
  functions pages call — this is the seam where real `fetch()` calls
  to the Node/Express API (see the Master Project Document) plug in.
  No component above that layer needs to change.
- **Auth** is a demo-only role switcher (`src/hooks/useAuth.jsx`) —
  swap it for real JWT-based login against `/api/auth/login` when the
  backend exists.
- **Real-time updates** are simulated with a subscribe/notify pattern
  (`src/hooks/useStore.js`) instead of Socket.IO. Swap the
  subscription for a real socket listener later; components don't
  change.

## Project structure

```
src/
  app/            routes.jsx (React Router tree), App.jsx
  components/
    ui/           shared primitives (Button, Input, Modal, Table...)
    customer/     pixel-skinned components
    staff/        clean-skinned components (Barber + both Admins)
  features/
    auth/         Login, Register, Forgot/Reset Password
    customer/     all 8 Customer screens
    barber/       Barber Home (handles current/next/break states)
    shop-admin/   Dashboard, Queue, Barbers, Services, Settings, Analytics
    super-admin/  Dashboard, Shops, Approvals, Users, Analytics, Settings
  hooks/          useAuth, useStore
  api/            mockStore.js, queueApi.js, congestion.js
  styles/         tokens.css (design tokens), base.css
```

## Screens implemented

Every screen from the design spec is here and interactive:

- **Auth:** Login, Register, Forgot Password, Reset Password
- **Customer:** Landing, Discover, Shop Details, Join Queue, My Queue,
  Recommended Time, Profile, Notifications
- **Barber:** Home (covers the Current Service, Next Customer, and
  Break states from the spec in one screen, matching real barber use)
- **Shop Admin:** Dashboard, Queue Management, Barber Management,
  Service Management, Settings, Analytics
- **Super Admin:** Dashboard, Shop Management, Shop Approval, User
  Management, Platform Analytics, Settings

## Known gaps (intentional, for a first pass)

- Profile "Favorites" and history are hardcoded sample data.
- Analytics screens use hardcoded sample numbers instead of computed
  historical data (there's no ServiceLog history in the mock store
  yet).
- No automated tests yet — the project builds clean (`npm run build`)
  and was manually click-tested through all four roles.
- Loading/skeleton states exist as components (`Skeleton.jsx`) but
  aren't wired into every screen yet, since the mock API resolves
  synchronously. When real `fetch()` calls replace `queueApi.js`,
  wrap each page's data load with a loading state using `Skeleton`.

## Security & validation hardening (this iteration)

This pass added public/private access separation, QR architecture,
shared validation, and queue state-machine enforcement on top of the
original UI. See the accompanying implementation report for the full
breakdown of what changed, what's frontend-enforced vs. mock-only, and
what still requires the real Express/MongoDB backend.

New folders: `src/validation/` (shared validators), plus
`src/api/errors.js`, `src/api/session.js`, `src/api/publicSerializers.js`.
