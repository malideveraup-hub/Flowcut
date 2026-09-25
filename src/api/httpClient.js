// Shared fetch wrapper for every non-auth backend call. Same pattern as
// authApi.js's internal `request()` (kept separate to avoid a circular
// import), so there is exactly one place that knows the API base URL,
// sends credentials, and normalizes error shapes across the whole app.

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export async function apiRequest(path, { method = 'GET', body } = {}) {
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
    // Non-JSON response — fall through to the generic message below.
  }

  if (!res.ok || !json || json.success === false) {
    const message = json?.message || `Request failed (${res.status}).`;
    const err = new Error(message);
    err.status = res.status;
    const rawErrors = json?.errors;
    err.fieldErrors =
      rawErrors && typeof rawErrors === 'object' && Object.keys(rawErrors).length > 0 ? rawErrors : null;
    throw err;
  }

  return json.data;
}
