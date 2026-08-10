<script setup lang="ts">
/**
 * A lettered mark — the square brand plate in the sidebar header and the round
 * identity chip in its footer. Both are solid fields of the accent, so they
 * share one component rather than drifting apart.
 */
withDefaults(defineProps<{
  initials: string
  shape?: 'square' | 'circle'
  /** `solid` fills with the accent's deepest step, `tint` with a light wash. */
  tone?: 'solid' | 'tint'
}>(), {
  shape: 'square',
  tone: 'solid'
})
</script>

<template>
  <span
    class="grid place-items-center flex-none size-6 leading-none font-heading [font-weight:var(--font-heading-weight)]"
    :class="[
      shape === 'circle' ? 'rounded-full text-meta' : 'text-label',
      tone === 'tint'
        ? 'bg-(--color-tint-strong) text-(--color-on-tint-strong)'
        : 'bg-(--color-mark) text-(--color-on-mark)'
    ]"
    aria-hidden="true"
  >{{ initials }}</span>
</template>
