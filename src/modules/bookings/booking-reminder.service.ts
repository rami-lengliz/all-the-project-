import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { NotificationService } from '../auth/notification.service';
import { TwilioWhatsappClient } from '../whatsapp/twilio-whatsapp.client';

/**
 * Abandoned-booking nudges.
 *
 * A booking sits in `status: pending` between creation and host acceptance
 * (or `status: confirmed` while the renter hasn't paid). Renters forget,
 * hosts ghost, conversion bleeds. Two reminders fix most of it:
 *
 *   - First reminder ~4h after creation
 *   - Final reminder ~24h after creation (if still unpaid)
 *
 * Sends via WhatsApp (if phone present) AND email (if email present) — so a
 * renter who only gave one of the two still gets reached.
 *
 * Each reminder tier has its own timestamp column on the Booking row, so this
 * is fully idempotent — calling the cron 100× in a row sends nothing extra.
 *
 * Invoked manually via `POST /api/bookings/process-pending-reminders` (admin)
 * or hourly via Railway / external cron.
 */

const FIRST_REMINDER_AFTER_MINUTES = 4 * 60;
const FINAL_REMINDER_AFTER_MINUTES = 24 * 60;
const BATCH_SIZE = 100;

@Injectable()
export class BookingReminderService {
  private readonly logger = new Logger(BookingReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
    private readonly whatsapp: TwilioWhatsappClient,
    private readonly configService: ConfigService,
  ) {}

  // ── Automatic in-process scheduler ─────────────────────────────────────────
  // Runs every 30 minutes — no external cron (Railway/cron-job.org) needed.
  // `cronRunning` prevents overlap if a run is slow; set DISABLE_REMINDER_CRON=true
  // on any secondary instance so only one process sends reminders (avoids dupes).
  private cronRunning = false;

  @Cron(CronExpression.EVERY_30_MINUTES, { name: 'booking-reminders' })
  async handleReminderCron(): Promise<void> {
    if (this.configService.get<string>('DISABLE_REMINDER_CRON') === 'true') return;
    if (this.cronRunning) {
      this.logger.warn('Reminder cron skipped — previous run still in progress');
      return;
    }
    this.cronRunning = true;
    try {
      await this.processPending();
    } catch (err) {
      this.logger.error(`Reminder cron failed: ${(err as Error)?.message ?? err}`);
    } finally {
      this.cronRunning = false;
    }
  }

  /** Top-level cron entry point. Returns counts so admins can sanity-check. */
  async processPending(): Promise<{
    firstRemindersSent: number;
    finalRemindersSent: number;
    expired: number;
  }> {
    const firstRemindersSent = await this.processFirstReminders();
    const finalRemindersSent = await this.processFinalReminders();
    const expired = await this.expireStaleBookings();
    this.logger.log(
      `Reminder cron done: first=${firstRemindersSent}, final=${finalRemindersSent}, expired=${expired}`,
    );
    return { firstRemindersSent, finalRemindersSent, expired };
  }

  // ─── First reminder (4h) ──────────────────────────────────────────────

  private async processFirstReminders(): Promise<number> {
    const cutoff = new Date(Date.now() - FIRST_REMINDER_AFTER_MINUTES * 60 * 1000);
    const candidates = await this.prisma.booking.findMany({
      where: {
        status: { in: ['pending', 'confirmed'] },
        paid: false,
        createdAt: { lt: cutoff },
        pendingReminderSentAt: null,
      },
      take: BATCH_SIZE,
      include: {
        renter: { select: { name: true, email: true, phone: true } },
        listing: { select: { title: true } },
      },
    });

    let sent = 0;
    for (const b of candidates) {
      const ok = await this.sendReminder(b, 'first');
      if (ok) {
        await this.prisma.booking.update({
          where: { id: b.id },
          data: { pendingReminderSentAt: new Date() },
        });
        sent++;
      }
    }
    return sent;
  }

  // ─── Final reminder (24h) ─────────────────────────────────────────────

  private async processFinalReminders(): Promise<number> {
    const cutoff = new Date(Date.now() - FINAL_REMINDER_AFTER_MINUTES * 60 * 1000);
    const candidates = await this.prisma.booking.findMany({
      where: {
        status: { in: ['pending', 'confirmed'] },
        paid: false,
        createdAt: { lt: cutoff },
        pendingFinalReminderSentAt: null,
      },
      take: BATCH_SIZE,
      include: {
        renter: { select: { name: true, email: true, phone: true } },
        listing: { select: { title: true } },
      },
    });

    let sent = 0;
    for (const b of candidates) {
      const ok = await this.sendReminder(b, 'final');
      if (ok) {
        await this.prisma.booking.update({
          where: { id: b.id },
          data: { pendingFinalReminderSentAt: new Date() },
        });
        sent++;
      }
    }
    return sent;
  }

  // ─── Expire bookings that never paid after 48h ────────────────────────

  private async expireStaleBookings(): Promise<number> {
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const result = await this.prisma.booking.updateMany({
      where: {
        status: { in: ['pending', 'confirmed'] },
        paid: false,
        createdAt: { lt: cutoff },
      },
      data: { status: 'cancelled' },
    });
    if (result.count > 0) {
      this.logger.log(`Auto-cancelled ${result.count} stale unpaid booking(s)`);
    }
    return result.count;
  }

  // ─── Delivery ──────────────────────────────────────────────────────────

  private async sendReminder(
    booking: {
      id: string;
      renter: { name: string; email: string | null; phone: string | null };
      listing: { title: string };
    },
    tier: 'first' | 'final',
  ): Promise<boolean> {
    const frontend =
      this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    const payUrl = `${frontend}/booking/${booking.id}/pay`;
    const isFinal = tier === 'final';
    const firstName = (booking.renter.name ?? '').split(' ')[0] || 'there';

    const subject = isFinal
      ? `Last chance to confirm your booking for ${booking.listing.title}`
      : `Don't lose your spot — ${booking.listing.title}`;

    const html =
      `<p>Hi ${escapeHtml(firstName)},</p>` +
      `<p>${isFinal
        ? `Your booking for <strong>${escapeHtml(booking.listing.title)}</strong> is still unpaid and will expire in the next 24 hours.`
        : `You started a booking for <strong>${escapeHtml(booking.listing.title)}</strong> but haven't completed payment yet. Hosts often pass dates that aren't locked in.`
      }</p>` +
      `<p style="margin: 24px 0"><a href="${payUrl}" style="display:inline-block;background:#0284c7;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600">Pay now</a></p>` +
      `<p style="font-size:12px;color:#666">Paying through RentEverything is the only way your booking is protected. Bookings paid outside the platform aren't covered.</p>`;

    let anyDelivered = false;

    // Email
    if (booking.renter.email) {
      try {
        await this.notifications.sendTransactionalEmail({
          to: booking.renter.email,
          subject,
          html,
        });
        anyDelivered = true;
      } catch (err: any) {
        this.logger.warn(
          `Email reminder failed for booking ${booking.id}: ${err?.message ?? err}`,
        );
      }
    }

    // WhatsApp
    if (booking.renter.phone) {
      const waBody = isFinal
        ? `⏰ Hi ${firstName}, your booking for "${booking.listing.title}" expires soon. Pay now to confirm: ${payUrl}\n\nOnly bookings paid through RentEverything are protected.`
        : `Hi ${firstName}, your booking for "${booking.listing.title}" is still unpaid. Lock it in here: ${payUrl}\n\nOnly bookings paid through RentEverything are protected.`;
      try {
        await this.whatsapp.send(booking.renter.phone, waBody);
        anyDelivered = true;
      } catch (err: any) {
        this.logger.warn(
          `WhatsApp reminder failed for booking ${booking.id}: ${err?.message ?? err}`,
        );
      }
    }

    if (!anyDelivered) {
      this.logger.warn(
        `Skipping reminder for booking ${booking.id} — renter has neither email nor phone`,
      );
    }
    return anyDelivered;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
