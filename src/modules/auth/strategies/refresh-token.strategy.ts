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
      // Prefer the body refreshToken if both are provided, as clients often mistakenly
      // attach access tokens to all requests via interceptors.
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromBodyField('refreshToken'),
        ExtractJwt.fromAuthHeaderAsBearerToken(),
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
    // Always re-derive role from DB — refresh tokens are long-lived and the
    // role claim can be stale (e.g. after become-host).
    const roles = ((user as any).roles ?? []).map((r: unknown) =>
      String(r).toUpperCase(),
    );
    let role: Role = 'USER';
    if (roles.includes('ADMIN') || (user as any).role === 'ADMIN') {
      role = 'ADMIN';
    } else if ((user as any).isHost === true || roles.includes('HOST')) {
      role = 'HOST';
    }
    return {
      sub: user.id,
      email: payload.email || (user as any).email || (user as any).phone || '',
      role,
    };
  }
}
