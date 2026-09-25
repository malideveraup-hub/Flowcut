import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { rateLimitMessage, registerRequest } from '../../api/authApi';
import {
  validateConfirmPassword,
  validateEmail,
  validateName,
  validatePassword,
} from '../../validation/authValidation';
import { filterNameInput } from '../../utils/inputFilters';
import Button from '../../components/ui/Button';
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

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: null }));
    setServerError('');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setServerError('');

    const validationErrors = validateForm(form);
    setErrors(validationErrors);
    if (Object.values(validationErrors).some(Boolean)) return;

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
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <div className={styles.brand}>FLOWCUT</div>
        <h1 className={styles.title}>Create your account</h1>

        <form onSubmit={handleSubmit} noValidate autoComplete="off">
          {serverError && <div role="alert">{serverError}</div>}

          <Input
            label="Name"
            value={form.name}
            onChange={(event) => update('name', filterNameInput(event.target.value))}
            error={errors.name}
          />
          <Input
            label="Last name"
            value={form.lastName}
            onChange={(event) => update('lastName', filterNameInput(event.target.value))}
            error={errors.lastName}
          />
          <Input
            label="Gmail"
            type="email"
            placeholder="you@gmail.com"
            value={form.email}
            onChange={(event) => update('email', event.target.value)}
            error={errors.email}
          />
          <Input
            label="Password"
            type="password"
            value={form.password}
            onChange={(event) => update('password', event.target.value)}
            error={errors.password}
          />
          <Input
            label="Confirm password"
            type="password"
            value={form.confirm}
            onChange={(event) => update('confirm', event.target.value)}
            error={errors.confirm}
          />

          <ConsentFields
            termsAccepted={form.termsAccepted}
            privacyAccepted={form.privacyAccepted}
            onChange={update}
            error={errors.consent}
          />

          <Button type="submit" fullWidth disabled={submitting}>
            {submitting ? 'Creating account...' : 'Create account'}
          </Button>
        </form>

        <div className={styles.links}>
          <span />
          <Link to="/login">Already have an account?</Link>
        </div>
      </div>
    </div>
  );
}
