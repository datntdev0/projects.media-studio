<script setup lang="ts">
const props = defineProps<{
  to: string
  icon: string
  label: string
  collapsed?: boolean
}>()

const route = useRoute()

/* Prefix matching so future child routes keep their section lit — except for
   the root, which every path would otherwise match. */
const active = computed(() => props.to === '/'
  ? route.path === '/'
  : route.path === props.to || route.path.startsWith(`${props.to}/`))
</script>

<template>
  <UTooltip
    :text="label"
    :disabled="!collapsed"
    :delay-duration="0"
    :content="{ side: 'right' }"
  >
    <NuxtLink
      :to="to"
      class="nav-link"
      :class="{ 'nav-link--active': active, 'nav-link--collapsed': collapsed }"
      :aria-current="active ? 'page' : undefined"
      :aria-label="collapsed ? label : undefined"
    >
      <UIcon
        :name="icon"
        class="size-5 shrink-0"
      />
      <span
        v-if="!collapsed"
        class="truncate"
      >{{ label }}</span>
    </NuxtLink>
  </UTooltip>
</template>

<style scoped>
.nav-link {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  font-size: var(--text-ui);
  color: var(--color-text);
  text-decoration: none;
}

.nav-link:hover {
  background: var(--color-hover);
  color: var(--color-text);
}

.nav-link--collapsed {
  justify-content: center;
}

/* The active section is the one solid field in the sidebar. */
.nav-link--active,
.nav-link--active:hover {
  background: var(--color-accent);
  color: var(--color-on-accent);
}
</style>
