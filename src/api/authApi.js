// Central place for every call to the real backend auth API. Components
// never call fetch() directly — this is the seam Section 22 asked for,
// and it's also where `credentials: 'include'` (required to send/receive
// the httpOnly auth cookie cross-origin in dev) lives exactly once.

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';

async function request(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    const err = new Error("Couldn't reach the server. Check your connection and try again.");
    err.status = 0;
    throw err;
  }

  let json = null;
  try {
    json = await res.json();
  } catch {
    // Non-JSON response (e.g. a proxy error page) — fall through to the
    // generic message below rather than crashing on res.json().
  }

  if (!res.ok || !json || json.success === false) {
    const message = json?.message || `Request failed (${res.status}).`;
    const err = new Error(message);
    err.status = res.status;
    const retryAfter = Number(res.headers.get('retry-after'));
    if (Number.isFinite(retryAfter) && retryAfter > 0) {
      err.retryAfterSeconds = retryAfter;
    }
    // Normalize to null unless there's a genuinely non-empty field-error
    // object — the backend's generic errors use `errors: []`, and an
    // empty array is truthy in JS, so a naive `json.errors || null` here
    // would make every caller's `if (err.fieldErrors)` check lie.
    const rawErrors = json?.errors;
    err.fieldErrors =
      rawErrors && typeof rawErrors === 'object' && Object.keys(rawErrors).length > 0 ? rawErrors : null;
    throw err;
  }

  return json;
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

export function loginRequest({ email, password }) {
  return request('/api/auth/login', { method: 'POST', body: { email, password } });
}

export function verifyEmailRequest({ email, otp }) {
  return request('/api/auth/verify-email', { method: 'POST', body: { email, otp } });
}

export function resendEmailRequest({ email }) {
  return request('/api/auth/resend-email', { method: 'POST', body: { email } });
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
