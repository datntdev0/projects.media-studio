import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppConfigService } from './config/app-config.service';
import { appConfig } from './config/configuration';
import { FirebaseAdminService } from './firebase/firebase-admin.service';
import { AppLogger } from './logging/app.logger';
import { CacheProvider } from './providers/cache.provider';
import { ScheduleProvider } from './providers/schedule.provider';
import { ScrapingProvider } from './providers/scraping.provider';

/**
 * The cross-cutting layer: configuration, logging, the Firebase Admin app, and the
 * providers over the infrastructure behind it.
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
    // Sets up the scheduler ScheduleProvider books its jobs with.
    ScheduleModule.forRoot(),
  ],
  providers: [AppConfigService, AppLogger, FirebaseAdminService, CacheProvider, ScheduleProvider, ScrapingProvider],
  exports: [AppConfigService, AppLogger, FirebaseAdminService, CacheProvider, ScheduleProvider, ScrapingProvider],
})
export class CoreModule {}
