import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import styles from './Auth.module.css';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ password: '', confirm: '' });
  const [errors, setErrors] = useState({});

  function handleSubmit(e) {
    e.preventDefault();
    const next = {};
    if (!form.password || form.password.length < 8) next.password = 'Use at least 8 characters.';
    if (form.confirm !== form.password) next.confirm = "Passwords don't match.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    navigate('/login');
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <div className={styles.brand}>FLOWCUT</div>
        <h1 className={styles.title}>Set a new password</h1>

        <form onSubmit={handleSubmit} noValidate>
          <Input
            label="New password"
            type="password"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            error={errors.password}
          />
          <Input
            label="Confirm password"
            type="password"
            value={form.confirm}
            onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))}
            error={errors.confirm}
          />
          <Button type="submit" fullWidth>
            Reset password
          </Button>
        </form>

        <div className={styles.links}>
          <Link to="/login">Back to login</Link>
          <span />
        </div>
      </div>
    </div>
  );
}
