<script setup lang="ts">
import type { NuxtError } from '#app'

defineProps<{
  error: NuxtError
}>()

useHead({
  htmlAttrs: {
    lang: 'en'
  },
  title: 'Media Studio'
})
</script>

<template>
  <UApp>
    <UError :error="error" />
  </UApp>
</template>
