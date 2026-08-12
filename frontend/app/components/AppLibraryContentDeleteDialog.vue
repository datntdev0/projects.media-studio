<script setup lang="ts">
import type { LibraryContent } from '~/types/library-content'

/**
 * The confirmation before content goes. Names what it is about, so the reader need
 * not trust their memory of which row they opened.
 *
 * Takes a list rather than one row, because the chapters table can act on a
 * selection — and one row is a list of one.
 */
const FALLBACK_ERROR = 'Could not delete. Try again.'

const open = defineModel<boolean>('open', { required: true })

const props = defineProps<{
  itemId: string
  /** What to delete. Empty while the dialog is closed. */
  contents: LibraryContent[]
}>()

const emit = defineEmits<{
  deleted: []
}>()

const api = useLibraryContents()

const files = useContentFiles()

const deleting = ref(false)

const deleteError = ref<string | null>(null)

const subject = computed(() => props.contents.length === 1 && props.contents[0]
  ? contentName(props.contents[0])
  : `${props.contents.length} items`)

watch(open, (isOpen) => {
  if (isOpen) {
    deleteError.value = null
  }
})

async function onDelete() {
  deleteError.value = null
  deleting.value = true

  try {
    // One at a time: a partial failure should leave the rows it already removed
    // removed, and say so, rather than pretend nothing happened.
    for (const content of props.contents) {
      await api.remove(props.itemId, content.id)
      await files.discard(content.contentUrl)
    }
  } catch (cause) {
    deleteError.value = apiMessage(cause, FALLBACK_ERROR)
    emit('deleted')

    return
  } finally {
    deleting.value = false
  }

  open.value = false
  emit('deleted')
}
</script>

<template>
  <UModal v-model:open="open" title="Delete content" :ui="{ content: 'max-w-lg' }">
    <template #body>
      <p class="text-body text-pretty">
        <strong class="heading text-h5">{{ subject }}</strong>
        and the stored bytes go with it. This cannot be undone.
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
          :label="contents.length > 1 ? `Delete ${contents.length}` : 'Delete'"
          color="error"
          :loading="deleting"
          @click="onDelete"
        />
      </div>
    </template>
  </UModal>
</template>
