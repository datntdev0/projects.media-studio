<script setup lang="ts">
import type { LibraryItem } from '~/types/library'

/** The confirmation before a delete. Names the item, so the reader need not trust their memory of which row they opened. */
const FALLBACK_ERROR = 'Could not delete the item. Try again.'

const open = defineModel<boolean>('open', { required: true })

const props = defineProps<{
  /** The item to delete. Null while the dialog is closed. */
  item?: LibraryItem | null
}>()

const emit = defineEmits<{
  deleted: []
}>()

const library = useLibrary()

const deleting = ref(false)

const deleteError = ref<string | null>(null)

watch(open, (isOpen) => {
  if (isOpen) {
    deleteError.value = null
  }
})

async function onDelete() {
  if (!props.item) {
    return
  }

  deleteError.value = null
  deleting.value = true

  try {
    await library.remove(props.item.id)
  } catch (cause) {
    deleteError.value = apiMessage(cause, FALLBACK_ERROR)

    return
  } finally {
    deleting.value = false
  }

  open.value = false
  emit('deleted')
}
</script>

<template>
  <UModal v-model:open="open" title="Delete item" :ui="{ content: 'max-w-lg' }">
    <template #body>
      <p class="text-body text-pretty">
        <strong class="heading text-h5">{{ item?.title }}</strong>
        and everything recorded about it are removed. This cannot be undone.
      </p>

      <p v-if="deleteError" class="flex items-center gap-2 mt-4 text-support text-error" role="alert">
        <UIcon name="i-lucide-triangle-alert" class="size-4 shrink-0" />
        {{ deleteError }}
      </p>
    </template>

    <template #footer>
      <div class="flex items-center gap-2 ms-auto">
        <UButton
          label="Cancel"
          color="neutral"
          variant="ghost"
          @click="open = false"
        />

        <UButton
          label="Delete item"
          color="error"
          :loading="deleting"
          @click="onDelete"
        />
      </div>
    </template>
  </UModal>
</template>
