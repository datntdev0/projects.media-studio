import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { REQUEST_ID_HEADER, requestContext } from './request-context';

/**
 * Opens a request context for every request.
 *
 * An inbound `x-request-id` is honoured so a trace started by a gateway or by
 * the frontend survives the hop; otherwise one is minted. Either way it goes
 * back out on the response, which is what makes a reported failure findable.
 *
 * Registered with `app.use()` in `configureApp` rather than as a Nest
 * middleware class: it takes no dependencies, it has to wrap every route
 * including the docs, and Express 5 no longer accepts the bare `'*'` pattern
 * that `forRoutes()` would need.
 */
export function requestContextMiddleware(request: Request, response: Response, next: NextFunction): void {
  const inbound = request.headers[REQUEST_ID_HEADER];
  const requestId = (Array.isArray(inbound) ? inbound[0] : inbound)?.trim() || randomUUID();

  response.setHeader(REQUEST_ID_HEADER, requestId);
  requestContext.run({ requestId }, () => next());
}
