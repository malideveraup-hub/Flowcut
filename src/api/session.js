import { useAuth } from '../hooks/useAuth';

/**
 * Phase 4 update: shopId now comes from the REAL authenticated user
 * (useAuth's `user.shopId`, itself read fresh from MongoDB by the
 * backend's requireAuth on every request — see authMiddleware.js). This
 * replaces the earlier mock version, which hardcoded a demo shopId per
 * role regardless of who was actually logged in.
 *
 * barberId (the Barber collection's own _id, distinct from the User's
 * id) is intentionally NOT resolved here — the backend resolves it
 * itself via attachBarberProfile for every barber route, so the frontend
 * never needs to know it. Pages that used to read `barberId` from this
 * hook no longer need to; the backend endpoints only require the
 * authenticated session (the cookie), not this value.
 */
export function useSession() {
  const { shopId } = useAuth();
  return { shopId };
}
