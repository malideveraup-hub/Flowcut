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
import styles from './Auth.module.css';

const EMPTY = {
  name: '',
  address: '',
  contactPhone: '',
  openingTime: '',
  closingTime: '',
};

/**
 * A shop application's ownerId always comes from the authenticated
 * session on the backend (never a field in this form) — so applying
 * requires being logged in first.
 */
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
      <div className={styles.wrap}>
        <div className={styles.card}>
          <div className={styles.brand}>FLOWCUT</div>

          <h1 className={styles.title}>Register a shop</h1>

          <p
            style={{
              fontSize: 13,
              color: 'var(--staff-secondary)',
              marginBottom: 20,
            }}
          >
            You'll need a FlowCut account first — the shop is linked to
            whoever is logged in when it's submitted.
          </p>

          <Button
            fullWidth
            onClick={() =>
              navigate('/login', {
                state: {
                  from: {
                    pathname: location.pathname,
                  },
                },
              })
            }
          >
            Log in to continue
          </Button>

          <div className={styles.links} style={{ marginTop: 12 }}>
            <Link to="/register">Create an account</Link>
            <Link to="/login">Log in</Link>
          </div>
        </div>
      </div>
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
      <div className={styles.wrap}>
        <div className={styles.card}>
          <div className={styles.brand}>FLOWCUT</div>

          <h1 className={styles.title}>
            Application submitted
          </h1>

          <div className={styles.successBox}>
            <p>
              Thanks — <strong>{submitted.name}</strong> has been
              submitted for review. A FlowCut Super Admin needs to
              approve it before it appears publicly or you can manage
              it as a Shop Admin.
            </p>

            <p
              style={{
                color: 'var(--staff-secondary)',
                fontSize: 13,
              }}
            >
              This is saved in our database as a real pending
              application — nothing about this shop is active yet.
            </p>

            <Link to="/">Back to FlowCut</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <div className={styles.brand}>FLOWCUT</div>

        <h1 className={styles.title}>Register a shop</h1>

        <p
          style={{
            fontSize: 13,
            color: 'var(--staff-secondary)',
            marginTop: -12,
            marginBottom: 20,
          }}
        >
          Your shop will need Super Admin approval before it goes live.
        </p>

        <form onSubmit={handleSubmit} noValidate>
          <Input
            label="Shop name"
            value={form.name}
            onChange={(e) =>
              update('name', e.target.value)
            }
            error={errors.name}
          />

          <Input
            label="Address"
            value={form.address}
            onChange={(e) =>
              update('address', e.target.value)
            }
            error={errors.address}
          />

          <Input
            label="Contact number"
            type="tel"
            inputMode="numeric"
            maxLength={11}
            value={form.contactPhone}
            onChange={handleContactChange}
            error={errors.contactPhone}
            placeholder="09171234567"
          />

          <Input
            label="Opening time"
            type="time"
            value={form.openingTime}
            onChange={(e) =>
              update('openingTime', e.target.value)
            }
            error={errors.hours}
          />

          <Input
            label="Closing time"
            type="time"
            value={form.closingTime}
            onChange={(e) =>
              update('closingTime', e.target.value)
            }
          />

          <Button
            type="submit"
            fullWidth
            disabled={submitting}
          >
            {submitting
              ? 'Submitting…'
              : 'Submit for approval'}
          </Button>
        </form>

        <div className={styles.links}>
          <Link to="/">Back to FlowCut</Link>
          <span />
        </div>
      </div>
    </div>
  );
}