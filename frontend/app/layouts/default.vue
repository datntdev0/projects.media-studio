<script setup lang="ts">
const { searchGroups } = useNavigation()
</script>

<template>
  <UDashboardGroup unit="rem">
    <AppSidebar />

    <UDashboardSearch :groups="searchGroups" />

    <slot />
  </UDashboardGroup>
</template>
