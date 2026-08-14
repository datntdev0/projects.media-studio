<script setup lang="ts">
import { refDebounced } from '@vueuse/core'
import type { LibraryFilters, LibraryItem, LibraryView, ListLibraryItemsQuery } from '~/types/library'

/**
 * The catalogue. Owns the filter state, fetches a page through it, and hosts the two
 * dialogs; how an item reads is in `AppLibrary*` and `utils/library`.
 *
 * A row or a card opens the item at `/library/:id`.
 */
const PAGE_SIZE = 20

/** Long enough that typing a title does not fetch once per letter. */
const SEARCH_DEBOUNCE = 300

const { libraryClient } = useApiClient()
const covers = useCovers()
const toast = useToast()

const filters = reactive<LibraryFilters>({
  type: 'all',
  status: 'all',
  sourceMode: 'all',
  search: '',
  page: 1
})

const view = ref<LibraryView>('table')

const search = refDebounced(computed(() => filters.search), SEARCH_DEBOUNCE)

/** `all` is the screen's word for "do not narrow"; the request just leaves the key out. */
const query = computed<ListLibraryItemsQuery>(() => ({
  type: filters.type === 'all' ? undefined : filters.type,
  status: filters.status === 'all' ? undefined : filters.status,
  sourceMode: filters.sourceMode === 'all' ? undefined : filters.sourceMode,
  search: search.value.trim() || undefined,
  page: filters.page,
  pageSize: PAGE_SIZE
}))

// Registered before the fetch below, so a narrowed filter and its reset page reach
// Firestore as one request rather than as a request for a page that is now gone.
watch(() => [filters.type, filters.status, filters.sourceMode, search.value], () => {
  filters.page = 1
})

const { data: page, status: listStatus, error: listError, refresh } = useAsyncData(
  'library',
  () => {
    const { type, status, sourceMode, search: term, page: number, pageSize } = query.value

    return libraryClient.list(type, status, sourceMode, term, number, pageSize).then(asLibraryItemPage)
  },
  { lazy: true, watch: [query] }
)

const { running, settled, reconcile } = useScrapingStatuses()

/**
 * The fetched page, with a running job's own numbers over each row it has them for.
 * `AppLibraryTable` and `AppLibraryGrid` read the merged rows and are unchanged.
 */
const items = computed(() => (page.value?.items ?? []).map(item => withLiveStatus(item, running(item.id))))

/**
 * A job that has just settled, refetched once.
 *
 * Membership of the page is deliberately not recomputed as statuses move: an item
 * filtered to `Ready` that starts scraping keeps its place until this fires. Re-running
 * the query on every tick would fight the pager and the debounced search, and a job
 * settles once.
 */
watch(settled, async (isSettled) => {
  if (!isSettled) {
    return
  }

  await refresh()

  // Only now: until the fetched rows are in hand, the live values are the truer ones.
  reconcile()
})

/** What matches the filter, which is what both counts on this screen mean. */
const total = computed(() => page.value?.total ?? 0)

const totalLabel = computed(() => `${total.value} ${total.value === 1 ? 'item' : 'items'}`)

// Deleting the last row of a page leaves that page empty while the catalogue is
// not. Step back to the last page that has something on it rather than draw the
// empty state over items that exist.
watch(page, (loaded) => {
  if (!loaded || loaded.items.length || filters.page === 1) {
    return
  }

  filters.page = Math.max(1, Math.ceil(loaded.total / PAGE_SIZE))
})

const loading = computed(() => listStatus.value === 'pending')

/**
 * Skeleton rows only where there is nothing to draw yet.
 *
 * A refetch with rows already on screen keeps them: a job settling in the background
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
  Object.assign(filters, { type: 'all', status: 'all', sourceMode: 'all', search: '', page: 1 })
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
      <UBadge :label="totalLabel" color="neutral" variant="outline" />
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
          :total="total"
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
