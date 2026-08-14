<script setup lang="ts">
import type { LibraryItem } from '~/types/library'

/**
 * The listing as a grid of blueprint cards. The cover sets the card height, which
 * keeps a row even however long the titles run.
 *
 * The title is a real link, so the card is reachable by keyboard; the card itself
 * carries the click for the pointer, and the menu stops it.
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
  <div class="grid gap-6 grid-cols-[repeat(auto-fill,minmax(23.75rem,1fr))]">
    <template v-if="loading">
      <AppBlueprint v-for="card in SKELETON_CARDS" :key="card" class="flex items-stretch">
        <USkeleton class="w-34 aspect-3/4 flex-none" />

        <div class="flex-1 min-w-0 grid gap-2 content-start p-4">
          <USkeleton class="h-5 w-3/4" />
          <USkeleton class="h-3 w-1/2" />
          <USkeleton class="h-4 w-16" />
        </div>
      </AppBlueprint>
    </template>

    <template v-else>
      <AppBlueprint
        v-for="item in items"
        :key="item.id"
        as="article"
        class="flex items-stretch cursor-pointer hover:bg-(--color-row-hover)"
        @click="navigateTo(`/library/${item.id}`)"
      >
        <div class="relative w-34 flex-none aspect-3/4 border-r border-default">
          <AppLibraryCover :url="item.coverUrl" :title="item.title" class="size-full" />

          <!-- The outline tag needs the ground behind it to stay legible over a cover. -->
          <UBadge
            :label="typeLabel(item.type)"
            color="neutral"
            variant="outline"
            size="sm"
            class="absolute top-2 left-2 bg-default"
          />
        </div>

        <div class="flex-1 min-w-0 flex flex-col gap-1 p-4">
          <div class="flex items-start gap-2">
            <h3 class="flex-1 min-w-0 text-h5 truncate">
              <NuxtLink :to="`/library/${item.id}`" class="block text-default truncate hover:text-default">
                {{ item.title }}
              </NuxtLink>
            </h3>

            <!-- Pulled up into the padding, so the menu does not open a gap the
                 stack beside it has to carry. -->
            <div class="shrink-0 -mt-1 -me-2" @click.stop>
              <AppLibraryRowMenu :item="item" @edit="$emit('edit', item)" @remove="$emit('remove', item)" />
            </div>
          </div>

          <p v-if="itemSummary(item)" class="text-label text-muted truncate">
            {{ itemSummary(item) }}
          </p>

          <div>
            <UBadge
              :label="statusTag(item.status).label"
              :color="statusTag(item.status).color"
              :variant="statusTag(item.status).variant"
              size="sm"
            />
          </div>

          <div class="flex items-center justify-between gap-2 mt-auto text-meta text-muted">
            <span class="truncate">{{ contentLabel(item) }}</span>
            <span class="shrink-0">{{ relativeUpdated(item.updatedAt) }}</span>
          </div>

          <!-- Under the count it measures, and the last thing in the card, so a row
               of cards draws one line at the same height. -->
          <UProgress
            :model-value="progressPercent(item)"
            :ui="{ base: 'h-[3px] rounded-none', indicator: 'rounded-none' }"
          />
        </div>
      </AppBlueprint>
    </template>
  </div>
</template>
