import { useState } from 'react';
import { Link } from 'react-router-dom';
import Input from '../../components/ui/Input';
import styles from './Auth.module.css';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  function handleSubmit(e) {
    e.preventDefault();
    if (!email) return;
    setSent(true);
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
          <p className={styles.lead}>Enter the email linked to your account and we’ll help you get back into FlowCut.</p>

          {sent ? (
            <div className={styles.forgotSuccess} role="status">
              <span className={styles.forgotSuccessIcon} aria-hidden="true">✓</span>
              <p>If an account exists for <strong>{email}</strong>, we’ve sent a reset link.</p>
            </div>
          ) : (
            <form className={styles.loginForm} onSubmit={handleSubmit} noValidate>
              <div className={`${styles.loginInputWrap} ${styles.hasIcon}`}>
                <Input
                  label="Email"
                  type="email"
                  name="email"
                  autoComplete="email"
                  inputMode="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                />
                <svg className={styles.inputIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
              </div>
              <button className={styles.submitButton} type="submit">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                Send reset link
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
