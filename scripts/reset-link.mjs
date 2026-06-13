#!/usr/bin/env node
/**
 * reset-link.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Generate a guaranteed-fresh password-reset link for a user, straight to the
 * terminal — no email, no inbox, no Gmail threading, no timing games.
 *
 * Why this exists:
 *   The email flow works, but during a demo it is fragile: every reseed deletes
 *   accounts (cascade-deleting their reset tokens), and Gmail threads old + new
 *   reset emails together, so it is very easy to click a link whose token was
 *   already invalidated → 400 "invalid or already used". This prints a brand-new
 *   working link tied to the account that exists right now.
 *
 * Usage:
 *   node scripts/reset-link.mjs bencheikhfadi5@gmail.com
 *   npm run reset-link -- bencheikhfadi5@gmail.com
 *
 * What it does:
 *   - Finds the user by email (or phone).
 *   - Invalidates any outstanding reset tokens for that user (same as the API).
 *   - Creates ONE fresh token (sha256-hashed in DB, raw value never stored),
 *     valid for 1 hour — identical scheme to PasswordResetService.
 *   - Prints the full /auth/reset-password?token=… URL to paste in a browser.
 *
 * Reads FRONTEND_URL from the environment (defaults to http://localhost:3000),
 * matching the backend so the printed link points at the right frontend.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { PrismaClient } from '@prisma/client';
import { randomBytes, createHash } from 'node:crypto';

const TOKEN_TTL_MINUTES = 60;
const TOKEN_BYTES = 32;

const identifier = process.argv[2];
if (!identifier) {
  console.error('Usage: node scripts/reset-link.mjs <email or phone>');
  process.exit(1);
}

const prisma = new PrismaClient();

try {
  const user = await prisma.user.findFirst({
    where: identifier.includes('@')
      ? { email: identifier }
      : { phone: identifier },
    select: { id: true, email: true, phone: true, passwordHash: true },
  });

  if (!user) {
    console.error(
      `✗ No user found with ${identifier.includes('@') ? 'email' : 'phone'}=${identifier}`,
    );
    console.error(
      '  Tip: register them via POST /api/auth/register first, then re-run this script.',
    );
    process.exit(1);
  }

  if (!user.passwordHash) {
    console.error(
      `✗ ${identifier} is a Google/OAuth-only account (no password to reset).`,
    );
    console.error('  They should use "Continue with Google" to sign in.');
    process.exit(1);
  }

  // Invalidate any outstanding tokens, exactly like PasswordResetService.
  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  const rawToken = randomBytes(TOKEN_BYTES).toString('base64url');
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000);

  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash, expiresAt },
  });

  const frontendBase = process.env.FRONTEND_URL ?? 'http://localhost:3000';
  const resetUrl = `${frontendBase}/auth/reset-password?token=${encodeURIComponent(rawToken)}`;

  console.log('');
  console.log(`✓ Fresh reset link for ${user.email ?? user.phone}`);
  console.log(`  (valid ${TOKEN_TTL_MINUTES} min — this is now the ONLY live token for the account)`);
  console.log('');
  console.log('  ┌─ paste this in a browser ────────────────────────────────');
  console.log(`  │ ${resetUrl}`);
  console.log('  └──────────────────────────────────────────────────────────');
  console.log('');
} catch (err) {
  console.error('✗ Error:', err.message);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
