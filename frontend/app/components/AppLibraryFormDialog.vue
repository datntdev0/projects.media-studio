<script setup lang="ts">
import type { FormError } from '@nuxt/ui'
import type { CrawlerPreview, CreateLibraryItem, LibraryItem, LibraryItemType, LibrarySourceMode, NovelStatus, WritableLibraryItemStatus } from '~/types/library'

/**
 * One dialog for both creating and editing an item.
 *
 * Creating is a three-step wizard: shape, source, then — for a crawler — a review
 * of what it found. A manual item ends at step 2. Editing is one form, because the
 * `PUT` replaces the whole writable representation.
 *
 * `type` and `sourceMode` are fixed after creation; the server refuses a change.
 */
interface FormState {
  type: LibraryItemType
  sourceMode: LibrarySourceMode
  title: string
  coverUrl: string
  /** A picked cover waiting for the save that uploads it. Null once it has a URL. */
  coverFile: Blob | null
  sourceName: string
  sourceUrl: string
  status: WritableLibraryItemStatus
  novelStatus: NovelStatus
  author: string
  language: string
  /** Comma separated in the box, an array in the request. */
  genres: string
  description: string
}

const FALLBACK_ERROR = 'Could not save the item. Try again.'

/** The statuses the job runner owns — a person's save cannot restore one. */
const RUNNER_STATUSES: string[] = ['scraping', 'failed']

const open = defineModel<boolean>('open', { required: true })

const props = defineProps<{
  /** The item to edit, or null to add one. */
  item?: LibraryItem | null
}>()

const emit = defineEmits<{
  saved: []
}>()

const library = useLibrary()

const covers = useCovers()

/** A manual novel — the most common thing to add by hand. */
function blank(): FormState {
  return {
    type: 'novel',
    sourceMode: 'manual',
    title: '',
    coverUrl: '',
    coverFile: null,
    sourceName: '',
    sourceUrl: '',
    status: 'draft',
    novelStatus: 'ongoing',
    author: '',
    language: '',
    genres: '',
    description: ''
  }
}

const form = reactive<FormState>(blank())

const saving = ref(false)

const saveError = ref<string | null>(null)

/** The id of an item this dialog created, so a retried save finishes it rather than doubling it. */
const added = ref<string | null>(null)

const step = ref(1)

/** What the crawler found, and the gate on step 3: no preview, no continuing. */
const preview = ref<CrawlerPreview | null>(null)

const validating = ref(false)

const validateError = ref<string | null>(null)

const editing = computed(() => !!props.item)

const isCrawler = computed(() => form.sourceMode === 'crawler')

const isNovel = computed(() => form.type === 'novel')

/** A manual item has nothing to review, so its wizard is one step shorter. */
const lastStep = computed(() => isCrawler.value ? 3 : 2)

const onLastStep = computed(() => editing.value || step.value === lastStep.value)

// Which sections the body draws. Editing shows the whole item at once; creating
// shows one step of it.
const showShape = computed(() => editing.value || step.value === 1)

const showSource = computed(() => !editing.value && step.value === 2 && isCrawler.value)

const showDetails = computed(() => editing.value || (step.value === 2 && !isCrawler.value))

const showReview = computed(() => !editing.value && step.value === 3)

/** Editing a crawler item still types its source in — there is no re-validation flow. */
const showSourceFields = computed(() => editing.value && isCrawler.value)

const crawlers = computed(() => crawlersFor(form.type))

const selectedCrawler = computed(() => crawlers.value.find(crawler => crawler.name === form.sourceName) ?? null)

const stepLabel = computed(() => `Step ${step.value} of ${lastStep.value}`)

const dialogTitle = computed(() => {
  if (editing.value) {
    return 'Edit item'
  }

  if (step.value === 1) {
    return 'New library item'
  }

  if (step.value === 3) {
    return 'Review before creating'
  }

  return isCrawler.value ? 'Choose a crawler and source' : 'Enter the metadata'
})

const dialogHint = computed(() => {
  if (editing.value) {
    return 'Everything writable about the item. What is left blank is cleared.'
  }

  if (step.value === 1) {
    return 'Type and source mode cannot be changed after creation.'
  }

  if (step.value === 3) {
    return 'This is what the item will be created with.'
  }

  return isCrawler.value
    ? 'The crawler reads the metadata first; content follows once part 2 runs the job.'
    : 'You will add chapters and files after the item is created.'
})

const nextLabel = computed(() => {
  if (editing.value) {
    return 'Save changes'
  }

  return onLastStep.value ? 'Create item' : 'Continue'
})

const backLabel = computed(() => editing.value || step.value === 1 ? 'Cancel' : 'Back')

/** The line under the reviewed title, from whatever the source gave us. */
const previewByline = computed(() => {
  if (!preview.value) {
    return ''
  }

  const status = NOVEL_STATUS_OPTIONS.find(option => option.value === preview.value?.status)?.label

  return [preview.value.author, preview.value.language, isNovel.value ? status : null].filter(Boolean).join(' · ')
})

/** Said out loud, because saving is what moves the item out of that status. */
const runnerStatus = computed(() => props.item && RUNNER_STATUSES.includes(props.item.status) ? props.item.status : null)

// Fill the form when the dialog opens rather than when the item changes: the
// dialog stays mounted, and a half-edited form should not survive a cancel.
watch(open, (isOpen) => {
  if (!isOpen) {
    return
  }

  saveError.value = null
  added.value = null
  step.value = 1
  clearPreview()
  Object.assign(form, props.item ? fromItem(props.item) : blank())

  if (!props.item) {
    form.sourceName = crawlers.value[0]?.name ?? ''
  }
})

// A crawler reads one type of item, so changing the type changes the shortlist —
// and anything already validated was validated against the old one.
watch(() => form.type, () => {
  if (editing.value) {
    return
  }

  form.sourceName = crawlers.value[0]?.name ?? ''
  clearPreview()
})

watch([() => form.sourceUrl, () => form.sourceName], clearPreview)

function clearPreview() {
  preview.value = null
  validateError.value = null
}

function fromItem(item: LibraryItem): FormState {
  const novel = item.type === 'novel' ? item.metadata : null

  return {
    ...blank(),
    type: item.type,
    sourceMode: item.sourceMode,
    title: item.title,
    coverUrl: item.coverUrl ?? '',
    sourceName: item.sourceName,
    sourceUrl: item.sourceUrl ?? '',
    status: item.status === 'ready' ? 'ready' : 'draft',
    novelStatus: novel?.status ?? 'ongoing',
    author: novel?.author ?? '',
    language: novel?.language ?? '',
    genres: novel?.genres.join(', ') ?? '',
    description: novel?.description ?? ''
  }
}

/** Only what the step on screen asks for — the deeper rules are the server's, and its refusals already read as sentences. */
function validate(state: FormState): FormError[] {
  const errors: FormError[] = []

  if (showSource.value) {
    if (!state.sourceUrl.trim()) {
      errors.push({ name: 'sourceUrl', message: 'Paste the URL the crawler should read.' })
    } else if (!preview.value) {
      errors.push({ name: 'sourceUrl', message: 'Validate the URL before continuing.' })
    }
  }

  if (showDetails.value && !state.title.trim()) {
    errors.push({ name: 'title', message: 'Give the item a title.' })
  }

  if (showSourceFields.value) {
    if (!state.sourceName.trim()) {
      errors.push({ name: 'sourceName', message: 'Name the crawler that reads this source.' })
    }

    if (!state.sourceUrl.trim()) {
      errors.push({ name: 'sourceUrl', message: 'A crawler item needs the URL to crawl.' })
    }
  }

  return errors
}

/** The mocked crawler read. What it finds fills the form, so the payload stays one shape. */
async function onValidate() {
  const crawler = selectedCrawler.value

  if (!crawler) {
    return
  }

  validating.value = true
  validateError.value = null

  try {
    const found = await validateCrawlerSource(crawler, form.sourceUrl)

    applyPreview(found)
    preview.value = found
  } catch (cause) {
    validateError.value = cause instanceof Error ? cause.message : 'Could not read that URL.'
  } finally {
    validating.value = false
  }
}

function applyPreview(found: CrawlerPreview) {
  form.title = found.title
  form.coverUrl = found.coverUrl ?? ''
  // A crawler cover is already a URL, so whatever was picked by hand is dropped.
  form.coverFile = null
  form.novelStatus = found.status
  form.author = found.author
  form.language = found.language
  form.genres = found.genres.join(', ')
  form.description = found.description
}

/** What is sent. A manual item carries no URL, and only a novel has writable metadata. */
function payload(coverUrl: string | null): CreateLibraryItem {
  return {
    type: form.type,
    title: form.title.trim(),
    coverUrl,
    sourceMode: form.sourceMode,
    sourceName: isCrawler.value ? form.sourceName.trim() : undefined,
    sourceUrl: isCrawler.value ? form.sourceUrl.trim() : null,
    metadata: isNovel.value
      ? {
          status: form.novelStatus,
          author: form.author.trim(),
          language: form.language.trim(),
          genres: form.genres.split(',').map(genre => genre.trim()).filter(Boolean),
          description: form.description.trim()
        }
      : undefined
  }
}

/** The footer's primary action: one step on, or the save at the end of them. */
async function onAdvance() {
  if (!onLastStep.value) {
    step.value += 1

    return
  }

  await save()
}

function onBack() {
  if (editing.value || step.value === 1) {
    open.value = false

    return
  }

  step.value -= 1
}

/**
 * The save, and the only moment anything is uploaded — a cancelled dialog still
 * leaves the bucket untouched. The replaced cover is dropped afterwards, so a
 * failed save never points the item at a deleted file.
 */
async function save() {
  saveError.value = null
  saving.value = true

  const replaced = form.coverFile ? props.item?.coverUrl : null

  try {
    if (props.item) {
      await write(props.item.id, form.status)
    } else {
      await add()
    }
  } catch (cause) {
    saveError.value = saveMessage(cause)

    return
  } finally {
    saving.value = false
  }

  await covers.discard(replaced)

  open.value = false
  emit('saved')
}

/**
 * A new item, then its cover — in that order, because a cover is filed under the
 * item it is the cover of and there is no id until the item exists.
 *
 * `added` holds that id, so a cover step that fails and is retried finishes the
 * item already made rather than making a second one.
 */
async function add() {
  const linked = form.coverUrl.trim() || null

  // Created without the cover when one is waiting to be uploaded — the URL it
  // will get does not exist yet.
  added.value ??= (await library.create(payload(form.coverFile ? null : linked))).id

  if (form.coverFile) {
    await write(added.value, form.status)
  }
}

/** The item's whole writable representation, with the picked cover uploaded first. */
async function write(id: string, status: WritableLibraryItemStatus) {
  const coverUrl = form.coverFile ? await covers.upload(id, form.coverFile) : form.coverUrl.trim() || null

  await library.replace(id, { ...payload(coverUrl), status })
}

/**
 * Storage answers with codes, so a cover failure prints the sentence `useCovers`
 * threw; an API failure carries its own under `data`.
 */
function saveMessage(cause: unknown): string {
  if (cause instanceof Error && !(cause as { data?: unknown }).data) {
    return cause.message
  }

  return apiMessage(cause, FALLBACK_ERROR)
}

/** A selected card takes the accent wash; a fixed one reads as disabled. */
function cardTone(selected: boolean, fixed = editing.value) {
  return [
    selected ? 'bg-(--color-tint)' : '',
    fixed ? 'opacity-45 cursor-not-allowed' : 'cursor-pointer',
    'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-(--color-accent)'
  ]
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="dialogTitle"
    :description="dialogHint"
    :ui="{ content: 'max-w-3xl' }"
  >
    <template #body>
      <UForm
        id="library-item-form"
        :state="form"
        :validate="validate"
        class="grid gap-6"
        @submit="onAdvance"
      >
        <!-- step 1: what the item is, and where its content comes from -->
        <template v-if="showShape">
          <UFormField label="Library type" name="type" :hint="editing ? 'Fixed after creation' : undefined">
            <div class="grid gap-4 sm:grid-cols-3">
              <AppBlueprint
                v-for="choice in LIBRARY_TYPE_CHOICES"
                :key="choice.value"
                as="label"
                class="block p-4"
                :class="cardTone(form.type === choice.value)"
              >
                <input
                  v-model="form.type"
                  type="radio"
                  name="library-type"
                  :value="choice.value"
                  :disabled="editing"
                  class="sr-only"
                >

                <UIcon :name="choice.icon" class="size-5 text-primary" />

                <span class="block mt-2 heading text-h5">
                  {{ choice.label }}
                </span>

                <span class="block text-label text-muted">
                  {{ choice.hint }}
                </span>
              </AppBlueprint>
            </div>
          </UFormField>

          <UFormField
            label="How is the content sourced?"
            name="sourceMode"
            :hint="editing ? 'Fixed after creation' : undefined"
          >
            <div class="grid gap-4 sm:grid-cols-2">
              <AppBlueprint
                v-for="choice in LIBRARY_SOURCE_CHOICES"
                :key="choice.value"
                as="label"
                class="block p-4"
                :class="cardTone(form.sourceMode === choice.value)"
              >
                <input
                  v-model="form.sourceMode"
                  type="radio"
                  name="library-source-mode"
                  :value="choice.value"
                  :disabled="editing"
                  class="sr-only"
                >

                <span class="flex items-center gap-2">
                  <UIcon :name="choice.icon" class="size-4 text-primary" />

                  <span class="heading text-h5">
                    {{ choice.label }}
                  </span>
                </span>

                <span class="block mt-1 text-label text-muted text-pretty">
                  {{ choice.hint }}
                </span>
              </AppBlueprint>
            </div>
          </UFormField>
        </template>

        <!-- step 2, crawler: which crawler, which URL, and does it read it -->
        <template v-if="showSource">
          <UFormField
            label="Crawler"
            name="sourceName"
            help="A mocked registry until part 2 registers crawlers for real."
          >
            <div class="grid gap-3 sm:grid-cols-2">
              <AppBlueprint
                v-for="crawler in crawlers"
                :key="crawler.name"
                as="label"
                class="flex items-center gap-3 p-3"
                :class="cardTone(form.sourceName === crawler.name, false)"
              >
                <input
                  v-model="form.sourceName"
                  type="radio"
                  name="library-crawler"
                  :value="crawler.name"
                  class="sr-only"
                >

                <span class="flex-1 min-w-0">
                  <span class="block text-support truncate">{{ crawler.name }}</span>

                  <span class="block text-label text-muted truncate">
                    {{ crawler.domain }} · {{ typeLabel(crawler.kind) }}
                  </span>
                </span>

                <UBadge
                  :label="crawler.healthy ? 'Healthy' : 'Degraded'"
                  color="neutral"
                  :variant="crawler.healthy ? 'subtle' : 'outline'"
                  size="sm"
                />
              </AppBlueprint>
            </div>
          </UFormField>

          <UFormField label="Resource URL" name="sourceUrl">
            <div class="flex gap-2">
              <UInput
                v-model="form.sourceUrl"
                placeholder="https://novelbin.net/n/silent-cartographer"
                class="flex-1"
              />

              <UButton
                label="Validate"
                color="neutral"
                variant="subtle"
                class="flex-none"
                :loading="validating"
                :disabled="!form.sourceUrl.trim() || !selectedCrawler"
                @click="onValidate"
              />
            </div>
          </UFormField>

          <p v-if="preview" class="flex items-center gap-2 -mt-4 text-label text-primary">
            <UIcon name="i-lucide-check" class="size-4 shrink-0" />

            URL matches {{ preview.crawler }} · {{ countLabel(preview.discoveredCount) }} {{ preview.unit }} detected
          </p>

          <p v-else-if="validateError" class="flex items-center gap-2 -mt-4 text-label text-error" role="alert">
            <UIcon name="i-lucide-triangle-alert" class="size-4 shrink-0" />

            {{ validateError }}
          </p>
        </template>

        <!-- Step 2 manual, and the whole edit form: what a person types, and the cover beside it. -->
        <div
          v-if="showDetails"
          class="flex flex-col gap-6 sm:flex-row"
          :class="editing ? 'border-t border-default pt-6' : ''"
        >
          <div class="flex-1 min-w-0 grid gap-4 content-start">
            <div class="w-full flex gap-4">
              <UFormField
                v-if="editing"
                label="Status"
                name="status"
                :help="runnerStatus
                  ? `This item is ${runnerStatus}, which only the job runner sets — saving moves it out of that.`
                  : undefined"
              >
                <USelect
                  v-model="form.status"
                  :items="WRITABLE_STATUS_OPTIONS"
                  size="lg"
                  class="w-40"
                />
              </UFormField>

              <UFormField label="Title" name="title" :ui="{ root: 'flex-1' }">
                <UInput
                  v-model="form.title"
                  placeholder="The Silent Cartographer"
                  size="lg"
                  class="w-full"
                />
              </UFormField>
            </div>

            <div v-if="showSourceFields" class="grid gap-4 sm:grid-cols-2">
              <UFormField label="Crawler" name="sourceName">
                <UInput v-model="form.sourceName" placeholder="novelbin.crawler" class="w-full" />
              </UFormField>

              <UFormField label="Resource URL" name="sourceUrl">
                <UInput
                  v-model="form.sourceUrl"
                  placeholder="https://novelbin.net/n/silent-cartographer"
                  class="w-full"
                />
              </UFormField>
            </div>

            <template v-if="isNovel">
              <UFormField label="Author" name="author">
                <UInput v-model="form.author" placeholder="Nguyen Van A" class="w-full" />
              </UFormField>

              <div class="grid gap-4 sm:grid-cols-2">
                <UFormField label="Novel status" name="novelStatus">
                  <USelect v-model="form.novelStatus" :items="NOVEL_STATUS_OPTIONS" class="w-full" />
                </UFormField>

                <UFormField label="Language" name="language">
                  <UInput v-model="form.language" placeholder="English" class="w-full" />
                </UFormField>
              </div>

              <UFormField label="Genres" name="genres">
                <UInput v-model="form.genres" placeholder="fantasy, adventure" class="w-full" />
              </UFormField>

              <UFormField label="Description" name="description">
                <UTextarea v-model="form.description" :rows="3" class="w-full" />
              </UFormField>
            </template>
          </div>

          <div class="w-full sm:w-48 flex-none">
            <UFormField label="Cover" name="coverUrl">
              <AppLibraryCoverField v-model="form.coverUrl" v-model:file="form.coverFile" :title="form.title" />
            </UFormField>
          </div>
        </div>

        <!-- step 3: what the crawler found, before anything is written -->
        <div v-if="showReview && preview" class="flex gap-6">
          <AppBlueprint class="w-36 flex-none aspect-3/4">
            <AppLibraryCover :url="preview.coverUrl" :title="preview.title" class="size-full" />
          </AppBlueprint>

          <div class="flex-1 min-w-0">
            <p class="text-meta tracking-widest uppercase text-primary">
              Fetched from {{ preview.crawler }}
            </p>

            <h4 class="mt-1">
              {{ preview.title }}
            </h4>

            <p v-if="previewByline" class="text-support text-muted">
              {{ previewByline }}
            </p>

            <div v-if="preview.genres.length" class="flex flex-wrap gap-1 mt-3">
              <UBadge
                v-for="genre in preview.genres"
                :key="genre"
                :label="genre"
                color="neutral"
                variant="subtle"
                size="sm"
              />
            </div>

            <dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 mt-4 text-support">
              <dt class="text-muted">
                Found
              </dt>

              <dd>{{ countLabel(preview.discoveredCount) }} {{ preview.unit }}</dd>

              <dt class="text-muted">
                Latest
              </dt>

              <dd class="truncate">
                {{ preview.latest }}
              </dd>

              <dt class="text-muted">
                Source
              </dt>

              <dd class="truncate">
                {{ displayUrl(form.sourceUrl) }}
              </dd>
            </dl>

            <p v-if="preview.description" class="mt-4 text-support text-muted text-pretty">
              {{ preview.description }}
            </p>

            <p class="mt-4 text-label text-muted">
              The item is created as a draft — the scraping job that pulls this content is part 2.
            </p>
          </div>
        </div>

        <p v-if="saveError" class="flex items-center gap-2 text-support text-error" role="alert">
          <UIcon name="i-lucide-triangle-alert" class="size-4 shrink-0" />
          {{ saveError }}
        </p>
      </UForm>
    </template>

    <template #footer>
      <span v-if="!editing" class="text-label text-muted">
        {{ stepLabel }}
      </span>

      <div class="flex items-center gap-2 ms-auto">
        <UButton
          :label="backLabel"
          color="neutral"
          variant="ghost"
          @click="onBack"
        />

        <!-- Outside the form element, so it names the form it submits. -->
        <UButton
          type="submit"
          form="library-item-form"
          :label="nextLabel"
          :loading="saving"
        />
      </div>
    </template>
  </UModal>
</template>
