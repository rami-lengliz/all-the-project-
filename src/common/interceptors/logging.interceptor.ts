import {
    Injectable,
    NestInterceptor,
    ExecutionContext,
    CallHandler,
    Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/**
 * Lightweight request duration logger.
 * Helps identify slow PostGIS or AI queries in production.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
    private readonly logger = new Logger('HTTP');

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const req = context.switchToHttp().getRequest();
        const { method, url } = req;
        const now = Date.now();

        return next.handle().pipe(
            tap(() => {
                const res = context.switchToHttp().getResponse();
                const delay = Date.now() - now;

                // Log all requests, but highlight slow ones (>500ms)
                const logMsg = `${method} ${url} ${res.statusCode} - ${delay}ms`;
                if (delay > 500) {
                    this.logger.warn(`SLOW REQUEST: ${logMsg}`);
                } else {
                    this.logger.log(logMsg);
                }
            }),
        );
    }
}
