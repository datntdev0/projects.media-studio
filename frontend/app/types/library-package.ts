/**
 * Packing an item into a `.zip`, and reading one back.
 *
 * The live half is mirrored by hand from
 * `backend/src/core/providers/realtime.provider.ts` — there is no shared package yet,
 * and the same arrangement `types/scraping-status.ts` has. Everything else is the
 * generated client's, and is not restated here.
 */

/** What to do with a chapter number the target already holds. The mockup's select. */
export type ImportConflict = 'skip' | 'overwrite' | 'newItem'

/** Where the dialog is. Client-side only: the server knows nothing about a wizard. */
export type ImportStage = 'pick' | 'upload' | 'validate' | 'importing' | 'done'

/**
 * One item's running — or last — import, under `libraryImports/{itemId}`.
 *
 * Keyed by the item because there is no import record: nothing lists past imports.
 * The node outlives the run, which is what lets a reopened dialog say what the last
 * one did, and it goes when the item does.
 */
export interface LibraryImportNode {
  itemId: string
  status: 'running' | 'completed' | 'failed'
  /** Bodies to write — chapters plus translations. What the bar divides by. */
  total?: number
  done?: number
  /** "Chapter 412 · Nine Bells for the Harbour". */
  label?: string
  added?: number
  overwritten?: number
  skipped?: number
  translated?: number
  error?: string
  /** Stamped on every write, so a node can be read as stale. */
  updatedAt: number
}
