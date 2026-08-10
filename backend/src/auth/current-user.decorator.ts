import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { AuthenticatedRequest } from './firebase-auth.guard';

/**
 * The verified claims of the caller.
 *
 * Only meaningful behind `FirebaseAuthGuard` — the guard is what puts them on
 * the request. Asserted rather than checked: a handler that reads this without
 * the guard is a wiring mistake, and it should fail on the spot rather than
 * quietly treat an anonymous request as a user.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): DecodedIdToken => context.switchToHttp().getRequest<AuthenticatedRequest>().user!,
);
