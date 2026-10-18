import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { submitConsentRequest } from '../../api/authApi';
import ConsentFields from './ConsentFields';
import Button from '../../components/ui/Button';
import styles from './Auth.module.css';

/**
 * Reached via RequireRole redirecting here when `consentCurrent` is
 * false — either a brand new account created by someone else (a Shop
 * Admin creating a Barber, or the dev seed script) that never saw the
 * registration consent screen, or an existing account whose stored
 * termsVersion/privacyVersion no longer matches CURRENT_* after an
 * update. Never shown to a logged-out visitor browsing publicly.
 */
export default function Consent() {
  const { role, loading, consentCurrent, refreshUser, homeFor } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [form, setForm] = useState({ termsAccepted: false, privacyAccepted: false });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (loading) return null;
  if (!role) return <Navigate to="/login" replace />;
  if (consentCurrent) {
    const dest = location.state?.from;
    return <Navigate to={dest ? dest.pathname + (dest.search || '') : homeFor(role)} replace />;
  }

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.termsAccepted || !form.privacyAccepted) {
      setError('You must accept both the Terms and the Privacy Notice to continue.');
      return;
    }
    setSubmitting(true);
    try {
      await submitConsentRequest(form);
      await refreshUser();
      const dest = location.state?.from;
      navigate(dest ? dest.pathname + (dest.search || '') : homeFor(role), { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <div className={styles.brand}>FLOWCUT</div>
        <h1 className={styles.title}>Please review and accept</h1>
        <p style={{ fontSize: 13, color: 'var(--staff-secondary)', marginTop: -12, marginBottom: 20 }}>
          Our Terms and Privacy Notice have been updated (or weren't shown to you yet). Please review and accept
          them to continue using your account.
        </p>

        <form onSubmit={handleSubmit} noValidate>
          <ConsentFields
            termsAccepted={form.termsAccepted}
            privacyAccepted={form.privacyAccepted}
            onChange={update}
            error={error}
          />
          <Button type="submit" fullWidth disabled={submitting}>
            {submitting ? 'Saving…' : 'Accept and continue'}
          </Button>
        </form>
      </div>
    </div>
  );
}
