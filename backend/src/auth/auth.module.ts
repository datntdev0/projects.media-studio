import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthManager } from './auth.manager';
import { IdentityToolkitClient } from './identity-toolkit.client';

/**
 * Controller over manager, with Firebase Authentication as the datastore.
 *
 * There is no repository: accounts live in Firebase, and `FirebaseAdminService`
 * is reachable from the global `CoreModule` — which is also what lets Nest build
 * `FirebaseAuthGuard` from a `@UseGuards` reference alone. The REST client is not
 * exported: checking a password is this domain's business and nobody else's.
 */
@Module({
  controllers: [AuthController],
  providers: [AuthManager, IdentityToolkitClient],
  exports: [AuthManager],
})
export class AuthModule {}
