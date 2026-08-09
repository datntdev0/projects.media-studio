import { AsyncLocalStorage } from 'node:async_hooks';

/** The header a request id arrives on, and leaves on. */
export const REQUEST_ID_HEADER = 'x-request-id';

export interface RequestContext {
  requestId: string;
}

/**
 * Per-request store, on Node's own async storage.
 *
 * This is what lets a log line ten calls deep carry the request id without
 * every signature between here and there taking a context argument.
 */
export const requestContext = new AsyncLocalStorage<RequestContext>();

/** The current request's id, or `undefined` outside a request (boot, jobs). */
export function currentRequestId(): string | undefined {
  return requestContext.getStore()?.requestId;
}
