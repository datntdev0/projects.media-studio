<script setup lang="ts">
useHead({
  htmlAttrs: {
    lang: 'en'
  },
  titleTemplate: title => title ? `${title} · Media Studio` : 'Media Studio',
  link: [
    { rel: 'icon', href: '/favicon.ico' }
  ]
})
</script>

<template>
  <UApp>
    <NuxtLoadingIndicator />

    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
