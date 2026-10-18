import { isIP } from 'node:net';

function isPrivateIpv4(hostname) {
  if (isIP(hostname) !== 4) return false;
  const [first, second] = hostname.split('.').map(Number);
  return (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

/** Allow the Vite LAN origin for phone testing, in development only. */
export function isLocalDevelopmentOrigin(origin) {
  if (typeof origin !== 'string') return false;

  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }

  const port = parsed.port || (parsed.protocol === 'https:' ? '443' : '80');
  return (
    parsed.origin === origin &&
    parsed.protocol === 'http:' &&
    port === '5173' &&
    isPrivateIpv4(parsed.hostname)
  );
}
