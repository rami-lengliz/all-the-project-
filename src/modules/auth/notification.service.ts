import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

export type NotificationChannel = 'email' | 'phone';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private readonly configService: ConfigService) {}

  // ── Gmail SMTP (fallback when RESEND_API_KEY is absent) ──────────────────

  private async sendViaGmail(opts: {
    to: string;
    subject: string;
    html: string;
  }): Promise<boolean> {
    const gmailUser = this.configService.get<string>('GMAIL_USER');
    const gmailPass = this.configService.get<string>('GMAIL_APP_PASSWORD');
    if (!gmailUser?.trim() || !gmailPass?.trim()) return false;

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: gmailUser, pass: gmailPass },
    });

    await transporter.sendMail({
      from: `"RentAI" <${gmailUser}>`,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    });
    return true;
  }

  // ── Resend API ────────────────────────────────────────────────────────────

  private async sendViaResend(opts: {
    to: string;
    subject: string;
    html: string;
  }): Promise<void> {
    const resendKey = this.configService.get<string>('RESEND_API_KEY');
    if (!resendKey?.trim()) return;

    const from = this.configService.get<string>(
      'VERIFY_FROM_EMAIL',
      'noreply@renteverything.app',
    );
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: opts.to, subject: opts.subject, html: opts.html }),
    });

    if (!response.ok) {
      const body = await response.text();
      this.logger.error(`Resend email failed (${response.status}): ${body}`);
      throw new Error('Failed to send email via Resend');
    }
  }

  // ── Unified send (Resend → Gmail → console) ───────────────────────────────

  private async dispatchEmail(opts: {
    to: string;
    subject: string;
    html: string;
    logFallback: string;
  }): Promise<void> {
    const resendKey = this.configService.get<string>('RESEND_API_KEY');
    if (resendKey?.trim()) {
      await this.sendViaResend(opts);
      return;
    }

    const sent = await this.sendViaGmail(opts);
    if (sent) {
      this.logger.log(`[Gmail SMTP] Email sent to ${opts.to}: ${opts.subject}`);
      return;
    }

    this.logger.warn(`[DEV] ${opts.logFallback} (set RESEND_API_KEY or GMAIL_USER/GMAIL_APP_PASSWORD to send real emails)`);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  async sendVerificationCode(
    channel: NotificationChannel,
    destination: string,
    code: string,
  ): Promise<void> {
    if (channel === 'email') {
      await this.sendEmail(destination, code);
    } else {
      await this.sendSms(destination, code);
    }
  }

  async sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
    const html =
      `<div style="font-family:sans-serif;max-width:520px;margin:auto">` +
      `<h2 style="color:#0284c7">Reset your password</h2>` +
      `<p>We received a request to reset the password for your RentAI account (<strong>${to}</strong>).</p>` +
      `<p><a href="${resetUrl}" style="display:inline-block;background:#0284c7;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Reset password</a></p>` +
      `<p style="font-size:12px;color:#666">Or paste this link into your browser:<br/><span style="word-break:break-all">${resetUrl}</span></p>` +
      `<p style="font-size:12px;color:#666">This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email.</p>` +
      `</div>`;

    await this.dispatchEmail({
      to,
      subject: 'Reset your RentAI password',
      html,
      logFallback: `Password reset link for ${to}: ${resetUrl}`,
    });
  }

  async sendPasswordResetUnavailableEmail(to: string): Promise<void> {
    const html =
      `<div style="font-family:sans-serif;max-width:520px;margin:auto">` +
      `<h2 style="color:#0284c7">About your account</h2>` +
      `<p>Someone (hopefully you) asked to reset the password on this account (<strong>${to}</strong>).</p>` +
      `<p>This account was created with <strong>Continue with Google</strong> and doesn't have a password to reset. ` +
      `Just use the "Continue with Google" button on the login page to sign in.</p>` +
      `<p style="font-size:12px;color:#666">If this wasn't you, no action is needed.</p>` +
      `</div>`;

    await this.dispatchEmail({
      to,
      subject: 'About your RentAI account',
      html,
      logFallback: `OAuth-only reset attempt for ${to}`,
    });
  }

  async sendTransactionalEmail(input: {
    to: string;
    subject: string;
    html: string;
  }): Promise<void> {
    await this.dispatchEmail({
      to: input.to,
      subject: input.subject,
      html: input.html,
      logFallback: `Email to ${input.to}: ${input.subject}`,
    });
  }

  private async sendEmail(to: string, code: string): Promise<void> {
    const html = `<p>Your verification code is <strong style="font-size:24px;letter-spacing:4px">${code}</strong>.</p><p>It expires in 10 minutes.</p>`;
    await this.dispatchEmail({
      to,
      subject: 'Your RentAI verification code',
      html,
      logFallback: `Email verification code for ${to}: ${code}`,
    });
  }

  private async sendSms(to: string, code: string): Promise<void> {
    const sid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
    const token = this.configService.get<string>('TWILIO_AUTH_TOKEN');
    const from = this.configService.get<string>('TWILIO_FROM_NUMBER');

    if (!sid?.trim() || !token?.trim() || !from?.trim()) {
      this.logger.warn(
        `[DEV] SMS verification code for ${to}: ${code} (set TWILIO_* env vars to send real SMS)`,
      );
      return;
    }

    const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
    const body = new URLSearchParams({
      To: to,
      From: from,
      Body: `Your RentAI verification code is ${code}. Expires in 10 minutes.`,
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    if (!response.ok) {
      const text = await response.text();
      this.logger.error(`Twilio SMS failed (${response.status}): ${text}`);
      throw new Error('Failed to send verification SMS');
    }
  }
}
