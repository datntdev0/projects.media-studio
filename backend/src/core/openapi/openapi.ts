import { INestApplication, Logger } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
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
 * for even when nobody is reading the page. The frontend's NSwag run reads it
 * from a running service; see `frontend/nswag.json`.
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
    {
      // An operation id is what a code generator splits into a class and a method,
      // so drop the `Controller` suffix Nest's default keeps: `Library_list` reads
      // as `LibraryClient.list()` rather than `LibraryControllerClient.list()`.
      operationIdFactory: (controllerKey, methodKey) => `${controllerKey.replace(/Controller$/, '')}_${methodKey}`,
    },
  );

  SwaggerModule.setup(DOCS_PATH, app, closeSchemas(document), {
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

/**
 * Says out loud what the service already does: no object here takes a property
 * it did not declare.
 *
 * `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`, so an
 * unknown property in a request body is a 400 — and a response is whatever its
 * DTO says it is. Nest leaves `additionalProperties` unset, which a generator
 * reads as "anything goes" and answers with an `[key: string]: any` on every
 * generated interface. That index signature accepts a misspelt field, which is
 * most of what a typed client is for.
 */
function closeSchemas(document: OpenAPIObject): OpenAPIObject {
  for (const schema of Object.values(document.components?.schemas ?? {})) {
    if ('properties' in schema && schema.additionalProperties === undefined) {
      schema.additionalProperties = false;
    }
  }

  return document;
}
