<script setup lang="ts">
import type { LibraryItem } from '~/types/library'

/**
 * The listing as a grid of blueprint cards: a 16:9 head carrying the type and
 * status tags, then the title, its summary line, and what the card is measured in.
 *
 * Cards are inert for the same reason rows are — the `…` menu is the only thing on
 * one that does anything.
 */
defineProps<{
  items: LibraryItem[]
  loading?: boolean
}>()

defineEmits<{
  edit: [item: LibraryItem]
  remove: [item: LibraryItem]
}>()

/** A couple of rows of cards, so the skeleton fills the grid rather than dotting it. */
const SKELETON_CARDS = 8
</script>

<template>
  <!-- Equal cells that reflow rather than a fixed column count — the modular grid. -->
  <div class="grid gap-8 grid-cols-[repeat(auto-fill,minmax(20rem,1fr))]">
    <template v-if="loading">
      <AppBlueprint
        v-for="card in SKELETON_CARDS"
        :key="card"
      >
        <USkeleton class="aspect-video w-full" />

        <div class="grid gap-2 p-4">
          <USkeleton class="h-5 w-3/4" />
          <USkeleton class="h-3 w-1/2" />
        </div>
      </AppBlueprint>
    </template>

    <template v-else>
      <AppBlueprint
        v-for="item in items"
        :key="item.id"
        as="article"
        class="flex flex-col"
      >
        <div class="relative">
          <AppLibraryCover
            :url="item.coverUrl"
            :title="item.title"
            class="aspect-video border-b border-default"
          />

          <!-- The outline tag needs the ground behind it to stay legible over a cover. -->
          <UBadge
            :label="typeLabel(item.type)"
            color="neutral"
            variant="outline"
            size="sm"
            class="absolute top-2 left-2 bg-default"
          />

          <UBadge
            :label="statusTag(item.status).label"
            :color="statusTag(item.status).color"
            :variant="statusTag(item.status).variant"
            size="sm"
            class="absolute bottom-2 left-2"
          />

          <div class="absolute top-2 right-2 bg-default">
            <AppLibraryRowMenu
              :item="item"
              @edit="$emit('edit', item)"
              @remove="$emit('remove', item)"
            />
          </div>
        </div>

        <div class="p-4 pt-3">
          <h3 class="text-h5 truncate">
            {{ item.title }}
          </h3>

          <p
            v-if="itemSummary(item)"
            class="mt-1 text-label text-muted truncate"
          >
            {{ itemSummary(item) }}
          </p>

          <div class="flex items-center justify-between gap-3 mt-3 text-meta text-muted">
            <span class="truncate">{{ contentLabel(item) }}</span>
            <span class="shrink-0">{{ relativeUpdated(item.updatedAt) }}</span>
          </div>
        </div>
      </AppBlueprint>
    </template>
  </div>
</template>
