<script setup lang="ts">
import type { LibraryItem } from '~/types/library'

/**
 * The listing as a table. Rows are inert — see `AppLibraryRowMenu`. Widths are
 * held by `table-fixed` so the truncating columns have something to truncate
 * against.
 */
defineProps<{
  items: LibraryItem[]
  loading?: boolean
}>()

defineEmits<{
  edit: [item: LibraryItem]
  remove: [item: LibraryItem]
}>()

/** Enough rows for the skeleton to read as a table rather than as a gap. */
const SKELETON_ROWS = 6
</script>

<template>
  <table class="w-full table-fixed border-collapse text-left">
    <thead>
      <tr class="border-b border-default">
        <th class="w-[44%] px-2 py-2 text-meta tracking-widest uppercase font-normal text-muted">
          Item
        </th>

        <th class="w-[9%] px-2 py-2 text-meta tracking-widest uppercase font-normal text-muted">
          Type
        </th>

        <th class="w-[15%] px-2 py-2 text-meta tracking-widest uppercase font-normal text-muted">
          Source
        </th>

        <th class="w-[13%] px-2 py-2 text-meta tracking-widest uppercase font-normal text-muted">
          Content
        </th>

        <th class="w-[10%] px-2 py-2 text-meta tracking-widest uppercase font-normal text-muted">
          Status
        </th>

        <th class="w-[9%] px-2 py-2 text-meta tracking-widest uppercase font-normal text-muted">
          Updated
        </th>

        <th class="w-10" />
      </tr>
    </thead>

    <tbody v-if="loading">
      <tr v-for="row in SKELETON_ROWS" :key="row" class="border-b border-default">
        <td class="px-2 py-3">
          <div class="flex items-center gap-3">
            <USkeleton class="w-10 aspect-3/4 shrink-0" />

            <div class="grid gap-2 grow">
              <USkeleton class="h-4 w-2/3" />
              <USkeleton class="h-3 w-1/3" />
            </div>
          </div>
        </td>

        <td v-for="cell in 5" :key="cell" class="px-2 py-3">
          <USkeleton class="h-4 w-2/3" />
        </td>

        <td />
      </tr>
    </tbody>

    <tbody v-else>
      <tr v-for="item in items" :key="item.id" class="border-b border-default">
        <td class="px-2 py-3">
          <div class="flex items-center gap-3">
            <AppLibraryCover
              :url="item.coverUrl"
              :title="item.title"
              class="w-10 aspect-3/4 shrink-0 border border-default"
            />

            <div class="min-w-0">
              <p class="heading text-h5 truncate">
                {{ item.title }}
              </p>

              <p v-if="itemSummary(item)" class="text-label text-muted truncate">
                {{ itemSummary(item) }}
              </p>
            </div>
          </div>
        </td>

        <td class="px-2 py-3">
          <UBadge
            :label="typeLabel(item.type)"
            color="neutral"
            variant="outline"
            size="sm"
          />
        </td>

        <td class="px-2 py-3">
          <p class="text-support truncate">
            {{ item.sourceName }}
          </p>

          <p class="text-meta text-muted truncate">
            {{ displayUrl(item.sourceUrl) }}
          </p>
        </td>

        <td class="px-2 py-3 text-support">
          {{ contentLabel(item) }}
        </td>

        <td class="px-2 py-3">
          <UBadge
            :label="statusTag(item.status).label"
            :color="statusTag(item.status).color"
            :variant="statusTag(item.status).variant"
            size="sm"
          />
        </td>

        <td class="px-2 py-3 text-label text-muted">
          {{ relativeUpdated(item.updatedAt) }}
        </td>

        <td class="px-2 py-3 text-right">
          <AppLibraryRowMenu :item="item" @edit="$emit('edit', item)" @remove="$emit('remove', item)" />
        </td>
      </tr>
    </tbody>
  </table>
</template>
