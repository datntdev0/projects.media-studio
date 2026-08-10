<script setup lang="ts">
/**
 * An item's cover, or the wireframe plane that stands in for one until there is
 * an image to draw.
 *
 * The aspect ratio and the frame are the caller's — a table row draws a bordered
 * 3:4 book cover, a grid card a 16:9 head under one hairline — so this decides
 * only what fills the box. A cover that is there is a photograph, and photographs
 * take the accent through `.duotone`.
 */
defineProps<{
  url: string | null
  /** The item's title, so the image is announced as that item's cover. */
  title: string
}>()
</script>

<template>
  <span
    v-if="url"
    class="duotone block"
  >
    <img
      :src="url"
      :alt="`${title} — cover`"
      class="size-full object-cover"
    >
  </span>

  <span
    v-else
    class="wireframe block"
    aria-hidden="true"
  />
</template>
