import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

/**
 * Route guard. `role` may be a single role string or an array of allowed
 * roles. Preserves the location the user was trying to reach in
 * `location.state.from` so Login can send them back afterwards.
 */
export default function RequireRole({ role, children }) {
  const { role: currentRole, loading, authError, refreshUser, consentCurrent, homeFor } = useAuth();
  const location = useLocation();

  const allowed = Array.isArray(role) ? role : [role];

  if (loading) {
    return null;
  }

  if (!currentRole && authError) {
    return (
      <section role="alert" style={{ maxWidth: 520, margin: '4rem auto', padding: 24 }}>
        <h1>Couldn't check your sign-in</h1>
        <p>{authError.message || "Couldn't reach the server. Check your connection and try again."}</p>
        <button type="button" onClick={() => void refreshUser()}>Try again</button>
      </section>
    );
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
