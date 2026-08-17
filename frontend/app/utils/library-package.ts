import type { BadgeProps } from '@nuxt/ui'
import type { ImportConflict, ImportStage } from '~/types/library-package'
import type { PackageCheckState } from './api.clients'

/** How a package reads on screen: the wizard's steps, the conflict choices, and a check's badge. */

/** Kept in step with the cap in `storage.rules`. Only a novel is packaged, and text is small. */
export const PACKAGE_MAX_MB = 200

const MAX_PACKAGE_BYTES = PACKAGE_MAX_MB * 1024 * 1024

/** What the browser calls a zip. Two, because Windows sends the second one. */
const PACKAGE_TYPES = ['application/zip', 'application/x-zip-compressed']

/** The four the stepper strip draws, in order. `done` is past the last of them. */
export const IMPORT_STEPS: { stage: ImportStage, label: string }[] = [
  { stage: 'pick', label: 'Select file' },
  { stage: 'upload', label: 'Upload' },
  { stage: 'validate', label: 'Validate' },
  { stage: 'importing', label: 'Import' }
]

/** How far along a stage is, so a step can draw itself as past, current or ahead. */
export const importStepIndex = (stage: ImportStage): number =>
  stage === 'done' ? IMPORT_STEPS.length : IMPORT_STEPS.findIndex(step => step.stage === stage)

/** The mockup's `On conflict` select, verbatim. */
export const IMPORT_CONFLICT_OPTIONS: { label: string, value: ImportConflict }[] = [
  { label: 'Keep existing chapter, skip imported', value: 'skip' },
  { label: 'Overwrite with imported content', value: 'overwrite' },
  { label: 'Import as new library item', value: 'newItem' }
]

/** One badge per check state. The `Record` makes a missing one a compile error. */
const CHECK_TAGS: Record<PackageCheckState, { label: string, color: BadgeProps['color'], variant: BadgeProps['variant'] }> = {
  pass: { label: 'Pass', color: 'primary', variant: 'subtle' },
  warn: { label: 'Warn', color: 'neutral', variant: 'outline' },
  fail: { label: 'Fail', color: 'error', variant: 'subtle' }
}

export const packageCheckTag = (state: PackageCheckState) => CHECK_TAGS[state]

/** The footer line under each stage — the mockup's own five sentences. */
export const IMPORT_HINTS: Record<ImportStage, string> = {
  pick: 'Nothing is written until validation passes.',
  upload: 'Do not close the browser tab while uploading.',
  validate: 'A warning does not stop an import.',
  importing: 'Running in the background.',
  done: 'The chapters are in the item now.'
}

/** Rejects with the sentence to print, as `checkAsset` does. */
export function checkPackage(file: File): void {
  if (file.type && !PACKAGE_TYPES.includes(file.type)) {
    throw new Error(`${file.name} is not a .zip package.`)
  }

  if (file.size > MAX_PACKAGE_BYTES) {
    throw new Error(`${file.name} is over the ${PACKAGE_MAX_MB} MB cap.`)
  }
}
