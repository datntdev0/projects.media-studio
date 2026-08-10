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
  /**
   * Drop the navbar's default actions, for a screen where "New" means nothing.
   * An empty `#actions` template cannot do this — Vue falls back to the slot's
   * default content when a provided slot renders nothing.
   */
  noActions?: boolean
}>()

useHead({ title: () => props.title })
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar :title="title">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <slot name="actions">
            <template v-if="!noActions">
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
            </template>
          </slot>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <slot>
        <AppPageSlot
          :title="title"
          :hint="hint"
        />
      </slot>
    </template>
  </UDashboardPanel>
</template>
