import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { submitShopApplication } from '../../api/shopApi';
import {
  validateShopName,
  validateAddress,
  validateContact,
  validateHours,
} from '../../validation/shopValidation';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import styles from './RegisterShop.module.css';

const EMPTY = {
  name: '',
  address: '',
  contactPhone: '',
  openingTime: '',
  closingTime: '',
};

function FieldIcon({ name }) {
  const paths = {
    shop: <><path d="M3 10h18l-1.5-6h-15L3 10Z" /><path d="M5 10v10h14V10M9 20v-6h6v6" /></>,
    address: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    phone: <path d="M5 3h4l2 5-3 2a15 15 0 0 0 6 6l2-3 5 2v4c0 1.1-.9 2-2 2C10 21 3 14 3 5c0-1.1.9-2 2-2Z" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  };

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

function RequiredLabel({ children }) {
  return <>{children} <span className={styles.requiredMark} aria-hidden="true">*</span></>;
}

function StepList({ completed = false }) {
  return (
    <section className={styles.progressCard} aria-labelledby="application-progress-title">
      <h2 id="application-progress-title">Your application</h2>
      <ol className={styles.steps} aria-label="Application progress">
        <li className={completed ? styles.completeStep : styles.currentStep} aria-current={completed ? undefined : 'step'}>
          <span className={styles.stepNumber}>{completed ? '✓' : '1'}</span>
          <span className={styles.stepCopy}><strong>Shop details</strong><small>{completed ? 'Submitted' : 'Current step'}</small></span>
        </li>
        <li className={styles.unavailableStep} aria-disabled="true">
          <span className={styles.stepNumber}>2</span>
          <span className={styles.stepCopy}><strong>Documents</strong><small>Not part of this form</small></span>
        </li>
        <li className={styles.unavailableStep} aria-disabled="true">
          <span className={styles.stepNumber}>3</span>
          <span className={styles.stepCopy}><strong>Review</strong><small>After submission</small></span>
        </li>
      </ol>
    </section>
  );
}

function RegistrationShell({ children }) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link className={styles.logo} to="/" aria-label="FlowCut home">
            <span className={styles.logoMark} aria-hidden="true">F</span>
            FlowCut
          </Link>
          <nav className={styles.nav} aria-label="Main navigation">
            <Link to="/">Home</Link>
            <Link to="/discover">Discover</Link>
          </nav>
          <div className={styles.headerAccount}>
            <span>Already manage a shop?</span>
            <Link className={styles.signIn} to="/login">Sign in</Link>
          </div>
        </div>
      </header>
      <main className={styles.main}>
        <div className={styles.pageGrid}>{children}</div>
      </main>
    </div>
  );
}

function ApplicationSidebar({ completed = false }) {
  return (
    <aside className={styles.sidebar}>
      <section className={styles.introCard}>
        <p className={styles.introLabel}><span />FLOWCUT ONBOARDING</p>
        <h2>Let’s get your shop verified.</h2>
        <p className={styles.introText}>Share your shop details to start the application. Our team will review it before it goes live.</p>
      </section>
      <StepList completed={completed} />
    </aside>
  );
}

export default function RegisterShop() {
  const { role, loading: authLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(null);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  // Contact number: numbers only, maximum 11 digits.
  function handleContactChange(e) {
    const value = e.target.value
      .replace(/\D/g, '')
      .slice(0, 11);

    update('contactPhone', value);
  }

  if (authLoading) return null;

  if (!role) {
    return (
      <RegistrationShell>
        <ApplicationSidebar />
        <section className={styles.formCard} aria-labelledby="shop-login-title">
          <div className={styles.formHeader}>
            <span className={styles.eyebrow}>CREATE YOUR SHOP ACCOUNT</span>
            <h1 className={styles.title} id="shop-login-title">Register your shop</h1>
            <p className={styles.subtitle}>Sign in to your FlowCut account first. Your application will be linked to the account you use.</p>
          </div>
          <div className={styles.loginPrompt}>
            <p>Already have a FlowCut account? Sign in to continue with your shop application.</p>
            <Button
              className={styles.loginButton}
              fullWidth
              onClick={() => navigate('/login', {
                state: {
                  from: {
                    pathname: location.pathname,
                  },
                },
              })}
            >
              Sign in to continue
            </Button>
            <p className={styles.createAccount}>New to FlowCut? <Link to="/register">Create an account</Link></p>
          </div>
          <div className={styles.cardFooter}><Link to="/">Back to FlowCut</Link></div>
        </section>
      </RegistrationShell>
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();

    const next = {
      name: validateShopName(form.name),
      address: validateAddress(form.address),
      contactPhone: validateContact(form.contactPhone),
      hours: validateHours(
        form.openingTime,
        form.closingTime
      ),
    };

    setErrors(next);

    if (Object.values(next).some(Boolean)) return;

    setSubmitting(true);

    try {
      const shop = await submitShopApplication(form);
      setSubmitted(shop);
    } catch (err) {
      if (err.fieldErrors) {
        setErrors((prev) => ({
          ...prev,
          ...err.fieldErrors,
        }));
      } else {
        setErrors((prev) => ({
          ...prev,
          name: err.message,
        }));
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <RegistrationShell>
        <ApplicationSidebar completed />
        <section className={styles.formCard} aria-labelledby="application-success-title">
          <div className={styles.successContent}>
            <span className={styles.successIcon} aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 4 4L19 6" /></svg>
            </span>
            <span className={styles.statusPill}>Pending review</span>
            <h1 className={styles.title} id="application-success-title">We’ve received your application</h1>
            <p className={styles.subtitle}>
              Thanks — <strong>{submitted.name}</strong> has been submitted for review. A FlowCut Super Admin needs to approve it before it appears publicly or you can manage it as a Shop Admin.
            </p>
            <p className={styles.pendingNote}>Your application is saved in our database as pending. Nothing about this shop is active yet.</p>
            <Link className={styles.successLink} to="/">Back to FlowCut</Link>
          </div>
        </section>
      </RegistrationShell>
    );
  }

  return (
    <RegistrationShell>
      <ApplicationSidebar />
      <section className={styles.formCard} aria-labelledby="shop-form-title">
        <header className={styles.formHeader}>
          <div>
            <span className={styles.eyebrow}>CREATE YOUR SHOP ACCOUNT</span>
            <h1 className={styles.title} id="shop-form-title">Register your shop</h1>
            <p className={styles.subtitle}>Enter your shop details to start the approval process.</p>
          </div>
        </header>

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <section className={styles.formSection} aria-labelledby="shop-details-heading">
            <div className={styles.sectionHeading}>
              <h2 id="shop-details-heading">Shop details</h2>
              <p>Tell us how customers can find and contact your shop.</p>
            </div>

            <div className={styles.fields}>
              <div className={`${styles.inputWrap} ${styles.withIcon}`}>
                <Input
                  label={<RequiredLabel>Shop name</RequiredLabel>}
                  name="name"
                  autoComplete="organization"
                  value={form.name}
                  onChange={(e) => update('name', e.target.value)}
                  error={errors.name}
                  required
                  aria-required="true"
                  placeholder="Your shop name"
                />
                <span className={styles.inputIcon}><FieldIcon name="shop" /></span>
              </div>

              <div className={`${styles.inputWrap} ${styles.withIcon}`}>
                <Input
                  label={<RequiredLabel>Contact number</RequiredLabel>}
                  type="tel"
                  name="contactPhone"
                  autoComplete="tel"
                  inputMode="numeric"
                  maxLength={11}
                  value={form.contactPhone}
                  onChange={handleContactChange}
                  error={errors.contactPhone}
                  required
                  aria-required="true"
                  placeholder="09171234567"
                />
                <span className={styles.inputIcon}><FieldIcon name="phone" /></span>
              </div>

              <div className={`${styles.inputWrap} ${styles.withIcon} ${styles.fullWidth}`}>
                <Input
                  label={<RequiredLabel>Shop address</RequiredLabel>}
                  name="address"
                  autoComplete="street-address"
                  value={form.address}
                  onChange={(e) => update('address', e.target.value)}
                  error={errors.address}
                  required
                  aria-required="true"
                  placeholder="Street, building, or complete shop address"
                />
                <span className={styles.inputIcon}><FieldIcon name="address" /></span>
              </div>

              <div className={`${styles.inputWrap} ${styles.withIcon}`}>
                <Input
                  label={<RequiredLabel>Opening time</RequiredLabel>}
                  type="time"
                  name="openingTime"
                  value={form.openingTime}
                  onChange={(e) => update('openingTime', e.target.value)}
                  error={errors.hours}
                  required
                  aria-required="true"
                />
                <span className={styles.inputIcon}><FieldIcon name="clock" /></span>
              </div>

              <div className={`${styles.inputWrap} ${styles.withIcon}`}>
                <Input
                  label={<RequiredLabel>Closing time</RequiredLabel>}
                  type="time"
                  name="closingTime"
                  value={form.closingTime}
                  onChange={(e) => update('closingTime', e.target.value)}
                  required
                  aria-required="true"
                />
                <span className={styles.inputIcon}><FieldIcon name="clock" /></span>
              </div>
            </div>
          </section>

          <footer className={styles.formFooter}>
            <p><span>*</span> Required fields</p>
            <div className={styles.footerActions}>
              <Link className={styles.backLink} to="/">Back to FlowCut</Link>
              <Button className={styles.submitButton} type="submit" disabled={submitting}>
                {submitting ? <><span className={styles.spinner} aria-hidden="true" />Submitting…</> : 'Submit for approval'}
              </Button>
            </div>
          </footer>
        </form>
      </section>
    </RegistrationShell>
  );
}
