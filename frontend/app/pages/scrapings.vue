<script setup lang="ts">
import type { RequestableJobStatus, ScrapingJob, ScrapingJobFilters } from '~/types/scraping-job'

/**
 * The jobs. Owns the tab and the library filter, fetches a page through them, and
 * hosts the panel; how a job reads is in `AppScrapingJob*` and `utils/scraping-job`.
 *
 * Nothing is live yet: the screen fetches, and refetches when something is done to
 * it. That is the bargain the scrape dialog struck in part 2, and it is what makes
 * the screen reviewable before the live tree exists.
 */
const PAGE_SIZE = 20

const FALLBACK_ERROR = 'Could not change the job. Try again.'

const { scrapingClient } = useApiClient()

const toast = useToast()

const filters = reactive<ScrapingJobFilters>({
  tab: 'active',
  libraryType: 'all',
  page: 1
})

/** `all` is the screen's word for "do not narrow"; the request just leaves the key out. */
const libraryType = computed(() => filters.libraryType === 'all' ? undefined : filters.libraryType)

// Registered before the fetch below, so a narrowed filter and its reset page reach
// Firestore as one request rather than as a request for a page that is now gone.
watch(() => [filters.tab, filters.libraryType], () => {
  filters.page = 1
})

const { data: page, status: listStatus, error: listError, refresh } = useAsyncData(
  'scraping-jobs',
  () => scrapingClient.listJobs(filters.tab, libraryType.value, undefined, filters.page, PAGE_SIZE).then(asScrapingJobPage),
  { lazy: true, watch: [() => filters.tab, () => filters.libraryType, () => filters.page] }
)

/**
 * The header's count, which is the *Active* tab's total whichever tab is open — so
 * one small request of its own rather than a number that disappears on the other two.
 *
 * Unwatched: nothing on this screen moves a job yet, and watching the list would
 * refetch the count once more the moment the list landed, for the same answer.
 */
const { data: activePage, refresh: refreshActive } = useAsyncData(
  'scraping-jobs-active',
  () => scrapingClient.listJobs('active', undefined, undefined, 1, 1).then(asScrapingJobPage),
  { lazy: true }
)

const { jobs: liveJobs, settled, reconcile } = useScrapingJobs()

/** The fetched page, each card wearing its live node's numbers where there is one. */
const jobs = computed<ScrapingJob[]>(() => (page.value?.items ?? []).map(job => withLiveJob(job, liveJobs.value[job.id])))

/** Which jobs the tree currently holds — what tells this screen that work has appeared. */
const liveIds = computed(() => Object.keys(liveJobs.value).sort().join(','))

/**
 * A job started or settled elsewhere, picked up without anyone touching the screen.
 *
 * The listing is fetched rather than live, and both events change which tab a job
 * belongs on — so the set of live nodes is what asks for the refetch. The overlay above
 * keeps the figures moving in between, which is the part that has to be free.
 */
watch([liveIds, settled], async () => {
  await Promise.all([refresh(), refreshActive()])

  // Only now: until the fetched rows are in hand, the live values are the truer ones.
  reconcile()
})

const total = computed(() => page.value?.total ?? 0)

const activeJobCount = computed(() => activePage.value?.total ?? 0)

/** Null until something is picked; the first job of the page stands in until then. */
const selectedId = ref<string | null>(null)

const selected = computed(() => jobs.value.find(job => job.id === selectedId.value) ?? jobs.value[0] ?? null)

const loading = computed(() => listStatus.value === 'pending')

/**
 * Skeleton cards only where there is nothing to draw yet. A refetch with cards
 * already on screen keeps them — they are the same cards.
 */
const showSkeleton = computed(() => loading.value && !jobs.value.length)

const narrowed = computed(() => filters.libraryType !== 'all')

const EMPTY_TAB_LINES: Record<ScrapingJobFilters['tab'], { title: string, hint: string }> = {
  active: { title: 'Nothing running', hint: 'Start a scraping job from an item, and it appears here while it runs.' },
  scheduled: { title: 'Nothing booked', hint: 'A job given a start time waits here until the clock reaches it.' },
  history: { title: 'Nothing finished yet', hint: 'A job that has completed, failed or been stopped is kept here.' }
}

const empty = computed(() => EMPTY_TAB_LINES[filters.tab])

/** The job a control is in flight for, so its own buttons hold still until it lands. */
const acting = ref<string | null>(null)

/**
 * Start, pause, resume or cancel — one request, then a refetch.
 *
 * The endpoint answers with the record it wrote, but the listing is refetched rather
 * than patched: the new status may well have moved the job to another tab, which is a
 * question about the page rather than about the job.
 */
async function onControl(job: ScrapingJob, status: RequestableJobStatus) {
  acting.value = job.id

  try {
    await scrapingClient.updateJobStatus(job.id, { status })
  } catch (cause) {
    toast.add({ title: apiMessage(cause, FALLBACK_ERROR), icon: 'i-lucide-triangle-alert', color: 'error' })

    return
  } finally {
    acting.value = null
  }

  await Promise.all([refresh(), refreshActive()])
}
</script>

<template>
  <AppPage title="Scrapings" flush no-actions>
    <template #trailing>
      <UBadge :label="`${activeJobCount} running`" color="neutral" variant="outline" />
    </template>

    <!--
      The mockup's two bands: a control row that spans the panel and holds still,
      over the list and its panel, which scroll on their own.
    -->
    <div class="flex flex-col flex-1 min-h-0">
      <div class="flex flex-wrap items-center gap-3 flex-none px-6 py-2 border-b border-default">
        <UTabs
          :model-value="filters.tab"
          :items="SCRAPING_JOB_TABS"
          :content="false"
          size="sm"
          @update:model-value="filters.tab = $event as ScrapingJobFilters['tab']"
        />

        <USelect
          v-model="filters.libraryType"
          :items="SCRAPING_LIBRARY_FILTERS"
          class="w-40"
          aria-label="Library"
        />

        <div class="flex items-center gap-2 ms-auto">
          <UTooltip v-for="control in ['Pause all', 'Clear finished', 'Retry failed']" :key="control" :text="JOB_CONTROLS_DEFERRED">
            <span class="block">
              <UButton
                :label="control"
                color="neutral"
                variant="ghost"
                size="sm"
                disabled
              />
            </span>
          </UTooltip>
        </div>
      </div>

      <div class="flex flex-1 min-h-0">
        <div class="flex flex-col gap-3 flex-1 min-w-0 overflow-y-auto p-6">
          <div v-if="listError" class="flex items-center gap-2 text-support text-error" role="alert">
            <UIcon name="i-lucide-triangle-alert" class="size-4 shrink-0" />

            Could not load the jobs.

            <UButton
              label="Try again"
              color="neutral"
              variant="ghost"
              size="xs"
              @click="refresh()"
            />
          </div>

          <template v-else-if="showSkeleton">
            <USkeleton v-for="row in 4" :key="row" class="h-20 rounded-none" />
          </template>

          <template v-else-if="jobs.length">
            <AppScrapingJobCard
              v-for="job in jobs"
              :key="job.id"
              :job="job"
              :selected="selected?.id === job.id"
              :busy="acting === job.id"
              @select="selectedId = job.id"
              @control="onControl(job, $event)"
            />

            <UPagination
              v-if="total > PAGE_SIZE"
              v-model:page="filters.page"
              :total="total"
              :items-per-page="PAGE_SIZE"
              class="justify-center"
            />
          </template>

          <AppBlueprint v-else dashed class="grid place-items-center p-8 text-center">
            <div>
              <p class="text-meta tracking-widest uppercase text-primary">
                {{ narrowed ? 'No matches' : 'Nothing here' }}
              </p>

              <h3 class="mt-1 mb-2">
                {{ narrowed ? 'No job of that library' : empty.title }}
              </h3>

              <p class="max-w-sm mx-auto text-support text-muted text-pretty">
                {{ narrowed ? 'Widen the filter to see every job on this tab.' : empty.hint }}
              </p>

              <UButton
                v-if="narrowed"
                label="All libraries"
                color="neutral"
                variant="ghost"
                class="mt-4"
                @click="filters.libraryType = 'all'"
              />
            </div>
          </AppBlueprint>
        </div>

        <div class="w-95 flex-none border-s border-default overflow-y-auto">
          <AppScrapingJobPanel
            :job="selected"
            :busy="acting === selected?.id"
            @control="selected && onControl(selected, $event)"
          />
        </div>
      </div>
    </div>
  </AppPage>
</template>
