import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyDto } from './dto/verify.dto';
import { RequestVerificationDto } from './dto/request-verification.dto';
import * as bcrypt from 'bcrypt';
import type { JwtPayload, Role } from '../../common/auth/jwt-payload';
import { VerificationService } from './verification.service';
import { RefreshTokenService } from './refresh-token.service';

// OWASP (2024) recommends a bcrypt cost factor of at least 12 for password
// hashes. Existing 10-round hashes keep working — bcrypt encodes the cost in
// the hash itself, so compare() reads whatever cost the stored hash used.
export const PASSWORD_BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private verificationService: VerificationService,
    private refreshTokens: RefreshTokenService,
  ) { }

  async register(registerDto: RegisterDto) {
    try {
      this.logger.log(
        `Registration attempt: ${registerDto.email ?? registerDto.phone}`,
      );

      if (!registerDto.email && !registerDto.phone) {
        throw new BadRequestException('Either email or phone must be provided');
      }

      const hashedPassword = await bcrypt.hash(registerDto.password, PASSWORD_BCRYPT_ROUNDS);
      this.logger.debug('Password hashed successfully');

      // Exclude password field, only send passwordHash
      // Also exclude firstName and lastName for the db entity itself, combining them into `name` if missing.
      const { password: _password, firstName, lastName, ...userDataWithoutPassword } = registerDto;

      let finalName = userDataWithoutPassword.name;
      if (!finalName) {
        finalName = [firstName, lastName].filter(Boolean).join(' ').trim();
      }
      if (!finalName) {
        finalName = 'User';
      }

      const user = await this.usersService.create({
        ...userDataWithoutPassword,
        name: finalName,
        passwordHash: hashedPassword,
      });
      this.logger.log(`User created: ${user.id}`);

      const tokens = await this.generateTokens(
        user.id,
        user.email || user.phone,
        this.getRoleForUser(user),
      );

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { passwordHash, ...result } = user;

      return {
        user: result,
        ...tokens,
      };
    } catch (_error) {
      this.logger.error(`Registration error: ${_error.message}`);
      throw _error;
    }
  }

  async login(loginDto: LoginDto) {
    try {
      const identifier = loginDto.emailOrPhone || loginDto.email;
      if (!identifier) {
        throw new BadRequestException('emailOrPhone or email must be provided');
      }

      this.logger.log(`Login attempt for: ${identifier}`);

      const user = await this.usersService.findByEmailOrPhone(identifier);

      if (!user) {
        this.logger.warn(
          `Login failed — user not found: ${loginDto.emailOrPhone}`,
        );
        throw new UnauthorizedException('Invalid credentials');
      }

      // OAuth-only users have no password; tell them to use Google instead of
      // leaking that the account exists.
      if (!user.passwordHash) {
        this.logger.warn(
          `Login failed — OAuth-only account, no local password: ${identifier}`,
        );
        throw new UnauthorizedException(
          'This account was created with Google. Use "Continue with Google" instead.',
        );
      }

      const isPasswordValid = await bcrypt.compare(
        loginDto.password,
        user.passwordHash,
      );
      this.logger.debug(`Password valid: ${isPasswordValid}`);

      if (!isPasswordValid) {
        this.logger.warn(
          `Login failed — invalid password: ${loginDto.emailOrPhone}`,
        );
        throw new UnauthorizedException('Invalid credentials');
      }

      if (user.suspendedAt) {
        this.logger.warn(`Login rejected — account suspended: ${user.id}`);
        throw new UnauthorizedException('Your account has been suspended');
      }

      const tokens = await this.generateTokens(
        user.id,
        user.email || user.phone,
        this.getRoleForUser(user),
      );
      this.logger.log(`Login successful: ${user.id}`);

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { passwordHash, ...result } = user;
      return {
        user: result,
        ...tokens,
      };
    } catch (_error) {
      if (_error instanceof UnauthorizedException) throw _error;
      this.logger.error(`Login error: ${_error.message}`);
      throw _error;
    }
  }

  async refresh(refreshToken: string) {
    try {
      const payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: this.configService.get<string>('refreshToken.secret'),
      });

      // The token signature is valid — but has it been logged out or rotated?
      const live = await this.refreshTokens.isLive(refreshToken);
      if (!live) {
        this.logger.warn(`Refresh rejected — token is revoked or unknown: sub=${payload.sub}`);
        throw new UnauthorizedException('Invalid refresh token');
      }

      const user = await this.usersService.findOne(payload.sub);
      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      // Rotate: revoke the just-used refresh token, issue a fresh pair.
      // Catches replay (an attacker reusing a stolen token will be locked out
      // the moment the legitimate user refreshes).
      await this.refreshTokens.revoke(refreshToken);

      const tokens = await this.generateTokens(
        user.id,
        user.email || user.phone || user.id,
        this.getRoleForUser(user),
      );

      return tokens;
    } catch (_error) {
      if (_error instanceof UnauthorizedException) throw _error;
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  /**
   * Revoke a refresh token so it can no longer be exchanged for an access
   * token. Idempotent: silently succeeds whether or not the token was live.
   * We intentionally do not throw on unknown tokens so a malformed body from
   * the client doesn't leak "this string was a valid token".
   */
  async logout(refreshToken: string | undefined): Promise<{ message: string }> {
    if (refreshToken) {
      try {
        // Verify shape first so we don't pollute the table with garbage hashes
        this.jwtService.verify<JwtPayload>(refreshToken, {
          secret: this.configService.get<string>('refreshToken.secret'),
        });
        await this.refreshTokens.revoke(refreshToken);
      } catch {
        // Invalid or expired token — nothing to revoke, still a successful logout
      }
    }
    return { message: 'Signed out' };
  }

  /**
   * Revoke every refresh token belonging to a user. Used by the "sign out
   * everywhere" button — the caller still has to clear their own local state,
   * but every *other* device with an open session is dead the moment its
   * access token expires (≤ 15min by default).
   */
  async logoutAll(userId: string): Promise<{ revokedCount: number }> {
    const count = await this.refreshTokens.revokeAllForUser(userId);
    this.logger.log(`Signed out everywhere for user ${userId} (${count} sessions)`);
    return { revokedCount: count };
  }

  /**
   * Change a user's password. Requires the current password — never trust
   * "user is logged in" alone for an action this destructive (stolen access
   * token would otherwise let the attacker lock the real owner out).
   *
   * Revokes every refresh token afterwards. The caller's own access token
   * keeps working until it expires; every other open session dies on the
   * next refresh.
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const user = await this.usersService.findOne(userId);
    if (!user) throw new UnauthorizedException('User not found');

    if (!user.passwordHash) {
      throw new BadRequestException(
        'This account uses Google sign-in and has no password. ' +
          'Set one from the password reset flow instead.',
      );
    }

    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) {
      this.logger.warn(`Change-password rejected — wrong current password for ${userId}`);
      throw new UnauthorizedException('Current password is incorrect');
    }

    if (currentPassword === newPassword) {
      throw new BadRequestException('New password must be different from the current one');
    }

    const newHash = await bcrypt.hash(newPassword, PASSWORD_BCRYPT_ROUNDS);
    await this.usersService.update(userId, { passwordHash: newHash });

    // Invalidate everywhere — if the password was changed because something
    // was off, every existing session should be killed.
    const revoked = await this.refreshTokens.revokeAllForUser(userId);
    this.logger.log(`Password changed for ${userId} (${revoked} sessions revoked)`);

    return { message: 'Password updated. Other devices have been signed out.' };
  }

  async requestVerification(userId: string, dto: RequestVerificationDto) {
    const channel = dto.type === 'email' ? 'EMAIL' : 'PHONE';
    return this.verificationService.requestCode(userId, channel);
  }

  async verify(userId: string, verifyDto: VerifyDto) {
    const channel = verifyDto.type === 'email' ? 'EMAIL' : 'PHONE';
    const result = await this.verificationService.verifyCode(
      userId,
      channel,
      verifyDto.code,
    );
    return { message: 'Verification successful', ...result };
  }

  private getRoleForUser(user: { roles?: string[]; isHost?: boolean }): Role {
    const roles = (user.roles ?? []).map((r) => String(r).toUpperCase());
    if (roles.includes('ADMIN')) return 'ADMIN';
    if (user.isHost) return 'HOST';
    return 'USER';
  }

  private async generateTokens(userId: string, identifier: string, role: Role) {
    const payload: JwtPayload = { sub: userId, email: identifier, role };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('jwt.secret'),
      expiresIn: this.configService.get<string>('jwt.expiresIn'),
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('refreshToken.secret'),
      expiresIn: this.configService.get<string>('refreshToken.expiresIn'),
    });

    // Decode (don't re-verify) to pull the exp claim — keeps a single source of truth.
    const decoded = this.jwtService.decode(refreshToken) as { exp?: number } | null;
    const expiresAt = decoded?.exp
      ? new Date(decoded.exp * 1000)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await this.refreshTokens.store({
      userId,
      rawToken: refreshToken,
      expiresAt,
    });

    return { accessToken, refreshToken };
  }

  // ─── OAuth (Google) ─────────────────────────────────────────────────────

  /**
   * Find a user by Google id, or link/create one. Called from the Passport
   * Google strategy after Google verifies the user's identity.
   */
  async findOrCreateFromGoogle(payload: {
    googleId: string;
    email: string;
    name: string;
    avatarUrl?: string;
  }) {
    return this.usersService.findOrCreateFromGoogle(payload);
  }

  /**
   * Issue access + refresh tokens for an already-authenticated user (e.g. the
   * one Passport just resolved from a Google profile).
   */
  async issueTokensFor(user: {
    id: string;
    email: string | null;
    phone: string | null;
    roles?: string[];
    isHost?: boolean;
    suspendedAt?: Date | null;
  }) {
    if (user.suspendedAt) {
      throw new UnauthorizedException('Your account has been suspended');
    }
    return this.generateTokens(
      user.id,
      user.email || user.phone || user.id,
      this.getRoleForUser(user),
    );
  }
}
