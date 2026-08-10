import { INestApplication, RequestMethod, ValidationPipe, VersioningType } from '@nestjs/common';
import { API_PREFIX, API_VERSION, HEALTH_PATH, SYSTEM_PATH } from './api.constants';
import { AllExceptionsFilter } from './http/all-exceptions.filter';
import { requestContextMiddleware } from './logging/request-context.middleware';
import { RequestLoggerInterceptor } from './logging/request-logger.interceptor';

/**
 * Everything about the served surface that is not a module: the URL space, and
 * the pipe, interceptor and filter every request passes through.
 *
 * Kept out of main.ts so anything that needs a configured app — a test fixture,
 * a second entry point — applies the real wiring rather than a copy that drifts.
 */
export function configureApp(app: INestApplication): void {
  // First in the chain: everything after it expects a request context to exist.
  app.use(requestContextMiddleware);

  app.setGlobalPrefix(API_PREFIX, {
    // Liveness and service information are not part of the API surface — see
    // api.constants.ts.
    exclude: [
      { path: HEALTH_PATH, method: RequestMethod.GET },
      { path: SYSTEM_PATH, method: RequestMethod.GET },
    ],
  });
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: API_VERSION,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      // Strip unknown properties, and reject rather than ignore them, so a
      // client's typo fails loudly instead of being silently dropped.
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalInterceptors(new RequestLoggerInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());
}
