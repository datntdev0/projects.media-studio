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
      class="flex items-center gap-2 px-3 py-2 text-ui no-underline"
      :class="[
        active ? 'bg-(--color-accent) text-(--color-on-accent)' : 'text-default hover:bg-elevated',
        collapsed && 'justify-center'
      ]"
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
