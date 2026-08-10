import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthManager } from './auth.manager';

/**
 * Controller over manager, with Firebase Authentication as the datastore.
 *
 * There is no repository: accounts live in Firebase, and `FirebaseAdminService`
 * is reachable from the global `CoreModule` — which is also what lets Nest build
 * `FirebaseAuthGuard` from a `@UseGuards` reference alone.
 */
@Module({
  controllers: [AuthController],
  providers: [AuthManager],
  exports: [AuthManager],
})
export class AuthModule {}
