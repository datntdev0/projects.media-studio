import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';

/**
 * One line per served request: method, path, status, duration.
 *
 * Only the successful path — failures are logged by AllExceptionsFilter, which
 * knows the status it settled on and has the stack to go with it. Logging both
 * here would double every error.
 */
@Injectable()
export class RequestLoggerInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Http');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const startedAt = Date.now();
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();

    return next.handle().pipe(
      tap({
        next: () => {
          const { statusCode } = http.getResponse<Response>();
          this.logger.log(
            `${request.method} ${request.originalUrl} ${statusCode} ${Date.now() - startedAt}ms`,
          );
        },
      }),
    );
  }
}
