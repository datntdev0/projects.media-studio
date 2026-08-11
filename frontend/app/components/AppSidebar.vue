<script setup lang="ts">
const { links } = useNavigation()

/* The resizable sidebar is sized in numbers rather than CSS, so the width
   token has to be mirrored here. Units are rem — see `unit` on the
   UDashboardGroup in layouts/default.vue — and `size.default` matches
   `--layout-sidebar-width` in assets/css/tokens.css. */
const size = {
  default: 16.25,
  min: 14,
  max: 22
}
</script>

<template>
  <UDashboardSidebar
    id="app"
    collapsible
    resizable
    :default-size="size.default"
    :min-size="size.min"
    :max-size="size.max"
  >
    <template #header="{ collapsed }">
      <AppBrand :collapsed="collapsed" />
    </template>

    <template #default="{ collapsed }">
      <UDashboardSearchButton
        :collapsed="collapsed"
        color="neutral"
        class="justify-start gap-2 px-3 py-2 mb-1 font-body font-normal text-sm text-muted bg-transparent ring-default"
      />

      <nav aria-label="Sections">
        <ul class="flex flex-col gap-0.5">
          <li v-for="link in links" :key="link.to">
            <AppNavLink v-bind="link" :collapsed="collapsed" />
          </li>
        </ul>
      </nav>
    </template>

    <template #footer="{ collapsed }">
      <AppUserMenu :collapsed="collapsed" />
    </template>
  </UDashboardSidebar>
</template>
