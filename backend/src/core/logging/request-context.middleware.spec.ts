import type { NextFunction, Request, Response } from 'express';
import { currentRequestId, REQUEST_ID_HEADER } from './request-context';
import { requestContextMiddleware } from './request-context.middleware';

interface Run {
  /** The id visible to everything downstream of the middleware. */
  seen?: string;
  /** What went back out on the response. */
  returned?: string;
}

function handle(headers: Record<string, string | string[]>): Run {
  const run: Run = {};

  const request = { headers } as unknown as Request;
  const response = {
    setHeader: (name: string, value: string) => {
      if (name === REQUEST_ID_HEADER) {
        run.returned = value;
      }
    },
  } as unknown as Response;

  const next: NextFunction = () => {
    run.seen = currentRequestId();
  };

  requestContextMiddleware(request, response, next);

  return run;
}

describe('requestContextMiddleware', () => {
  it('honours an inbound request id, so a trace survives the hop', () => {
    expect(handle({ [REQUEST_ID_HEADER]: 'probe-123' })).toEqual({
      seen: 'probe-123',
      returned: 'probe-123',
    });
  });

  it('mints an id when none arrives', () => {
    const { seen, returned } = handle({});

    expect(seen).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(returned).toBe(seen);
  });

  it('takes the first of a repeated header', () => {
    expect(handle({ [REQUEST_ID_HEADER]: ['first', 'second'] }).seen).toBe(
      'first',
    );
  });

  it('mints an id rather than trusting a blank header', () => {
    expect(handle({ [REQUEST_ID_HEADER]: '   ' }).seen).not.toBe('   ');
  });

  it('leaves no context behind once the request is done', () => {
    handle({ [REQUEST_ID_HEADER]: 'probe-123' });

    expect(currentRequestId()).toBeUndefined();
  });

  it('gives concurrent requests their own id', async () => {
    // The point of async storage: one request cannot read another's id.
    const ids = await Promise.all(
      ['a', 'b', 'c'].map(
        (id) =>
          new Promise<string | undefined>((resolve) => {
            const request = {
              headers: { [REQUEST_ID_HEADER]: id },
            } as unknown as Request;
            const response = {
              setHeader: () => undefined,
            } as unknown as Response;

            requestContextMiddleware(request, response, () => {
              setTimeout(() => resolve(currentRequestId()), 5);
            });
          }),
      ),
    );

    expect(ids).toEqual(['a', 'b', 'c']);
  });
});
