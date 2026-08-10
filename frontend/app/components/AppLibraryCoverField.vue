<script setup lang="ts">
/**
 * The cover picker: the mockup's dashed plane, clicked or dropped onto.
 *
 * What it holds is still a URL — `uploadCover` mocks the upload and hands one
 * back, and a crawler-fetched cover arrives as one already. The link box below
 * is the same value typed in, kept because part 1 has no real storage behind
 * the plane and a pasted link is the only cover that outlives this machine.
 */
const model = defineModel<string>({ required: true })

const props = withDefaults(defineProps<{
  /** The item's title, so the preview is announced as that item's cover. */
  title?: string
}>(), {
  title: 'This item'
})

const picker = useTemplateRef<HTMLInputElement>('picker')

const uploading = ref(false)

const error = ref<string | null>(null)

const dragging = ref(false)

function onPick() {
  picker.value?.click()
}

function onDrop(event: DragEvent) {
  dragging.value = false
  void upload(event.dataTransfer?.files ?? null)
}

async function upload(files: FileList | null) {
  const file = files?.[0]

  if (!file || uploading.value) {
    return
  }

  error.value = null
  uploading.value = true

  try {
    model.value = await uploadCover(file)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Could not read that image.'
  } finally {
    uploading.value = false

    // Cleared so picking the same file twice still fires a change.
    if (picker.value) {
      picker.value.value = ''
    }
  }
}

function clear() {
  model.value = ''
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
      :aria-label="model ? 'Replace the cover image' : 'Upload a cover image'"
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

      <UIcon
        v-if="uploading"
        name="i-lucide-loader-circle"
        class="size-5 animate-spin text-primary"
      />

      <span
        v-else-if="!model"
        class="px-1.5 py-0.5 bg-default text-label text-muted"
      >
        Upload cover
      </span>
    </AppBlueprint>

    <p class="text-label text-muted text-pretty">
      PNG, JPG or WebP, up to {{ COVER_MAX_MB }} MB.
    </p>

    <div class="flex flex-wrap items-center gap-1">
      <UButton
        :label="model ? 'Replace' : 'Choose a file'"
        icon="i-lucide-upload"
        color="neutral"
        variant="subtle"
        size="sm"
        :loading="uploading"
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

    <p
      v-if="error"
      class="flex items-start gap-2 text-label text-error"
      role="alert"
    >
      <UIcon
        name="i-lucide-triangle-alert"
        class="size-4 shrink-0 mt-0.5"
      />

      {{ error }}
    </p>

    <input
      ref="picker"
      type="file"
      :accept="COVER_ACCEPT"
      class="sr-only"
      tabindex="-1"
      @change="upload(($event.target as HTMLInputElement).files)"
    >
  </div>
</template>
