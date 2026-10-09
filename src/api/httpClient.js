// Shared fetch wrapper for every non-auth backend call. Same pattern as
// authApi.js's internal `request()` (kept separate to avoid a circular
// import), so there is exactly one place that knows the API base URL,
// sends credentials, and normalizes error shapes across the whole app.

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';

async function readError(response) {
  let json = null;
  try { json = await response.json(); } catch { /* A non-JSON error still gets a useful status message. */ }
  const err = new Error(json?.message || `Request failed (${response.status}).`);
  err.status = response.status;
  const rawErrors = json?.errors;
  err.fieldErrors = rawErrors && typeof rawErrors === 'object' && Object.keys(rawErrors).length > 0 ? rawErrors : null;
  throw err;
}

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
    const err = new Error(json?.message || `Request failed (${res.status}).`);
    err.status = res.status;
    const rawErrors = json?.errors;
    err.fieldErrors = rawErrors && typeof rawErrors === 'object' && Object.keys(rawErrors).length > 0 ? rawErrors : null;
    throw err;
  }

  return json.data;
}

export async function apiBlobRequest(path) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, { credentials: 'include' });
  } catch {
    const err = new Error("Couldn't reach the server. Check your connection and try again.");
    err.status = 0;
    throw err;
  }
  if (!response.ok) await readError(response);
  return response.blob();
}

export function apiUploadRequest(path, file, headers, onProgress) {
  return new Promise((resolve, reject) => {
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
        const err = new Error(json?.message || `Request failed (${request.status}).`);
        err.status = request.status;
        const rawErrors = json?.errors;
        err.fieldErrors = rawErrors && typeof rawErrors === 'object' && Object.keys(rawErrors).length > 0 ? rawErrors : null;
        reject(err);
        return;
      }
      resolve(json.data);
    });
    request.addEventListener('error', () => reject(new Error("Couldn't reach the server. Check your connection and try again.")));
    request.addEventListener('abort', () => reject(new Error('Upload was cancelled.')));
    request.send(file);
  });
}
