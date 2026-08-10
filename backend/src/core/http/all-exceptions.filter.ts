import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { currentRequestId } from '../logging/request-context';

export interface ErrorResponseBody {
  statusCode: number;
  /** What went wrong. A validation failure carries one entry per field. */
  message: string | string[];
  /** The status' name, e.g. `Not Found`. */
  error: string;
  /** Echoes `x-request-id` — the handle for finding this failure in the logs. */
  requestId?: string;
  path: string;
  timestamp: string;
}

interface HttpExceptionPayload {
  message?: string | string[];
  error?: string;
}

/** At and above this, the failure is ours and deserves a stack in the log. */
const SERVER_ERROR_FLOOR = 500;

/**
 * The single exit for every failure.
 *
 * `HttpException`s keep their status and message; anything else becomes a 500
 * whose body says nothing about the internals while the log keeps the stack.
 * Without this an unhandled error would answer in Nest's default shape, so
 * clients would have two error formats to parse.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const body: ErrorResponseBody = {
      statusCode: status,
      ...this.describe(exception, status),
      requestId: currentRequestId(),
      path: request.originalUrl,
      timestamp: new Date().toISOString(),
    };

    const summary = `${request.method} ${request.originalUrl} ${status}`;

    if (status >= SERVER_ERROR_FLOOR) {
      this.logger.error(summary, exception instanceof Error ? exception.stack : JSON.stringify(exception));
    } else {
      this.logger.warn(`${summary} ${JSON.stringify(body.message)}`);
    }

    response.status(status).json(body);
  }

  /** The client-facing message and error name for an exception. */
  private describe(exception: unknown, status: number): Pick<ErrorResponseBody, 'message' | 'error'> {
    const error = statusName(status);

    if (!(exception instanceof HttpException)) {
      // Never surface an internal failure's text: it leaks paths and queries.
      return { message: 'Internal server error', error };
    }

    const payload = exception.getResponse();

    if (typeof payload === 'string') {
      return { message: payload, error };
    }

    const { message, error: nested } = payload as HttpExceptionPayload;

    return { message: message ?? exception.message, error: nested ?? error };
  }
}

/** `404` → `Not Found`. Falls back to the raw status for unusual codes. */
function statusName(status: number): string {
  // HttpStatus is a numeric enum, so it carries its own reverse mapping.
  const name = (HttpStatus as unknown as Record<number, string | undefined>)[status];

  if (!name) {
    return String(status);
  }

  return name
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
