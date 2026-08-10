import { INestApplication, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { DOCS_PATH, OPENAPI_JSON_PATH } from '../api.constants';
import { AppConfigService } from '../config/app-config.service';
import { SERVICE_VERSION } from '../service-metadata';

/**
 * Publishes the OpenAPI document and the Swagger UI that browses it.
 *
 * Call after `setGlobalPrefix` and `enableVersioning`: the document is generated
 * from the routing table as it stands, so a document built earlier would
 * advertise paths without their `/api/v1` prefix.
 *
 * `jsonDocumentUrl` exposes the raw document alongside the UI — that is what
 * client codegen and the frontend consume, and it is worth having a stable URL
 * for even when nobody is reading the page.
 */
export function setupOpenApi(app: INestApplication, config: AppConfigService): void {
  if (!config.docsEnabled) {
    return;
  }

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Media Studio API')
      .setDescription('The Media Studio service: media generation pipelines, the content library and scraping jobs.')
      .setVersion(SERVICE_VERSION)
      // Every protected route reads the same Firebase ID token, so one scheme
      // covers the document and `persistAuthorization` below keeps it across
      // reloads — paste a token once and the whole page is usable.
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'A Firebase ID token.' })
      .build(),
  );

  SwaggerModule.setup(DOCS_PATH, app, document, {
    jsonDocumentUrl: OPENAPI_JSON_PATH,
    customSiteTitle: 'Media Studio API',
    swaggerOptions: {
      // Keep the operation list collapsed and the URL in sync with what is open,
      // so a link to an endpoint reopens on it.
      docExpansion: 'list',
      displayRequestDuration: true,
      persistAuthorization: true,
    },
  });

  new Logger('OpenApi').log(`Swagger UI at /${DOCS_PATH}, document at /${OPENAPI_JSON_PATH}`);
}
