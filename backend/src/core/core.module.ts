import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import type { ConfigType } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppConfigService } from './config/app-config.service';
import { appConfig } from './config/configuration';
import { FirebaseAdminService } from './firebase/firebase-admin.service';
import { AppLogger } from './logging/app.logger';
import { CacheProvider } from './providers/cache.provider';
import { ContentFileProvider } from './providers/content-file.provider';
import { ScheduleProvider } from './providers/schedule.provider';
import { ScrapingProvider } from './providers/scraping.provider';
import { allConsumerQueues } from './queues/queue.messages';
import { QueueProducer } from './queues/queue.producer';

/**
 * Every queue the registry names, created once, here.
 *
 * Central rather than per feature module: the registry already says which queues
 * exist, and registering them twice from two places is how one comes to be missing
 * from the other. A module that declares a consumer only declares the class —
 * this module is global, so the queue it processes is already in scope.
 */
const ConsumerQueues = BullModule.registerQueue(...allConsumerQueues().map((name) => ({ name })));

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
    BullModule.forRootAsync({
      // The namespaced config rather than AppConfigService: that one is a provider
      // of this module, and a module cannot inject its own providers into what it
      // imports. `forFeature` hands over the same registered config without the cycle.
      imports: [ConfigModule.forFeature(appConfig)],
      inject: [appConfig.KEY],
      useFactory: ({ queue }: ConfigType<typeof appConfig>) => ({
        // ioredis wants the option absent rather than empty when there is no password.
        connection: { host: queue.host, port: queue.port, password: queue.password || undefined },
        prefix: queue.prefix,
        // What every job gets unless the caller says otherwise. Retries live here
        // rather than at the send, so a consumer's failure is handled the same way
        // wherever the message came from.
        defaultJobOptions: {
          attempts: queue.attempts,
          backoff: { type: 'exponential', delay: queue.backoffMs },
          removeOnComplete: queue.keepCompleted,
          removeOnFail: queue.keepFailed,
        },
      }),
    }),
    ConsumerQueues,
  ],
  providers: [AppConfigService, AppLogger, FirebaseAdminService, CacheProvider, ContentFileProvider, ScheduleProvider, ScrapingProvider, QueueProducer],
  // The queues are re-exported so a feature module's consumer resolves the one it
  // processes, and so anything holding a queue directly can still reach it.
  exports: [AppConfigService, AppLogger, FirebaseAdminService, CacheProvider, ContentFileProvider, ScheduleProvider, ScrapingProvider, QueueProducer, ConsumerQueues],
})
export class CoreModule {}
