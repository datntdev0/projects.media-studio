import { onValue, ref as databaseRef } from 'firebase/database'
import type { Unsubscribe } from 'firebase/database'
import type { ScrapingContentStatus, ScrapingItemStatus } from '~/types/scraping-status'

/**
 * What a running job is doing, as the Realtime Database publishes it.
 *
 * The backend writes these nodes beside the Firestore writes they mirror, so a job
 * that takes hours is visible while it runs rather than only after a refresh.
 *
 * **A summary is trusted only while its `status` is `scraping`.** Anything else is
 * ignored in favour of what the API answered, which is what makes a stale node
 * harmless: nothing has to be swept, and a chapter edited by hand outside a job
 * cannot leave the screen showing a count nobody recomputed.
 *
 * With one exception, and it is the whole reason `reconcile()` exists. A job's last
 * act is to drop its per-row subtree and move its summary off `scraping` — both before
 * the screen's refetch has landed. Dropping the overlay at that instant would blink
 * every row back to the status it was *fetched* with and the counters back to the
 * numbers they had before the job started, for as long as a round trip takes. So the
 * last published values are held across the gap, and the screen calls `reconcile()`
 * once the stored rows have caught up.
 */

/** The one state a live summary is worth reading in. */
const RUNNING = 'scraping'

/**
 * Every item's summary, keyed by id — one listener for the whole listing.
 *
 * The whole node rather than a listener per visible row: it is six fields per item
 * that has ever been scraped, and one subscription that survives paging and filtering
 * beats twenty that are torn down whenever the page changes.
 */
export function useScrapingStatuses() {
  const { $firebaseDatabase: database } = useNuxtApp()

  const statuses = ref<Record<string, ScrapingItemStatus>>({})

  /** The last summary each running item published, kept until the refetch has landed. */
  const held = ref<Record<string, ScrapingItemStatus>>({})

  const stop = onValue(databaseRef(database, 'scraping/items'), (snapshot) => {
    const now = (snapshot.val() as Record<string, ScrapingItemStatus> | null) ?? {}

    for (const [id, status] of Object.entries(now)) {
      if (status.status === RUNNING) {
        held.value[id] = status
      }
    }

    statuses.value = now
  })

  onScopeDispose(stop)

  /** The live summary for an item, or null where there is nothing to believe. */
  const running = (itemId: string): ScrapingItemStatus | null => {
    const status = statuses.value[itemId]

    return status?.status === RUNNING ? status : (held.value[itemId] ?? null)
  }

  /** Whether any watched item has settled since the last `reconcile()`. */
  const settled = computed(() => Object.keys(held.value).some(id => statuses.value[id]?.status !== RUNNING))

  /** The stored rows now carry the truth, so the held values can go. */
  const reconcile = (): void => {
    held.value = {}
  }

  return { statuses, running, settled, reconcile }
}

/**
 * One item: its summary, and its rows while a job is running.
 *
 * Two subscriptions rather than one on a shared parent, so this screen never
 * downloads another item's chapters. Both are re-pointed when `itemId` changes,
 * which is what a client-side navigation between two items is.
 */
export function useItemScrapingStatus(itemId: Ref<string>) {
  const { $firebaseDatabase: database } = useNuxtApp()

  const status = ref<ScrapingItemStatus | null>(null)

  const contents = ref<Record<string, ScrapingContentStatus>>({})

  /** The last values published while the job ran — see the note on `reconcile()` above. */
  const heldStatus = ref<ScrapingItemStatus | null>(null)

  const heldContents = ref<Record<string, ScrapingContentStatus>>({})

  /** True from the moment a job stops running until the screen says it has caught up. */
  const settling = ref(false)

  let stopStatus: Unsubscribe | null = null
  let stopContents: Unsubscribe | null = null

  watch(itemId, (id) => {
    stopStatus?.()
    stopContents?.()

    // Cleared rather than left behind: the previous item's numbers on this one's
    // screen would be wrong in the one way nobody would question.
    status.value = null
    contents.value = {}
    heldStatus.value = null
    heldContents.value = {}
    settling.value = false

    stopStatus = onValue(databaseRef(database, `scraping/items/${id}`), (snapshot) => {
      const now = snapshot.val() as ScrapingItemStatus | null

      if (now?.status === RUNNING) {
        heldStatus.value = now
      } else if (heldStatus.value) {
        settling.value = true
      }

      status.value = now
    })

    stopContents = onValue(databaseRef(database, `scraping/contents/${id}`), (snapshot) => {
      const now = (snapshot.val() as Record<string, ScrapingContentStatus> | null) ?? {}

      if (Object.keys(now).length) {
        heldContents.value = now
      }

      contents.value = now
    })
  }, { immediate: true })

  onScopeDispose(() => {
    stopStatus?.()
    stopContents?.()
  })

  /** Whether a job is running. What the screen watches to know one has finished. */
  const running = computed(() => status.value?.status === RUNNING)

  /** The summary to draw, or null to leave the API's answer alone. */
  const live = computed(() => {
    if (running.value) {
      return status.value
    }

    return settling.value ? heldStatus.value : null
  })

  /** The rows to draw over, empty where the API's own are the truth. */
  const rows = computed(() => {
    if (running.value) {
      return contents.value
    }

    return settling.value ? heldContents.value : {}
  })

  /** The stored rows now carry the truth, so the held values can go. */
  const reconcile = (): void => {
    settling.value = false
    heldStatus.value = null
    heldContents.value = {}
  }

  return { status, contents, running, live, rows, reconcile }
}
