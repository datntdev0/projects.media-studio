import {
  ArgumentsHost,
  BadRequestException,
  ForbiddenException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { requestContext } from '../logging/request-context';
import {
  AllExceptionsFilter,
  ErrorResponseBody,
} from './all-exceptions.filter';

interface Caught {
  status: number;
  body: ErrorResponseBody;
}

/** Catch an exception and report what would have gone back over the wire. */
function catchIt(exception: unknown, path = '/api/v1/system'): Caught {
  const caught = {} as Caught;

  /** Just enough of Express' response to record a chained status().json(). */
  interface ResponseStub {
    status(code: number): ResponseStub;
    json(body: ErrorResponseBody): ResponseStub;
  }

  const response: ResponseStub = {
    status(code) {
      caught.status = code;
      return response;
    },
    json(body) {
      caught.body = body;
      return response;
    },
  };

  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ method: 'GET', originalUrl: path }),
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;

  new AllExceptionsFilter().catch(exception, host);

  return caught;
}

describe('AllExceptionsFilter', () => {
  beforeAll(() => {
    // The filter logs every failure; keep the spec output readable.
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('passes an HttpException through with its status and message', () => {
    const { status, body } = catchIt(new NotFoundException('No such novel'));

    expect(status).toBe(404);
    expect(body).toMatchObject({
      statusCode: 404,
      message: 'No such novel',
      error: 'Not Found',
    });
  });

  it('keeps the per-field messages of a validation failure', () => {
    const { body } = catchIt(
      new BadRequestException(['name must be a string', 'page must be an int']),
    );

    expect(body.message).toEqual([
      'name must be a string',
      'page must be an int',
    ]);
  });

  it('names the status even when the exception carries no message', () => {
    expect(catchIt(new ForbiddenException()).body).toMatchObject({
      statusCode: 403,
      error: 'Forbidden',
    });
  });

  it('turns an unknown failure into a 500 that says nothing useful to an attacker', () => {
    const { status, body } = catchIt(
      new Error('connect ECONNREFUSED 10.0.0.5:5432'),
    );

    expect(status).toBe(500);
    expect(body).toMatchObject({
      message: 'Internal server error',
      error: 'Internal Server Error',
    });
    expect(JSON.stringify(body)).not.toContain('10.0.0.5');
  });

  it('logs a server failure with its stack', () => {
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const thrown = new Error('boom');

    catchIt(thrown);

    expect(error).toHaveBeenCalledWith('GET /api/v1/system 500', thrown.stack);
  });

  it('logs a client failure as a warning, not an error', () => {
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    catchIt(new NotFoundException('nope'));

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('GET /api/v1/system 404'),
    );
  });

  it('carries the request id so a report can be found in the logs', () => {
    const body = requestContext.run({ requestId: 'probe-123' }, () =>
      catchIt(new NotFoundException()),
    ).body;

    expect(body.requestId).toBe('probe-123');
  });

  it('omits the request id outside a request', () => {
    expect(catchIt(new NotFoundException()).body.requestId).toBeUndefined();
  });

  it('records where the failure happened and when', () => {
    const { body } = catchIt(new NotFoundException(), '/api/v1/library/7');

    expect(body.path).toBe('/api/v1/library/7');
    expect(Date.parse(body.timestamp)).not.toBeNaN();
  });
});
