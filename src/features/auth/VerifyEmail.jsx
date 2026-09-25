import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { rateLimitMessage, resendEmailRequest, verifyEmailRequest } from '../../api/authApi';
import { validateEmail, validateOtp } from '../../validation/authValidation';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import styles from './Auth.module.css';

export default function VerifyEmail() {
  const location = useLocation();
  const navigate = useNavigate();
  const { setUser, homeFor } = useAuth();
  const [email, setEmail] = useState(location.state?.email || '');
  const [expiresAt, setExpiresAt] = useState(location.state?.expiresAt || null);
  const [remainingMs, setRemainingMs] = useState(null);
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const inputRefs = useRef([]);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState('');
  const expired = remainingMs !== null && remainingMs <= 0;

  useEffect(() => {
    if (!expiresAt) {
      setRemainingMs(null);
      return undefined;
    }

    function updateRemaining() {
      const timestamp = Date.parse(expiresAt);
      setRemainingMs(Number.isFinite(timestamp) ? Math.max(0, timestamp - Date.now()) : 0);
    }

    updateRemaining();
    const timer = window.setInterval(updateRemaining, 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);

  async function handleSubmit(e) {
    e.preventDefault();
    const otp = digits.join('');
    const next = { email: validateEmail(email), otp: validateOtp(otp) };
    setErrors(next);
    if (next.email || next.otp) return;
    if (expired) {
      setErrors({ otp: 'This code has expired. Request a new code.' });
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await verifyEmailRequest({ email, otp });
      setUser(data.user);
      navigate(homeFor(data.user.role), { replace: true });
    } catch (err) {
      setErrors({ otp: err.message });
    } finally {
      setSubmitting(false);
    }
  }

  function updateDigit(index, value) {
    const digit = value.replace(/\D/g, '').slice(-1);
    setDigits((current) => current.map((item, itemIndex) => (itemIndex === index ? digit : item)));
    if (digit && index < digits.length - 1) inputRefs.current[index + 1]?.focus();
  }

  function handleKeyDown(index, event) {
    if (event.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  function handlePaste(event) {
    event.preventDefault();
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    setDigits(pasted.padEnd(6, '').split('').concat(['', '', '', '', '', '']).slice(0, 6));
    inputRefs.current[Math.min(pasted.length, 6) - 1]?.focus();
  }

  async function resend() {
    const emailError = validateEmail(email);
    if (emailError) {
      setErrors({ email: emailError });
      return;
    }
    setSubmitting(true);
    setNotice('');
    try {
      const { data } = await resendEmailRequest({ email });
      setExpiresAt(data.expiresAt);
      setDigits(['', '', '', '', '', '']);
      setErrors({});
      setNotice('A new code was sent to your Gmail.');
    } catch (err) {
      setErrors({ email: rateLimitMessage(err) });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <div className={styles.brand}>FLOWCUT</div>
        <h1 className={styles.title}>Verify your Gmail</h1>
        <p>Enter the 6-digit code sent to your Gmail before logging in.</p>
        <form onSubmit={handleSubmit} noValidate>
          <Input label="Gmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
          <div>
            <label htmlFor="otp-0">Verification code</label>
            {remainingMs !== null && (
              <div className={expired ? styles.otpExpired : styles.otpTimer}>
                {expired
                  ? 'Code expired. Request a new code.'
                  : `Code expires in ${String(Math.floor(remainingMs / 60000)).padStart(2, '0')}:${String(Math.floor((remainingMs % 60000) / 1000)).padStart(2, '0')}`}
              </div>
            )}
            <div className={styles.otpGrid} onPaste={handlePaste}>
              {digits.map((digit, index) => (
                <input
                  key={index}
                  id={`otp-${index}`}
                  ref={(element) => { inputRefs.current[index] = element; }}
                  className={styles.otpInput}
                  type="text"
                  inputMode="numeric"
                  autoComplete={index === 0 ? 'one-time-code' : 'off'}
                  maxLength={1}
                  value={digit}
                  aria-label={`Verification digit ${index + 1}`}
                  onChange={(e) => updateDigit(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                />
              ))}
            </div>
            {errors.otp && <div className={styles.otpError}>{errors.otp}</div>}
          </div>
          <Button type="submit" fullWidth disabled={submitting || expired}>{submitting ? 'Verifying…' : 'Verify Gmail'}</Button>
        </form>
        {notice && <p>{notice}</p>}
        <button type="button" onClick={resend} disabled={submitting}>Resend code</button>
        <div className={styles.links}><Link to="/login">Back to login</Link></div>
      </div>
    </div>
  );
}