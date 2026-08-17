import { deleteObject, getDownloadURL, ref as storageObject, uploadBytesResumable } from 'firebase/storage'

/**
 * The `.zip` an item packs into, in Cloud Storage. Filed under the item, as its
 * content and its cover are: `packages/{itemId}/…` — so an item's whole footprint is
 * one prefix per shelf, findable from its id alone.
 *
 * Both directions go around the API, which is the bargain `useContentFiles` states:
 * the bytes never enter the API process, and what travels over HTTP is the URL. That
 * is also what buys the mockup's upload bar — `uploadBytesResumable` reports progress,
 * and a multipart POST to the API would not.
 */

/** The sentences a caller prints. Storage's own errors are codes, not prose. */
const SIGNED_OUT = 'Sign in again to upload a package.'

const UPLOAD_FAILED = 'Could not upload the package. Try again.'

/** What `storage.rules` admits a package as. */
const ZIP_CONTENT_TYPE = 'application/zip'

export const useLibraryPackages = () => {
  const { $firebaseStorage: storage } = useNuxtApp()
  const { user } = useAuth()

  /** Uploads a picked package, reporting 0–100 as it goes, and hands back its URL. */
  async function upload(itemId: string, file: File, onProgress: (percent: number) => void): Promise<string> {
    // Still checked, even though the uid is not in the path: an upload with nobody
    // behind it would be refused by the rules anyway, and this says why.
    if (!user.value?.uid) {
      throw new Error(SIGNED_OUT)
    }

    // Named at random, for `useContentFiles`' reason: two people importing into one
    // item must not overwrite each other's upload mid-transfer.
    const object = storageObject(storage, `packages/${itemId}/${crypto.randomUUID()}.zip`)
    const task = uploadBytesResumable(object, file, { contentType: ZIP_CONTENT_TYPE })

    task.on('state_changed', snapshot => onProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)))

    try {
      await task

      return await getDownloadURL(object)
    } catch {
      throw new Error(UPLOAD_FAILED)
    }
  }

  /** Drops a package nothing will read — an abandoned upload, or one that failed validation. */
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

  /**
   * Hands the browser an export to save.
   *
   * A navigation and nothing more: the object carries its own `Content-Disposition`,
   * so the file lands under the name the server chose without fetching it into a Blob
   * first — which on a large package would mean holding the whole thing in a tab.
   */
  function download(url: string): void {
    window.location.assign(url)
  }

  return { upload, discard, download }
}
