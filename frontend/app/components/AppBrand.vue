<script setup lang="ts">
defineProps<{
  collapsed?: boolean
}>()

const title = 'Media Studio'
</script>

<template>
  <UButton
    to="/"
    color="neutral"
    variant="ghost"
    :block="!collapsed"
    :square="collapsed"
    :aria-label="collapsed ? title : undefined"
    class="gap-2 px-3 py-2"
    :class="collapsed ? 'justify-center' : 'justify-start'"
  >
    <AppMark initials="MS" />

    <span v-if="!collapsed" class="text-sm truncate">{{ title }}</span>
  </UButton>
</template>
