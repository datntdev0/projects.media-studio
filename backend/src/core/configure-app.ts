import {
  INestApplication,
  RequestMethod,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { API_PREFIX, API_VERSION, HEALTH_PATH } from './api.constants';
import { AllExceptionsFilter } from './http/all-exceptions.filter';
import { requestContextMiddleware } from './logging/request-context.middleware';
import { RequestLoggerInterceptor } from './logging/request-logger.interceptor';

/**
 * Everything about the served surface that is not a module: the URL space, and
 * the pipe, interceptor and filter every request passes through.
 *
 * Shared by main.ts and the e2e spec on purpose. A spec that re-declared this
 * wiring would be asserting against its own copy, and would keep passing after
 * the real bootstrap changed.
 */
export function configureApp(app: INestApplication): void {
  // First in the chain: everything after it expects a request context to exist.
  app.use(requestContextMiddleware);

  app.setGlobalPrefix(API_PREFIX, {
    // Liveness is not part of the API surface — see api.constants.ts.
    exclude: [{ path: HEALTH_PATH, method: RequestMethod.GET }],
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
