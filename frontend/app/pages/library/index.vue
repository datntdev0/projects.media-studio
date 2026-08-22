<script setup lang="ts">
import { refDebounced } from '@vueuse/core'
import type { LibraryFilters, LibraryItem, LibraryView, ListLibraryItemsQuery } from '~/types/library'

/**
 * The catalogue. Owns the filter state, fetches a page through it, and hosts the two
 * dialogs; how an item reads is in `AppLibrary*` and `utils/library`.
 *
 * A row or a card opens the item at `/library/:id`.
 */
const PAGE_SIZE = 25

/** Long enough that typing a title does not fetch once per letter. */
const SEARCH_DEBOUNCE = 300

const { libraryClient } = useApiClient()
const covers = useCovers()
const toast = useToast()

const filters = reactive<LibraryFilters>({
  type: 'all',
  status: 'all',
  sourceMode: 'all',
  search: ''
})

const view = ref<LibraryView>('table')

const search = refDebounced(computed(() => filters.search), SEARCH_DEBOUNCE)

/** `all` is the screen's word for "do not narrow"; the request just leaves the key out. */
const query = computed<ListLibraryItemsQuery>(() => ({
  type: filters.type === 'all' ? undefined : filters.type,
  status: filters.status === 'all' ? undefined : filters.status,
  sourceMode: filters.sourceMode === 'all' ? undefined : filters.sourceMode,
  search: search.value.trim() || undefined
}))

/** The rows loaded so far. Pages are appended, so this grows as the reader scrolls. */
const rows = ref<LibraryItem[]>([])

/** The cursor each loaded page was fetched with — `cursors[0]` is always the first page's, `undefined`. */
const cursors = ref<(string | undefined)[]>([undefined])

/** What the last page answered with. Null once the reader has reached the end. */
const nextCursor = ref<string | null>(null)

/** How many pages have landed. The next request always reads `cursors` at this index. */
const loaded = ref(0)

const loading = ref(false)

const loadingMore = ref(false)

const listError = ref<Error | null>(null)

/** Whether the server holds rows nobody has asked for yet. */
const more = computed(() => nextCursor.value !== null)

/**
 * One page. The first replaces what is drawn and the rest append, so a narrowed
 * filter never lays its matches under the old one's.
 *
 * `ticket` is bumped per request: the answer to a search two letters ago must not
 * land after the answer to this one.
 */
let ticket = 0

async function fetchPage(at: number) {
  const mine = ++ticket
  const pending = at === 0 ? loading : loadingMore

  pending.value = true
  listError.value = null

  try {
    const { type, status, sourceMode, search: term } = query.value
    const answer = await libraryClient.list(type, status, sourceMode, term, cursors.value[at], PAGE_SIZE).then(asLibraryItemPage)

    if (mine !== ticket) {
      return
    }

    rows.value = at === 0 ? answer.items : [...rows.value, ...answer.items]
    cursors.value[at + 1] = answer.nextCursor ?? undefined
    nextCursor.value = answer.nextCursor
    loaded.value = at + 1
  } catch (cause) {
    if (mine === ticket) {
      listError.value = cause as Error
    }
  } finally {
    pending.value = false
  }
}

/** Back to the first page — what a narrowed filter and a saved or deleted item both mean. */
function refresh(): Promise<void> {
  loaded.value = 0
  cursors.value = [undefined]

  return fetchPage(0)
}

/** The next page, when the reader reaches the end of the last one. */
function loadMore() {
  if (loading.value || loadingMore.value || !more.value) {
    return
  }

  return fetchPage(loaded.value)
}

watch(query, () => refresh(), { immediate: true })

const { forLibrary, settled, reconcile } = useScrapingJobs()

/**
 * The fetched rows, each one scraping where a job is running over it.
 * `AppLibraryTable` and `AppLibraryGrid` read the merged rows and are unchanged.
 *
 * The counters are the fetch's: a job over chapters 1–20 knows nothing about the rest,
 * and this listing draws what the *item* holds.
 */
const items = computed(() => rows.value.map(item => withLiveStatus(item, !!forLibrary(item.id))))

/**
 * The rows already on screen, fetched again in place.
 *
 * What a settled job wants, and what `refresh()` is wrong for: that one resets to the
 * first page, so a reader who had scrolled through hundreds of items would be thrown
 * back to the first twenty-five by a job finishing in the background. The loaded pages
 * are fetched together, each with the cursor it was originally loaded under, and
 * swapped in a single assignment, so nothing blanks and nothing moves.
 */
async function reloadLoaded(): Promise<void> {
  const pages = loaded.value

  if (pages < 1) {
    return
  }

  const mine = ++ticket
  const { type, status, sourceMode, search: term } = query.value

  try {
    const answers = await Promise.all(Array.from({ length: pages }, (_, at) =>
      libraryClient.list(type, status, sourceMode, term, cursors.value[at], PAGE_SIZE).then(asLibraryItemPage)))

    if (mine !== ticket) {
      return
    }

    rows.value = answers.flatMap(answer => answer.items)
    nextCursor.value = answers[answers.length - 1]?.nextCursor ?? null
  } catch {
    // Keep what is drawn.
  }
}

/**
 * A job that has just settled, reloaded in place.
 *
 * Membership of the loaded rows is deliberately not recomputed as statuses move: an
 * item filtered to `Ready` that starts scraping keeps its place until this fires.
 */
watch(settled, async (isSettled) => {
  if (!isSettled) {
    return
  }

  await reloadLoaded()

  // Only now: until the fetched rows are in hand, the live values are the truer ones.
  reconcile()
})

/**
 * Skeleton rows only where there is nothing to draw yet.
 *
 * A reload with rows already on screen keeps them: a job settling in the background
 * would otherwise blank the table every time, and the rows it replaces them with are
 * the same rows.
 */
const showSkeleton = computed(() => loading.value && !items.value.length)

/** Whether "nothing here" means an empty catalogue or a filter with no matches. */
const narrowed = computed(() => filters.type !== 'all'
  || filters.status !== 'all'
  || filters.sourceMode !== 'all'
  || !!filters.search.trim())

const formOpen = ref(false)

const deleteOpen = ref(false)

/** Null means the form is adding rather than editing. */
const editing = ref<LibraryItem | null>(null)

const deleting = ref<LibraryItem | null>(null)

function onNew() {
  editing.value = null
  formOpen.value = true
}

function onEdit(item: LibraryItem) {
  editing.value = item
  formOpen.value = true
}

function onRemove(item: LibraryItem) {
  deleting.value = item
  deleteOpen.value = true
}

function clearFilters() {
  Object.assign(filters, { type: 'all', status: 'all', sourceMode: 'all', search: '' })
}

async function onSaved() {
  const added = !editing.value

  await refresh()

  toast.add({ title: added ? 'Item added' : 'Item saved', icon: 'i-lucide-check', color: 'primary' })
}

/**
 * The item, then the cover it pointed at — the order every delete here takes: the
 * row first, its bytes after, so a refused delete leaves an item with its cover
 * rather than one pointing at nothing.
 *
 * `discard` is quiet about a URL that is not ours, which is what makes it safe to
 * call on a cover somebody linked to rather than uploaded.
 */
async function removeItem() {
  if (deleting.value) {
    await libraryClient.remove(deleting.value.id)
    await covers.discard(deleting.value.coverUrl)
  }
}

async function onDeleted() {
  const title = deleting.value?.title

  await refresh()

  toast.add({ title: title ? `Deleted ${title}` : 'Item deleted', icon: 'i-lucide-check', color: 'primary' })
}
</script>

<template>
  <AppPage title="Library" flush>
    <template #trailing>
      <UBadge :label="`${items.length}${more ? '+' : ''} ${items.length === 1 && !more ? 'item' : 'items'}`" color="neutral" variant="outline" />
    </template>

    <template #actions>
      <!-- No count badge on Scrapings: there are no jobs to count until part 2. -->
      <UButton
        to="/scrapings"
        label="Scrapings"
        icon="i-lucide-download"
        color="neutral"
        variant="ghost"
        class="font-body font-normal"
      />

      <UButton icon="i-lucide-plus" label="New item" @click="onNew" />
    </template>

    <!--
      The mockup's two bands: a control row that spans the panel and holds still,
      over the listing, which scrolls on its own.
    -->
    <div class="flex flex-col flex-1 min-h-0">
      <div class="flex-none px-6 py-2 border-b border-default">
        <AppLibraryFilters
          v-model:type="filters.type"
          v-model:status="filters.status"
          v-model:source-mode="filters.sourceMode"
          v-model:search="filters.search"
          v-model:view="view"
          :visible="items.length"
          :more="more"
        />
      </div>

      <div class="flex flex-col gap-6 flex-1 min-h-0 overflow-y-auto p-6">
        <div v-if="listError" class="flex items-center gap-2 text-support text-error" role="alert">
          <UIcon name="i-lucide-triangle-alert" class="size-4 shrink-0" />

          Could not load the library.

          <UButton
            label="Try again"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="refresh()"
          />
        </div>

        <template v-else-if="loading || items.length">
          <AppLibraryTable
            v-if="view === 'table'"
            :items="items"
            :loading="showSkeleton"
            @edit="onEdit"
            @remove="onRemove"
          />

          <AppLibraryGrid
            v-else
            :items="items"
            :loading="showSkeleton"
            @edit="onEdit"
            @remove="onRemove"
          />

          <UButton
            v-if="more"
            label="Load more"
            color="neutral"
            variant="outline"
            :loading="loadingMore"
            class="self-center"
            @click="loadMore"
          />
        </template>

        <AppBlueprint v-else dashed class="grid place-items-center p-8 text-center">
          <div>
            <p class="text-meta tracking-widest uppercase text-primary">
              {{ narrowed ? 'No matches' : 'Empty library' }}
            </p>

            <h3 class="mt-1 mb-2">
              {{ narrowed ? 'Nothing matches this filter' : 'Nothing in the library yet' }}
            </h3>

            <p class="max-w-sm mx-auto text-support text-muted text-pretty">
              {{ narrowed
                ? 'Widen the filter, or clear it to see the whole catalogue.'
                : 'Add a novel, an image set or a video set to start the catalogue.' }}
            </p>

            <UButton
              v-if="narrowed"
              label="Clear the filter"
              color="neutral"
              variant="ghost"
              class="mt-4"
              @click="clearFilters"
            />

            <UButton
              v-else
              icon="i-lucide-plus"
              label="New item"
              class="mt-4"
              @click="onNew"
            />
          </div>
        </AppBlueprint>
      </div>
    </div>

    <AppLibraryFormDialog v-model:open="formOpen" :item="editing" @saved="onSaved" />

    <AppDialog
      v-model:open="deleteOpen"
      title="Delete item"
      confirm-label="Delete item"
      :action="removeItem"
      error-fallback="Could not delete the item. Try again."
      @confirmed="onDeleted"
    >
      <p class="text-body text-pretty">
        <strong class="heading text-h5">{{ deleting?.title }}</strong>
        and everything recorded about it are removed. This cannot be undone.
      </p>
    </AppDialog>
  </AppPage>
</template>
