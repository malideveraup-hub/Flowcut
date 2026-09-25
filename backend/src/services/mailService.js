import nodemailer from 'nodemailer';
import dns from 'node:dns/promises';
import { env } from '../config/env.js';
import { AppError } from '../middleware/errorHandler.js';

const smtpIpv4 = env.resendApiKey ? null : (await dns.resolve4(env.smtpHost))[0];
if (smtpIpv4) console.log(`[mail] SMTP target: ${smtpIpv4}:${env.smtpPort}`);

const transporter = env.resendApiKey
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

export async function sendOtpEmail(email, otp) {
  const subject = 'Your FlowCut verification code';
  const text = `Your FlowCut verification code is ${otp}. It expires in 10 minutes.`;
  const html = `<p>Your FlowCut verification code is <strong>${otp}</strong>.</p><p>It expires in 10 minutes.</p>`;

  if (env.resendApiKey) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: env.mailFrom, to: [email], subject, text, html }),
    });

    if (!response.ok) {
      throw new AppError(503, 'Email delivery is temporarily unavailable. Please try again.');
    }
    return;
  }

  if (!env.smtpUser || !env.smtpPass || !env.mailFrom) {
    throw new AppError(503, 'Email delivery is not configured.');
  }

  await transporter.sendMail({
    from: env.mailFrom,
    to: email,
    subject,
    text,
    html,
  });
}