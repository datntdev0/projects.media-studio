<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { LibraryItem } from '~/types/library'

/**
 * The `…` menu a row and a card both carry — and the only interactive element on
 * either, since the detail screen is part 3.
 */
const props = defineProps<{
  item: LibraryItem
}>()

const emit = defineEmits<{
  edit: [item: LibraryItem]
  remove: [item: LibraryItem]
}>()

// Destructive action in its own group, behind a hairline — as the account menu
// keeps "Log out" apart from the rest.
const items = computed<DropdownMenuItem[][]>(() => [[{
  label: 'Edit',
  icon: 'i-lucide-pencil',
  onSelect: () => emit('edit', props.item)
}], [{
  label: 'Delete',
  icon: 'i-lucide-trash-2',
  color: 'error',
  onSelect: () => emit('remove', props.item)
}]])
</script>

<template>
  <UDropdownMenu :items="items" :content="{ align: 'end', collisionPadding: 12 }" :ui="{ content: 'w-40' }">
    <UButton
      icon="i-lucide-ellipsis-vertical"
      color="neutral"
      variant="ghost"
      size="sm"
      square
      :aria-label="`Actions for ${item.title}`"
    />
  </UDropdownMenu>
</template>
