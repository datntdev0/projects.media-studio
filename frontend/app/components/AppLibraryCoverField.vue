<script setup lang="ts">
/**
 * The cover picker. Picking is not uploading: the file is resized and held as a blob
 * until the item is saved, so a cancelled dialog leaves nothing in the bucket.
 *
 * `model` is the cover URL, or the preview of a picked file still waiting.
 */
const model = defineModel<string>({ required: true })

/** The picked file, for whoever saves the form to upload. */
const file = defineModel<Blob | null>('file', { required: true })

const props = withDefaults(defineProps<{
  /** The item's title, so the preview is announced as that item's cover. */
  title?: string
}>(), {
  title: 'This item'
})

const picker = useTemplateRef<HTMLInputElement>('picker')

const reading = ref(false)

const error = ref<string | null>(null)

const dragging = ref(false)

const caption = computed(() => file.value
  ? 'This image is uploaded when you save.'
  : `PNG, JPG or WebP, up to ${COVER_MAX_MB} MB.`)

function onPick() {
  picker.value?.click()
}

function onDrop(event: DragEvent) {
  dragging.value = false
  void select(event.dataTransfer?.files ?? null)
}

async function select(files: FileList | null) {
  const picked = files?.[0]

  if (!picked || reading.value) {
    return
  }

  error.value = null
  reading.value = true

  try {
    const draft = await prepareCover(picked)

    file.value = draft.blob
    model.value = draft.preview
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Could not read that image.'
  } finally {
    reading.value = false

    // Cleared so picking the same file twice still fires a change.
    if (picker.value) {
      picker.value.value = ''
    }
  }
}

function clear() {
  model.value = ''
  file.value = null
  error.value = null
}
</script>

<template>
  <div class="grid gap-2">
    <AppBlueprint
      as="button"
      type="button"
      dashed
      class="relative w-full aspect-3/4 grid place-items-center overflow-hidden transition-colors"
      :class="dragging ? 'bg-(--color-tint)' : 'bg-elevated'"
      :aria-label="model ? 'Replace the cover image' : 'Choose a cover image'"
      @click="onPick"
      @dragenter.prevent="dragging = true"
      @dragover.prevent="dragging = true"
      @dragleave="dragging = false"
      @drop.prevent="onDrop"
    >
      <AppLibraryCover
        v-if="model"
        :url="model"
        :title="props.title"
        class="absolute inset-0 size-full"
      />

      <UIcon v-if="reading" name="i-lucide-loader-circle" class="size-5 animate-spin text-primary" />

      <span v-else-if="!model" class="px-1.5 py-0.5 bg-default text-label text-muted">
        Upload cover
      </span>
    </AppBlueprint>

    <p class="text-label text-muted text-pretty">
      {{ caption }}
    </p>

    <div class="flex flex-wrap items-center gap-1">
      <UButton
        :label="model ? 'Replace' : 'Choose a file'"
        icon="i-lucide-upload"
        color="neutral"
        variant="subtle"
        size="sm"
        :loading="reading"
        @click="onPick"
      />

      <UButton
        v-if="model"
        label="Remove"
        color="neutral"
        variant="ghost"
        size="sm"
        @click="clear"
      />
    </div>

    <p v-if="error" class="flex items-start gap-2 text-label text-error" role="alert">
      <UIcon name="i-lucide-triangle-alert" class="size-4 shrink-0 mt-0.5" />

      {{ error }}
    </p>

    <input
      ref="picker"
      type="file"
      :accept="COVER_ACCEPT"
      class="sr-only"
      tabindex="-1"
      @change="select(($event.target as HTMLInputElement).files)"
    >
  </div>
</template>
