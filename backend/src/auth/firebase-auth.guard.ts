import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { FirebaseAdminService } from '../core/firebase/firebase-admin.service';

/** A request that has been through the guard, with the token it carried. */
export interface AuthenticatedRequest extends Request {
  user?: DecodedIdToken;
}

/**
 * Proof that the caller is who the token says.
 *
 * The token was issued by Firebase Authentication to a browser that presented
 * the right password; all this service does is check the signature, the audience
 * and the expiry, then park the decoded claims on the request for
 * `@CurrentUser()`. Against the emulator the signature check is skipped — the
 * tokens are unsigned — so the guard is only as good as the emulator is private.
 */
@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  private readonly logger = new Logger(FirebaseAuthGuard.name);

  constructor(private readonly firebase: FirebaseAdminService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = bearerToken(request.header('authorization'));

    if (!token) {
      throw new UnauthorizedException('Missing access token');
    }

    try {
      request.user = await this.firebase.auth.verifyIdToken(token);
    } catch (cause) {
      // Which way it failed is for the log: expired, malformed and forged all
      // get the same answer, so a caller learns nothing from probing.
      this.logger.debug(`Rejected an ID token: ${cause instanceof Error ? cause.message : String(cause)}`);

      throw new UnauthorizedException('Invalid access token');
    }

    return true;
  }
}

function bearerToken(header: string | undefined): string | null {
  const [scheme, token] = header?.split(' ') ?? [];

  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null;
  }

  return token;
}
