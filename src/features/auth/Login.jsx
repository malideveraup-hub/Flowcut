import { useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth, normalizeRole } from '../../hooks/useAuth';
import { loginRequest, rateLimitMessage } from '../../api/authApi';
import { validateEmail, validatePassword } from '../../validation/authValidation';
import Input from '../../components/ui/Input';
import styles from './Auth.module.css';

export default function Login() {
  const { setUser, homeFor } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [loginError, setLoginError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const submittingRef = useRef(false);

  function goToDestination(role) {
    navigate(homeFor(role), { replace: true });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (submittingRef.current) return;

    const normalizedEmail = email.trim();

    const nextErrors = {
      email: validateEmail(normalizedEmail),
      password: validatePassword(password),
    };

    setErrors(nextErrors);
    setLoginError('');

    if (Object.values(nextErrors).some(Boolean)) return;

    submittingRef.current = true;
    setSubmitting(true);

    try {
      const { data } = await loginRequest({
        email: normalizedEmail,
        password,
        rememberMe,
      });

      const authenticatedUser = {
        ...data.user,
        role: normalizeRole(data.user?.role),
      };

      setUser(authenticatedUser);
      goToDestination(authenticatedUser.role);
    } catch (err) {
      if (err.status === 403 && err.fieldErrors?.email) {
        navigate('/verify-email', {
          state: { email: normalizedEmail, expiresAt: err.fieldErrors.otpExpiresAt },
        });
        return;
      }
      setErrors((current) => ({ ...current, ...(err.fieldErrors || {}) }));
      setLoginError(rateLimitMessage(err));
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
          <Link className={styles.headerButton} to="/register-shop">Register your shop</Link>
        </div>
      </header>

      <main className={styles.loginMain}>
        <section className={styles.loginCard} aria-labelledby="login-title">
          <div className={styles.portalTag}><span />BARBER PORTAL</div>
          <h1 className={styles.loginTitle} id="login-title">Welcome back</h1>
          <p className={styles.lead}>Sign in to manage your shop, documents, and account settings.</p>

          <form className={styles.loginForm} onSubmit={handleSubmit} noValidate>
            {loginError && <div className={styles.errorBanner} role="alert">{loginError}</div>}

            <div className={`${styles.loginInputWrap} ${styles.hasIcon}`}>
              <Input
                label="Gmail"
                type="email"
                name="email"
                autoComplete="username"
                inputMode="email"
                placeholder="you@gmail.com"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setErrors((current) => ({ ...current, email: null }));
                  setLoginError('');
                }}
                error={errors.email}
              />
              <svg className={styles.inputIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
            </div>

            <div className={`${styles.loginInputWrap} ${styles.hasIcon} ${styles.hasEye}`}>
              <Input
                label="Password"
                type={showPassword ? 'text' : 'password'}
                name="password"
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onKeyDown={(event) => {
                  if (event.key === ' ') {
                    event.preventDefault();
                    setErrors((current) => ({ ...current, password: 'Password cannot contain spaces.' }));
                  }
                }}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setErrors((current) => ({ ...current, password: /\s/.test(event.target.value) ? 'Password cannot contain spaces.' : null }));
                  setLoginError('');
                }}
                error={errors.password}
              />
              <svg className={styles.inputIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
              <button className={styles.passwordToggle} type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword((visible) => !visible)}>
                {showPassword ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8" /><path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c6 0 10 7 10 7a16 16 0 0 1-3.1 3.8M6.2 6.2C3.5 8 2 12 2 12s4 7 10 7c1.2 0 2.4-.3 3.4-.8" /></svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>
                )}
              </button>
            </div>

            <div className={styles.loginOptions}>
              <label className={styles.rememberLabel}>
                <input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} />
                <span className={styles.checkmark} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5"><path d="m5 12 5 5 9-10" /></svg></span>
                Remember me
              </label>
              <Link className={styles.authLink} to="/forgot-password">Forgot password?</Link>
            </div>

            <button className={styles.submitButton} type="submit" disabled={submitting}>
              {submitting ? <><span className={styles.spinner} aria-hidden="true" />Signing in…</> : <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>Sign in to FlowCut</>}
            </button>
          </form>

          <div className={styles.secureNote}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m12 3 8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="m9 12 2 2 4-4" /></svg>
            Protected with secure sign-in and encrypted account data.
          </div>

          <div className={styles.loginDivider}>Don't have a FlowCut account yet?</div>
          <Link className={styles.createAccountButton} to="/register">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m4 9 1-5h14l1 5M4 9h16v11H4z" /></svg>
            Create an account
          </Link>
        </section>
      </main>
    </div>
  );
}