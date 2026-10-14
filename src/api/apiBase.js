const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

function isLoopback(hostname) {
  const normalized = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  return LOOPBACK_HOSTS.has(normalized) || /^127(?:\.\d{1,3}){3}$/.test(normalized);
}

/**
 * Resolve the API origin once for every frontend API client. During local
 * development, a loopback URL must follow the browser's host: on a phone,
 * `localhost` means the phone itself, not the computer running FlowCut.
 */
export function resolveApiBase(configuredApiUrl, location, development) {
  const configured = typeof configuredApiUrl === 'string' ? configuredApiUrl.trim() : '';
  if (!configured && !development && location) return '';
  const fallback = configured || 'http://localhost:4000';
  const pageOrigin = location?.origin || 'http://localhost';
  const apiUrl = new URL(fallback, pageOrigin);

  if (
    development &&
    location?.hostname &&
    isLoopback(apiUrl.hostname) &&
    !isLoopback(location.hostname)
  ) {
    apiUrl.hostname = location.hostname;
  }

  return `${apiUrl.origin}${apiUrl.pathname.replace(/\/+$/, '')}`;
}
