import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';

/**
 * Generates a UUID v4 requestId for every incoming request.
 * - Attaches it to `req.requestId`
 * - Sets `X-Request-Id` response header
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(
    req: Request & { requestId?: string },
    res: Response,
    next: NextFunction,
  ) {
    const id = (req.headers['x-request-id'] as string) || crypto.randomUUID();
    req.requestId = id;
    res.setHeader('X-Request-Id', id);
    next();
  }
}
