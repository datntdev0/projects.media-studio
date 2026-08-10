import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppConfigService } from './core/config/app-config.service';
import { configureApp } from './core/configure-app';
import { AppLogger } from './core/logging/app.logger';
import { setupOpenApi } from './core/openapi/openapi';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    // Hold Nest's own start-up logs until our logger is installed, so boot
    // output is formatted like everything that follows it.
    bufferLogs: true,
  });

  app.useLogger(app.get(AppLogger));

  configureApp(app, app.get(AppConfigService));

  // After configureApp: the document is generated from the routing table as it
  // stands, so it has to see the prefix and the version already applied.
  setupOpenApi(app, app.get(AppConfigService));

  app.enableShutdownHooks();

  await app.listen(app.get(AppConfigService).port);
}

void bootstrap();
