import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomBytes, createHash } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { UsersService } from '../users/users.service';
import { NotificationService } from './notification.service';
import { PASSWORD_BCRYPT_ROUNDS } from './auth.service';

const TOKEN_TTL_MINUTES = 60;
const TOKEN_BYTES = 32;

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly notifications: NotificationService,
    private readonly configService: ConfigService,
  ) {}

  async requestReset(email: string, ipAddress?: string) {
    const user = await this.usersService.findByEmail(email);

    // Always behave the same whether the user exists or not — don't leak which
    // emails are registered. The "if no user" branch still costs a hash, so
    // the response time stays roughly the same.
    if (!user) {
      this.logger.log(`Password reset requested for unknown email: ${email}`);
      await bcrypt.hash('decoy-to-equalize-timing', PASSWORD_BCRYPT_ROUNDS);
      return { message: 'If that email is registered, a reset link has been sent.' };
    }

    // OAuth-only users have no password to reset. Tell them, but only via
    // the email so we don't leak account presence to the requester.
    if (!user.passwordHash) {
      this.logger.log(`Password reset requested for OAuth-only user ${user.id}`);
      // Fire-and-forget: don't block the HTTP response on SMTP delivery.
      void this.notifications
        .sendPasswordResetUnavailableEmail(email)
        .catch((err) =>
          this.logger.error(
            `Failed to send OAuth-only notice to ${email}: ${err?.message ?? err}`,
          ),
        );
      return { message: 'If that email is registered, a reset link has been sent.' };
    }

    // Invalidate any outstanding tokens for this user
    await this.prisma.passwordResetToken.updateMany({
      where: { userId: user.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    const rawToken = randomBytes(TOKEN_BYTES).toString('base64url');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000);

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
        ipAddress: ipAddress ?? null,
      },
    });

    const frontendBase =
      this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    const resetUrl = `${frontendBase}/auth/reset-password?token=${encodeURIComponent(rawToken)}`;

    // Fire-and-forget: the response is intentionally identical whether or not
    // the email exists, so there's no reason to block it on SMTP delivery
    // (the Gmail handshake alone can take 20+ seconds on a cold connection).
    void this.notifications
      .sendPasswordResetEmail(email, resetUrl)
      .then(() =>
        this.logger.log(`Password reset email sent for user ${user.id}`),
      )
      .catch((err) =>
        this.logger.error(
          `Failed to send password reset email for user ${user.id}: ${err?.message ?? err}`,
        ),
      );

    return { message: 'If that email is registered, a reset link has been sent.' };
  }

  async resetPassword(rawToken: string, newPassword: string) {
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });

    if (!record || record.consumedAt) {
      throw new BadRequestException('This reset link is invalid or has already been used.');
    }

    if (record.expiresAt < new Date()) {
      throw new BadRequestException('This reset link has expired. Request a new one.');
    }

    const passwordHash = await bcrypt.hash(newPassword, PASSWORD_BCRYPT_ROUNDS);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { consumedAt: new Date() },
      }),
      // Also invalidate any other live reset tokens for this user
      this.prisma.passwordResetToken.updateMany({
        where: {
          userId: record.userId,
          consumedAt: null,
          NOT: { id: record.id },
        },
        data: { consumedAt: new Date() },
      }),
    ]);

    this.logger.log(`Password reset completed for user ${record.userId}`);
    return { message: 'Password updated. You can now log in.' };
  }
}
