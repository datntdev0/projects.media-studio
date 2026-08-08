<script setup lang="ts">
/**
 * A section of the studio: the navbar (sidebar toggle, title, actions) over a
 * scrolling body. Every route renders one, so the frame stays identical from
 * section to section and only the body changes.
 */
const props = defineProps<{
  title: string
  /** One line describing what the section will hold. */
  hint?: string
}>()

useHead({ title: () => props.title })
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar :title="props.title">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <slot name="actions">
            <UButton
              icon="i-lucide-bell"
              color="neutral"
              variant="ghost"
              square
              aria-label="Notifications"
            />

            <UButton
              icon="i-lucide-plus"
              label="New"
            />
          </slot>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <slot>
        <AppPageSlot
          :title="props.title"
          :hint="props.hint"
        />
      </slot>
    </template>
  </UDashboardPanel>
</template>
