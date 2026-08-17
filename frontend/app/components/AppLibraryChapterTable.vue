<script setup lang="ts">
import type { NovelChapter, TranslationLanguage } from '~/types/library-content'

/**
 * A novel's chapters. The title is a link into the reader, so a row is reachable
 * by keyboard; the row carries the click for the pointer, and the checkbox and the
 * action cell stop it.
 *
 * Long lists arrive a page at a time: the last row is a sentinel, and reaching it
 * is what asks for the next page. The caller owns the fetching — this only says
 * when the reader has run out of rows.
 */
const props = defineProps<{
  itemId: string
  chapters: NovelChapter[]
  loading?: boolean
  /** True while the next page is in flight. */
  loadingMore?: boolean
  /** Whether there are rows past the ones handed over. */
  more?: boolean
  /** The language the rows are in. Null is the source, and the table is the one it has always been. */
  language?: TranslationLanguage | null
}>()

/** Carried onto every row link, so the reader opens in the language the table is in. */
const chapterLink = (chapterId: string) => ({ path: `/library/${props.itemId}/${chapterId}`, query: props.language ? { lang: props.language } : {} })

const emit = defineEmits<{
  remove: [chapter: NovelChapter]
  load: []
}>()

/** Which rows the toolbar's bulk actions are about. */
const selected = defineModel<string[]>('selected', { required: true })

/** Enough rows for the skeleton to read as a table rather than as a gap. */
const SKELETON_ROWS = 8

/** The columns between the checkbox and the action cell, so a skeleton row is as wide as a real one. */
const SKELETON_CELLS = computed(() => props.language ? 6 : 5)

const sentinel = useTemplateRef<HTMLElement>('sentinel')

// Fires again every time the row re-enters the viewport, which is what makes the
// second page and the twentieth cost the same code.
useIntersectionObserver(sentinel, ([entry]) => {
  if (entry?.isIntersecting) {
    emit('load')
  }
})

function toggle(id: string, on: boolean) {
  selected.value = on ? [...selected.value, id] : selected.value.filter(one => one !== id)
}
</script>

<template>
  <table class="w-full table-fixed border-collapse text-left">
    <thead>
      <tr class="border-b border-default">
        <th class="w-10" />

        <th class="w-16 px-2 py-2 text-meta tracking-widest uppercase font-normal text-muted">
          No.
        </th>

        <th class="px-2 py-2 text-meta tracking-widest uppercase font-normal text-muted">
          Title
        </th>

        <th v-if="language" class="w-32 px-2 py-2 text-meta tracking-widest uppercase font-normal text-muted">
          {{ languageName(language) }}
        </th>

        <th class="w-24 px-2 py-2 text-meta tracking-widest uppercase font-normal text-muted">
          Words
        </th>

        <th class="w-28 px-2 py-2 text-meta tracking-widest uppercase font-normal text-muted">
          Status
        </th>

        <th class="w-28 px-2 py-2 text-meta tracking-widest uppercase font-normal text-muted">
          Updated
        </th>

        <th class="w-20" />
      </tr>
    </thead>

    <tbody v-if="loading">
      <tr v-for="row in SKELETON_ROWS" :key="row" class="border-b border-default">
        <td />

        <td v-for="cell in SKELETON_CELLS" :key="cell" class="px-2 py-3">
          <USkeleton class="h-4 w-2/3" />
        </td>

        <td />
      </tr>
    </tbody>

    <tbody v-else>
      <tr
        v-for="chapter in chapters"
        :key="chapter.id"
        class="border-b border-default cursor-pointer hover:bg-(--color-row-hover)"
        @click="navigateTo(chapterLink(chapter.id))"
      >
        <td class="px-2 py-3" @click.stop>
          <UCheckbox
            :model-value="selected.includes(chapter.id)"
            :aria-label="`Select ${chapter.title}`"
            @update:model-value="toggle(chapter.id, $event === true)"
          />
        </td>

        <td class="px-2 py-3 text-support text-muted tabular-nums">
          {{ chapter.index }}
        </td>

        <td class="px-2 py-3">
          <NuxtLink :to="chapterLink(chapter.id)" class="block text-ui text-default truncate hover:text-default">
            {{ chapter.title }}
          </NuxtLink>

          <!-- What the chapter is called in its own language, so a translated list
               can still be matched against the source. -->
          <p v-if="chapter.sourceTitle" class="text-label text-muted truncate">
            {{ chapter.sourceTitle }}
          </p>
        </td>

        <td v-if="language" class="px-2 py-3">
          <UBadge
            :label="chapter.translated ? 'Translated' : 'Not translated'"
            :color="chapter.translated ? 'primary' : 'neutral'"
            :variant="chapter.translated ? 'subtle' : 'outline'"
            size="sm"
          />
        </td>

        <td class="px-2 py-3 text-support text-muted tabular-nums">
          {{ wordsLabel(chapter.words) }}
        </td>

        <td class="px-2 py-3">
          <UBadge
            :label="contentStatusTag(chapter.status).label"
            :color="contentStatusTag(chapter.status).color"
            :variant="contentStatusTag(chapter.status).variant"
            size="sm"
          />
        </td>

        <td class="px-2 py-3 text-label text-muted">
          {{ relativeUpdated(chapter.updatedAt) }}
        </td>

        <td class="px-2 py-3 text-right" @click.stop>
          <UButton
            icon="i-lucide-trash-2"
            color="neutral"
            variant="ghost"
            size="sm"
            square
            :aria-label="`Delete ${chapter.title}`"
            @click="$emit('remove', chapter)"
          />
        </td>
      </tr>

      <!-- The trigger and the wait are one row, so the table grows rather than jumping. -->
      <tr v-if="more" ref="sentinel" class="border-b border-default">
        <td />

        <td v-for="cell in SKELETON_CELLS" :key="cell" class="px-2 py-3">
          <USkeleton v-if="loadingMore" class="h-4 w-2/3" />
        </td>

        <td />
      </tr>
    </tbody>
  </table>
</template>
