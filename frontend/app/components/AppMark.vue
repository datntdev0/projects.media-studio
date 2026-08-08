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
    class="mark"
    :class="[`mark--${shape}`, `mark--${tone}`]"
    aria-hidden="true"
  >{{ initials }}</span>
</template>

<style scoped>
.mark {
  display: grid;
  place-items: center;
  flex: none;
  width: calc(var(--spacing) * 6);
  height: calc(var(--spacing) * 6);
  font-family: var(--font-heading);
  font-weight: var(--font-heading-weight);
  line-height: 1;
}

.mark--square {
  font-size: var(--text-label);
}

.mark--circle {
  border-radius: 50%;
  font-size: var(--text-meta);
}

.mark--solid {
  background: var(--color-mark);
  color: var(--color-on-mark);
}

.mark--tint {
  background: var(--color-tint-strong);
  color: var(--color-on-tint-strong);
}
</style>
