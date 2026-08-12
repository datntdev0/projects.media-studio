<script setup lang="ts">
import type { ImageSetItem, LibraryItemDetail, VideoSetItem } from '~/types/library'

/**
 * A set's hero band: what it is, what it holds, and what can be done to it.
 *
 * Image and video sets share one screen — the mockup draws them identically, and
 * the only differences are in the data.
 */
const props = defineProps<{
  item: LibraryItemDetail & (ImageSetItem | VideoSetItem)
  /** What the grid counts, so both halves of the screen agree. */
  assets: number
  uploading?: boolean
}>()

defineEmits<{
  edit: []
  remove: []
  upload: []
}>()

const stats = computed(() => [
  { label: 'Assets', value: `${countLabel(props.assets)} ${contentUnit(props.item.type, props.assets)}` },
  { label: 'Mode', value: props.item.sourceMode === 'crawler' ? 'Crawler' : 'Manual upload' },
  { label: 'Crawler', value: props.item.sourceMode === 'crawler' ? props.item.sourceName : '—' },
  { label: 'Size', value: bytesLabel(props.item.metadata.downloadedSize) },
  { label: 'Updated', value: relativeUpdated(props.item.updatedAt) }
])
</script>

<template>
  <div class="flex-none flex items-start gap-8 p-6 border-b border-default">
    <AppBlueprint class="w-24 flex-none aspect-3/4">
      <AppLibraryCover :url="item.coverUrl" :title="item.title" class="size-full" />
    </AppBlueprint>

    <div class="flex-1 min-w-0">
      <h3 class="text-h3 truncate">
        {{ item.title }}
      </h3>

      <div class="mt-1">
        <UBadge
          :label="statusTag(item.status).label"
          :color="statusTag(item.status).color"
          :variant="statusTag(item.status).variant"
          size="sm"
        />
      </div>

      <dl class="flex flex-wrap gap-x-8 gap-y-3 mt-4 text-support">
        <div v-for="stat in stats" :key="stat.label">
          <dt class="text-meta tracking-widest uppercase text-muted">
            {{ stat.label }}
          </dt>

          <dd>{{ stat.value }}</dd>
        </div>
      </dl>
    </div>

    <div class="flex flex-wrap items-center justify-end gap-2">
      <UButton
        label="Edit metadata"
        color="neutral"
        variant="subtle"
        @click="$emit('edit')"
      />

      <UButton
        label="Delete item"
        color="error"
        variant="ghost"
        @click="$emit('remove')"
      />

      <UTooltip :text="SCRAPING_DEFERRED">
        <span class="block">
          <UButton
            icon="i-lucide-refresh-cw"
            label="Discover new links"
            color="neutral"
            variant="subtle"
            disabled
          />
        </span>
      </UTooltip>

      <UButton
        icon="i-lucide-upload"
        label="Upload"
        :loading="uploading"
        @click="$emit('upload')"
      />
    </div>
  </div>
</template>
