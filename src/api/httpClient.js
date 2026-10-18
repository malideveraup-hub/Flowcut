// Shared fetch wrapper for every backend call. It is the single place that
// knows the API base URL, sends the HttpOnly-cookie credentials, and
// normalizes errors across the whole app.
import { resolveApiBase } from './apiBase';

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
  if (response.status === 401) return 'Your sign-in has expired or is no longer valid. Please sign in again.';
  return json?.message || `Request failed (${response.status}).`;
}

async function readError(response) {
  let json = null;
  try { json = await response.json(); } catch { /* A non-JSON error still gets a useful status message. */ }
  const err = new Error(getErrorMessage(response, json));
  err.status = response.status;
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

  let json = null;
  try {
    json = await res.json();
  } catch {
    // Non-JSON response — fall through to the generic message below.
  }

  if (!res.ok || !json || json.success === false) {
    const err = new Error(res.status === 401 && !normalizeUnauthorized
      ? json?.message || `Request failed (${res.status}).`
      : getErrorMessage(res, json));
    err.status = res.status;
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
      if (request.status < 200 || request.status >= 300 || !json || json.success === false) {
        const err = new Error(getErrorMessage({ status: request.status }, json));
        err.status = request.status;
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
