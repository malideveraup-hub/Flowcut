import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { AppError } from '../middleware/errorHandler.js';

const transporter = nodemailer.createTransport({
  host: env.smtpHost,
  port: env.smtpPort,
  secure: env.smtpPort === 465,
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 10_000,
  auth: env.smtpUser && env.smtpPass ? { user: env.smtpUser, pass: env.smtpPass } : undefined,
});

export async function sendOtpEmail(email, otp) {
  if (!env.smtpUser || !env.smtpPass || !env.mailFrom) {
    throw new AppError(503, 'Gmail verification is temporarily unavailable. Please configure email delivery.');
  }

  await transporter.sendMail({
    from: env.mailFrom,
    to: email,
    subject: 'Your FlowCut verification code',
    text: `Your FlowCut verification code is ${otp}. It expires in 10 minutes.`,
    html: `<p>Your FlowCut verification code is <strong>${otp}</strong>.</p><p>It expires in 10 minutes.</p>`,
  });
}