<script setup lang="ts">
import type { NovelChapter } from '~/types/library-content'

/**
 * One chapter, read or written. The navigator on the left is the whole novel, so
 * moving between chapters never goes back through the table.
 *
 * The body is not in Firestore — the row holds a `contentUrl` and the text is
 * fetched from Storage, which is why reading and saving each cost a second call.
 */
const FALLBACK_ERROR = 'Could not save the chapter. Try again.'

/** Enough to hold a whole novel's navigator; past it the list is trimmed. */
const PAGE_SIZE = 200

const route = useRoute()

const library = useLibrary()

const contents = useLibraryContents()

const files = useContentFiles()

const toast = useToast()

const itemId = computed(() => String(route.params.id))

const contentId = computed(() => String(route.params.contentId))

const { data: item } = useAsyncData(() => `library-item-${itemId.value}`, () => library.get(itemId.value), { watch: [itemId] })

// Its own key, not the detail screen's: that list is whatever the search box there
// narrowed it to, and the navigator has to be the whole novel.
const { data: page } = useAsyncData(
  () => `library-chapters-${itemId.value}`,
  () => contents.list(itemId.value, { pageSize: PAGE_SIZE }),
  { lazy: true, watch: [itemId] }
)

const { data: chapter, status: chapterStatus, error: chapterError, refresh: refreshChapter } = useAsyncData(
  () => `library-content-${contentId.value}`,
  () => contents.get(itemId.value, contentId.value) as Promise<NovelChapter>,
  { watch: [contentId] }
)

const siblings = computed(() => (page.value?.items ?? []).filter((row): row is NovelChapter => row.type === 'novel'))

const editing = ref(false)

const title = ref('')

const body = ref('')

const loadingBody = ref(false)

const bodyError = ref<string | null>(null)

const saving = ref(false)

const saveError = ref<string | null>(null)

const paragraphs = computed(() => paragraphsOf(body.value))

/** What the toolbar counts while editing: the text in the box, not the text last saved. */
const words = computed(() => editing.value ? wordCount(body.value) : chapter.value?.words ?? 0)

const dirty = computed(() => !!chapter.value && (title.value !== chapter.value.title || wordCount(body.value) !== chapter.value.words))

// Loaded when the row lands, and again whenever the route moves to another
// chapter — the navigator changes `contentId` without remounting the page.
watch(chapter, async (loaded) => {
  if (!loaded) {
    return
  }

  title.value = loaded.title
  body.value = ''
  bodyError.value = null
  saveError.value = null

  // A placeholder has nothing to read, so it opens straight into Edit rather
  // than showing an empty reading view.
  if (!loaded.contentUrl) {
    editing.value = true

    return
  }

  editing.value = false
  loadingBody.value = true

  try {
    body.value = await files.readText(loaded.contentUrl)
  } catch (cause) {
    bodyError.value = cause instanceof Error ? cause.message : 'Could not load the stored text.'
  } finally {
    loadingBody.value = false
  }
}, { immediate: true })

/**
 * Upload, then write the row, then drop what it replaced — the order the cover
 * picker saves in. A failed `PUT` discards the fresh object instead, so a failure
 * leaves nothing behind either way.
 */
async function save() {
  const stored = chapter.value

  if (!stored || saving.value) {
    return
  }

  const named = title.value.trim()

  if (!named) {
    saveError.value = 'A chapter needs a title.'

    return
  }

  saveError.value = null
  saving.value = true

  const text = body.value.trim()
  let uploaded: string | null = null

  try {
    uploaded = text ? await files.uploadText(body.value) : null

    await contents.replace(itemId.value, stored.id, {
      title: named,
      index: stored.index,
      language: stored.language,
      words: wordCount(body.value),
      contentUrl: uploaded
    })
  } catch (cause) {
    await files.discard(uploaded)
    saveError.value = apiMessage(cause, FALLBACK_ERROR)

    return
  } finally {
    saving.value = false
  }

  await files.discard(stored.contentUrl)
  await refreshChapter()

  editing.value = false
  toast.add({ title: 'Chapter saved', icon: 'i-lucide-check', color: 'primary' })
}
</script>

<template>
  <AppPage :title="chapter?.title ?? 'Chapter'" flush no-actions>
    <template #title>
      <div class="flex items-center gap-2 min-w-0">
        <UButton
          :to="`/library/${itemId}`"
          icon="i-lucide-arrow-left"
          :label="item?.title ?? 'Back'"
          color="neutral"
          variant="ghost"
          class="font-body font-normal shrink-0 max-w-56"
        />

        <span class="text-dimmed">/</span>

        <span class="heading text-h4 truncate">{{ chapter?.title ?? '…' }}</span>
      </div>
    </template>

    <div v-if="chapterError" class="flex items-center gap-2 p-6 text-support text-error" role="alert">
      <UIcon name="i-lucide-triangle-alert" class="size-4 shrink-0" />

      There is no chapter under that id.

      <UButton
        :to="`/library/${itemId}`"
        label="All chapters"
        color="neutral"
        variant="ghost"
        size="xs"
      />
    </div>

    <div v-else class="flex flex-1 min-h-0 overflow-hidden">
      <!-- The navigator: the whole novel, so moving on never goes via the table. -->
      <nav class="w-70 flex-none overflow-y-auto border-r border-default">
        <div class="px-6 py-3 border-b border-default">
          <UButton
            :to="`/library/${itemId}`"
            icon="i-lucide-arrow-left"
            label="All chapters"
            color="neutral"
            variant="ghost"
            size="sm"
            class="font-body font-normal"
          />
        </div>

        <NuxtLink
          v-for="sibling in siblings"
          :key="sibling.id"
          :to="`/library/${itemId}/${sibling.id}`"
          class="flex gap-2.5 px-6 py-2 border-b border-default text-support text-default hover:text-default hover:bg-(--color-row-hover)"
          :class="sibling.id === contentId ? 'bg-(--color-tint)' : ''"
        >
          <span class="w-6 shrink-0 text-label text-muted tabular-nums">{{ sibling.index }}</span>
          <span class="min-w-0">{{ sibling.title }}</span>
        </NuxtLink>
      </nav>

      <div class="flex flex-col flex-1 min-w-0">
        <div class="flex-none flex items-center gap-3 px-6 py-2 border-b border-default">
          <div v-if="chapter" class="min-w-0">
            <p class="text-meta tracking-widest uppercase text-muted">
              Chapter {{ chapter.index }}
            </p>

            <p class="heading text-h5 truncate">
              {{ chapter.title }}
            </p>
          </div>

          <div class="flex items-center gap-3 ms-auto">
            <span class="text-label text-muted">{{ countLabel(words) }} words</span>

            <div class="flex border border-default divide-x divide-default">
              <UButton
                label="Read"
                :color="editing ? 'neutral' : 'primary'"
                :variant="editing ? 'ghost' : 'solid'"
                size="sm"
                :disabled="!chapter?.contentUrl && !body"
                :aria-pressed="!editing"
                @click="editing = false"
              />

              <UButton
                label="Edit"
                :color="editing ? 'primary' : 'neutral'"
                :variant="editing ? 'solid' : 'ghost'"
                size="sm"
                :aria-pressed="editing"
                @click="editing = true"
              />
            </div>

            <UButton
              label="Save"
              :loading="saving"
              :disabled="!editing && !dirty"
              @click="save"
            />
          </div>
        </div>

        <div class="flex-1 min-h-0 overflow-y-auto flex justify-center px-6 py-9">
          <div class="w-full max-w-180">
            <p v-if="saveError" class="flex items-center gap-2 mb-4 text-support text-error" role="alert">
              <UIcon name="i-lucide-triangle-alert" class="size-4 shrink-0" />
              {{ saveError }}
            </p>

            <div v-if="chapterStatus === 'pending' || loadingBody" class="grid gap-3">
              <USkeleton
                v-for="line in 8"
                :key="line"
                class="h-4"
                :class="line % 3 === 0 ? 'w-2/3' : 'w-full'"
              />
            </div>

            <template v-else-if="editing">
              <UFormField label="Chapter title" class="mb-4">
                <UInput v-model="title" class="w-full" />
              </UFormField>

              <UFormField label="Content — plain text, one paragraph per line">
                <UTextarea v-model="body" :rows="18" class="w-full" />
              </UFormField>

              <p class="mt-2 text-label text-muted text-pretty">
                Saving uploads the text and replaces what was stored before. Re-crawling this chapter will discard manual changes.
              </p>
            </template>

            <template v-else>
              <p v-if="bodyError" class="flex items-center gap-2 text-support text-error" role="alert">
                <UIcon name="i-lucide-triangle-alert" class="size-4 shrink-0" />
                {{ bodyError }}
              </p>

              <div v-else-if="paragraphs.length" class="grid gap-4 text-body/relaxed">
                <p v-for="(paragraph, at) in paragraphs" :key="at" class="text-pretty">
                  {{ paragraph }}
                </p>
              </div>

              <p v-else class="text-support text-muted">
                Nothing written yet.
              </p>
            </template>
          </div>
        </div>
      </div>
    </div>
  </AppPage>
</template>
