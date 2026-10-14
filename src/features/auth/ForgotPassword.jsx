import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { forgotPasswordRequest, rateLimitMessage } from '../../api/authApi';
import Input from '../../components/ui/Input';
import { normalizeEmail, validateEmail } from '../../validation/authValidation';
import styles from './Auth.module.css';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (submittingRef.current) return;

    const validationError = validateEmail(email);
    setEmailError(validationError || '');
    setError('');
    if (validationError) return;

    submittingRef.current = true;
    setSubmitting(true);
    try {
      await forgotPasswordRequest({ email: normalizeEmail(email) });
      setSent(true);
    } catch (requestError) {
      setEmailError(requestError.fieldErrors?.email || '');
      setError(rateLimitMessage(requestError));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.loginPage}>
      <header className={styles.loginHeader}>
        <div className={styles.headerInner}>
          <Link className={styles.logo} to="/" aria-label="FlowCut home">
            <span className={styles.logoMark} aria-hidden="true" />FLOWCUT
          </Link>
          <nav className={styles.headerLinks} aria-label="Main navigation">
            <Link to="/">Home</Link>
            <Link to="/discover">Discover</Link>
          </nav>
          <Link className={styles.headerButton} to="/login">Sign in</Link>
        </div>
      </header>

      <main className={styles.loginMain}>
        <section className={styles.loginCard} aria-labelledby="forgot-password-title">
          <div className={styles.portalTag}><span />ACCOUNT RECOVERY</div>
          <h1 className={styles.loginTitle} id="forgot-password-title">Reset your password</h1>
          <p className={styles.lead}>Enter the Gmail linked to your account and we’ll help you get back into FlowCut.</p>

          {sent ? (
            <div className={styles.forgotSuccess} role="status">
              <span className={styles.forgotSuccessIcon} aria-hidden="true">✓</span>
              <p>If an account exists for <strong>{email.trim()}</strong>, you should receive a reset link shortly. Check your inbox and spam folder. The link expires in one hour.</p>
            </div>
          ) : (
            <form className={styles.loginForm} onSubmit={handleSubmit} noValidate>
              {error && <div className={styles.errorBanner} role="alert">{error}</div>}
              <div className={styles.loginInputWrap + ' ' + styles.hasIcon}>
                <Input
                  label="Gmail"
                  type="email"
                  name="email"
                  required
                  autoComplete="email"
                  inputMode="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setEmailError('');
                    setError('');
                  }}
                  error={emailError}
                  placeholder="you@gmail.com"
                />
                <svg className={styles.inputIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
              </div>
              <button className={styles.submitButton} type="submit" disabled={submitting}>
                {submitting ? <><span className={styles.spinner} aria-hidden="true" />Sending…</> : <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>Send reset link</>}
              </button>
            </form>
          )}

          <div className={styles.forgotFooter}>
            <Link className={styles.authLink} to="/login">← Back to login</Link>
            <span>Need an account? <Link className={styles.authLink} to="/register">Create one</Link></span>
          </div>
        </section>
      </main>
    </div>
  );
}
