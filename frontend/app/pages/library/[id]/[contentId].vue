<script setup lang="ts">
import type { LibraryContent, NovelChapter } from '~/types/library-content'

/**
 * One chapter, read or written. The navigator on the left is the whole novel, so
 * moving between chapters never goes back through the table.
 *
 * The body is not in Firestore — the row holds a `contentUrl` and the text is
 * fetched from Storage, which is why reading and saving each cost a second call.
 */
const FALLBACK_ERROR = 'Could not save the chapter. Try again.'

/** One page of the navigator. The rest arrives as it is scrolled. */
const PAGE_SIZE = 200

const route = useRoute()

const { libraryClient } = useApiClient()

const files = useContentFiles()

const toast = useToast()

const itemId = computed(() => String(route.params.id))

const contentId = computed(() => String(route.params.contentId))

/** The language the table sent us in, and the one a save writes. Null is the source. */
const language = computed({
  get: () => asTranslationLanguage(route.query.lang) ?? null,
  set: chosen => navigateTo({ query: { ...route.query, lang: chosen ?? undefined } })
})

const { data: item, refresh: refreshItem } = useAsyncData(() => `library-item-${itemId.value}`, () => libraryClient.get(itemId.value).then(asLibraryItem), { watch: [itemId] })

const novel = computed(() => item.value?.type === 'novel' ? item.value : null)

// Its own fetch, not the detail screen's list: that one is whatever the search box
// there narrowed it to, and the navigator has to be the whole novel.
const rows = ref<LibraryContent[]>([])

const total = ref(0)

/** How many pages have landed. The next request is always one past it. */
const loaded = ref(0)

const loadingMore = ref(false)

/** Whether the novel runs past what has been fetched. */
const more = computed(() => rows.value.length < total.value)

/** Bumped per request, so a page answered late cannot land under another novel's. */
let ticket = 0

async function fetchPage(next: number) {
  const mine = ++ticket

  loadingMore.value = true

  try {
    const answer = asLibraryContentPage(await libraryClient.listContents(itemId.value, undefined, language.value ?? undefined, undefined, undefined, next, PAGE_SIZE))

    if (mine !== ticket) {
      return
    }

    rows.value = next === 1 ? answer.items : [...rows.value, ...answer.items]
    total.value = answer.total
    loaded.value = next
  } catch {
    // The navigator is a convenience. A failure leaves it short rather than
    // taking over a screen that is showing the chapter perfectly well.
  } finally {
    loadingMore.value = false
  }
}

/** The next page, when the reader reaches the end of the last one. */
function loadMore() {
  if (loadingMore.value || !more.value) {
    return
  }

  return fetchPage(loaded.value + 1)
}

// The navigator reads in the same language as the chapter beside it.
watch([itemId, language], () => {
  loaded.value = 0

  return fetchPage(1)
}, { immediate: true })

/** Every link out of this screen keeps the language, so moving about never silently drops it. */
const linkTo = (path: string) => ({ path, query: language.value ? { lang: language.value } : {} })

const sentinel = useTemplateRef<HTMLElement>('sentinel')

useIntersectionObserver(sentinel, ([entry]) => {
  if (entry?.isIntersecting) {
    loadMore()
  }
})

// Keyed on the language as well as the row: switching language is a different
// chapter to fetch, not the same one redrawn.
const { data: chapter, status: chapterStatus, error: chapterError, refresh: refreshChapter } = useAsyncData(
  () => `library-content-${contentId.value}-${language.value ?? 'source'}`,
  () => libraryClient.getContent(itemId.value, contentId.value, language.value ?? undefined).then(row => asLibraryContent(row) as NovelChapter),
  { watch: [contentId, language] }
)

/** True where a language is selected and nothing is stored for this chapter in it. */
const missingTranslation = computed(() => !!language.value && !!chapter.value && !chapter.value.translated)

const siblings = computed(() => rows.value.filter((row): row is NovelChapter => row.type === 'novel'))

const editing = ref(false)

const title = ref('')

/** What the editor holds and a save writes. Empty while a translation is missing — see the watcher. */
const body = ref('')

/** The source text, shown for reading where no translation is stored. Never the editor's. */
const sourceBody = ref('')

const loadingBody = ref(false)

const bodyError = ref<string | null>(null)

const saving = ref(false)

const saveError = ref<string | null>(null)

const paragraphs = computed(() => paragraphsOf(missingTranslation.value ? sourceBody.value : body.value))

/** What the toolbar counts while editing: the text in the box, not the text last saved. */
const words = computed(() => editing.value ? wordCount(body.value) : chapter.value?.words ?? 0)

// Nothing is stored in this language yet, so there is nothing for the editor to
// differ from: while falling back, the only way to write one is to enter Edit.
const dirty = computed(() => !!chapter.value && !missingTranslation.value && (title.value !== chapter.value.title || wordCount(body.value) !== chapter.value.words))

// Loaded when the row lands, and again whenever the route moves to another
// chapter — the navigator changes `contentId` without remounting the page.
watch(chapter, async (loaded) => {
  if (!loaded) {
    return
  }

  // The source's title where nothing is translated yet: a translation that keeps
  // the original title is reasonable, and an empty title field is not.
  title.value = loaded.title
  body.value = ''
  sourceBody.value = ''
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
    const text = await files.readText(loaded.contentUrl)

    // The fallback's text is loaded to *read* and never to edit. An editor seeded
    // with the source and then saved would file the original as its own
    // translation, in every chapter anyone opened and saved without thinking.
    if (missingTranslation.value) {
      sourceBody.value = text
    } else {
      body.value = text
    }
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
  // Whether this write brings a translation into existence, which decides both
  // whether the coverage moved and whether there is an old object to drop.
  const creating = missingTranslation.value

  // The object this save replaces — and none where the row on screen is the
  // *source* falling back, because that object is the source's text and dropping
  // it would delete the chapter to write a translation of it.
  const replaced = creating ? null : stored.contentUrl

  let uploaded: string | null = null

  try {
    uploaded = text ? await files.uploadText(itemId.value, body.value) : null

    await libraryClient.replaceContent(itemId.value, stored.id, {
      title: named,
      index: stored.index,
      language: stored.language,
      words: wordCount(body.value),
      contentUrl: uploaded
    }, language.value ?? undefined)
  } catch (cause) {
    await files.discard(uploaded)
    saveError.value = apiMessage(cause, FALLBACK_ERROR)

    return
  } finally {
    saving.value = false
  }

  await files.discard(replaced)
  await refreshChapter()

  // A language that now covers one more chapter is a dropdown label out of date —
  // and both screens key the item on the same id, so the table behind this one
  // gets the new count with it.
  if (creating) {
    await refreshItem()
  }

  editing.value = false
  toast.add({ title: language.value ? `${languageName(language.value)} translation saved` : 'Chapter saved', icon: 'i-lucide-check', color: 'primary' })
}
</script>

<template>
  <AppPage :title="chapter?.title ?? 'Chapter'" flush no-actions>
    <template #title>
      <div class="flex items-center gap-2 min-w-0">
        <UButton
          :to="linkTo(`/library/${itemId}`)"
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
        :to="linkTo(`/library/${itemId}`)"
        label="All chapters"
        color="neutral"
        variant="ghost"
        size="xs"
      />
    </div>

    <div v-else class="flex flex-1 min-h-0 overflow-hidden">
      <!-- The navigator: the whole novel, so moving on never goes via the table. -->
      <AppResizable storage-key="chapter-nav" label="Resize the chapter list" :default-width="17.5">
        <nav class="size-full overflow-y-auto border-r border-default">
          <div class="px-6 py-3 border-b border-default">
            <UButton
              :to="linkTo(`/library/${itemId}`)"
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
            :to="linkTo(`/library/${itemId}/${sibling.id}`)"
            class="flex gap-2.5 px-6 py-2 border-b border-default text-support text-default hover:text-default hover:bg-(--color-row-hover)"
            :class="sibling.id === contentId ? 'bg-(--color-tint)' : ''"
          >
            <span class="w-6 shrink-0 text-label text-muted tabular-nums">{{ sibling.index }}</span>
            <span class="min-w-0">{{ sibling.title }}</span>
          </NuxtLink>

          <!-- The trigger and the wait are one row, so the list grows rather than jumping. -->
          <div v-if="more" ref="sentinel" class="px-6 py-2 border-b border-default">
            <USkeleton v-if="loadingMore" class="h-4 w-2/3" />
          </div>
        </nav>
      </AppResizable>

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

            <AppLibraryLanguageSelect
              v-if="novel"
              v-model="language"
              :source-language="novel.metadata.language"
              :coverage="novel.translations"
              :total="novel.metadata.discoveredCount"
            />

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

            <AppBlueprint v-if="missingTranslation && language" class="flex items-center gap-3 mb-6 p-3">
              <div class="min-w-0">
                <p class="heading text-h5">
                  No {{ languageName(language) }} translation for this chapter yet
                </p>

                <p class="text-label text-muted text-pretty">
                  Showing the source. Switch to Edit and save to write one.
                </p>
              </div>
            </AppBlueprint>

            <div v-if="chapterStatus === 'pending' || loadingBody" class="grid gap-3">
              <USkeleton
                v-for="line in 8"
                :key="line"
                class="h-4"
                :class="line % 3 === 0 ? 'w-2/3' : 'w-full'"
              />
            </div>

            <template v-else-if="editing">
              <UFormField :label="language ? `Chapter title · ${languageName(language)}` : 'Chapter title'" class="mb-4">
                <UInput v-model="title" class="w-full" />
              </UFormField>

              <UFormField :label="language ? `${languageName(language)} translation — plain text, one paragraph per line` : 'Content — plain text, one paragraph per line'">
                <UTextarea v-model="body" :rows="18" class="w-full" />
              </UFormField>

              <p class="mt-2 text-label text-muted text-pretty">
                {{ language
                  ? 'Saving uploads the translation and replaces what was stored in this language. The source chapter is left alone.'
                  : 'Saving uploads the text and replaces what was stored before. Re-crawling this chapter will discard manual changes.' }}
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
