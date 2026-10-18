// Test-only environment loaded before each isolated Node test file.
// The MongoDB sentinel is loopback port 1 (closed), and all provider
// credentials are placeholders or empty so tests cannot reach live services.
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:1/flowcut-test';
process.env.JWT_SECRET = 'test-only-never-use-outside-tests';
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.CORS_ORIGIN = '';
process.env.GEMINI_API_KEY = '';
process.env.GEMINI_MODEL = 'gemini-3.8-flash';
process.env.RESEND_API_KEY = '';
process.env.SMTP_HOST = '127.0.0.1';
process.env.SMTP_PORT = '1';
process.env.SMTP_USER = 'test-only-user';
process.env.SMTP_PASS = 'test-only-password';
process.env.MAIL_FROM = 'FlowCut <no-reply@example.test>';
process.env.VAPID_PUBLIC_KEY = '';
process.env.VAPID_PRIVATE_KEY = '';
