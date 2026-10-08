import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { rateLimitMessage, registerRequest } from '../../api/authApi';
import {
  validateConfirmPassword,
  validateEmail,
  validateName,
  validatePassword,
} from '../../validation/authValidation';
import { filterNameInput } from '../../utils/inputFilters';
import Input from '../../components/ui/Input';
import ConsentFields from './ConsentFields';
import styles from './Auth.module.css';

function createEmptyForm() {
  return {
    name: '',
    lastName: '',
    email: '',
    password: '',
    confirm: '',
    termsAccepted: false,
    privacyAccepted: false,
  };
}

function validateForm(form) {
  return {
    name: validateName(form.name),
    lastName: validateName(form.lastName),
    email: validateEmail(form.email),
    password: validatePassword(form.password),
    confirm: validateConfirmPassword(form.password, form.confirm),
    consent:
      form.termsAccepted && form.privacyAccepted
        ? null
        : 'You must accept both the Terms and the Privacy Notice to continue.',
  };
}

export default function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState(createEmptyForm);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const submittingRef = useRef(false);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({
      ...current,
      [field]: field === 'password' && /\s/.test(value) ? 'Password cannot contain spaces.' : null,
      ...(field === 'password' && form.confirm ? { confirm: validateConfirmPassword(value, form.confirm) } : {}),
    }));
    setServerError('');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (submittingRef.current) return;
    setServerError('');

    const validationErrors = validateForm(form);
    setErrors(validationErrors);
    if (Object.values(validationErrors).some(Boolean)) return;

    submittingRef.current = true;
    setSubmitting(true);
    try {
      const { data } = await registerRequest({
        name: form.name.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        termsAccepted: form.termsAccepted,
        privacyAccepted: form.privacyAccepted,
      });

      setForm(createEmptyForm());
      navigate('/verify-email', { state: { email: data.email, expiresAt: data.expiresAt } });
    } catch (error) {
      const fieldErrors = error.fieldErrors || {};
      setErrors((current) => ({ ...current, ...fieldErrors }));
      setServerError(rateLimitMessage(error));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.registerPage}>
      <header className={styles.registerHeader}>
        <div className={styles.registerHeaderInner}>
          <Link className={styles.registerLogo} to="/" aria-label="FlowCut home">
            <span className={styles.registerLogoMark} aria-hidden="true" />FLOWCUT
          </Link>
          <nav className={styles.registerNav} aria-label="Main navigation">
            <Link to="/">Home</Link>
            <Link to="/discover">Discover</Link>
          </nav>
          <Link className={styles.registerHeaderButton} to="/register-shop">Register your shop</Link>
        </div>
      </header>

      <main className={styles.registerMain}>
        <section className={`${styles.registerCard} ${styles.registerCardWide}`} aria-labelledby="register-title">
          <div className={styles.registerTag}><span />JOIN FLOWCUT</div>
          <h1 className={styles.registerTitle} id="register-title">Create your account</h1>
          <p className={styles.registerLead}>Use your Gmail to get started. We'll send a code to confirm it's you.</p>

          <form className={styles.registerForm} onSubmit={handleSubmit} noValidate autoComplete="off">
            {serverError && <div className={styles.registerBanner} role="alert">{serverError}</div>}

            <div className={styles.registerTwo}>
              <div className={styles.registerInputWrap}>
                <Input
                  label="First name"
                  name="firstName"
                  autoComplete="given-name"
                  value={form.name}
                  onChange={(event) => update('name', filterNameInput(event.target.value))}
                  error={errors.name}
                />
              </div>
              <div className={styles.registerInputWrap}>
                <Input
                  label="Last name"
                  name="lastName"
                  autoComplete="family-name"
                  value={form.lastName}
                  onChange={(event) => update('lastName', filterNameInput(event.target.value))}
                  error={errors.lastName}
                />
              </div>
            </div>

            <div className={`${styles.registerInputWrap} ${styles.registerIcon}`}>
              <Input
                label="Gmail"
                type="email"
                name="email"
                autoComplete="email"
                inputMode="email"
                placeholder="you@gmail.com"
                value={form.email}
                onChange={(event) => update('email', event.target.value)}
                error={errors.email}
              />
              <svg className={styles.registerInputIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
            </div>

            <div className={`${styles.registerInputWrap} ${styles.registerIcon} ${styles.registerEye}`}>
                <Input
                  label="Password"
                  type={showPassword ? 'text' : 'password'}
                  name="new-password"
                  autoComplete="new-password"
                  placeholder="Min. 8 characters"
                  value={form.password}
                  onKeyDown={(event) => {
                    if (event.key === ' ') {
                      event.preventDefault();
                      setErrors((current) => ({ ...current, password: 'Password cannot contain spaces.' }));
                    }
                  }}
                  onChange={(event) => update('password', event.target.value)}
                  error={errors.password}
                />
                <svg className={styles.registerInputIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
                <button className={styles.registerPasswordToggle} type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword((visible) => !visible)}>
                  {showPassword ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8" /><path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c6 0 10 7 10 7a16 16 0 0 1-3.1 3.8M6.2 6.2C3.5 8 2 12 2 12s4 7 10 7c1.2 0 2.4-.3 3.4-.8" /></svg> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>}
                </button>
            </div>
            <div className={`${styles.registerInputWrap} ${styles.registerIcon} ${styles.registerEye}`}>
                <Input
                  label="Confirm password"
                  type={showConfirm ? 'text' : 'password'}
                  name="confirm-password"
                  autoComplete="new-password"
                  placeholder="Re-enter password"
                  value={form.confirm}
                  onKeyDown={(event) => {
                    if (event.key === ' ') {
                      event.preventDefault();
                      setErrors((current) => ({ ...current, confirm: 'Password cannot contain spaces.' }));
                    }
                  }}
                  onChange={(event) => update('confirm', event.target.value)}
                  error={errors.confirm}
                />
                <svg className={styles.registerInputIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
                <button className={styles.registerPasswordToggle} type="button" aria-label={showConfirm ? 'Hide confirm password' : 'Show confirm password'} aria-pressed={showConfirm} onClick={() => setShowConfirm((visible) => !visible)}>
                  {showConfirm ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8" /><path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c6 0 10 7 10 7a16 16 0 0 1-3.1 3.8M6.2 6.2C3.5 8 2 12 2 12s4 7 10 7c1.2 0 2.4-.3 3.4-.8" /></svg> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>}
                </button>
            </div>

            <ConsentFields
              termsAccepted={form.termsAccepted}
              privacyAccepted={form.privacyAccepted}
              onChange={update}
              error={errors.consent}
            />

            <button className={styles.registerSubmit} type="submit" disabled={submitting}>
              {submitting ? <><span className={styles.registerSpinner} aria-hidden="true" />Creating account…</> : 'Create account'}
            </button>
          </form>

          <p className={styles.registerSwitch}>Already have an account? <Link to="/login">Sign in</Link></p>
        </section>
      </main>
    </div>
  );
}
