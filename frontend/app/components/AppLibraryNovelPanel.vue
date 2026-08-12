<script setup lang="ts">
import type { LibraryItemDetail, NovelItem } from '~/types/library'

/**
 * A novel's left column: what the work is, and what can be done to it.
 *
 * The scraping actions are drawn and disabled — there is no job runner yet, and a
 * control that looks live and is not would be worse than one that plainly is not.
 */
const props = defineProps<{
  item: LibraryItemDetail & NovelItem
  /** What the chapters pane counts, so both halves of the screen agree. */
  chapters: number
}>()

defineEmits<{
  edit: []
  remove: []
}>()

const facts = computed(() => [
  { label: 'Chapters', value: `${countLabel(props.chapters)} ${contentUnit('novel', props.chapters)}` },
  { label: 'Mode', value: props.item.sourceMode === 'crawler' ? 'Crawler' : 'Manual' },
  { label: 'Crawler', value: props.item.sourceMode === 'crawler' ? props.item.sourceName : '—' },
  { label: 'Language', value: props.item.metadata.language || '—' },
  { label: 'Updated', value: relativeUpdated(props.item.updatedAt) }
])
</script>

<template>
  <!-- The width is the caller's, so this fills whatever column it is given. -->
  <div class="size-full overflow-y-auto border-r border-default p-6">
    <AppBlueprint class="aspect-3/4 mb-6">
      <AppLibraryCover :url="item.coverUrl" :title="item.title" class="size-full" />
    </AppBlueprint>

    <h3 class="text-h3">
      {{ item.title }}
    </h3>

    <p class="mt-0.5 text-support text-muted">
      {{ item.metadata.author || 'No author recorded' }}
    </p>

    <div v-if="item.metadata.genres.length" class="flex flex-wrap gap-1 mt-3">
      <UBadge
        v-for="genre in item.metadata.genres"
        :key="genre"
        :label="genre"
        color="neutral"
        variant="subtle"
        size="sm"
      />
    </div>

    <dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 mt-4 text-support">
      <dt class="text-muted">
        Status
      </dt>

      <dd>
        <UBadge
          :label="statusTag(item.status).label"
          :color="statusTag(item.status).color"
          :variant="statusTag(item.status).variant"
          size="sm"
        />
      </dd>

      <template v-for="fact in facts" :key="fact.label">
        <dt class="text-muted">
          {{ fact.label }}
        </dt>

        <dd class="truncate">
          {{ fact.value }}
        </dd>
      </template>

      <dt class="text-muted">
        Source
      </dt>

      <dd class="break-all">
        <a
          v-if="item.sourceUrl"
          :href="item.sourceUrl"
          target="_blank"
          rel="noopener noreferrer"
        >{{ displayUrl(item.sourceUrl) }}</a>

        <span v-else>—</span>
      </dd>
    </dl>

    <div class="flex flex-col gap-2 mt-6">
      <UTooltip :text="SCRAPING_DEFERRED">
        <span class="block">
          <UButton
            icon="i-lucide-download"
            label="Scrape content…"
            block
            disabled
          />
        </span>
      </UTooltip>

      <UTooltip :text="SCRAPING_DEFERRED">
        <span class="block">
          <UButton
            icon="i-lucide-refresh-cw"
            label="Discover new chapters"
            color="neutral"
            variant="subtle"
            block
            disabled
          />
        </span>
      </UTooltip>

      <p class="text-label text-muted text-pretty">
        Discovery only checks the source for new chapter links — it does not download content.
      </p>

      <UButton
        label="Edit metadata"
        color="neutral"
        variant="subtle"
        block
        @click="$emit('edit')"
      />

      <UButton
        label="Delete item"
        color="error"
        variant="ghost"
        block
        @click="$emit('remove')"
      />
    </div>
  </div>
</template>
