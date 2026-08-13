import type { CrawlerPreview, ValidateSource } from '~/types/library'

/** The one place a scraping path is written. */
const SCRAPING = '/scraping'

/**
 * Reading a source before anything is created from it.
 *
 * One call, and a slow one: the server drives a real browser, so a cold read is
 * tens of seconds. The answer is cached there for 30 days — `refresh` is how a
 * caller insists on a fresh one.
 */
export const useScraping = () => {
  const api = useApi()

  return {
    validate: (source: ValidateSource, refresh = false) => api<CrawlerPreview>(`${SCRAPING}/validate`, { method: 'POST', body: source, query: refresh ? { refresh: true } : undefined })
  }
}
