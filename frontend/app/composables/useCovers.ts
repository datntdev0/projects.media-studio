import { deleteObject, getDownloadURL, ref as storageObject, uploadBytes } from 'firebase/storage'

/**
 * Cover images in Cloud Storage. The browser uploads directly — the API only ever
 * sees the resulting URL.
 *
 * Filed under the item, as its content is: `covers/{itemId}/…` beside
 * `content/{itemId}/…`. Everything one item stores sits under its own id, which is
 * what makes a deleted item's files findable from that id alone.
 */

/** The sentences a caller prints. Storage's own errors are codes, not prose. */
const SIGNED_OUT = 'Sign in again to upload a cover.'

const FAILED = 'Could not upload the cover image. Try again.'

export const useCovers = () => {
  const { $firebaseStorage: storage } = useNuxtApp()
  const { user } = useAuth()

  /** Uploads the picked cover and hands back the URL to store on the item. */
  async function upload(itemId: string, blob: Blob): Promise<string> {
    // Still checked, even though the uid is no longer in the path: an upload with
    // nobody behind it would be refused by the rules anyway, and this says why.
    if (!user.value?.uid) {
      throw new Error(SIGNED_OUT)
    }

    // Named at random rather than after the item: a cover replaced mid-edit must
    // not overwrite the one still in use while the save is in flight.
    const object = storageObject(storage, `covers/${itemId}/${crypto.randomUUID()}.webp`)

    try {
      await uploadBytes(object, blob, { contentType: COVER_CONTENT_TYPE })

      return await getDownloadURL(object)
    } catch {
      throw new Error(FAILED)
    }
  }

  /** Drops an orphaned cover. Quiet by design: a URL we did not upload is not ours to delete. */
  async function discard(url: string | null | undefined): Promise<void> {
    if (!url) {
      return
    }

    try {
      await deleteObject(storageObject(storage, url))
    } catch {
      // Not a URL in our bucket, or not ours to delete. Either way, leave it.
    }
  }

  return { upload, discard }
}
