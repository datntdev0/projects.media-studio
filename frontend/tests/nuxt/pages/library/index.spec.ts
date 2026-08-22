import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import AppDialog from '~/components/AppDialog.vue'
import AppLibraryFilters from '~/components/AppLibraryFilters.vue'
import AppLibraryGrid from '~/components/AppLibraryGrid.vue'
import AppLibraryTable from '~/components/AppLibraryTable.vue'
import LibraryPage from '~/pages/library/index.vue'
import type { LibraryFilters, LibraryItemPage, NovelItem } from '~/types/library'
import type { RunningJob } from '~/types/scraping-status'

/**
 * The catalogue. What is exercised is the page's own three jobs: turning its filter
 * into a request, choosing which of the four things to draw over the answer, and
 * ordering the two halves of a delete.
 *
 * The filter band is driven through its models rather than through the controls
 * inside it, because the page's contract is that band's events — the band has its
 * own reasons to change which control raises them.
 */

const PAGE_SIZE = 25

const { list, remove, discard, toast } = vi.hoisted(() => ({
  list: vi.fn(),
  remove: vi.fn(),
  discard: vi.fn(),
  toast: vi.fn()
}))

/** The live tree, as a test sets it: which jobs are running, and whether one has just settled. */
const live = vi.hoisted(() => ({
  running: [] as RunningJob[],
  /** Assigned on first use — a hoisted block runs before `ref` is there to call. */
  settled: null as null | { value: boolean },
  reconcile: vi.fn()
}))

mockNuxtImport('useApiClient', () => () => ({
  libraryClient: { list, remove },
  scrapingClient: { validate: vi.fn() }
}))

mockNuxtImport('useCovers', () => () => ({ discard, upload: vi.fn() }))

mockNuxtImport('useToast', () => () => ({ add: toast }))

mockNuxtImport('useScrapingJobs', () => () => {
  live.settled ??= ref(false)

  return {
    jobs: ref({}),
    forLibrary: (libraryId: string) => live.running.find(job => job.libraryId === libraryId) ?? null,
    settled: computed(() => live.settled!.value),
    reconcile: live.reconcile
  }
})

function novel(overrides: Partial<NovelItem> = {}): NovelItem {
  return {
    id: 'the-cartographer',
    title: 'The Cartographer',
    coverUrl: 'https://covers.test/the-cartographer.webp',
    sourceMode: 'crawler',
    sourceName: 'novelfull',
    sourceUrl: 'https://novelfull.test/the-cartographer',
    status: 'ready',
    updatedAt: '2026-08-18T09:00:00.000Z',
    type: 'novel',
    metadata: { discoveredCount: 640, discoveredAt: null, downloadedCount: 412, status: 'ongoing', author: 'Ada Vane', language: 'en', genres: ['Fantasy'], description: '' },
    ...overrides
  }
}

const answered = (items: NovelItem[], more = false) => list.mockResolvedValue({ items, nextCursor: more ? 'next' : null, pageSize: PAGE_SIZE } satisfies LibraryItemPage)

/**
 * The page, with its first fetch landed — the listing is lazy, so the mount does not
 * wait for it. Unmounted after every test: the listing is keyed async data, and a page
 * left mounted keeps the key alive for the next one.
 */
let page: VueWrapper | null = null

async function render() {
  page = await mountSuspended(LibraryPage)

  await flushPromises()

  return page
}

/** The arguments of the last `list` call: what the filter actually asked for. */
const asked = () => list.mock.lastCall

/** One control of the filter band, moved. */
async function narrow<Key extends keyof LibraryFilters>(key: Key, value: LibraryFilters[Key]) {
  page!.findComponent(AppLibraryFilters).vm.$emit(`update:${key}`, value)

  await flushPromises()
}

async function click(text: string) {
  await page!.findAll('button').find(button => button.text() === text)!.trigger('click')
  await flushPromises()
}

beforeEach(() => {
  list.mockReset()
  remove.mockReset().mockResolvedValue(undefined)
  discard.mockReset().mockResolvedValue(undefined)
  toast.mockReset()
  live.reconcile.mockReset()
  live.running = []

  if (live.settled) {
    live.settled.value = false
  }

  answered([novel()])
})

afterEach(() => {
  page?.unmount()
  page = null
})

describe('the library page', () => {
  describe('asks for', () => {
    it('the whole catalogue where nothing is narrowed', async () => {
      await render()

      expect(asked()).toEqual([undefined, undefined, undefined, undefined, undefined, PAGE_SIZE])
    })

    it('one type once the tab is picked', async () => {
      await render()
      await narrow('type', 'novel')

      expect(asked()?.[0]).toBe('novel')
    })

    it('one status and one source, together', async () => {
      await render()
      await narrow('status', 'failed')
      await narrow('sourceMode', 'crawler')

      expect(asked()?.[1]).toBe('failed')
      expect(asked()?.[2]).toBe('crawler')
    })

    it('the search term, once the typing has settled', async () => {
      vi.useFakeTimers()

      try {
        await render()
        await narrow('search', 'carto')

        expect(list).toHaveBeenCalledTimes(1)

        await vi.advanceTimersByTimeAsync(300)
        await flushPromises()

        expect(asked()?.[3]).toBe('carto')
      } finally {
        vi.useRealTimers()
      }
    })

    it('the first page again once the filter has narrowed', async () => {
      answered([novel()], true)

      await render()
      await click('Load more')

      expect(asked()?.[4]).toBe('next')

      await narrow('type', 'image')

      expect(asked()?.[4]).toBeUndefined()
    })
  })

  describe('draws', () => {
    it('how many have loaded, with a marker while more remain', async () => {
      answered([novel()], true)

      await render()

      expect(page!.text()).toContain('1+ items')
      expect(page!.findComponent(AppLibraryTable).exists()).toBe(true)
    })

    it('one match in the singular', async () => {
      await render()

      expect(page!.text()).toContain('1 item')
    })

    it('the same items as cards, once the grid is picked', async () => {
      await render()

      await page!.get('[aria-label="Grid view"]').trigger('click')

      expect(page!.findComponent(AppLibraryGrid).exists()).toBe(true)
      expect(page!.findComponent(AppLibraryTable).exists()).toBe(false)
    })

    it('an empty catalogue as an invitation to fill it', async () => {
      answered([])

      await render()

      expect(page!.text()).toContain('Nothing in the library yet')
    })

    it('a filter with no matches as a filter, not as an empty catalogue', async () => {
      answered([])

      await render()
      await narrow('type', 'video')

      expect(page!.text()).toContain('Nothing matches this filter')

      await click('Clear the filter')

      expect(asked()).toEqual([undefined, undefined, undefined, undefined, undefined, PAGE_SIZE])
    })

    it('a refused fetch as something to try again', async () => {
      list.mockRejectedValue(new Error('the network, probably'))

      await render()

      expect(page!.get('[role="alert"]').text()).toContain('Could not load the library.')

      answered([novel()])
      await click('Try again')

      expect(page!.findComponent(AppLibraryTable).exists()).toBe(true)
    })

    it('no load-more button once every match has landed', async () => {
      answered([novel()], false)

      await render()

      expect(page!.findAll('button').some(button => button.text() === 'Load more')).toBe(false)
    })

    it('a load-more button while more matches remain', async () => {
      answered([novel()], true)

      await render()

      expect(page!.findAll('button').some(button => button.text() === 'Load more')).toBe(true)
    })
  })

  describe('the live tree', () => {
    it('reads an item with a job over it as scraping, keeping its fetched counters', async () => {
      live.running = [{ id: 'job-1', libraryId: 'the-cartographer', status: 'running', range: 'all', refetch: false, completed: 3, total: 20, updatedAt: 0 }]

      await render()

      expect(page!.findComponent(AppLibraryTable).props('items')[0]!.status).toBe('scraping')
      expect(page!.text()).toContain('412 / 640 ch.')
    })

    it('refetches once a job has settled, and only then lets the overlay go', async () => {
      await render()

      expect(list).toHaveBeenCalledTimes(1)

      live.settled!.value = true
      await flushPromises()

      expect(list).toHaveBeenCalledTimes(2)
      expect(live.reconcile).toHaveBeenCalledOnce()
    })
  })

  describe('deleting an item', () => {
    it('removes the row before the cover it pointed at', async () => {
      await render()

      const item = novel()

      page!.findComponent(AppLibraryTable).vm.$emit('remove', item)
      await flushPromises()

      await page!.findComponent(AppDialog).props('action')()

      expect(remove).toHaveBeenCalledWith(item.id)
      expect(discard).toHaveBeenCalledWith(item.coverUrl)
      expect(remove.mock.invocationCallOrder[0]!).toBeLessThan(discard.mock.invocationCallOrder[0]!)
    })

    it('refetches and names what went, once the dialog says it worked', async () => {
      await render()

      page!.findComponent(AppLibraryTable).vm.$emit('remove', novel())
      await flushPromises()

      page!.findComponent(AppDialog).vm.$emit('confirmed')
      await flushPromises()

      expect(list).toHaveBeenCalledTimes(2)
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Deleted The Cartographer' }))
    })
  })
})
