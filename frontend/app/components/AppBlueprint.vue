<script setup lang="ts">
/**
 * The wireframe frame every card, figure and major section wears: square,
 * hairline-bordered, with `+` registration marks at the four corners.
 * Never drop the marks — a framed element without them is off-system.
 */
withDefaults(defineProps<{
  /** Draw the frame as a dashed outline, for empty or reserved space. */
  dashed?: boolean
  as?: string
}>(), {
  dashed: false,
  as: 'div'
})
</script>

<template>
  <component :is="as" class="blueprint" :class="{ 'blueprint--dashed': dashed }">
    <i class="corner corner-tl" aria-hidden="true" />
    <i class="corner corner-tr" aria-hidden="true" />
    <i class="corner corner-bl" aria-hidden="true" />
    <i class="corner corner-br" aria-hidden="true" />

    <slot />
  </component>
</template>
