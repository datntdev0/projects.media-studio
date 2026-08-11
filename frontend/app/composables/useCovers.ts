import { deleteObject, getDownloadURL, ref as storageObject, uploadBytes } from 'firebase/storage'

/**
 * Cover images in Cloud Storage. The browser uploads directly — the API only ever
 * sees the resulting URL. The path starts with the uploader's uid because that is
 * the ownership check `storage.rules` makes.
 */

/** The sentences a caller prints. Storage's own errors are codes, not prose. */
const SIGNED_OUT = 'Sign in again to upload a cover.'

const FAILED = 'Could not upload the cover image. Try again.'

export const useCovers = () => {
  const { $firebaseStorage: storage } = useNuxtApp()
  const { user } = useAuth()

  /** Uploads the picked cover and hands back the URL to store on the item. */
  async function upload(blob: Blob): Promise<string> {
    const uid = user.value?.uid

    if (!uid) {
      throw new Error(SIGNED_OUT)
    }

    // Named at random rather than after the item: the item may not exist yet,
    // and a cover replaced mid-edit must not overwrite the one still in use.
    const object = storageObject(storage, `covers/${uid}/${crypto.randomUUID()}.webp`)

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
