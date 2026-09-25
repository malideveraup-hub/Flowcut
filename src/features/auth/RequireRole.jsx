import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

/**
 * Route guard. `role` may be a single role string or an array of allowed
 * roles. Preserves the location the user was trying to reach in
 * `location.state.from` so Login can send them back afterwards.
 */
export default function RequireRole({ role, children }) {
  const { role: currentRole, loading, consentCurrent } = useAuth();
  const location = useLocation();

  console.log('[AUTH] RequireRole', {
    path: location.pathname,
    currentRole,
    loading,
    consentCurrent,
    requiredRole: role,
  });

  const allowed = Array.isArray(role) ? role : [role];

  if (loading) {
    return null;
  }

  if (!currentRole || !allowed.includes(currentRole)) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (!consentCurrent) {
    return <Navigate to="/consent" replace state={{ from: location }} />;
  }

  return children;
}