<script setup lang="ts">
import type { RequestableJobStatus, ScrapingJob } from '~/types/scraping-job'

/**
 * One job in the listing: what was scraped, how far it has got, and the two controls
 * over it. Selecting it fills the panel beside the list.
 *
 * The controls are drawn but not called here: the screen owns the request and the
 * refetch, as the item screen owns its own.
 */
const props = defineProps<{
  job: ScrapingJob
  selected: boolean
  /** True while a request for this job is in the air. */
  busy: boolean
}>()

defineEmits<{ select: [], control: [status: RequestableJobStatus] }>()

/** **Start now**, **Resume** or **Pause**, depending on where the job stands. */
const primary = computed(() => jobPrimaryControl(props.job))
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
      -->
      <div v-if="!jobSettled(job)" class="flex gap-1" @click.stop>
        <UTooltip v-if="primary" :text="primary.label">
          <UButton
            :icon="primary.icon"
            :aria-label="`${primary.label} the job`"
            :disabled="busy"
            color="neutral"
            variant="ghost"
            size="xs"
            square
            @click="$emit('control', primary.status)"
          />
        </UTooltip>

        <UTooltip text="Cancel">
          <UButton
            icon="i-lucide-x"
            aria-label="Cancel the job"
            :disabled="busy"
            color="neutral"
            variant="ghost"
            size="xs"
            square
            @click="$emit('control', 'stopped')"
          />
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
