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
  <AppBlueprint dashed class="flex-1 grid place-items-center p-8 text-center">
    <div>
      <p class="text-meta tracking-widest uppercase text-primary">
        Page slot
      </p>

      <h3 class="mt-1 mb-2">
        {{ title }}
      </h3>

      <p v-if="hint" class="max-w-sm text-support text-muted text-pretty">
        {{ hint }}
      </p>
    </div>
  </AppBlueprint>
</template>
