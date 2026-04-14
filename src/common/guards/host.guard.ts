import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import type { JwtPayload } from '../auth/jwt-payload';

@Injectable()
export class HostGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user as JwtPayload | undefined;

    if (!user || (user.role !== 'HOST' && user.role !== 'ADMIN')) {
      throw new ForbiddenException('Only hosts can perform this action');
    }

    return true;
  }
}
