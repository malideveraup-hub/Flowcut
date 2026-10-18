// Shared fetch wrapper for every backend call. It is the single place that
// knows the API base URL, sends the HttpOnly-cookie credentials, and
// normalizes errors across the whole app.
import { resolveApiBase } from './apiBase';
import { AUTH_SESSION_EVENT, AUTH_SESSION_ACTIVITY_EVENT } from './authSessionSync';

export const API_BASE = resolveApiBase(
  import.meta.env.VITE_API_URL,
  typeof window === 'undefined' ? null : window.location,
  import.meta.env.DEV
);

export function logNetworkFailure(method, path) {
  if (import.meta.env.DEV) {
    console.warn(`[api] ${method} ${path} could not reach ${API_BASE}; check the API host, network, CORS origin, and HTTP/HTTPS setup.`);
  }
}

function ensureApiConfigured() {
  if (API_BASE) return;
  const err = new Error('The API server address is not configured for this site. Please try again later.');
  err.status = 0;
  throw err;
}

function getErrorMessage(response, json) {
  if (response.status === 401 && json?.code === 'SESSION_EXPIRED') {
    return json?.message || 'Your session has expired. Please sign in again.';
  }
  if (response.status === 401) return 'Your sign-in has expired or is no longer valid. Please sign in again.';
  return json?.message || `Request failed (${response.status}).`;
}

function notifySessionActivity(response) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  if (response.headers?.get('x-flowcut-session-activity') !== '1') return;
  const rawValues = [
    response.headers?.get('x-flowcut-idle-expires-at'),
    response.headers?.get('x-flowcut-absolute-expires-at'),
    response.headers?.get('x-flowcut-idle-remaining-ms'),
    response.headers?.get('x-flowcut-absolute-remaining-ms'),
  ];
  if (rawValues.some((value) => typeof value !== 'string' || value.trim() === '')) return;
  const [idleExpiresAt, absoluteExpiresAt, idleRemainingMs, absoluteRemainingMs] = rawValues.map(Number);
  if (![idleExpiresAt, absoluteExpiresAt, idleRemainingMs, absoluteRemainingMs].every(Number.isFinite)) return;
  window.dispatchEvent(new CustomEvent(AUTH_SESSION_ACTIVITY_EVENT, {
    detail: { idleExpiresAt, absoluteExpiresAt, idleRemainingMs, absoluteRemainingMs },
  }));
}

function notifySessionExpired(json) {
  if (typeof window === 'undefined' || json?.code !== 'SESSION_EXPIRED' && json?.code !== 'AUTH_REQUIRED') return;
  window.dispatchEvent(new CustomEvent(AUTH_SESSION_EVENT, { detail: { code: json.code } }));
}

async function readError(response) {
  let json = null;
  try { json = await response.json(); } catch { /* A non-JSON error still gets a useful status message. */ }
  notifySessionExpired(json);
  const err = new Error(getErrorMessage(response, json));
  err.status = response.status;
  err.code = json?.code;
  const rawErrors = json?.errors;
  err.fieldErrors = rawErrors && typeof rawErrors === 'object' && Object.keys(rawErrors).length > 0 ? rawErrors : null;
  throw err;
}

export async function apiRequest(path, { method = 'GET', body, normalizeUnauthorized = true } = {}) {
  ensureApiConfigured();
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      cache: 'no-store',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    logNetworkFailure(method, path);
    const err = new Error("Couldn't reach the server. Check your connection and try again.");
    err.status = 0;
    throw err;
  }
  notifySessionActivity(res);

  let json = null;
  try {
    json = await res.json();
  } catch {
    // Non-JSON response — fall through to the generic message below.
  }

  notifySessionExpired(json);
  if (!res.ok || !json || json.success === false) {
    const err = new Error(res.status === 401 && !normalizeUnauthorized
      ? json?.message || `Request failed (${res.status}).`
      : getErrorMessage(res, json));
    err.status = res.status;
    err.code = json?.code;
    const retryAfter = Number(res.headers.get('retry-after'));
    if (Number.isFinite(retryAfter) && retryAfter > 0) err.retryAfterSeconds = retryAfter;
    const rawErrors = json?.errors;
    err.fieldErrors = rawErrors && typeof rawErrors === 'object' && Object.keys(rawErrors).length > 0 ? rawErrors : null;
    throw err;
  }

  return json.data;
}

export async function apiBlobRequest(path) {
  ensureApiConfigured();
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, { credentials: 'include', cache: 'no-store' });
  } catch {
    logNetworkFailure('GET', path);
    const err = new Error("Couldn't reach the server. Check your connection and try again.");
    err.status = 0;
    throw err;
  }
  notifySessionActivity(response);
  if (!response.ok) await readError(response);
  return response.blob();
}

export function apiUploadRequest(path, file, headers, onProgress) {
  return new Promise((resolve, reject) => {
    if (!API_BASE) {
      const err = new Error('The API server address is not configured for this site. Please try again later.');
      err.status = 0;
      reject(err);
      return;
    }
    const request = new XMLHttpRequest();
    request.open('POST', `${API_BASE}${path}`);
    request.withCredentials = true;
    Object.entries(headers || {}).forEach(([name, value]) => request.setRequestHeader(name, value));
    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) onProgress(Math.round((event.loaded / event.total) * 100));
    });
    request.addEventListener('load', () => {
      let json;
      try { json = JSON.parse(request.responseText); } catch { json = null; }
      const headers = {
        get(name) {
          if (name === 'x-flowcut-idle-expires-at') return request.getResponseHeader('X-FlowCut-Idle-Expires-At');
          if (name === 'x-flowcut-absolute-expires-at') return request.getResponseHeader('X-FlowCut-Absolute-Expires-At');
          if (name === 'x-flowcut-idle-remaining-ms') return request.getResponseHeader('X-FlowCut-Idle-Remaining-Ms');
          if (name === 'x-flowcut-absolute-remaining-ms') return request.getResponseHeader('X-FlowCut-Absolute-Remaining-Ms');
          if (name === 'x-flowcut-session-activity') return request.getResponseHeader('X-FlowCut-Session-Activity');
          return null;
        },
      };
      notifySessionActivity({ headers });
      notifySessionExpired(json);
      if (request.status < 200 || request.status >= 300 || !json || json.success === false) {
        const err = new Error(getErrorMessage({ status: request.status }, json));
        err.status = request.status;
        err.code = json?.code;
        const rawErrors = json?.errors;
        err.fieldErrors = rawErrors && typeof rawErrors === 'object' && Object.keys(rawErrors).length > 0 ? rawErrors : null;
        reject(err);
        return;
      }
      resolve(json.data);
    });
    request.addEventListener('error', () => {
      logNetworkFailure('POST', path);
      reject(new Error("Couldn't reach the server. Check your connection and try again."));
    });
    request.addEventListener('abort', () => reject(new Error('Upload was cancelled.')));
    request.send(file);
  });
}
