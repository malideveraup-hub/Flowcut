import nodemailer from 'nodemailer';
import dns from 'node:dns/promises';
import { env } from '../config/env.js';
import { AppError } from '../middleware/errorHandler.js';

const hasSmtpConfig = Boolean(env.smtpUser && env.smtpPass && env.mailFrom);
const useResend = Boolean(env.resendApiKey && (env.nodeEnv === 'production' || !hasSmtpConfig));
const smtpIpv4 = useResend ? null : (await dns.resolve4(env.smtpHost))[0];
console.log(`[mail] Provider: ${useResend ? 'resend' : 'smtp'}`);
if (smtpIpv4) console.log(`[mail] SMTP target: ${smtpIpv4}:${env.smtpPort}`);

const transporter = useResend
  ? null
  : nodemailer.createTransport({
      host: smtpIpv4,
      port: env.smtpPort,
      secure: env.smtpPort === 465,
      requireTLS: env.smtpPort === 587,
      tls: { servername: env.smtpHost },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 10_000,
      auth: env.smtpUser && env.smtpPass ? { user: env.smtpUser, pass: env.smtpPass } : undefined,
    });

export const activeMailProvider = useResend ? 'resend' : 'smtp';

function safeCode(value) {
  return typeof value === 'string' ? value.replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 80) : '';
}

export function mailErrorDetails(error) {
  const details = [];
  const code = safeCode(error?.providerCode || error?.code);
  const responseCode = Number(error?.responseCode || error?.statusCode);
  const command = safeCode(error?.command);
  if (code) details.push(`code=${code}`);
  if (Number.isFinite(responseCode) && responseCode > 0) details.push(`response=${responseCode}`);
  if (command) details.push(`command=${command}`);
  if (details.length === 0) details.push(`type=${safeCode(error?.name) || 'Error'}`);
  return details.join(' ');
}

async function sendMail({ email, subject, text, html }) {
  if (useResend) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: env.mailFrom, to: [email], subject, text, html }),
    });

    let result = null;
    try {
      result = await response.json();
    } catch {
      // Keep the provider's raw response body out of logs.
    }

    if (!response.ok) {
      const error = new AppError(503, 'Email delivery is temporarily unavailable. Please try again.');
      error.providerCode = safeCode(result?.name || result?.code);
      error.statusCode = response.status;
      throw error;
    }
    return { provider: 'resend', messageId: safeCode(result?.id) || null, accepted: true };
  }

  if (!env.smtpUser || !env.smtpPass || !env.mailFrom) {
    throw new AppError(503, 'Email delivery is not configured.');
  }

  const result = await transporter.sendMail({ from: env.mailFrom, to: email, subject, text, html });
  if (!Array.isArray(result.accepted) || result.accepted.length === 0) {
    const error = new AppError(503, 'Email delivery is temporarily unavailable. Please try again.');
    error.providerCode = 'recipient_not_accepted';
    throw error;
  }
  return { provider: 'smtp', messageId: safeCode(result.messageId) || null, accepted: true };
}

export function sendOtpEmail(email, otp) {
  return sendMail({
    email,
    subject: 'Your FlowCut verification code',
    text: `Your FlowCut verification code is ${otp}. It expires in 10 minutes.`,
    html: `<p>Your FlowCut verification code is <strong>${otp}</strong>.</p><p>It expires in 10 minutes.</p>`,
  });
}

export function sendPasswordResetEmail(email, token) {
  const resetUrl = `${env.frontendUrl}/reset-password?token=${encodeURIComponent(token)}`;
  const htmlResetUrl = resetUrl.replaceAll('&', '&amp;');
  return sendMail({
    email,
    subject: 'Reset your FlowCut password',
    text: `Use this link to reset your FlowCut password: ${resetUrl}\n\nThe link expires in one hour. If you did not request this, you can ignore this email.`,
    html: `<p>We received a request to reset your FlowCut password.</p><p><a href="${htmlResetUrl}">Reset your password</a></p><p>This link expires in one hour. If you did not request this, you can ignore this email.</p>`,
  });
}
