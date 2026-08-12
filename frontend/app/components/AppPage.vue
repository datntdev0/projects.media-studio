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
  /** Drop the navbar's default actions. An empty `#actions` template cannot — Vue falls back to slot defaults. */
  noActions?: boolean
  /** Drop the body's padding, for a section whose top is a control band that holds still while content scrolls. */
  flush?: boolean
}>()

useHead({ title: () => props.title })
</script>

<template>
  <UDashboardPanel :ui="flush ? { body: 'p-0 sm:p-0 gap-0 sm:gap-0' } : undefined">
    <template #header>
      <UDashboardNavbar :title="title">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <!--
          The title itself, for a screen that is somewhere rather than something —
          a detail page draws its trail back here. `#leading` is the sidebar
          toggle's and stays it.
        -->
        <template v-if="$slots.title" #title>
          <slot name="title" />
        </template>

        <!--
          Beside the title: a count, a state, whatever the section is measured in.
          A passthrough, so a screen can add one without restyling the navbar.
        -->
        <template #trailing>
          <slot name="trailing" />
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

              <UButton icon="i-lucide-plus" label="New" />
            </template>
          </slot>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <slot>
        <AppPageSlot :title="title" :hint="hint" />
      </slot>
    </template>
  </UDashboardPanel>
</template>
