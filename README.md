# FlowCut

FlowCut is a multi-shop barbershop queue and waiting-time system with a React/Vite frontend and an Express/MongoDB backend. It supports customer shop discovery and queue joining, barber service tracking, shop administration, and descriptive analytics.

## Run locally

Install the frontend dependencies from the repository root and backend dependencies from `backend/`. Configure the backend by copying `backend/.env.example` to `backend/.env`, then set `MONGODB_URI` and `JWT_SECRET`. Set `GEMINI_API_KEY` to enable the optional Shop Admin analytics assistant. `GEMINI_MODEL` defaults to `gemini-3.5-flash-lite`.

Run the API from `backend/` with `npm run dev` and the frontend from the repository root with `npm run dev`. The frontend uses `VITE_API_URL` when set; otherwise local development resolves the API on port 4000.

## Checks

- Frontend production build: `npm run build`
- Frontend lint: `npm run lint`
- Backend tests: from `backend/`, run `npm test`

## Analytics and wait estimates

Shop analytics use real queue entries and service logs, with UTC date ranges and shop-scoped access. Invalid or implausible timestamps and service durations are excluded. Actual wait is measured from queue entry creation to recorded service start. Historical queue-size and barber-availability snapshots are not available, so those historical relationships cannot be calculated. Estimate accuracy is reported only when an estimate snapshot and a valid actual wait both exist.

Customer wait estimates are changing ranges based on the current queue, configured service durations, work already in progress, delays and pauses, and currently available barbers. They are operational arithmetic, not machine-learning predictions or guarantees. If the shop has active queued work but no active barber, the estimate is reported as unavailable. The Shop Admin Analytics assistant can answer about the authenticated shop's aggregate analytics, FlowCut behavior, and general barbershop operations; it does not receive individual queue records or customer identity details.

See [backend/README.md](backend/README.md) for environment setup, API behavior, analytics definitions, and provider configuration.
