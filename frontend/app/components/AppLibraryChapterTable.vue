<script setup lang="ts">
import type { NovelChapter } from '~/types/library-content'

/**
 * A novel's chapters. The title is a link into the reader, so a row is reachable
 * by keyboard; the row carries the click for the pointer, and the checkbox and the
 * action cell stop it.
 */
defineProps<{
  itemId: string
  chapters: NovelChapter[]
  loading?: boolean
}>()

defineEmits<{
  remove: [chapter: NovelChapter]
}>()

/** Which rows the toolbar's bulk actions are about. */
const selected = defineModel<string[]>('selected', { required: true })

/** Enough rows for the skeleton to read as a table rather than as a gap. */
const SKELETON_ROWS = 8

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

        <td v-for="cell in 5" :key="cell" class="px-2 py-3">
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
        @click="navigateTo(`/library/${itemId}/${chapter.id}`)"
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
          <NuxtLink :to="`/library/${itemId}/${chapter.id}`" class="block text-ui text-default truncate hover:text-default">
            {{ chapter.title }}
          </NuxtLink>
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
    </tbody>
  </table>
</template>
