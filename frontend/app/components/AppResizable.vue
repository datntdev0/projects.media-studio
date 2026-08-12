<script setup lang="ts">
import { useStorage } from '@vueuse/core'

/**
 * A column the reader can widen, with the handle beside it. The width is held in
 * rem and remembered under `storageKey`, so a column set once stays set.
 *
 * Two root nodes — the panel and its handle — so the parent must be a flex row.
 */
const props = withDefaults(defineProps<{
  /** Where the width is remembered. One per panel, so two on a screen do not share. */
  storageKey: string
  /** What a double-click on the handle returns to. */
  defaultWidth?: number
  minWidth?: number
  maxWidth?: number
  /** What the separator announces itself as. */
  label?: string
}>(), {
  defaultWidth: 20,
  minWidth: 14,
  maxWidth: 44,
  label: 'Resize this panel'
})

/** One arrow-key press, in rem. Coarse enough to be worth pressing. */
const STEP = 1

const width = useStorage(`media-studio.panel.${props.storageKey}`, props.defaultWidth)

const dragging = ref(false)

const clamped = computed(() => clamp(width.value))

function clamp(rem: number): number {
  return Math.min(props.maxWidth, Math.max(props.minWidth, rem))
}

/** Pointer events rather than mouse and touch pairs — one path covers both. */
function onPointerDown(event: PointerEvent) {
  event.preventDefault()

  const fromX = event.clientX
  const fromWidth = clamped.value
  const rootFontSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16

  dragging.value = true

  const onMove = (moved: PointerEvent) => {
    width.value = clamp(fromWidth + (moved.clientX - fromX) / rootFontSize)
  }

  const onUp = () => {
    dragging.value = false
    document.removeEventListener('pointermove', onMove)
    document.removeEventListener('pointerup', onUp)
  }

  document.addEventListener('pointermove', onMove)
  document.addEventListener('pointerup', onUp)
}

// A separator that only answers to a pointer is a separator half the room cannot
// use, so the arrows move it and Home puts it back.
function onKeydown(event: KeyboardEvent) {
  const by = { ArrowLeft: -STEP, ArrowRight: STEP, Home: 0 }[event.key]

  if (by === undefined) {
    return
  }

  event.preventDefault()
  width.value = event.key === 'Home' ? props.defaultWidth : clamp(clamped.value + by)
}
</script>

<template>
  <div class="flex-none min-w-0" :style="{ width: `${clamped}rem` }">
    <slot />
  </div>

  <UDashboardResizeHandle
    role="separator"
    tabindex="0"
    aria-orientation="vertical"
    :aria-label="label"
    :aria-valuenow="Math.round(clamped)"
    :aria-valuemin="minWidth"
    :aria-valuemax="maxWidth"
    :class="dragging ? 'bg-(--color-accent)' : ''"
    @pointerdown="onPointerDown"
    @dblclick="width = defaultWidth"
    @keydown="onKeydown"
  />
</template>
