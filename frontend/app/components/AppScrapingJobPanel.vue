<script setup lang="ts">
import type { ScrapingJob } from '~/types/scraping-job'

/**
 * The selected job, beside the list: the big figure over its bar, what the job was
 * asked to do, and the two controls over it.
 *
 * The **Failed** count is drawn; the rows are not. A row would need each chapter's
 * title, which is a read per row into the item's content — and the item screen
 * already lists its failed chapters, one click away.
 */
defineProps<{ job: ScrapingJob | null }>()
</script>

<template>
  <div v-if="job" class="p-6">
    <p class="text-meta tracking-widest uppercase text-primary">
      {{ typeLabel(job.libraryType) }} · {{ jobStatusTag(job.status).label }}
    </p>

    <h4 class="mt-0.5">
      {{ job.libraryTitle }}
    </h4>

    <p class="text-support text-muted mb-4">
      {{ jobMeta(job) }}
    </p>

    <div class="flex items-baseline gap-2">
      <span class="heading text-h2 leading-none">{{ countLabel(job.completed) }}</span>
      <span class="text-support text-muted">{{ jobOfLabel(job) }}</span>
    </div>

    <UProgress
      class="mt-2"
      :model-value="jobProgressPercent(job)"
      :ui="{ base: 'h-[6px] rounded-none', indicator: 'rounded-none' }"
    />

    <dl class="grid grid-cols-2 gap-4 mt-6">
      <div>
        <dt class="text-meta tracking-widest uppercase text-muted">
          Range
        </dt>
        <dd class="text-body">
          {{ job.range }}
        </dd>
      </div>

      <div>
        <dt class="text-meta tracking-widest uppercase text-muted">
          Mode
        </dt>
        <dd class="text-body">
          {{ jobModeLabel(job) }}
        </dd>
      </div>

      <div>
        <dt class="text-meta tracking-widest uppercase text-muted">
          Rate
        </dt>
        <dd class="text-body">
          {{ jobRate(job) }}
        </dd>
      </div>

      <div>
        <dt class="text-meta tracking-widest uppercase text-muted">
          Started
        </dt>
        <dd class="text-body">
          {{ jobStartedLabel(job) }}
        </dd>
      </div>
    </dl>

    <!-- Gone once the job has settled, for the card's reason: there is nothing left to stop. -->
    <div v-if="!jobSettled(job)" class="flex gap-2 mt-6">
      <UTooltip :text="JOB_CONTROLS_DEFERRED" class="flex-1">
        <UButton
          label="Pause"
          color="neutral"
          variant="subtle"
          block
          disabled
        />
      </UTooltip>

      <UTooltip :text="JOB_CONTROLS_DEFERRED" class="flex-1">
        <UButton
          label="Cancel"
          color="neutral"
          variant="subtle"
          block
          disabled
        />
      </UTooltip>
    </div>

    <div v-if="job.failed" class="mt-6 pt-4 border-t border-default">
      <div class="flex items-center gap-3">
        <h5 class="m-0">
          Failed ({{ countLabel(job.failed) }})
        </h5>

        <UTooltip :text="JOB_CONTROLS_DEFERRED" class="ms-auto">
          <span class="block">
            <UButton
              label="Retry all"
              color="neutral"
              variant="ghost"
              size="xs"
              disabled
            />
          </span>
        </UTooltip>
      </div>

      <p class="mt-1.5 text-label text-muted text-pretty">
        <ULink :to="`/library/${job.libraryId}`" class="text-primary">The item's content list</ULink>
        names which ones, and why each failed.
      </p>
    </div>
  </div>

  <div v-else class="grid place-items-center h-full p-6 text-center">
    <p class="text-support text-muted text-pretty">
      Select a job to see what it was asked to do.
    </p>
  </div>
</template>
