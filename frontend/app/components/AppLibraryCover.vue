<script setup lang="ts">
/**
 * An item's cover, or the wireframe plane standing in for one. Aspect ratio and
 * frame are the caller's; this only decides what fills the box.
 *
 * No `.duotone` wash here — it would recolour the artwork to the accent.
 */
defineProps<{
  url: string | null
  /** The item's title, so the image is announced as that item's cover. */
  title: string
}>()
</script>

<template>
  <span v-if="url" class="block overflow-hidden">
    <img :src="url" :alt="`${title} — cover`" class="size-full object-cover">
  </span>

  <span v-else class="wireframe block" aria-hidden="true" />
</template>
