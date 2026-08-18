import { UApp, UPagination, USelect, UTabs } from '#components'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, ref } from 'vue'
import AppScrapingJobCard from '~/components/AppScrapingJobCard.vue'
import AppScrapingJobPanel from '~/components/AppScrapingJobPanel.vue'
import ScrapingsPage from '~/pages/scrapings.vue'
import type { ScrapingJob, ScrapingJobPage } from '~/types/scraping-job'
import type { RunningJob } from '~/types/scraping-status'
import { ApiException } from '~/utils/api.clients'

/**
 * The jobs. What is exercised is the page's own three jobs: turning the tab and the
 * library filter into a request, drawing the listing and its panel over the answer,
 * and the controls — each of which is one request followed by a refetch of both the
 * listing and the header's count.
 */

const PAGE_SIZE = 20

const { listJobs, updateJobStatus, deleteJob, toast } = vi.hoisted(() => ({
  listJobs: vi.fn(),
  updateJobStatus: vi.fn(),
  deleteJob: vi.fn(),
  toast: vi.fn()
}))

/** The live tree, as a test sets it: the nodes it holds, and whether one has just settled. */
const live = vi.hoisted(() => ({
  /** Assigned on first use — a hoisted block runs before `ref` is there to call. */
  jobs: null as null | { value: Record<string, RunningJob> },
  settled: null as null | { value: boolean },
  reconcile: vi.fn()
}))

mockNuxtImport('useApiClient', () => () => ({
  scrapingClient: { listJobs, updateJobStatus, deleteJob }
}))

mockNuxtImport('useToast', () => () => ({ add: toast }))

mockNuxtImport('useScrapingJobs', () => () => {
  live.jobs ??= ref({})
  live.settled ??= ref(false)

  return {
    jobs: live.jobs,
    forLibrary: () => null,
    settled: computed(() => live.settled!.value),
    reconcile: live.reconcile
  }
})

function job(overrides: Partial<ScrapingJob> = {}): ScrapingJob {
  return {
    id: 'job-1',
    libraryId: 'the-cartographer',
    libraryType: 'novel',
    libraryTitle: 'The Cartographer',
    crawler: 'novelfull',
    status: 'running',
    range: 'all',
    refetch: false,
    retry: 0,
    startAt: null,
    queuedAt: '2026-08-18T08:00:00.000Z',
    completedAt: null,
    total: 640,
    completed: 412,
    failed: 0,
    skipped: 0,
    createdAt: '2026-08-18T08:00:00.000Z',
    updatedAt: '2026-08-18T09:00:00.000Z',
    tasks: [],
    ...overrides
  }
}

/**
 * What the endpoint answers. The header's count is its own one-row request for the
 * Active tab, told apart by that page size and answered with a total of its own.
 */
function answered(items: ScrapingJob[], total = items.length, activeTotal = items.length) {
  listJobs.mockImplementation((_state, _type, _id, _page, pageSize) => Promise.resolve(pageSize === 1
    ? { items: [], total: activeTotal, page: 1, pageSize: 1 } satisfies ScrapingJobPage
    : { items, total, page: 1, pageSize: PAGE_SIZE } satisfies ScrapingJobPage))
}

let page: VueWrapper | null = null

/** Inside `<UApp>`, as `app.vue` mounts it — the band's tooltips look for its provider. */
const Screen = defineComponent({ setup: () => () => h(UApp, null, { default: () => h(ScrapingsPage) }) })

/** The page, with both fetches landed — the listing is lazy, so the mount does not wait for them. */
async function render() {
  page = await mountSuspended(Screen)

  await flushPromises()

  return page
}

/** The arguments of the last listing call, the header's own one-row request skipped. */
const asked = () => listJobs.mock.calls.findLast(call => call[4] !== 1)

const cards = () => page!.findAllComponents(AppScrapingJobCard)

/** One of the control band's three, moved. Each is a model the page owns. */
async function pick(control: typeof UTabs | typeof USelect | typeof UPagination, event: string, value: unknown) {
  page!.findComponent(control).vm.$emit(event, value)

  await flushPromises()
}

async function click(text: string) {
  await page!.findAll('button').find(button => button.text() === text)!.trigger('click')
  await flushPromises()
}

const refused = (message: string) => new ApiException('the documented description', 409, JSON.stringify({ message }), {}, null)

beforeEach(() => {
  listJobs.mockReset()
  updateJobStatus.mockReset().mockResolvedValue({})
  deleteJob.mockReset().mockResolvedValue(undefined)
  toast.mockReset()
  live.reconcile.mockReset()

  if (live.jobs) {
    live.jobs.value = {}
  }

  if (live.settled) {
    live.settled.value = false
  }

  answered([job()])
})

afterEach(() => {
  page?.unmount()
  page = null
})

describe('the scrapings page', () => {
  describe('asks for', () => {
    it('the active tab, every library, on arrival', async () => {
      await render()

      expect(asked()).toEqual(['active', undefined, undefined, 1, PAGE_SIZE])
    })

    it('one row of the active tab for the header, whichever tab is open', async () => {
      answered([job()], 1, 7)

      await render()
      await pick(UTabs, 'update:modelValue', 'history')

      expect(listJobs).toHaveBeenCalledWith('active', undefined, undefined, 1, 1)
      expect(page!.text()).toContain('7 running')
    })

    it('the tab that was picked', async () => {
      await render()
      await pick(UTabs, 'update:modelValue', 'scheduled')

      expect(asked()?.[0]).toBe('scheduled')
    })

    it('one library once the filter narrows, and the first page with it', async () => {
      answered([job()], 60)

      await render()
      await pick(UPagination, 'update:page', 3)

      expect(asked()?.[3]).toBe(3)

      await pick(USelect, 'update:modelValue', 'video')

      expect(asked()?.[1]).toBe('video')
      expect(asked()?.[3]).toBe(1)
    })
  })

  describe('draws', () => {
    it('a card for every job, and the first of them in the panel', async () => {
      answered([job(), job({ id: 'job-2', libraryTitle: 'The Second' })])

      await render()

      expect(cards()).toHaveLength(2)
      expect(page!.findComponent(AppScrapingJobPanel).props('job')?.id).toBe('job-1')
    })

    it('the job that was picked in the panel instead', async () => {
      answered([job(), job({ id: 'job-2', libraryTitle: 'The Second' })])

      await render()

      await cards()[1]!.trigger('click')
      await flushPromises()

      expect(page!.findComponent(AppScrapingJobPanel).props('job')?.id).toBe('job-2')
    })

    it('an empty tab in that tab\'s own words', async () => {
      answered([])

      await render()

      expect(page!.text()).toContain('Nothing running')

      await pick(UTabs, 'update:modelValue', 'scheduled')

      expect(page!.text()).toContain('Nothing booked')
    })

    it('a library filter with no matches as a filter, not as an empty tab', async () => {
      answered([])

      await render()
      await pick(USelect, 'update:modelValue', 'image')

      expect(page!.text()).toContain('No job of that library')

      await click('All libraries')

      expect(asked()?.[1]).toBeUndefined()
    })

    it('a refused fetch as something to try again', async () => {
      listJobs.mockRejectedValue(new Error('the network, probably'))

      await render()

      expect(page!.get('[role="alert"]').text()).toContain('Could not load the jobs.')

      answered([job()])
      await click('Try again')

      expect(cards()).toHaveLength(1)
    })
  })

  describe('the live tree', () => {
    it('wears a running node\'s numbers over the fetched job', async () => {
      live.jobs!.value = { 'job-1': { id: 'job-1', status: 'paused', range: 'all', refetch: false, completed: 500, failed: 2, updatedAt: 0 } }

      await render()

      expect(cards()[0]!.props('job')).toMatchObject({ status: 'paused', completed: 500, failed: 2 })
    })

    it('refetches when work appears, and only then lets the overlay go', async () => {
      await render()

      const before = listJobs.mock.calls.length

      live.jobs!.value = { 'job-9': { id: 'job-9', status: 'running', range: 'all', refetch: false, updatedAt: 0 } }
      await flushPromises()

      expect(listJobs.mock.calls.length).toBeGreaterThan(before)
      expect(live.reconcile).toHaveBeenCalledOnce()
    })
  })

  describe('the controls over one job', () => {
    it('pauses it, then refetches the listing and the count', async () => {
      await render()

      const before = listJobs.mock.calls.length

      cards()[0]!.vm.$emit('control', 'paused')
      await flushPromises()

      expect(updateJobStatus).toHaveBeenCalledWith('job-1', { status: 'paused' })
      expect(listJobs.mock.calls.length).toBe(before + 2)
    })

    it('says why the API refused, in the API\'s words', async () => {
      updateJobStatus.mockRejectedValue(refused('That job has already finished.'))

      await render()

      cards()[0]!.vm.$emit('control', 'stopped')
      await flushPromises()

      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'That job has already finished.', color: 'error' }))
    })

    it('falls back on a refusal that says nothing', async () => {
      updateJobStatus.mockRejectedValue(new Error('the network, probably'))

      await render()

      cards()[0]!.vm.$emit('control', 'stopped')
      await flushPromises()

      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Could not change the job. Try again.' }))
    })

    it('deletes a settled one', async () => {
      answered([job({ status: 'completed', completedAt: '2026-08-18T09:00:00.000Z' })])

      await render()

      cards()[0]!.vm.$emit('remove')
      await flushPromises()

      expect(deleteJob).toHaveBeenCalledWith('job-1')
    })
  })

  describe('clearing the finished jobs', () => {
    const withSettledJobs = () => answered([
      job({ id: 'job-1', status: 'completed', completedAt: '2026-08-18T09:00:00.000Z' }),
      job({ id: 'job-2', status: 'failed', completedAt: '2026-08-18T09:00:00.000Z' }),
      job({ id: 'job-3', status: 'running' })
    ])

    it('is not offered where nothing on the page has finished', async () => {
      await render()

      const control = page!.findAll('button').find(button => button.text() === 'Clear finished')

      expect(control!.attributes('disabled')).toBeDefined()
    })

    it('deletes every settled job on the page, and leaves the running one', async () => {
      withSettledJobs()

      await render()
      await click('Clear finished')

      expect(deleteJob.mock.calls.flat()).toEqual(['job-1', 'job-2'])
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Cleared 2 jobs' }))
    })

    it('stops at the first refusal, and says how many went', async () => {
      withSettledJobs()
      deleteJob.mockResolvedValueOnce(undefined).mockRejectedValueOnce(refused('That job is gone.'))

      await render()
      await click('Clear finished')

      expect(deleteJob).toHaveBeenCalledTimes(2)
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'That job is gone.', color: 'error' }))
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Cleared 1 job' }))
    })
  })
})
