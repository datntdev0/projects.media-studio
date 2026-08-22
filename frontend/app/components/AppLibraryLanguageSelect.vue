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

/** The item's own language as one of the three, when it is one. `zh` and `Chinese` both name it. */
const sourceCode = computed(() => {
  const own = props.sourceLanguage.trim().toLowerCase()

  return TRANSLATION_LANGUAGES.find(({ code, name }) => own === code || own === name.toLowerCase())?.code ?? null
})

/**
 * A novel written in one of the three has no row of its own: that language *is* the
 * source, so the name stands where it always does and there is nothing to translate
 * into. Anything else — or nothing — keeps the source at the top as its own row.
 */
const options = computed(() => {
  const rows = TRANSLATION_LANGUAGES.map(({ code, name }) => code === sourceCode.value
    ? { value: null, label: `${name} · source` }
    : { value: code, label: `${name}` })

  return sourceCode.value ? rows : [{ value: null, label: `${props.sourceLanguage || 'Source'} · source` }, ...rows]
})

/** The source row, which a `?lang=` naming the novel's own language falls back to. */
const sourceOption = computed(() => options.value.find(option => option.value === null)!)

const selected = computed({
  get: () => options.value.find(option => option.value === language.value) ?? sourceOption.value,
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
