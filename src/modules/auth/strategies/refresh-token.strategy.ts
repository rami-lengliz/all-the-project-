import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';
import type { JwtPayload, Role } from '../../../common/auth/jwt-payload';

@Injectable()
export class RefreshTokenStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
  ) {
    super({
      // Backward-compatible: accept refresh token from Authorization header (preferred)
      // and from body field `refreshToken` (existing clients).
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        ExtractJwt.fromBodyField('refreshToken'),
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('refreshToken.secret'),
    });
  }

  private normalizeRole(
    role: unknown,
    user: { roles?: string[]; isHost?: boolean },
  ): Role {
    const r = typeof role === 'string' ? role.toUpperCase() : '';
    if (r === 'ADMIN' || r === 'HOST' || r === 'USER') return r;
    const roles = (user.roles ?? []).map((x) => String(x).toUpperCase());
    if (roles.includes('ADMIN')) return 'ADMIN';
    if (user.isHost) return 'HOST';
    return 'USER';
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    const user = await this.usersService.findOne(payload.sub);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return {
      sub: user.id,
      email: payload.email || user.email || user.phone || '',
      role: this.normalizeRole(payload.role, user),
    };
  }
}
