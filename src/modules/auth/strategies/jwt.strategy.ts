import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';
import type { JwtPayload, Role } from '../../../common/auth/jwt-payload';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.secret'),
    });
  }

  private getRoleFromDb(
    dbUser: { isHost?: boolean | null; roles?: string[] },
    jwtRole: unknown,
  ): Role {
    // ADMIN can only be set server-side — trust the JWT for that
    const r = typeof jwtRole === 'string' ? jwtRole.toUpperCase() : '';
    const roles = (dbUser.roles ?? []).map((x) => String(x).toUpperCase());
    if (r === 'ADMIN' || roles.includes('ADMIN')) return 'ADMIN';

    // For HOST: always read from DB so that become-host takes effect immediately
    // without requiring a new login / token refresh.
    if (dbUser.isHost === true || roles.includes('HOST')) return 'HOST';

    return 'USER';
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    const user = await this.usersService.findOne(payload.sub);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Always derive role from the live DB record so that role changes
    // (e.g. become-host) take effect on the very next request.
    return {
      sub: user.id,
      email: payload.email || user.email || user.phone || '',
      role: this.getRoleFromDb(user, payload.role),
    };
  }
}
