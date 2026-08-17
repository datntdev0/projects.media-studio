<script setup lang="ts">
import { onValue, ref as databaseRef } from 'firebase/database'
import type { ImportConflict, ImportStage, LibraryImportNode } from '~/types/library-package'
import type { LibraryPackageReportDto } from '~/utils/api.clients'

/**
 * Reading a `.zip` back into an item, in the mockup's four steps: pick a file,
 * upload it, see what is in it, and watch it land.
 *
 * The bytes go straight to Cloud Storage and only the URL reaches the API — which is
 * what makes the upload bar real. Nothing is written until **Import** is pressed, and
 * what happens after it happens on the server: the dialog subscribes to the item's
 * live node, so closing it does not stop anything and reopening it picks the run back
 * up where it got to.
 */
const open = defineModel<boolean>('open', { required: true })

const props = defineProps<{ itemId: string }>()

const emit = defineEmits<{
  /** The run finished. Carries the target, which is a new item under that policy. */
  imported: [itemId: string]
}>()

const { libraryClient } = useApiClient()

const packages = useLibraryPackages()

const { $firebaseDatabase: database } = useNuxtApp()

const stage = ref<ImportStage>('pick')

const picked = ref<File | null>(null)

const onConflict = ref<ImportConflict>('skip')

const percent = ref(0)

/** Where the uploaded package is, so a cancel can drop it and a start can name it. */
const packageUrl = ref<string | null>(null)

const report = ref<LibraryPackageReportDto | null>(null)

/** The item the run is writing into — this one, unless the policy made another. */
const target = ref(props.itemId)

const total = ref(0)

const busy = ref(false)

const failure = ref<string | null>(null)

const dragging = ref(false)

const file = useTemplateRef<HTMLInputElement>('file')

/** The live node for whichever item the run is writing into. */
const node = ref<LibraryImportNode | null>(null)

let unwatch: (() => void) | null = null

function watchNode(itemId: string) {
  unwatch?.()
  unwatch = onValue(databaseRef(database, `libraryImports/${itemId}`), snapshot => (node.value = snapshot.val() as LibraryImportNode | null))
}

onScopeDispose(() => unwatch?.())

const steps = computed(() => IMPORT_STEPS.map((step, at) => ({ ...step, at, on: at === importStepIndex(stage.value), past: at < importStepIndex(stage.value) })))

const done = computed(() => node.value?.done ?? 0)

const bar = computed(() => stage.value === 'upload' ? percent.value : Math.round((done.value / Math.max(total.value, 1)) * 100))

/** What the primary button says, and nothing where there is nothing to advance to. */
const advance = computed(() => ({
  pick: picked.value ? 'Upload package' : '',
  upload: '',
  validate: report.value?.valid ? `Import ${countLabel(report.value.adding)} ${contentUnit('novel', report.value.adding)}` : '',
  importing: '',
  done: 'View chapters'
}[stage.value]))

// Refilled when the dialog opens rather than when a prop changes, so a close
// animation does not play over a form that has already been reset. An import
// already running over this item is picked up instead — which is what makes
// "you can close this dialog" true.
watch(open, (isOpen) => {
  if (!isOpen) {
    return
  }

  failure.value = null
  target.value = props.itemId
  watchNode(props.itemId)

  if (node.value?.status === 'running') {
    stage.value = 'importing'
    total.value = node.value.total ?? 0

    return
  }

  stage.value = 'pick'
  picked.value = null
  packageUrl.value = null
  report.value = null
  percent.value = 0
})

// The server settles the run, not the dialog: the node is what says it is over.
watch(node, (now) => {
  if (stage.value !== 'importing' || !now) {
    return
  }

  if (now.status === 'completed') {
    stage.value = 'done'
  }

  if (now.status === 'failed') {
    failure.value = now.error || 'The import did not finish.'
  }
})

function choose(chosen: File | null | undefined) {
  failure.value = null

  if (!chosen) {
    return
  }

  try {
    checkPackage(chosen)
    picked.value = chosen
  } catch (cause) {
    failure.value = (cause as Error).message
  }
}

function onDrop(event: DragEvent) {
  dragging.value = false
  choose(event.dataTransfer?.files?.[0])
}

/** Step 2. Advances itself, because an upload that landed has nothing to confirm. */
async function upload() {
  if (!picked.value) {
    return
  }

  stage.value = 'upload'
  percent.value = 0

  try {
    packageUrl.value = await packages.upload(props.itemId, picked.value, value => (percent.value = value))
    await validate()
  } catch (cause) {
    failure.value = apiMessage(cause, 'Could not upload the package.')
    stage.value = 'pick'
  }
}

async function validate() {
  stage.value = 'validate'
  busy.value = true

  try {
    report.value = await libraryClient.validateImport(props.itemId, { packageUrl: packageUrl.value! })
  } catch (cause) {
    failure.value = apiMessage(cause, 'Could not read the package.')
    await cancel()
  } finally {
    busy.value = false
  }
}

/** Step 4. The answer names the target, which under `newItem` is not this item. */
async function start() {
  busy.value = true

  try {
    const started = await libraryClient.startImport(props.itemId, { packageUrl: packageUrl.value!, onConflict: onConflict.value })

    target.value = started.itemId
    total.value = started.total
    watchNode(started.itemId)
    stage.value = 'importing'
  } catch (cause) {
    failure.value = apiMessage(cause, 'Could not start the import.')
  } finally {
    busy.value = false
  }
}

/** An abandoned package should not sit in the bucket. A started one is the server's. */
async function cancel() {
  const abandoned = stage.value === 'pick' || stage.value === 'validate' ? packageUrl.value : null

  packageUrl.value = null
  open.value = false

  await packages.discard(abandoned)
}

function finish() {
  open.value = false
  emit('imported', target.value)
}

const summary = computed(() => [
  { label: 'Chapters added', value: countLabel(node.value?.added ?? 0) },
  { label: 'Chapters overwritten', value: node.value?.overwritten ? countLabel(node.value.overwritten) : '0 — existing kept' },
  { label: 'Translations added', value: countLabel(node.value?.translated ?? 0) },
  { label: 'Skipped', value: countLabel(node.value?.skipped ?? 0) }
])
</script>

<template>
  <UModal
    v-model:open="open"
    title="Import novel package"
    :description="`Step ${Math.min(importStepIndex(stage) + 1, IMPORT_STEPS.length)} of ${IMPORT_STEPS.length}`"
    :ui="{ content: 'max-w-2xl' }"
  >
    <template #body>
      <div class="flex border border-default divide-x divide-default mb-6">
        <div
          v-for="step in steps"
          :key="step.stage"
          class="flex-1 px-3 py-2"
          :class="step.on ? 'bg-(--color-tint)' : ''"
        >
          <p class="text-meta tracking-widest uppercase text-muted">
            0{{ step.at + 1 }}
          </p>

          <p class="heading text-support" :class="step.on || step.past ? '' : 'text-dimmed'">
            {{ step.label }}
          </p>
        </div>
      </div>

      <template v-if="stage === 'pick'">
        <input
          ref="file"
          type="file"
          accept=".zip,application/zip"
          class="hidden"
          @change="choose((($event.target as HTMLInputElement).files ?? [])[0])"
        >

        <AppBlueprint
          dashed
          class="grid place-items-center p-8 text-center cursor-pointer"
          :class="dragging ? 'bg-(--color-tint)' : ''"
          @click="file?.click()"
          @dragover.prevent="dragging = true"
          @dragleave="dragging = false"
          @drop.prevent="onDrop"
        >
          <div>
            <UIcon name="i-lucide-upload" class="size-6 text-primary" />

            <h3 class="mt-2">
              {{ picked ? picked.name : 'Drop a .zip package here' }}
            </h3>

            <p class="text-support text-muted">
              {{ picked ? bytesLabel(picked.size) : `or click to browse · max ${PACKAGE_MAX_MB} MB` }}
            </p>
          </div>
        </AppBlueprint>

        <p class="mt-3 text-support text-muted text-pretty">
          The package must contain <code>manifest.json</code>, a metadata record, chapter files and — optionally — translations and a cover. Importing into this item merges by chapter number.
        </p>

        <UFormField label="On conflict" class="mt-3">
          <USelect v-model="onConflict" :items="IMPORT_CONFLICT_OPTIONS" class="w-full" />
        </UFormField>
      </template>

      <template v-if="stage === 'upload' || stage === 'importing'">
        <div class="flex items-center gap-3 mb-3">
          <UIcon :name="stage === 'upload' ? 'i-lucide-file' : 'i-lucide-book-open'" class="size-5 shrink-0" />

          <div class="min-w-0">
            <p class="heading text-h5 truncate">
              {{ stage === 'upload' ? picked?.name : `Writing ${countLabel(total)} ${contentUnit('novel', total)}` }}
            </p>

            <p class="text-support text-muted truncate">
              {{ stage === 'upload' ? `${bytesLabel(picked?.size ?? 0)} · uploading` : node?.label || 'Starting…' }}
            </p>
          </div>

          <UBadge :label="`${bar}%`" variant="subtle" class="ms-auto" />
        </div>

        <UProgress v-model="bar" />
      </template>

      <div v-if="stage === 'validate'" class="grid gap-3">
        <USkeleton v-if="busy" class="h-24" />

        <div
          v-for="check in report?.checks ?? []"
          v-else
          :key="check.label"
          class="flex items-start gap-3"
        >
          <UBadge
            :label="packageCheckTag(check.state).label"
            :color="packageCheckTag(check.state).color"
            :variant="packageCheckTag(check.state).variant"
            size="sm"
            class="shrink-0"
          />

          <div class="min-w-0">
            <p class="text-body">
              {{ check.label }}
            </p>

            <p class="text-support text-muted text-pretty">
              {{ check.detail }}
            </p>
          </div>
        </div>
      </div>

      <template v-if="stage === 'done'">
        <div class="flex items-center gap-3 mb-4">
          <UIcon name="i-lucide-check" class="size-5 text-primary" />

          <h3>Import complete</h3>
        </div>

        <dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-support">
          <template v-for="row in summary" :key="row.label">
            <dt class="text-muted">
              {{ row.label }}
            </dt>

            <dd>{{ row.value }}</dd>
          </template>
        </dl>
      </template>

      <p v-if="failure" class="flex items-center gap-2 mt-4 text-support text-error" role="alert">
        <UIcon name="i-lucide-triangle-alert" class="size-4 shrink-0" />
        {{ failure }}
      </p>
    </template>

    <template #footer>
      <span class="text-label text-muted">{{ IMPORT_HINTS[stage] }}</span>

      <div class="flex items-center gap-2 ms-auto">
        <UButton
          :label="stage === 'done' ? 'Close' : 'Cancel'"
          color="neutral"
          variant="ghost"
          @click="cancel"
        />

        <UButton
          v-if="advance"
          :label="advance"
          :loading="busy"
          @click="stage === 'pick' ? upload() : stage === 'validate' ? start() : finish()"
        />
      </div>
    </template>
  </UModal>
</template>
