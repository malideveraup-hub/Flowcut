# AGENTS.md

## Project snapshot

This repository contains two related apps:

- Frontend UI: React + Vite app at the repo root
- Backend API: Express + MongoDB app under `backend/`

The root project is the primary UI implementation and includes mock API behavior for demo flows. The backend is a separate service that will eventually replace that mock layer with real auth, queue, shop, and admin APIs.

## Key docs

- [README.md](README.md)
- [backend/README.md](backend/README.md)

## Commands

Run the frontend:

```bash
npm install
npm run dev
```

Build the frontend:

```bash
npm run build
npm run preview
```

Lint the frontend:

```bash
npm run lint
```

Run the backend:

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

The backend expects a MongoDB connection string in `backend/.env` via `MONGODB_URI` and a JWT secret via `JWT_SECRET`.

## Architecture and conventions

### Frontend

- Source files live in `src/`.
- Route and app composition lives under `src/app/`.
- Feature modules are grouped by role in `src/features/`:
  - `auth/`
  - `customer/`
  - `barber/`
  - `shop-admin/`
  - `super-admin/`
- Shared UI primitives live in `src/components/ui/`.
- Shared validation rules live in `src/validation/`.
- API abstractions live in `src/api/`; the mock store is intentionally separated from the UI so a real backend can replace it later.
- State and role-based behavior should stay aligned with the existing `useAuth` and `useStore` patterns instead of introducing ad hoc global state.

### Backend

- Express app entrypoints live in `backend/src/app.js` and `backend/src/server.js`.
- Environment and DB bootstrapping live in `backend/src/config/`.
- Models live in `backend/src/models/` and are organized by domain concern.
- Route/controller/service responsibilities should stay separated as the backend grows.
- Error responses are expected to be centralized and consistent with the app middleware pattern.

## Working rules for agents

- Prefer the existing project structure over creating new top-level folders.
- Reuse shared validation and API helper modules before adding new one-off logic.
- Do not assume the mock frontend is the canonical backend contract; keep role, queue, and auth flows aligned with the backend spec when implementing real integrations.
- If a change affects a user journey or queue state, consider both the frontend and backend contract together.
- Keep edits small and consistent with the surrounding feature module.
- Prefer existing conventions in `src/features`, `src/api`, and `backend/src` over introducing new patterns.

## Important project nuance

This repo intentionally mixes a working demo UI with a backend under active construction. A change that looks like a UI-only tweak may still need a matching backend or validation update. When in doubt, trace the route and data flow through the shared API layer rather than patching only one side.
