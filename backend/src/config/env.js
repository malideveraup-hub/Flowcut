import dotenv from 'dotenv';

dotenv.config();

// Every secret/connection string the server needs comes from here and
// nowhere else. If a required variable is missing, we fail loudly and
// immediately at startup instead of limping along and failing confusingly
// later (Section 2/17: "the server should fail clearly").
const REQUIRED_VARS = ['MONGODB_URI', 'JWT_SECRET'];

function getCorsOrigins() {
  const configuredOrigins = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const developmentOrigins =
    process.env.NODE_ENV === 'production'
      ? []
      : ['http://localhost:5173', 'http://127.0.0.1:5173'];

  return [
    ...new Set([
      ...configuredOrigins,
      ...developmentOrigins,
      'https://www.flowcutph.me',
    ]),
  ];
}

function getFrontendUrl(nodeEnv) {
  const configuredUrl = process.env.FRONTEND_URL || (nodeEnv === 'production'
    ? 'https://www.flowcutph.me'
    : 'http://localhost:5173');
  let parsedUrl;
  try {
    parsedUrl = new URL(configuredUrl);
  } catch {
    throw new Error('FRONTEND_URL must be an absolute HTTP or HTTPS URL.');
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol) || parsedUrl.username || parsedUrl.password) {
    throw new Error('FRONTEND_URL must be an absolute HTTP or HTTPS URL without credentials.');
  }

  const loopbackHost = ['localhost', '127.0.0.1', '[::1]'].includes(parsedUrl.hostname.toLowerCase());
  if (nodeEnv === 'production' && (parsedUrl.protocol !== 'https:' || loopbackHost)) {
    throw new Error('Production FRONTEND_URL must use HTTPS and cannot point to localhost.');
  }

  // Reset routes are served from the frontend root. Discard accidental paths,
  // query strings, and fragments so generated links always use the real SPA route.
  return parsedUrl.origin;
}

function loadEnv() {
  const missing = REQUIRED_VARS.filter((key) => !process.env[key] || process.env[key].trim() === '');

  if (missing.length > 0) {
    // Intentionally thrown, not just logged: nothing in server.js should be
    // able to accidentally continue booting without these.
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}.\n` +
        `Copy backend/.env.example to backend/.env and fill in real values before starting the server.`
    );
  }

  const vapidPublicKey = (process.env.VAPID_PUBLIC_KEY || '').trim();
  const vapidPrivateKey = (process.env.VAPID_PRIVATE_KEY || '').trim();
  if (Boolean(vapidPublicKey) !== Boolean(vapidPrivateKey)) {
    throw new Error('VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must both be set to enable web push.');
  }

  const nodeEnv = process.env.NODE_ENV || 'development';
  const frontendUrl = getFrontendUrl(nodeEnv);

  return {
    nodeEnv,
    port: Number(process.env.PORT) || 4000,
    mongoUri: process.env.MONGODB_URI,
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
    corsOrigins: getCorsOrigins(),
    smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
    smtpPort: Number(process.env.SMTP_PORT) || 587,
    smtpUser: (process.env.SMTP_USER || '').trim(),
    smtpPass: (process.env.SMTP_PASS || '').replace(/\s+/g, ''),
    mailFrom: (process.env.MAIL_FROM || process.env.SMTP_USER || '').trim(),
    resendApiKey: (process.env.RESEND_API_KEY || '').trim(),
    frontendUrl,
    vapidPublicKey,
    vapidPrivateKey,
    vapidSubject: (process.env.VAPID_SUBJECT || 'https://www.flowcutph.me').trim(),
  };
}

export const env = loadEnv();
