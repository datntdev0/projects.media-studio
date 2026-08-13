import { BadGatewayException, BadRequestException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { ScrapingProvider } from './scraping.provider';

const BASE_URL = 'http://scraper.test';

const CRAWLER = 'novel543';

const SOURCE_URL = 'https://www.novel543.com/0413553971';

const METADATA_URL = `${BASE_URL}/novels/novel543/metadata?sourceUrl=https%3A%2F%2Fwww.novel543.com%2F0413553971`;

const NOVEL = { id: '0413553971', url: SOURCE_URL, crawler: CRAWLER, title: '劍來', status: '連載' };

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

const provider = new ScrapingProvider({ scraping: { baseUrl: BASE_URL, timeoutMs: 1_000, cacheTtlDays: 30 } } as AppConfigService);

/**
 * The one call each method makes, answered however the case wants. Typed from
 * `fetch` itself rather than from what this provider happens to pass, so the stub
 * stays assignable to the global it replaces.
 */
const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock;
});

function answers(body: BodyInit | null, status = 200, headers: Record<string, string> = { 'content-type': 'application/json' }) {
  fetchMock.mockResolvedValue(new Response(body, { status, headers }));
}

/** FastAPI's shape for anything it raises itself. */
function refuses(status: number, detail: unknown) {
  answers(JSON.stringify({ detail }), status);
}

describe('ScrapingProvider.metadata', () => {
  it('asks the crawler named, for the URL given', async () => {
    answers(JSON.stringify(NOVEL));

    await expect(provider.metadata(CRAWLER, SOURCE_URL)).resolves.toEqual(NOVEL);

    const [url, init] = fetchMock.mock.calls[0] ?? [];

    expect(url).toBe(METADATA_URL);
    // Every call carries one: the thing on the other end can hang.
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('passes on the sentence behind a 400 — the service already wrote one', async () => {
    refuses(400, 'www.wuxiaworld.com is not a novel543 address');

    await expect(provider.metadata(CRAWLER, SOURCE_URL)).rejects.toThrow(new BadRequestException('www.wuxiaworld.com is not a novel543 address'));
  });

  it('is a 404 for a book that is not there', async () => {
    refuses(404, 'https://www.novel543.com/0413553971 does not exist');

    await expect(provider.metadata(CRAWLER, SOURCE_URL)).rejects.toThrow(NotFoundException);
  });

  it('is a 502 for an upstream or browser failure', async () => {
    refuses(502, 'Fetching … failed: Timeout 120000ms exceeded');

    await expect(provider.metadata(CRAWLER, SOURCE_URL)).rejects.toThrow(BadGatewayException);
  });

  it('survives a 422, whose detail is a list rather than a sentence', async () => {
    refuses(422, [{ loc: ['query', 'sourceUrl'], msg: 'field required' }]);

    await expect(provider.metadata(CRAWLER, SOURCE_URL)).rejects.toThrow(BadGatewayException);
  });

  it('is a 503 when nothing answers', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    await expect(provider.metadata(CRAWLER, SOURCE_URL)).rejects.toThrow(ServiceUnavailableException);
  });

  it('is a 503 when the answer does not arrive in time', async () => {
    fetchMock.mockRejectedValue(new DOMException('The operation was aborted due to timeout', 'TimeoutError'));

    await expect(provider.metadata(CRAWLER, SOURCE_URL)).rejects.toThrow(ServiceUnavailableException);
  });

  it('is a 502 when a 200 does not hold JSON', async () => {
    answers('<html>a proxy got in the way</html>');

    await expect(provider.metadata(CRAWLER, SOURCE_URL)).rejects.toThrow(BadGatewayException);
  });
});

describe('ScrapingProvider.chapters', () => {
  it('hands back the list as it comes, in reading order', async () => {
    const chapters = [
      { index: 1, title: '第一章', url: `${SOURCE_URL}/8095_1.html` },
      { index: 2, title: '第二章', url: `${SOURCE_URL}/8095_2.html` },
    ];

    answers(JSON.stringify(chapters));

    await expect(provider.chapters(CRAWLER, SOURCE_URL)).resolves.toEqual(chapters);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BASE_URL}/novels/novel543/chapters?sourceUrl=https%3A%2F%2Fwww.novel543.com%2F0413553971`);
  });
});

describe('ScrapingProvider.cover', () => {
  it('hands back the bytes and the type the service sniffed', async () => {
    answers(JPEG, 200, { 'content-type': 'image/jpeg' });

    await expect(provider.cover(CRAWLER, SOURCE_URL)).resolves.toEqual({ contentType: 'image/jpeg', bytes: JPEG });
  });

  it('is null for a book with no cover, rather than a 404', async () => {
    refuses(404, 'This book has no cover image');

    await expect(provider.cover(CRAWLER, SOURCE_URL)).resolves.toBeNull();
  });

  it('still throws for a failure that is not a missing cover', async () => {
    refuses(502, 'The cover URL did not return an image');

    await expect(provider.cover(CRAWLER, SOURCE_URL)).rejects.toThrow(BadGatewayException);
  });
});
