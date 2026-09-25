import dotenv from 'dotenv';

dotenv.config();

// Every secret/connection string the server needs comes from here and
// nowhere else. If a required variable is missing, we fail loudly and
// immediately at startup instead of limping along and failing confusingly
// later (Section 2/17: "the server should fail clearly").
const REQUIRED_VARS = ['MONGODB_URI', 'JWT_SECRET'];

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

  return {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: Number(process.env.PORT) || 4000,
    mongoUri: process.env.MONGODB_URI,
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
    corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
    smtpPort: Number(process.env.SMTP_PORT) || 587,
    smtpUser: (process.env.SMTP_USER || '').trim(),
    smtpPass: (process.env.SMTP_PASS || '').replace(/\s+/g, ''),
    mailFrom: (process.env.MAIL_FROM || process.env.SMTP_USER || '').trim(),
    resendApiKey: (process.env.RESEND_API_KEY || '').trim(),
  };
}

export const env = loadEnv();
