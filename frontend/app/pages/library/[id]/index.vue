<script setup lang="ts">
import { refDebounced } from '@vueuse/core'
import type { ImageSetItem, LibraryItemDetail, NovelItem, VideoSetItem } from '~/types/library'
import type { LibraryAsset, LibraryContent, NovelChapter } from '~/types/library-content'
import type { ScrapingJobDto } from '~/utils/api.clients'

/**
 * One library item, and what it holds. A novel gets its metadata column beside a
 * chapters table; an image or video set gets a hero band over a grid of assets.
 *
 * The item's counters are the server's — they are refetched after every content
 * change rather than adjusted here.
 */
const PAGE_SIZE = 200

/** Long enough that typing a title does not fetch once per letter. */
const SEARCH_DEBOUNCE = 300

const route = useRoute()

const { libraryClient, scrapingClient } = useApiClient()

const covers = useCovers()

const files = useContentFiles()

const toast = useToast()

const itemId = computed(() => String(route.params.id))

const search = ref('')

const debouncedSearch = refDebounced(search, SEARCH_DEBOUNCE)

const { data: item, status: itemStatus, error: itemError, refresh: refreshItem } = useAsyncData(
  () => `library-item-${itemId.value}`,
  () => libraryClient.get(itemId.value).then(asLibraryItem),
  { watch: [itemId] }
)

/** The rows loaded so far. Pages are appended, so this grows as the reader scrolls. */
const rows = ref<LibraryContent[]>([])

/** What matches, as the server counts it — not what is drawn. */
const total = ref(0)

/** How many pages have landed. The next request is always one past it. */
const loaded = ref(0)

const loading = ref(false)

const loadingMore = ref(false)

const contentError = ref<Error | null>(null)

/** Whether the server holds rows nobody has asked for yet. */
const more = computed(() => rows.value.length < total.value)

/**
 * One page. The first replaces what is drawn and the rest append, so a new search
 * never lays its matches under the old one's.
 *
 * `ticket` is bumped per request: the answer to a search two letters ago must not
 * land after the answer to this one.
 */
let ticket = 0

async function fetchPage(next: number) {
  const mine = ++ticket
  const pending = next === 1 ? loading : loadingMore

  pending.value = true
  contentError.value = null

  try {
    const answer = asLibraryContentPage(await libraryClient.listContents(itemId.value, undefined, debouncedSearch.value.trim() || undefined, next, PAGE_SIZE))

    if (mine !== ticket) {
      return
    }

    rows.value = next === 1 ? answer.items : [...rows.value, ...answer.items]
    total.value = answer.total
    loaded.value = next
  } catch (cause) {
    if (mine === ticket) {
      contentError.value = cause as Error
    }
  } finally {
    pending.value = false
  }
}

/** Back to the first page — what a new item, a new search and a content change all mean. */
function refreshContents(): Promise<void> {
  loaded.value = 0

  return fetchPage(1)
}

/**
 * The rows already on screen, fetched again in place.
 *
 * What a settling job wants, and what `refreshContents()` is wrong for: that one resets
 * to page one, so a reader who had scrolled through a thousand rows would be thrown back
 * to the first two hundred by a job finishing in the background. The loaded pages are
 * fetched together and swapped in a single assignment, so nothing blanks and nothing
 * moves — and `loading` is deliberately left alone, since the rows are already drawn.
 *
 * Quiet about its own failure: the rows on screen are a job's worth of live updates and
 * are right in every column but `words`. An error banner over them would be worse.
 */
async function reloadLoaded(): Promise<void> {
  const pages = loaded.value

  if (pages < 1) {
    return
  }

  const mine = ++ticket

  try {
    const answers = await Promise.all(Array.from({ length: pages }, (_, at) =>
      libraryClient.listContents(itemId.value, undefined, debouncedSearch.value.trim() || undefined, at + 1, PAGE_SIZE).then(asLibraryContentPage)))

    if (mine !== ticket) {
      return
    }

    rows.value = answers.flatMap(answer => answer.items)
    total.value = answers[answers.length - 1]?.total ?? total.value
  } catch {
    // Keep what is drawn.
  }
}

/** The next page, when the reader reaches the end of the last one. */
function loadMore() {
  if (loading.value || loadingMore.value || !more.value) {
    return
  }

  return fetchPage(loaded.value + 1)
}

watch([itemId, debouncedSearch], () => refreshContents(), { immediate: true })

const { rows: liveRows, running, live, reconcile } = useItemScrapingStatus(itemId)

/** The item, wearing a running job's own counters. Null only before the first fetch lands. */
const shown = computed(() => item.value ? withLiveStatus(item.value, live.value) : null)

/**
 * The two panels want the item narrowed to its own shape. Split rather than cast:
 * `type` is what decides which half of this screen renders at all.
 */
const novel = computed(() => shown.value?.type === 'novel' ? shown.value as LibraryItemDetail & NovelItem : null)

const set = computed(() => shown.value && shown.value.type !== 'novel' ? shown.value as LibraryItemDetail & (ImageSetItem | VideoSetItem) : null)

/**
 * The loaded rows, each wearing its live status where a job has published one.
 *
 * Merged into the row rather than passed alongside it, so `AppLibraryChapterTable` and
 * `contentStatusTag()` need no idea this exists — they draw whatever `status` the row
 * now carries.
 */
const chapters = computed(() => rows.value
  .filter((row): row is NovelChapter => row.type === 'novel')
  .map((row) => {
    const live = liveRows.value[row.id]

    // The same object back where the live status agrees with the stored one, so a tick
    // that moved one chapter leaves every other row identical rather than merely equal.
    return live && live.status !== row.status ? { ...row, status: live.status } : row
  }))

const assets = computed(() => rows.value.filter((row): row is LibraryAsset => row.type !== 'novel'))

const failed = computed(() => rows.value.filter(row => row.status === 'failed').length)

/** What the scrape dialog counts against: the item's own inventory, not the filtered table's. */
const discovered = computed(() => novel.value?.metadata.discoveredCount ?? 0)

const notExtracted = computed(() => Math.max(discovered.value - (novel.value?.metadata.downloadedCount ?? 0), 0))

const selected = ref<string[]>([])

/** The panel's Upload button opens the grid's picker — there is one, not two. */
const grid = useTemplateRef<{ pick: () => void }>('grid')

const uploading = ref(false)

const discovering = ref(false)

const formOpen = ref(false)

const deleteItemOpen = ref(false)

const chapterOpen = ref(false)

const scrapeOpen = ref(false)

/** The chapter numbers a **Scrape selected** press hands the dialog. Empty for the panel's own button. */
const scrapeIndexes = ref<number[]>([])

const deleteContentOpen = ref(false)

/** Null means the chapter dialog is adding rather than renaming. */
const renaming = ref<NovelChapter | null>(null)

const deleting = ref<LibraryContent[]>([])

/** One row is named; several are counted. */
const deletingLabel = computed(() => deleting.value.length === 1 && deleting.value[0]
  ? contentName(deleting.value[0])
  : `${deleting.value.length} items`)

// A row that has gone cannot stay selected — deleting three and then acting on a
// stale selection would send requests for rows that are not there.
watch(rows, (current) => {
  const alive = new Set(current.map(row => row.id))

  selected.value = selected.value.filter(id => alive.has(id))
})

function onAddChapter() {
  renaming.value = null
  chapterOpen.value = true
}

function onRemoveContent(content: LibraryContent) {
  deleting.value = [content]
  deleteContentOpen.value = true
}

function onRemoveSelected() {
  deleting.value = rows.value.filter(row => selected.value.includes(row.id))
  deleteContentOpen.value = true
}

/** Both halves move together: the rows changed, and so did the item's counters. */
async function refreshAll() {
  await Promise.all([refreshContents(), refreshItem()])
}

/**
 * The job has settled, so the screen goes back to the API's answer.
 *
 * The single point where it does, and it has to happen: the per-row subtree is dropped
 * when a job settles, so the live statuses the table has been wearing go with it. This
 * is what replaces them with the stored rows — and collects what the tree deliberately
 * never carried, `words` and `updatedAt`.
 *
 * `reloadLoaded()` rather than `refreshAll()`, and neither half draws a skeleton: a job
 * ending in the background must not blank the screen or move what someone is reading.
 */
watch(running, async (isRunning, was) => {
  if (!was || isRunning) {
    return
  }

  await Promise.all([reloadLoaded(), refreshItem()])

  // Only now: until the stored rows are in hand, the live values are the truer ones.
  reconcile()
})

async function onContentSaved() {
  await refreshAll()

  toast.add({ title: 'Chapter saved', icon: 'i-lucide-check', color: 'primary' })
}

async function onContentDeleted() {
  await refreshAll()

  toast.add({ title: 'Deleted', icon: 'i-lucide-check', color: 'primary' })
}

/**
 * The source's inventory, read now. Slow on a long novel, and idempotent — so a
 * request that gives up can simply be made again, and the second one appends
 * exactly what the first missed.
 */
async function onDiscover() {
  if (discovering.value) {
    return
  }

  const before = novel.value?.metadata.discoveredCount ?? 0

  discovering.value = true

  try {
    const read = asLibraryItem(await scrapingClient.discover({ libraryId: itemId.value }))
    const added = Math.max(read.metadata.discoveredCount - before, 0)

    await refreshAll()

    toast.add({ title: added ? `Found ${added} new ${contentUnit('novel', added)}` : 'No new chapters', icon: 'i-lucide-check', color: 'primary' })
  } catch (cause) {
    toast.add({ title: apiMessage(cause, 'Could not read the source.'), icon: 'i-lucide-triangle-alert', color: 'error' })
  } finally {
    discovering.value = false
  }
}

/** The panel's button describes a job over the whole novel; the table's over what is ticked. */
function onScrape(indexes: number[] = []) {
  scrapeIndexes.value = indexes
  scrapeOpen.value = true
}

function onScrapeSelected() {
  onScrape(chapters.value.filter(chapter => selected.value.includes(chapter.id)).map(chapter => chapter.index))
}

/**
 * A job has been described, and the screen follows it from here.
 *
 * The content list is deliberately left alone. Queueing's first act is to publish every
 * claimed row as **Pending** and the item as **Scraping**, so the table flips on its own
 * within a tick — reloading it would throw away the reader's place to draw the very same
 * thing, and a novel scrolled to its four hundredth chapter would snap back to its
 * second hundredth for no reason anyone could see.
 *
 * The item is still refetched, quietly: its counters are the server's, and a screen with
 * no realtime channel at all should still show the job has started.
 */
async function onJobStarted(job: ScrapingJobDto) {
  await refreshItem()

  if (!job.total) {
    toast.add({ title: 'Nothing to scrape', icon: 'i-lucide-info', color: 'neutral' })

    return
  }

  const what = `${countLabel(job.total)} ${contentUnit('novel', job.total)}`
  const when = job.startAt ? `Scheduled for ${timeLabel(job.startAt)} · ${what}` : `Queued ${what}`

  toast.add({ title: when, icon: 'i-lucide-check', color: 'primary' })
}

async function onItemSaved() {
  await refreshItem()

  toast.add({ title: 'Item saved', icon: 'i-lucide-check', color: 'primary' })
}

async function onItemDeleted() {
  await navigateTo('/library')

  toast.add({ title: `Deleted ${item.value?.title ?? 'the item'}`, icon: 'i-lucide-check', color: 'primary' })
}

/** The item, then the cover it pointed at — the order `removeContent` below takes for a row and its bytes. */
async function removeItem() {
  await libraryClient.remove(itemId.value)
  await covers.discard(item.value?.coverUrl)
}

/**
 * One row at a time, so a partial failure leaves what it already removed removed
 * and says which one stopped it — rather than pretending nothing happened.
 */
async function removeContent() {
  for (const content of deleting.value) {
    await libraryClient.removeContent(itemId.value, content.id)
    await files.discard(content.contentUrl)
  }
}

/**
 * Each file goes to Storage first, then becomes a row — the same order the cover
 * picker saves in, and the reason a failed upload never leaves a row pointing at
 * nothing.
 */
async function onUpload(picked: FileList | null) {
  const chosen = Array.from(picked ?? [])
  const type = set.value?.type

  if (!chosen.length || !type || uploading.value) {
    return
  }

  uploading.value = true

  let added = 0

  for (const file of chosen) {
    let uploaded: string | null = null

    try {
      checkAsset(file, type)

      uploaded = await files.uploadAsset(itemId.value, file)

      await libraryClient.createContent(itemId.value, { filename: file.name, filesize: file.size, contentUrl: uploaded })
      added += 1
    } catch (cause) {
      // The row is what failed, so the object it would have pointed at goes —
      // otherwise a retry leaves the first attempt orphaned in the bucket.
      await files.discard(uploaded)

      toast.add({ title: apiMessage(cause, `Could not upload ${file.name}.`), icon: 'i-lucide-triangle-alert', color: 'error' })
    }
  }

  uploading.value = false

  await refreshAll()

  if (added) {
    toast.add({ title: `Uploaded ${added} ${contentUnit(type, added)}`, icon: 'i-lucide-check', color: 'primary' })
  }
}
</script>

<template>
  <AppPage :title="item?.title ?? 'Library'" flush>
    <template #title>
      <div class="flex items-center gap-2 min-w-0">
        <UButton
          to="/library"
          icon="i-lucide-arrow-left"
          label="Library"
          color="neutral"
          variant="ghost"
          class="font-body font-normal shrink-0"
        />

        <span class="text-dimmed">/</span>

        <span class="heading text-h4 truncate">{{ item?.title ?? '…' }}</span>
      </div>
    </template>

    <template #actions>
      <UButton
        to="/scrapings"
        label="Scrapings"
        icon="i-lucide-download"
        color="neutral"
        variant="ghost"
        class="font-body font-normal"
      />
    </template>

    <div v-if="itemError" class="flex items-center gap-2 p-6 text-support text-error" role="alert">
      <UIcon name="i-lucide-triangle-alert" class="size-4 shrink-0" />

      {{ itemError.statusCode === 404 ? 'There is no item under that id.' : 'Could not load the item.' }}

      <UButton
        to="/library"
        label="Back to the library"
        color="neutral"
        variant="ghost"
        size="xs"
      />
    </div>

    <!-- Only before the first item lands. A refetch has the whole screen already drawn,
         and blanking it to two bars because a background job settled is the flash. -->
    <div v-else-if="itemStatus === 'pending' && !item" class="grid gap-3 p-6">
      <USkeleton class="h-8 w-64" />
      <USkeleton class="h-4 w-40" />
    </div>

    <!-- ── a novel: its metadata beside its chapters ── -->
    <div v-else-if="novel" class="flex flex-1 min-h-0 overflow-hidden">
      <AppResizable storage-key="novel-panel" label="Resize the novel panel" :default-width="20">
        <AppLibraryNovelPanel
          :item="novel"
          :chapters="total"
          :discovering="discovering"
          @edit="formOpen = true"
          @remove="deleteItemOpen = true"
          @discover="onDiscover"
          @scrape="onScrape()"
        />
      </AppResizable>

      <div class="flex flex-col flex-1 min-w-0">
        <div class="flex-none flex flex-wrap items-center gap-3 px-6 py-2 border-b border-default">
          <h4 class="text-h5">
            Chapters
          </h4>

          <UBadge
            :label="String(total)"
            color="neutral"
            variant="outline"
            size="sm"
          />

          <UInput
            v-model="search"
            icon="i-lucide-search"
            placeholder="Find chapter..."
            class="w-52"
          />

          <div class="flex items-center gap-2 ms-auto">
            <template v-if="selected.length">
              <span class="text-label text-muted">{{ selected.length }} selected</span>

              <UTooltip v-if="novel.sourceMode !== 'crawler'" text="A manual item has no source to read.">
                <span class="block">
                  <UButton label="Scrape selected" size="sm" disabled />
                </span>
              </UTooltip>

              <UButton
                v-else
                label="Scrape selected"
                size="sm"
                @click="onScrapeSelected"
              />

              <UButton
                label="Delete selected"
                color="error"
                size="sm"
                @click="onRemoveSelected"
              />
            </template>

            <UTooltip :text="SCRAPING_DEFERRED">
              <span class="block">
                <UButton
                  :label="`Retry failed (${failed})`"
                  color="neutral"
                  variant="subtle"
                  size="sm"
                  disabled
                />
              </span>
            </UTooltip>

            <UButton
              icon="i-lucide-plus"
              label="Add chapter"
              color="neutral"
              variant="subtle"
              size="sm"
              @click="onAddChapter"
            />
          </div>
        </div>

        <div class="flex-1 min-h-0 overflow-y-auto">
          <p v-if="contentError" class="flex items-center gap-2 p-6 text-support text-error" role="alert">
            <UIcon name="i-lucide-triangle-alert" class="size-4 shrink-0" />
            Could not load the chapters.
          </p>

          <AppLibraryChapterTable
            v-else-if="loading || chapters.length"
            v-model:selected="selected"
            :item-id="itemId"
            :chapters="chapters"
            :loading="loading"
            :loading-more="loadingMore"
            :more="more"
            @remove="onRemoveContent"
            @load="loadMore"
          />

          <AppBlueprint v-else dashed class="grid place-items-center m-6 p-8 text-center">
            <div>
              <p class="text-meta tracking-widest uppercase text-primary">
                {{ search.trim() ? 'No matches' : 'No chapters' }}
              </p>

              <h3 class="mt-1 mb-2">
                {{ search.trim() ? 'Nothing matches that search' : 'Nothing written yet' }}
              </h3>

              <UButton
                v-if="!search.trim()"
                icon="i-lucide-plus"
                label="Add chapter"
                class="mt-2"
                @click="onAddChapter"
              />
            </div>
          </AppBlueprint>
        </div>
      </div>
    </div>

    <!-- ── a set: its stats over its assets ── -->
    <div v-else-if="set" class="flex flex-col flex-1 min-h-0 overflow-hidden">
      <AppLibraryGalleryPanel
        :item="set"
        :assets="total"
        :uploading="uploading"
        @edit="formOpen = true"
        @remove="deleteItemOpen = true"
        @upload="grid?.pick()"
      />

      <div class="flex-1 min-h-0 overflow-y-auto p-6">
        <p v-if="contentError" class="flex items-center gap-2 text-support text-error" role="alert">
          <UIcon name="i-lucide-triangle-alert" class="size-4 shrink-0" />
          Could not load the assets.
        </p>

        <AppLibraryAssetGrid
          v-else
          ref="grid"
          :type="set.type"
          :assets="assets"
          :loading="loading"
          :uploading="uploading"
          @pick="onUpload"
          @remove="onRemoveContent"
        />
      </div>
    </div>

    <AppLibraryFormDialog v-model:open="formOpen" :item="item" @saved="onItemSaved" />

    <AppDialog
      v-model:open="deleteItemOpen"
      title="Delete item"
      confirm-label="Delete item"
      :action="removeItem"
      error-fallback="Could not delete the item. Try again."
      @confirmed="onItemDeleted"
    >
      <p class="text-body text-pretty">
        <strong class="heading text-h5">{{ item?.title }}</strong>
        and everything filed under it are removed. This cannot be undone.
      </p>
    </AppDialog>

    <AppLibraryChapterDialog
      v-model:open="chapterOpen"
      :item-id="itemId"
      :chapter="renaming"
      @saved="onContentSaved"
    />

    <AppLibraryScrapeDialog
      v-model:open="scrapeOpen"
      :item-id="itemId"
      :total="discovered"
      :missing="notExtracted"
      :indexes="scrapeIndexes"
      @started="onJobStarted"
    />

    <AppDialog
      v-model:open="deleteContentOpen"
      title="Delete content"
      :confirm-label="deleting.length > 1 ? `Delete ${deleting.length}` : 'Delete'"
      :action="removeContent"
      error-fallback="Could not delete. Try again."
      @confirmed="onContentDeleted"
    >
      <p class="text-body text-pretty">
        <strong class="heading text-h5">{{ deletingLabel }}</strong>
        and the stored bytes go with it. This cannot be undone.
      </p>
    </AppDialog>
  </AppPage>
</template>
