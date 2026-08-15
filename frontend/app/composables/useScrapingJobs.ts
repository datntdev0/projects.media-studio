import { onValue, ref as databaseRef } from 'firebase/database'
import type { RunningJob } from '~/types/scraping-status'

/**
 * Every running job, live. One subscription serves all three screens that watch work.
 *
 * The backend writes these nodes beside the Firestore writes they mirror, so a job
 * that takes hours is visible while it runs rather than only after a refresh.
 *
 * **A node is trusted only while its job has not settled.** A settled one is ignored in
 * favour of what the API answered, which is what makes the minute before the sweep
 * harmless.
 *
 * With one exception, and it is the whole reason `reconcile()` exists. A job's last act
 * moves its node to `completed` — before the screen's refetch has landed. Dropping the
 * overlay at that instant would blink every row back to the status it was *fetched*
 * with and the counters back to the numbers they had before the job started, for as
 * long as a round trip takes. So the last published values are held across the gap, and
 * the screen calls `reconcile()` once the stored rows have caught up.
 */

/**
 * The three states a job is under way in — what the Active tab lists.
 *
 * `scheduled` is deliberately not one of them. A booked job has a node from the moment
 * it is recorded, and it must not make its item read **Scraping** hours before the cron
 * publishes it: nothing is being fetched, and the library is untouched until then.
 */
const ACTIVE = ['queued', 'running', 'paused']

const isRunning = (job: RunningJob): boolean => ACTIVE.includes(job.status)

export function useScrapingJobs() {
  const { $firebaseDatabase: database } = useNuxtApp()

  const jobs = ref<Record<string, RunningJob>>({})

  /** The last node each unsettled job published, kept until the refetch has landed. */
  const held = ref<Record<string, RunningJob>>({})

  const stop = onValue(databaseRef(database, 'scrapings/runningJobs'), (snapshot) => {
    const now = (snapshot.val() as Record<string, RunningJob> | null) ?? {}

    for (const [id, job] of Object.entries(now)) {
      if (isRunning(job)) {
        held.value[id] = job
      }
    }

    jobs.value = now
  })

  onScopeDispose(stop)

  /** The node to believe for a job, or null once the API's answer is the truer one. */
  const believed = (id: string): RunningJob | null => {
    const job = jobs.value[id]

    return job && isRunning(job) ? job : (held.value[id] ?? null)
  }

  /**
   * The running job for an item, or null — what the Library screens overlay from.
   *
   * An item with two overlapping jobs takes the first one found. That was already the
   * behaviour; it is now visible on the Scrapings screen as the two rows it actually is.
   */
  const forLibrary = (libraryId: string): RunningJob | null => {
    const ids = new Set([...Object.keys(jobs.value), ...Object.keys(held.value)])

    for (const id of ids) {
      const job = believed(id)

      if (job?.library?.id === libraryId) {
        return job
      }
    }

    return null
  }

  /**
   * Whether a watched job has settled since the last `reconcile()`.
   *
   * A node that is simply gone counts: the sweep takes a settled job a minute later,
   * and a screen that missed the transition still owes itself a refetch.
   */
  const settled = computed(() => Object.keys(held.value).some((id) => {
    const job = jobs.value[id]

    return !job || !isRunning(job)
  }))

  /** The stored rows now carry the truth, so the held values can go. */
  const reconcile = (): void => {
    held.value = {}
  }

  return { jobs, forLibrary, settled, reconcile }
}
