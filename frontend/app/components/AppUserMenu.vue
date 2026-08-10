<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

defineProps<{
  collapsed?: boolean
}>()

const colorMode = useColorMode()

/* Placeholder identity — the shell renders the account row; who is signed in
   is a screen concern, not a layout one. */
const user = {
  name: 'Dat Nguyen',
  initials: 'DN'
}

function useTheme(preference: 'light' | 'dark') {
  return {
    label: preference === 'light' ? 'Light' : 'Dark',
    type: 'checkbox' as const,
    checked: colorMode.value === preference,
    onUpdateChecked(checked: boolean) {
      if (checked) {
        colorMode.preference = preference
      }
    },
    onSelect(event: Event) {
      event.preventDefault()
    }
  }
}

const items = computed<DropdownMenuItem[][]>(() => [[{
  label: 'Profile',
  icon: 'i-lucide-user'
}, {
  label: 'Theme',
  icon: 'i-lucide-sun',
  children: [useTheme('light'), useTheme('dark')]
}], [{
  label: 'Log out',
  icon: 'i-lucide-log-out',
  color: 'error'
}]])
</script>

<template>
  <UDropdownMenu
    :items="items"
    :content="{ align: 'center', collisionPadding: 12 }"
    :ui="{ content: collapsed ? 'w-48' : 'w-(--reka-dropdown-menu-trigger-width)' }"
  >
    <UButton
      color="neutral"
      variant="ghost"
      :block="!collapsed"
      :square="collapsed"
      :aria-label="collapsed ? user.name : undefined"
      class="gap-2 px-3 py-2 font-body font-normal data-[state=open]:bg-elevated"
      :class="collapsed ? 'justify-center' : 'justify-start'"
    >
      <AppMark
        :initials="user.initials"
        shape="circle"
        tone="tint"
      />

      <template v-if="!collapsed">
        <span class="text-sm truncate">{{ user.name }}</span>

        <UIcon
          name="i-lucide-chevrons-up-down"
          class="ms-auto size-4 shrink-0 text-dimmed"
        />
      </template>
    </UButton>
  </UDropdownMenu>
</template>
