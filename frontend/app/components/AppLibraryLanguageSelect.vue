<script setup lang="ts">
import type { TranslationCoverage, TranslationLanguage } from '~/types/library-content'

/**
 * Which language a novel is being read in — the source, or one of the three we
 * translate into.
 *
 * The coverage beside each name comes off the item, so this fetches nothing: a
 * screen that draws this has already loaded the item it belongs to.
 */
const props = defineProps<{
  /** The item's own language, which names the source option. */
  sourceLanguage: string
  /** How much of the novel each language covers, as the item reports it. */
  coverage: TranslationCoverage[] | null
  /** The novel's chapter count, which the coverage is out of. */
  total: number
}>()

/** Null is the source — the state every screen starts in. */
const language = defineModel<TranslationLanguage | null>({ required: true })

const options = computed(() => [
  { value: null, label: `${props.sourceLanguage || 'Source'} · source` },
  ...TRANSLATION_LANGUAGES.map(({ code, name }) => ({
    value: code,
    label: `${name} · ${coverageLabel(props.coverage?.find(row => row.language === code)?.translated ?? 0, props.total)}`
  }))
])

const selected = computed({
  get: () => options.value.find(option => option.value === language.value) ?? options.value[0],
  set: (option) => { language.value = option?.value ?? null }
})
</script>

<template>
  <div class="flex items-center gap-1.5">
    <UIcon name="i-lucide-languages" class="size-4 shrink-0 text-primary" />

    <USelectMenu
      v-model="selected"
      :items="options"
      :search-input="false"
      class="w-52"
      aria-label="Reading language"
    />
  </div>
</template>
