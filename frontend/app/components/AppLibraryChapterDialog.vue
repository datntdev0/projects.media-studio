<script setup lang="ts">
import type { FormError } from '@nuxt/ui'
import type { TextContentDtoLanguage } from '~/utils/api.clients'
import type { NovelChapter } from '~/types/library-content'

/**
 * Adding a chapter, and renaming one. A title is all it takes: the number and the
 * language are worked out from the novel around it, and the text is written in
 * the reader.
 */
const FALLBACK_ERROR = 'Could not save the chapter. Try again.'

const open = defineModel<boolean>('open', { required: true })

const props = defineProps<{
  itemId: string
  /** The chapter to rename. Null while the dialog is adding. */
  chapter?: NovelChapter | null
  /** One past the highest chapter number stored. Only read while adding. */
  nextIndex: number
  /** The novel's own language, stamped on a placeholder chapter. Only read while adding. */
  sourceLanguage: string
}>()

const emit = defineEmits<{
  saved: []
}>()

const { libraryClient } = useApiClient()

const title = ref('')

const saving = ref(false)

const saveError = ref<string | null>(null)

const editing = computed(() => !!props.chapter)

// Refilled when the dialog opens rather than when the prop changes, so a close
// animation does not play over a form that has already been reset.
watch(open, (isOpen) => {
  if (isOpen) {
    title.value = props.chapter?.title ?? ''
    saveError.value = null
  }
})

function validate(): FormError[] {
  return title.value.trim() ? [] : [{ name: 'title', message: 'A chapter needs a title.' }]
}

async function save() {
  saveError.value = null
  saving.value = true

  try {
    // A rename is a PUT of the whole row, so everything it keeps is restated —
    // an omitted field would be a cleared one. `status` follows `contentUrl`, the
    // rule `LibraryContentDto.status` itself documents.
    if (props.chapter) {
      await libraryClient.replaceContent(props.itemId, props.chapter.id, {
        idx: props.chapter.index,
        type: 'original',
        status: props.chapter.contentUrl ? 'completed' : 'pending',
        sourceUrl: props.chapter.sourceUrl,
        textContent: {
          contentUrl: props.chapter.contentUrl,
          language: props.chapter.language as TextContentDtoLanguage,
          title: title.value.trim(),
          words: props.chapter.words
        }
      })
    } else {
      await libraryClient.createContent(props.itemId, {
        idx: props.nextIndex,
        type: 'original',
        status: 'pending',
        textContent: { contentUrl: null, language: props.sourceLanguage as TextContentDtoLanguage, title: title.value.trim(), words: 0 }
      })
    }
  } catch (cause) {
    saveError.value = apiMessage(cause, FALLBACK_ERROR)

    return
  } finally {
    saving.value = false
  }

  open.value = false
  emit('saved')
}
</script>

<template>
  <UModal v-model:open="open" :title="editing ? 'Rename chapter' : 'Add chapter'" :ui="{ content: 'max-w-lg' }">
    <template #body>
      <UForm
        id="chapter-form"
        :state="{ title }"
        :validate="validate"
        @submit="save"
      >
        <UFormField label="Chapter title" name="title" required>
          <UInput
            v-model="title"
            placeholder="Nine Bells for the Harbour"
            class="w-full"
            autofocus
          />
        </UFormField>
      </UForm>

      <p v-if="!editing" class="mt-3 text-label text-muted text-pretty">
        It is numbered one past the highest chapter stored, and starts empty — write it in the reader.
      </p>

      <p v-if="saveError" class="flex items-center gap-2 mt-4 text-support text-error" role="alert">
        <UIcon name="i-lucide-triangle-alert" class="size-4 shrink-0" />
        {{ saveError }}
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
          type="submit"
          form="chapter-form"
          :label="editing ? 'Save' : 'Add chapter'"
          :loading="saving"
        />
      </div>
    </template>
  </UModal>
</template>
