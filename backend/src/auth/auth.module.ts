import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthManager } from './auth.manager';
import { InMemoryUserRepository } from './in-memory-user.repository';
import { UserRepository } from './user.repository';

/**
 * The worked example of all three layers: controller → manager → repository.
 *
 * `UserRepository` is bound to its in-memory stand-in here and nowhere else, so
 * the day a datastore is chosen this one line changes and neither the manager
 * nor the controller notices. The repository is deliberately not exported —
 * persistence stays private to the domain that owns it, and other modules go
 * through `AuthManager`.
 */
@Module({
  controllers: [AuthController],
  providers: [AuthManager, { provide: UserRepository, useClass: InMemoryUserRepository }],
  exports: [AuthManager],
})
export class AuthModule {}
