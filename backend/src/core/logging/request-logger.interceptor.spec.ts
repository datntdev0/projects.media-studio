import { CallHandler, ExecutionContext, Logger } from '@nestjs/common';
import { firstValueFrom, of, throwError } from 'rxjs';
import { RequestLoggerInterceptor } from './request-logger.interceptor';

function httpContext(
  method = 'GET',
  url = '/api/v1/system',
  statusCode = 200,
): ExecutionContext {
  return {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => ({ method, originalUrl: url }),
      getResponse: () => ({ statusCode }),
    }),
  } as unknown as ExecutionContext;
}

const handlerOf = (value: unknown): CallHandler =>
  ({ handle: () => of(value) }) as CallHandler;

describe('RequestLoggerInterceptor', () => {
  let log: jest.SpyInstance;

  beforeEach(() => {
    log = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logs the method, path, status and duration of a served request', async () => {
    await firstValueFrom(
      new RequestLoggerInterceptor().intercept(
        httpContext('POST', '/api/v1/library', 201),
        handlerOf('created'),
      ),
    );

    expect(log).toHaveBeenCalledWith(
      expect.stringMatching(/^POST \/api\/v1\/library 201 \d+ms$/),
    );
  });

  it('passes the handled value through untouched', async () => {
    const value = await firstValueFrom(
      new RequestLoggerInterceptor().intercept(
        httpContext(),
        handlerOf({ status: 'ok' }),
      ),
    );

    expect(value).toEqual({ status: 'ok' });
  });

  it('leaves failures to the exception filter', async () => {
    // Logging here too would print every error twice, once without its status.
    const failing = {
      handle: () => throwError(() => new Error('boom')),
    } as CallHandler;

    await expect(
      firstValueFrom(
        new RequestLoggerInterceptor().intercept(httpContext(), failing),
      ),
    ).rejects.toThrow('boom');

    expect(log).not.toHaveBeenCalled();
  });

  it('ignores anything that is not an HTTP request', async () => {
    const context = {
      getType: () => 'rpc',
      switchToHttp: () => {
        throw new Error('not an http context');
      },
    } as unknown as ExecutionContext;

    await firstValueFrom(
      new RequestLoggerInterceptor().intercept(context, handlerOf('queued')),
    );

    expect(log).not.toHaveBeenCalled();
  });
});
