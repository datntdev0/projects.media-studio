<script setup lang="ts">
import type { LibraryFilters, LibraryView } from '~/types/library'

/**
 * The control band over the listing. One model per control rather than one for the
 * whole filter object, so the page owning the state is the only thing that mutates it.
 */
const type = defineModel<LibraryFilters['type']>('type', { required: true })

const status = defineModel<LibraryFilters['status']>('status', { required: true })

const sourceMode = defineModel<LibraryFilters['sourceMode']>('sourceMode', { required: true })

/** The raw box — the page debounces it before it reaches a request. */
const search = defineModel<string>('search', { required: true })

const view = defineModel<LibraryView>('view', { required: true })

defineProps<{
  /** How many are on this page, of how many match the filter. */
  visible: number
  total: number
}>()
</script>

<template>
  <div class="flex flex-wrap items-center gap-3">
    <UTabs
      :model-value="type"
      :items="LIBRARY_TYPE_TABS"
      :content="false"
      size="sm"
      @update:model-value="type = $event as LibraryFilters['type']"
    />

    <UInput
      v-model="search"
      icon="i-lucide-search"
      placeholder="Filter by title, author, source..."
      class="w-full sm:w-76"
      :ui="{ trailing: 'pe-1' }"
    >
      <template v-if="search" #trailing>
        <UButton
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          size="xs"
          aria-label="Clear the search"
          @click="search = ''"
        />
      </template>
    </UInput>

    <USelect
      v-model="status"
      :items="LIBRARY_STATUS_FILTERS"
      class="w-36"
      aria-label="Status"
    />

    <USelect
      v-model="sourceMode"
      :items="LIBRARY_SOURCE_FILTERS"
      class="w-36"
      aria-label="Source"
    />

    <div class="flex items-center gap-3 ms-auto">
      <span class="text-label text-muted whitespace-nowrap">
        {{ visible }} of {{ total }}
      </span>

      <!-- A segmented pair, framed as one object rather than two loose buttons. -->
      <div class="flex border border-default divide-x divide-default">
        <UButton
          v-for="option in LIBRARY_VIEWS"
          :key="option.value"
          :icon="option.icon"
          :color="view === option.value ? 'primary' : 'neutral'"
          :variant="view === option.value ? 'subtle' : 'ghost'"
          :aria-label="option.label"
          :aria-pressed="view === option.value"
          square
          @click="view = option.value"
        />
      </div>
    </div>
  </div>
</template>
