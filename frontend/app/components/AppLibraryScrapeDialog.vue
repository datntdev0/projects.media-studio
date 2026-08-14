<script setup lang="ts">
import type { FormError } from '@nuxt/ui'
import type { ScrapeScope, ScrapeStart } from '~/types/library-content'
import type { ScrapingJobStartedDto } from '~/utils/api.clients'

/**
 * What to fetch, what to do with what is already held, and when to start.
 *
 * The dialog describes a job and hands the answer back; the screen it opened from
 * refreshes and says what landed. Nothing here watches the job — there is nothing
 * to watch it with.
 */
const FALLBACK_ERROR = 'Could not start the job. Try again.'

const open = defineModel<boolean>('open', { required: true })

const props = defineProps<{
  itemId: string
  /** Every chapter the item is known to hold. */
  total: number
  /** Those without stored text yet. */
  missing: number
  /** The rows a **Scrape selected** press handed over, by chapter number. */
  indexes?: number[]
}>()

const emit = defineEmits<{
  started: [answer: ScrapingJobStartedDto]
}>()

const { scrapingClient } = useApiClient()

const scope = ref<ScrapeScope>('missing')

const from = ref(1)

const to = ref(1)

/** Skip / Force, asked only where the answer is not already implied by the card. */
const force = ref(false)

const retry = ref(3)

const start = ref<ScrapeStart>('now')

/** A `datetime-local` value — local wall clock, converted on submit. */
const startAt = ref('')

const starting = ref(false)

const startError = ref<string | null>(null)

const picked = computed(() => props.indexes ?? [])

/** How many rows each card would take, so the choice is made against a number. */
const counts = computed<Record<ScrapeScope, number>>(() => ({
  missing: props.missing,
  all: props.total,
  range: Math.max(Math.min(to.value, props.total) - Math.max(from.value, 1) + 1, 0),
  selected: picked.value.length
}))

const queueing = computed(() => counts.value[scope.value])

/** Only a specific selection asks: `all` means including what is held, and `missing` cannot mean anything else. */
const asksAboutStored = computed(() => scope.value === 'range' || scope.value === 'selected')

const refetch = computed(() => asksAboutStored.value ? force.value : scope.value === 'all')

const cards = computed(() => (['missing', 'all', 'range', ...(picked.value.length ? ['selected' as const] : [])] as ScrapeScope[]).map(value => ({
  value,
  label: SCRAPE_SCOPE_LABELS[value],
  hint: `${countLabel(counts.value[value])} ${contentUnit('novel', counts.value[value])}`
})))

// Refilled when the dialog opens rather than when a prop changes, so a close
// animation does not play over a form that has already been reset.
watch(open, (isOpen) => {
  if (!isOpen) {
    return
  }

  scope.value = picked.value.length ? 'selected' : 'missing'
  from.value = 1
  to.value = props.total || 1
  force.value = false
  retry.value = 3
  start.value = 'now'
  startAt.value = ''
  startError.value = null
})

function validate(): FormError[] {
  const errors: FormError[] = []

  if (scope.value === 'range' && !(from.value >= 1 && to.value >= from.value)) {
    errors.push({ name: 'range', message: 'A range runs from one chapter number up to a higher one.' })
  }

  if (start.value === 'at' && !(startAt.value && new Date(startAt.value).getTime() > Date.now())) {
    errors.push({ name: 'startAt', message: 'Pick a time that has not passed.' })
  }

  return errors
}

/** The expression the endpoint parses: two names, a span, or the selected chapters' own numbers. */
function rangeFor(): string {
  if (scope.value === 'range') {
    return `${from.value}-${to.value}`
  }

  if (scope.value === 'selected') {
    return picked.value.join(',')
  }

  return scope.value
}

async function submit() {
  startError.value = null
  starting.value = true

  let answer: ScrapingJobStartedDto

  try {
    answer = await scrapingClient.job({
      libraryId: props.itemId,
      range: rangeFor(),
      refetch: refetch.value,
      startAt: start.value === 'at' ? new Date(startAt.value).toISOString() : null,
      retry: retry.value
    })
  } catch (cause) {
    startError.value = apiMessage(cause, FALLBACK_ERROR)

    return
  } finally {
    starting.value = false
  }

  open.value = false
  emit('started', answer)
}

/** A selected card takes the accent wash, as the item form's do. */
function cardTone(selected: boolean) {
  return [
    selected ? 'bg-(--color-tint)' : '',
    'cursor-pointer has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-(--color-accent)'
  ]
}
</script>

<template>
  <UModal v-model:open="open" title="Start a scraping job" :ui="{ content: 'max-w-xl' }">
    <template #body>
      <UForm
        id="scrape-form"
        :state="{ scope, from, to, startAt }"
        :validate="validate"
        class="grid gap-6"
        @submit="submit"
      >
        <UFormField label="What to extract" name="range">
          <div class="grid gap-2">
            <AppBlueprint
              v-for="card in cards"
              :key="card.value"
              as="label"
              class="flex items-start gap-3 p-3"
              :class="cardTone(scope === card.value)"
            >
              <input
                v-model="scope"
                type="radio"
                name="scrape-scope"
                :value="card.value"
                class="sr-only"
              >

              <div class="flex-1">
                <span class="block text-body">{{ card.label }}</span>

                <span v-if="card.value !== 'range'" class="block text-label text-muted">{{ card.hint }}</span>

                <!-- A click on an input inside a label does not reach the radio, so reaching for a bound picks the card. -->
                <div v-if="card.value === 'range'" class="flex items-center gap-2 mt-2">
                  <UInput
                    v-model.number="from"
                    type="number"
                    min="1"
                    class="w-24"
                    @focus="scope = 'range'"
                  />
                  <span class="text-label text-muted">to</span>
                  <UInput
                    v-model.number="to"
                    type="number"
                    min="1"
                    class="w-24"
                    @focus="scope = 'range'"
                  />
                  <span class="block text-label text-muted">{{ card.hint }}</span>
                </div>
              </div>

              <UBadge
                v-if="card.value === 'missing'"
                label="Recommended"
                variant="subtle"
                size="sm"
              />
            </AppBlueprint>
          </div>
        </UFormField>

        <UFormField v-if="asksAboutStored" label="If content already exists" name="refetch">
          <!-- A segmented pair, framed as one object rather than two loose buttons. -->
          <div class="flex border border-default divide-x divide-default w-fit">
            <UButton
              label="Skip it"
              :color="force ? 'neutral' : 'primary'"
              :variant="force ? 'ghost' : 'subtle'"
              :aria-pressed="!force"
              @click="force = false"
            />

            <UButton
              label="Force re-scrape from source"
              :color="force ? 'primary' : 'neutral'"
              :variant="force ? 'subtle' : 'ghost'"
              :aria-pressed="force"
              @click="force = true"
            />
          </div>

          <p class="mt-1.5 text-label text-muted text-pretty">
            Force overwrites stored content — manual edits to chapters in scope are lost.
          </p>
        </UFormField>

        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="On failure" name="retry">
            <USelect v-model="retry" :items="SCRAPE_RETRY_OPTIONS" class="w-full" />
          </UFormField>

          <UFormField label="Start" name="startAt">
            <USelect v-model="start" :items="SCRAPE_START_OPTIONS" class="w-full" />

            <UInput
              v-if="start === 'at'"
              v-model="startAt"
              type="datetime-local"
              class="w-full mt-2"
            />
          </UFormField>
        </div>
      </UForm>

      <p v-if="startError" class="flex items-center gap-2 mt-4 text-support text-error" role="alert">
        <UIcon name="i-lucide-triangle-alert" class="size-4 shrink-0" />
        {{ startError }}
      </p>
    </template>

    <template #footer>
      <span class="text-label text-muted">
        {{ countLabel(queueing) }} {{ contentUnit('novel', queueing) }} to queue
      </span>

      <div class="flex items-center gap-2 ms-auto">
        <UButton
          label="Cancel"
          color="neutral"
          variant="ghost"
          @click="open = false"
        />

        <UButton
          type="submit"
          form="scrape-form"
          label="Start job"
          :loading="starting"
        />
      </div>
    </template>
  </UModal>
</template>
