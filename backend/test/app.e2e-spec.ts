import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/core/configure-app';
import { REQUEST_ID_HEADER } from './../src/core/logging/request-context';
import { HealthDto } from './../src/system/dto/health.dto';
import { ServiceInfoDto } from './../src/system/dto/service-info.dto';

/**
 * The served URL space, end to end. Mirrors main.ts — the prefix, the version
 * and the health exclusion are what clients depend on, so they are worth
 * asserting rather than trusting.
 */
describe('API (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const fixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = fixture.createNestApplication({ logger: false });
    // The same wiring main.ts applies — not a copy of it.
    configureApp(app);

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/v1/system', () => {
    it('identifies the service and the version serving it', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/system')
        .expect(200);

      const body = response.body as ServiceInfoDto;

      expect(typeof body.name).toBe('string');
      expect(typeof body.version).toBe('string');
      expect(typeof body.environment).toBe('string');
      expect(body.apiVersion).toBe('v1');
    });

    it('is not served unversioned', async () => {
      await request(app.getHttpServer()).get('/api/system').expect(404);
    });

    it('is not served unprefixed', async () => {
      await request(app.getHttpServer()).get('/v1/system').expect(404);
    });
  });

  describe('GET /health', () => {
    it('reports the process as serving', async () => {
      const response = await request(app.getHttpServer())
        .get('/health')
        .expect(200);

      const body = response.body as HealthDto;

      expect(body.status).toBe('ok');
      expect(typeof body.uptimeSeconds).toBe('number');
    });

    it('stays outside the prefix and the version', async () => {
      // Orchestrators and the e2e readiness probe should not track API versions.
      await request(app.getHttpServer()).get('/api/v1/health').expect(404);
    });
  });

  describe('request ids', () => {
    it('echoes the one it is given', async () => {
      const response = await request(app.getHttpServer())
        .get('/health')
        .set(REQUEST_ID_HEADER, 'probe-123');

      expect(response.headers[REQUEST_ID_HEADER]).toBe('probe-123');
    });

    it('mints one when none is given', async () => {
      const response = await request(app.getHttpServer()).get('/health');

      expect(response.headers[REQUEST_ID_HEADER]).toEqual(expect.any(String));
    });
  });

  describe('errors', () => {
    it('answers an unknown route in the one error shape', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/nope')
        .set(REQUEST_ID_HEADER, 'probe-404')
        .expect(404);

      expect(response.body).toMatchObject({
        statusCode: 404,
        error: 'Not Found',
        requestId: 'probe-404',
        path: '/api/v1/nope',
      });
    });
  });
});
