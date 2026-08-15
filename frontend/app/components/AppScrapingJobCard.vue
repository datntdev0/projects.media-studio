<script setup lang="ts">
import type { ScrapingJob } from '~/types/scraping-job'

/**
 * One job in the listing: what was scraped, how far it has got, and the two controls
 * over it. Selecting it fills the panel beside the list.
 *
 * The two icon buttons are drawn disabled until the status endpoint exists — the
 * tooltip pattern the library's deferred controls already use.
 */
defineProps<{
  job: ScrapingJob
  selected: boolean
}>()

defineEmits<{ select: [] }>()
</script>

<template>
  <AppBlueprint
    as="button"
    type="button"
    class="w-full text-left px-5 py-3 cursor-pointer"
    :class="selected ? 'bg-(--color-tint)' : ''"
    :aria-pressed="selected"
    @click="$emit('select')"
  >
    <div class="flex items-center gap-3">
      <UBadge
        :label="typeLabel(job.libraryType)"
        color="primary"
        variant="subtle"
        size="sm"
      />

      <div class="flex-1 min-w-0">
        <p class="heading text-h5 truncate">
          {{ job.libraryTitle }}
        </p>

        <p class="text-label text-muted truncate">
          {{ jobMeta(job) }}
        </p>
      </div>

      <UBadge
        :label="jobStatusTag(job.status).label"
        :color="jobStatusTag(job.status).color"
        :variant="jobStatusTag(job.status).variant"
        size="sm"
      />

      <!--
        Not drawn on a settled job: there is nothing left to pause or cancel, and a
        control that could never do anything is worse than no control.
        `span` inside the tooltip: a disabled button emits no pointer events of its own.
      -->
      <div v-if="!jobSettled(job)" class="flex gap-1" @click.stop>
        <UTooltip :text="JOB_CONTROLS_DEFERRED">
          <span class="block">
            <UButton
              icon="i-lucide-pause"
              color="neutral"
              variant="ghost"
              size="xs"
              square
              disabled
              aria-label="Pause the job"
            />
          </span>
        </UTooltip>

        <UTooltip :text="JOB_CONTROLS_DEFERRED">
          <span class="block">
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="xs"
              square
              disabled
              aria-label="Cancel the job"
            />
          </span>
        </UTooltip>
      </div>
    </div>

    <div class="flex items-center gap-4 mt-2.5">
      <UProgress
        class="flex-1"
        :model-value="jobProgressPercent(job)"
        :ui="{ base: 'h-[4px] rounded-none', indicator: 'rounded-none' }"
      />

      <span class="text-label tabular-nums w-40 text-right">{{ jobProgressLabel(job) }}</span>

      <span class="text-label text-muted w-28 text-right truncate">{{ jobEta(job) }}</span>
    </div>
  </AppBlueprint>
</template>
