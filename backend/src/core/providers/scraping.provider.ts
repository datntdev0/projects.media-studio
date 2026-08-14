import { BadGatewayException, BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';

/**
 * A book as the scraping service reports it.
 *
 * Its shape, not ours: `camelCase` over the wire, and everything but the first
 * three optional, because the service runs `response_model_exclude_none=True` and
 * leaves a field out rather than sending null. Declared here because this is the
 * only file that reads it — a field of somebody else's API should not travel.
 */
export interface ScrapedNovel {
  /** The book id the source files it under. */
  id: string;
  /** The canonical book URL, whatever spelling was asked for. */
  url: string;
  crawler: string;
  title?: string;
  author?: string;
  /** One genre, as the source names it — `武俠`. */
  category?: string;
  /** The source's own word for its state — `連載`, `完結`. */
  status?: string;
  /** The source's own format, `2026-08-13 00:33:11`. Not an ISO instant. */
  updatedAt?: string;
  latestChapter?: string;
  latestChapterUrl?: string;
  readUrl?: string;
  /** Absolute, and on a CDN behind the same protection as the site. */
  coverUrl?: string;
  description?: string;
}

/** One chapter, in reading order. */
export interface ScrapedChapter {
  index: number;
  title: string;
  url: string;
}

/** A cover, as bytes and what they are. The service sniffs the type from the file itself. */
export interface ScrapedCover {
  contentType: string;
  bytes: Buffer;
}

/**
 * One chapter's text, as the source publishes it: its heading, and its lines.
 *
 * Lines rather than one string, because that is what the page is — what goes between
 * them is decided where the file is written, not here. A chapter served over several
 * pages arrives as one of these, already joined up by the service.
 */
export interface ScrapedContent {
  title: string;
  content: string[];
}

/** What the service calls each thing it can answer about a book. */
const METADATA = 'metadata';

const CHAPTERS = 'chapters';

const COVER = 'cover';

const CONTENT = 'content';

const UNREADABLE = 'The source could not be read. Try again.';

const UNAVAILABLE = 'The scraping service is not answering. Try again in a moment.';

const MISSING = 'There is no book at that URL';

/**
 * The scraping service, as the rest of this app sees it: three questions about a
 * book, and an exception when it cannot answer one.
 *
 * Plain `fetch`, like `IdentityToolkitClient` — there is no HTTP module in this
 * project and one call per method does not want one. What it adds is a timeout,
 * because the thing on the other end drives a real browser and can hang in a way
 * an ordinary API does not.
 *
 * Nothing here knows what a novel means. The mapping from what the source says to
 * what the library stores belongs to the manager above it, which knows which
 * crawler was used and therefore how to read `status`.
 */
@Injectable()
export class ScrapingProvider {
  private readonly logger = new Logger(ScrapingProvider.name);

  constructor(private readonly config: AppConfigService) {}

  /** The book's own fields, without its chapters. */
  async metadata(crawler: string, sourceUrl: string): Promise<ScrapedNovel> {
    return this.json<ScrapedNovel>(await this.call(METADATA, crawler, sourceUrl));
  }

  /** Every chapter, in reading order. */
  async chapters(crawler: string, sourceUrl: string): Promise<ScrapedChapter[]> {
    return this.json<ScrapedChapter[]>(await this.call(CHAPTERS, crawler, sourceUrl));
  }

  /**
   * The text behind one chapter.
   *
   * `sourceUrl` here is a **chapter** URL — the one discovery stored on the row — and
   * not a book URL, which is the one thing this call does differently from the three
   * beside it.
   */
  async content(crawler: string, sourceUrl: string): Promise<ScrapedContent> {
    return this.json<ScrapedContent>(await this.call(CONTENT, crawler, sourceUrl));
  }

  /**
   * The cover's bytes, or null where the book has none.
   *
   * Null rather than a 404 out of this method: by the time it is called the book
   * has already been read, so a missing cover is a fact about the book rather
   * than a failure to find it.
   */
  async cover(crawler: string, sourceUrl: string): Promise<ScrapedCover | null> {
    let response: Response;

    try {
      response = await this.call(COVER, crawler, sourceUrl);
    } catch (cause: unknown) {
      if (cause instanceof NotFoundException) {
        return null;
      }

      throw cause;
    }

    return {
      contentType: response.headers.get('content-type') ?? 'application/octet-stream',
      bytes: Buffer.from(await response.arrayBuffer()),
    };
  }

  private get baseUrl(): string {
    return this.config.scraping.baseUrl;
  }

  /** One call, with the service's refusals turned into ours. Answers only on a 2xx. */
  private async call(part: string, crawler: string, sourceUrl: string): Promise<Response> {
    const url = `${this.baseUrl}/novels/${encodeURIComponent(crawler)}/${part}?sourceUrl=${encodeURIComponent(sourceUrl)}`;
    let response: Response;

    try {
      response = await fetch(url, { signal: AbortSignal.timeout(this.config.scraping.timeoutMs) });
    } catch (cause: unknown) {
      // A refused connection, a DNS failure, or our own timeout. None of them is
      // the caller's fault, and none of them says anything a person can act on.
      this.logger.error(`GET ${url} did not answer`, cause);

      throw new ServiceUnavailableException(UNAVAILABLE);
    }

    if (!response.ok) {
      await this.fail(response, url);
    }

    return response;
  }

  /** Always throws. Which exception is the only thing the status decides. */
  private async fail(response: Response, url: string): Promise<never> {
    const detail = await errorDetail(response);

    // The service checks the URL belongs to the crawler and says so in a sentence
    // — "…is not a novel543 address" — which is already the right thing to show.
    if (response.status === 400) {
      throw new BadRequestException(detail || UNREADABLE);
    }

    if (response.status === 404) {
      throw new NotFoundException(MISSING);
    }

    // A browser that crashed, a challenge that never cleared, a site that answered
    // 503: the detail belongs in the log rather than in the response.
    this.logger.error(`GET ${url} answered ${response.status} ${detail}`);

    throw new BadGatewayException(UNREADABLE);
  }

  private async json<T>(response: Response): Promise<T> {
    try {
      return (await response.json()) as T;
    } catch (cause: unknown) {
      this.logger.error('The scraping service answered 200 with something that is not JSON', cause);

      throw new BadGatewayException(UNREADABLE);
    }
  }
}

/**
 * FastAPI's `{"detail": …}`, as a sentence.
 *
 * A string for anything the service raises itself. A list for a 422, which means
 * we sent it something it could not parse — our bug, so it is logged whole rather
 * than shown.
 */
async function errorDetail(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown };

    return typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail ?? '');
  } catch {
    return '';
  }
}
