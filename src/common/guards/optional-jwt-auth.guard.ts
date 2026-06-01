import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Same JWT strategy as JwtAuthGuard but never throws when the token is
 * missing or invalid — it just leaves `req.user` undefined. Use on routes
 * that should work for both anonymous and logged-in users, where having
 * the user identity is a bonus (e.g., personalized recommendations).
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  override canActivate(context: ExecutionContext) {
    // Always allow the request through; whether req.user is populated is
    // determined by handleRequest below.
    return super.canActivate(context) as any;
  }

  override handleRequest<TUser = any>(_err: any, user: any): TUser {
    // Swallow auth errors and return whatever user (or undefined) we have.
    return user as TUser;
  }
}
