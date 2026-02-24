import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response, Request } from 'express';

/**
 * Error code mapping from HTTP status to machine-readable code.
 */
function errorCode(status: number): string {
  switch (status) {
    case 400:
      return 'VALIDATION_ERROR';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 429:
      return 'RATE_LIMITED';
    default:
      return status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST';
  }
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { requestId?: string }>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    // Extract user-friendly message
    let message = 'Internal server error';
    let details: any = undefined;

    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const obj = res as Record<string, any>;
        // class-validator returns { message: string[] }
        if (Array.isArray(obj.message)) {
          message = obj.message.join('; ');
          details = obj.message;
        } else {
          message = obj.message || obj.error || 'Error';
        }
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    const requestId = request.requestId || 'unknown';

    // Log errors with requestId for traceability
    if (status >= 500) {
      this.logger.error(
        `[${requestId}] ${status} ${request.method} ${request.url} — ${message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.warn(
        `[${requestId}] ${status} ${request.method} ${request.url} — ${message}`,
      );
    }

    const body: Record<string, any> = {
      success: false,
      error: {
        code: errorCode(status),
        message,
      },
      timestamp: new Date().toISOString(),
      requestId,
    };

    // Only include details in non-production
    if (details && process.env.NODE_ENV !== 'production') {
      body.error.details = details;
    }

    response.status(status).json(body);
  }
}
