import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

/**
 * Route guard. `role` may be a single role string or an array of allowed
 * roles. Preserves the location the user was trying to reach in
 * `location.state.from` so Login can send them back afterwards.
 */
export default function RequireRole({ role, children }) {
  const { role: currentRole, loading, consentCurrent, homeFor } = useAuth();
  const location = useLocation();

  const allowed = Array.isArray(role) ? role : [role];

  if (loading) {
    return null;
  }

  if (!currentRole) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (!allowed.includes(currentRole)) {
    return <Navigate to={homeFor(currentRole)} replace />;
  }

  if (!consentCurrent) {
    return <Navigate to="/consent" replace state={{ from: location }} />;
  }

  return children;
}