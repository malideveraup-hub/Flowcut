// Auth functions preserve the { data } result shape their existing callers
// use while sharing the same transport, cookie handling, and error parsing
// as all other frontend API requests.
import { apiRequest } from './httpClient';

async function request(path, { method = 'GET', body } = {}) {
  const data = await apiRequest(path, {
    method,
    body,
    // Login uses 401 for incorrect credentials. Keep the server's generic
    // credential message there; other protected auth calls should prompt
    // users to sign in again when their cookie has expired.
    normalizeUnauthorized: path !== '/api/auth/login',
  });
  return { data };
}

export function rateLimitMessage(error) {
  if (!error?.retryAfterSeconds) return error?.message || 'Too many requests. Please try again later.';
  const totalSeconds = Math.ceil(error.retryAfterSeconds);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `Too many requests. Try again in ${seconds} seconds.`;
  if (seconds === 0) return `Too many requests. Try again in ${minutes} minutes.`;
  return `Too many requests. Try again in ${minutes} minutes ${seconds} seconds.`;
}

export function registerRequest({ name, lastName, email, password, termsAccepted, privacyAccepted }) {
  return request('/api/auth/register', {
    method: 'POST',
    body: { name, lastName, email, password, termsAccepted, privacyAccepted },
  });
}

export function loginRequest({ email, password, rememberMe = true }) {
  return request('/api/auth/login', { method: 'POST', body: { email, password, rememberMe } });
}

export function verifyEmailRequest({ email, otp }) {
  return request('/api/auth/verify-email', { method: 'POST', body: { email, otp } });
}

export function resendEmailRequest({ email }) {
  return request('/api/auth/resend-email', { method: 'POST', body: { email } });
}

export function forgotPasswordRequest({ email }) {
  return request('/api/auth/forgot-password', { method: 'POST', body: { email } });
}

export function resetPasswordRequest({ token, password }) {
  return request('/api/auth/reset-password', { method: 'POST', body: { token, password } });
}

export function getMeRequest() {
  return request('/api/auth/me');
}

export function logoutRequest() {
  return request('/api/auth/logout', { method: 'POST' });
}

export function updateProfileRequest(fields) {
  return request('/api/auth/me', { method: 'PATCH', body: fields });
}

export function deleteAccountRequest() {
  return request('/api/auth/me', { method: 'DELETE' });
}

export function submitConsentRequest({ termsAccepted, privacyAccepted }) {
  return request('/api/auth/consent', { method: 'POST', body: { termsAccepted, privacyAccepted } });
}
