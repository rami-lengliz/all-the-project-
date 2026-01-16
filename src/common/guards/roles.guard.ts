import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { JwtPayload, Role } from '../auth/jwt-payload';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.get<Role[]>(
      'roles',
      context.getHandler(),
    );
    if (!requiredRoles) {
      return true;
    }
    const request = context.switchToHttp().getRequest();
    const user = request.user as JwtPayload | undefined;
    if (!user) return false;
    const role =
      typeof user.role === 'string'
        ? (user.role.toUpperCase() as Role)
        : undefined;
    if (!role) return false;
    if (requiredRoles.includes(role)) return true;
    throw new ForbiddenException('Insufficient role');
  }
}
