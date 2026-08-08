<script setup lang="ts">
const props = defineProps<{
  collapsed?: boolean
}>()

const title = 'Media Studio'
</script>

<template>
  <UButton
    to="/"
    color="neutral"
    variant="ghost"
    :block="!props.collapsed"
    :square="props.collapsed"
    :aria-label="props.collapsed ? title : undefined"
    class="gap-2 px-3 py-2"
    :class="props.collapsed ? 'justify-center' : 'justify-start'"
  >
    <AppMark initials="MS" />

    <span
      v-if="!props.collapsed"
      class="text-sm truncate"
    >{{ title }}</span>
  </UButton>
</template>
