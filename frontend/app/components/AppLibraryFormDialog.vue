<script setup lang="ts">
import type { FormError } from '@nuxt/ui'
import type { CreateLibraryItem, LibraryItem, LibraryItemType, LibrarySourceMode, NovelStatus, WritableLibraryItemStatus } from '~/types/library'

/**
 * One dialog for both creating and editing an item.
 *
 * Not the mockup's three-step wizard: steps 2 and 3 are crawler and preview work,
 * which is part 2. What is left is one metadata form — and the `PUT` behind it
 * replaces the whole writable representation, so what the form shows is exactly
 * what the item will be.
 *
 * `type` and `sourceMode` decide the shape of the item, so both are fixed after
 * creation — the server refuses a change, and the form does not offer one.
 */
interface FormState {
  type: LibraryItemType
  sourceMode: LibrarySourceMode
  title: string
  coverUrl: string
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

/** A manual novel — the most common thing to add by hand. */
function blank(): FormState {
  return {
    type: 'novel',
    sourceMode: 'manual',
    title: '',
    coverUrl: '',
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

const editing = computed(() => !!props.item)

const isCrawler = computed(() => form.sourceMode === 'crawler')

const isNovel = computed(() => form.type === 'novel')

/** Said out loud, because saving is what moves the item out of that status. */
const runnerStatus = computed(() => props.item && RUNNER_STATUSES.includes(props.item.status) ? props.item.status : null)

// Fill the form when the dialog opens rather than when the item changes: the
// dialog stays mounted, and a half-edited form should not survive a cancel.
watch(open, (isOpen) => {
  if (!isOpen) {
    return
  }

  saveError.value = null
  Object.assign(form, props.item ? fromItem(props.item) : blank())
})

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

/**
 * Shapes only. What a crawler item needs and what a set may not carry are the
 * server's rules, and its refusals read as sentences — repeating them here would
 * be two places to keep in step.
 */
function validate(state: FormState): FormError[] {
  const errors: FormError[] = []

  if (!state.title.trim()) {
    errors.push({ name: 'title', message: 'Give the item a title.' })
  }

  if (state.sourceMode === 'crawler') {
    if (!state.sourceName.trim()) {
      errors.push({ name: 'sourceName', message: 'Name the crawler that reads this source.' })
    }

    if (!state.sourceUrl.trim()) {
      errors.push({ name: 'sourceUrl', message: 'A crawler item needs the URL to crawl.' })
    }
  }

  return errors
}

/**
 * What is sent. A manual item carries no URL and names itself `Manual` on the
 * server, and only a novel has writable metadata — an image or video set is all
 * counters, and those are the job runner's.
 */
function payload(): CreateLibraryItem {
  return {
    type: form.type,
    title: form.title.trim(),
    coverUrl: form.coverUrl.trim() || null,
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

async function onSubmit() {
  saveError.value = null
  saving.value = true

  try {
    if (props.item) {
      await library.replace(props.item.id, { ...payload(), status: form.status })
    } else {
      await library.create(payload())
    }
  } catch (cause) {
    saveError.value = apiMessage(cause, FALLBACK_ERROR)

    return
  } finally {
    saving.value = false
  }

  open.value = false
  emit('saved')
}

/** A selected card takes the accent wash; a fixed one reads as disabled. */
function cardTone(selected: boolean) {
  return [
    selected ? 'bg-(--color-tint)' : '',
    editing.value ? 'opacity-45 cursor-not-allowed' : 'cursor-pointer',
    'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-(--color-accent)'
  ]
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="editing ? 'Edit item' : 'New library item'"
    :description="editing
      ? 'Everything writable about the item. What is left blank is cleared.'
      : 'Type and source mode cannot be changed after creation.'"
    :ui="{ content: 'max-w-3xl' }"
  >
    <template #body>
      <UForm
        id="library-item-form"
        :state="form"
        :validate="validate"
        class="grid gap-6"
        @submit="onSubmit"
      >
        <UFormField
          label="Library type"
          name="type"
          :hint="editing ? 'Fixed after creation' : undefined"
        >
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

              <UIcon
                :name="choice.icon"
                class="size-5 text-primary"
              />

              <span class="block mt-2 font-heading [font-weight:var(--font-heading-weight)] text-h5">
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
                <UIcon
                  :name="choice.icon"
                  class="size-4 text-primary"
                />

                <span class="font-heading [font-weight:var(--font-heading-weight)] text-h5">
                  {{ choice.label }}
                </span>
              </span>

              <span class="block mt-1 text-label text-muted text-pretty">
                {{ choice.hint }}
              </span>
            </AppBlueprint>
          </div>
        </UFormField>

        <div class="grid gap-4 border-t border-default pt-6">
          <UFormField
            label="Title"
            name="title"
          >
            <UInput
              v-model="form.title"
              placeholder="The Silent Cartographer"
              size="lg"
              class="w-full"
            />
          </UFormField>

          <UFormField
            label="Cover URL"
            name="coverUrl"
            help="A link to an image. Left blank, the listing draws its wireframe placeholder."
          >
            <UInput
              v-model="form.coverUrl"
              placeholder="https://example.com/cover.jpg"
              class="w-full"
            />
          </UFormField>

          <div
            v-if="isCrawler"
            class="grid gap-4 sm:grid-cols-2"
          >
            <UFormField
              label="Crawler"
              name="sourceName"
              help="Free text until part 2 registers crawlers."
            >
              <UInput
                v-model="form.sourceName"
                placeholder="novelbin.crawler"
                class="w-full"
              />
            </UFormField>

            <UFormField
              label="Resource URL"
              name="sourceUrl"
            >
              <UInput
                v-model="form.sourceUrl"
                placeholder="https://novelbin.net/n/silent-cartographer"
                class="w-full"
              />
            </UFormField>
          </div>

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
              class="w-40"
            />
          </UFormField>
        </div>

        <!-- Only a novel has anything descriptive to write; a set is all counters. -->
        <div
          v-if="isNovel"
          class="grid gap-4 border-t border-default pt-6"
        >
          <p class="text-meta tracking-widest uppercase text-primary">
            Novel metadata
          </p>

          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField
              label="Novel status"
              name="novelStatus"
              help="The work's own status, as its source publishes it."
            >
              <USelect
                v-model="form.novelStatus"
                :items="NOVEL_STATUS_OPTIONS"
                class="w-full"
              />
            </UFormField>

            <UFormField
              label="Language"
              name="language"
            >
              <UInput
                v-model="form.language"
                placeholder="English"
                class="w-full"
              />
            </UFormField>
          </div>

          <UFormField
            label="Author"
            name="author"
          >
            <UInput
              v-model="form.author"
              placeholder="Nguyen Van A"
              class="w-full"
            />
          </UFormField>

          <UFormField
            label="Genres"
            name="genres"
            help="Comma separated."
          >
            <UInput
              v-model="form.genres"
              placeholder="fantasy, adventure"
              class="w-full"
            />
          </UFormField>

          <UFormField
            label="Description"
            name="description"
          >
            <UTextarea
              v-model="form.description"
              :rows="4"
              class="w-full"
            />
          </UFormField>
        </div>

        <p
          v-if="saveError"
          class="flex items-center gap-2 text-support text-error"
          role="alert"
        >
          <UIcon
            name="i-lucide-triangle-alert"
            class="size-4 shrink-0"
          />
          {{ saveError }}
        </p>
      </UForm>
    </template>

    <template #footer>
      <div class="flex items-center gap-2 ms-auto">
        <UButton
          label="Cancel"
          color="neutral"
          variant="ghost"
          @click="open = false"
        />

        <!-- Outside the form element, so it names the form it submits. -->
        <UButton
          type="submit"
          form="library-item-form"
          :label="editing ? 'Save changes' : 'Create item'"
          :loading="saving"
        />
      </div>
    </template>
  </UModal>
</template>
