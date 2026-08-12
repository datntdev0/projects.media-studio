<script setup lang="ts">
import type { ButtonProps } from '@nuxt/ui'

/**
 * A confirmation. The dialog owns the whole act: it runs `action`, holds the
 * spinner while it runs, prints what went wrong in place, and closes and emits
 * only once it worked.
 *
 * That is why there is one of these rather than a dialog per thing being deleted
 * — what differs between them is a sentence and a verb, not behaviour.
 */
const FALLBACK_ERROR = 'That did not work. Try again.'

const open = defineModel<boolean>('open', { required: true })

const props = withDefaults(defineProps<{
  title: string
  /** The verb on the confirming button. */
  confirmLabel?: string
  /** `error` for anything destructive, which is most of what this is used for. */
  color?: ButtonProps['color']
  /** What to run. Rejecting leaves the dialog open with the reason printed. */
  action: () => Promise<void>
  /** Printed when the failure carries no message of its own. */
  errorFallback?: string
}>(), {
  confirmLabel: 'Confirm',
  color: 'error',
  errorFallback: FALLBACK_ERROR
})

const emit = defineEmits<{
  confirmed: []
}>()

const running = ref(false)

const error = ref<string | null>(null)

// Cleared when it opens rather than when it closes, so the message does not
// vanish mid-animation on the way out.
watch(open, (isOpen) => {
  if (isOpen) {
    error.value = null
  }
})

async function confirm() {
  if (running.value) {
    return
  }

  error.value = null
  running.value = true

  try {
    await props.action()
  } catch (cause) {
    error.value = apiMessage(cause, props.errorFallback)

    return
  } finally {
    running.value = false
  }

  open.value = false
  emit('confirmed')
}
</script>

<template>
  <UModal v-model:open="open" :title="title" :ui="{ content: 'max-w-lg' }">
    <template #body>
      <slot />

      <p v-if="error" class="flex items-center gap-2 mt-4 text-support text-error" role="alert">
        <UIcon name="i-lucide-triangle-alert" class="size-4 shrink-0" />
        {{ error }}
      </p>
    </template>

    <template #footer>
      <div class="flex items-center gap-2 ms-auto">
        <UButton
          label="Cancel"
          color="neutral"
          variant="ghost"
          :disabled="running"
          @click="open = false"
        />

        <UButton
          :label="confirmLabel"
          :color="color"
          :loading="running"
          @click="confirm"
        />
      </div>
    </template>
  </UModal>
</template>
