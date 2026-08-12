<script setup lang="ts">
import type { LibraryItemType } from '~/types/library'
import type { LibraryAsset } from '~/types/library-content'

/**
 * A set's assets, the dropzone first. A card draws what it holds — an image is
 * shown, a clip gets the wireframe plane and a play mark, since nothing here can
 * make a poster frame for it.
 */
defineProps<{
  type: LibraryItemType
  assets: LibraryAsset[]
  loading?: boolean
  uploading?: boolean
}>()

defineEmits<{
  pick: [files: FileList | null]
  remove: [asset: LibraryAsset]
}>()

const dragging = ref(false)

const picker = useTemplateRef<HTMLInputElement>('picker')

/** A couple of rows, so the skeleton fills the grid rather than dotting it. */
const SKELETON_CARDS = 7

/** So the panel's Upload button opens the same picker the dropzone card does. */
defineExpose({ pick: () => picker.value?.click() })
</script>

<template>
  <div class="grid gap-8 grid-cols-[repeat(auto-fill,minmax(11.25rem,1fr))]">
    <AppBlueprint
      as="button"
      type="button"
      dashed
      class="aspect-square grid place-items-center p-4 text-center transition-colors"
      :class="dragging ? 'bg-(--color-tint)' : ''"
      :aria-label="`Add files to this ${type === 'video' ? 'video set' : 'image set'}`"
      @click="picker?.click()"
      @dragenter.prevent="dragging = true"
      @dragover.prevent="dragging = true"
      @dragleave="dragging = false"
      @drop.prevent="dragging = false; $emit('pick', $event.dataTransfer?.files ?? null)"
    >
      <div>
        <UIcon :name="uploading ? 'i-lucide-loader-circle' : 'i-lucide-upload'" class="size-6 text-muted" :class="uploading ? 'animate-spin text-primary' : ''" />

        <p class="mt-1.5 text-support">
          {{ uploading ? 'Uploading…' : 'Drop files or browse' }}
        </p>

        <p class="text-meta text-muted">
          {{ type === 'video' ? 'MP4, WebM, MOV' : 'JPG, PNG, WebP' }} · max {{ ASSET_MAX_MB }} MB
        </p>
      </div>
    </AppBlueprint>

    <template v-if="loading">
      <USkeleton v-for="card in SKELETON_CARDS" :key="card" class="aspect-square" />
    </template>

    <AppBlueprint
      v-for="asset in assets"
      v-else
      :key="asset.id"
      as="figure"
    >
      <div class="relative aspect-square">
        <img
          v-if="asset.type === 'image' && asset.contentUrl"
          :src="asset.contentUrl"
          :alt="asset.filename"
          class="size-full object-cover"
        >

        <span v-else class="wireframe block size-full" aria-hidden="true" />

        <UIcon
          v-if="asset.type === 'video'"
          name="i-lucide-circle-play"
          class="absolute inset-0 m-auto size-8 text-muted"
        />

        <!-- The tag needs the ground behind it to stay legible over an image. -->
        <UBadge
          v-if="assetMeta(asset)"
          :label="assetMeta(asset)"
          color="neutral"
          variant="subtle"
          size="sm"
          class="absolute bottom-1.5 right-1.5 bg-default"
        />
      </div>

      <figcaption class="flex items-center gap-1.5 px-3 py-2 border-t border-default">
        <a
          v-if="asset.contentUrl"
          :href="asset.contentUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="min-w-0 flex-1 text-label text-default truncate hover:text-default"
        >{{ asset.filename }}</a>

        <span v-else class="min-w-0 flex-1 text-label text-muted truncate">{{ asset.filename }}</span>

        <UButton
          icon="i-lucide-trash-2"
          color="neutral"
          variant="ghost"
          size="xs"
          square
          :aria-label="`Delete ${asset.filename}`"
          @click="$emit('remove', asset)"
        />
      </figcaption>
    </AppBlueprint>

    <input
      ref="picker"
      type="file"
      multiple
      :accept="assetAccept(type)"
      class="sr-only"
      tabindex="-1"
      @change="$emit('pick', ($event.target as HTMLInputElement).files); picker && (picker.value = '')"
    >
  </div>
</template>
