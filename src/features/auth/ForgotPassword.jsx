import { useState } from 'react';
import { Link } from 'react-router-dom';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
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
    <div className={styles.wrap}>
      <div className={styles.card}>
        <div className={styles.brand}>FLOWCUT</div>
        <h1 className={styles.title}>Reset your password</h1>

        {sent ? (
          <div className={styles.successBox}>
            <p>If an account exists for {email}, we've sent a reset link.</p>
            <Link to="/login">Back to login</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
            <Button type="submit" fullWidth>
              Send reset link
            </Button>
          </form>
        )}

        <div className={styles.links}>
          <Link to="/login">Back to login</Link>
          <span />
        </div>
      </div>
    </div>
  );
}
