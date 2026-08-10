import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppConfigService } from './config/app-config.service';
import { appConfig } from './config/configuration';
import { FirebaseAdminService } from './firebase/firebase-admin.service';
import { AppLogger } from './logging/app.logger';

/**
 * The cross-cutting layer: configuration, logging and the Firebase Admin app.
 *
 * Global, because every feature module needs these and threading the import
 * through each one buys nothing. Feature modules are imported explicitly by
 * `AppModule` instead — a domain's providers should never be ambient.
 */
@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      // Read once, here, so no other module reaches for process.env.
      load: [appConfig],
      cache: true,
      envFilePath: ['.env.local', '.env'],
    }),
  ],
  providers: [AppConfigService, AppLogger, FirebaseAdminService],
  exports: [AppConfigService, AppLogger, FirebaseAdminService],
})
export class CoreModule {}
