<script setup lang="ts">
/**
 * The reserved content area of a section that has no screen yet: a dashed
 * blueprint frame naming what will be drawn in it.
 */
defineProps<{
  title: string
  hint?: string
}>()
</script>

<template>
  <AppBlueprint
    dashed
    class="page-slot"
  >
    <div>
      <p class="page-slot__kicker">
        Page slot
      </p>

      <h3 class="page-slot__title">
        {{ title }}
      </h3>

      <p
        v-if="hint"
        class="page-slot__hint"
      >
        {{ hint }}
      </p>
    </div>
  </AppBlueprint>
</template>

<style scoped>
.page-slot {
  flex: 1;
  display: grid;
  place-items: center;
  padding: var(--space-8);
  text-align: center;
}

.page-slot__kicker {
  margin: 0;
  font-size: var(--text-meta);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-accent);
}

.page-slot__title {
  margin: var(--space-1) 0 var(--space-2);
}

.page-slot__hint {
  margin: 0;
  max-width: 24rem;
  font-size: var(--text-support);
  color: var(--color-muted);
  text-wrap: pretty;
}
</style>
