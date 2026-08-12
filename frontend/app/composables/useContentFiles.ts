import { deleteObject, getDownloadURL, ref as storageObject, uploadBytes } from 'firebase/storage'

/**
 * The bytes a library item holds, in Cloud Storage. The browser uploads directly —
 * the API only ever sees the resulting URL, the same bargain `useCovers.ts` makes
 * for a cover, and the reason a 200 MB clip never enters the API process.
 *
 * The path starts with the uploader's uid because that is the ownership check
 * `storage.rules` makes.
 */

/** The sentences a caller prints. Storage's own errors are codes, not prose. */
const SIGNED_OUT = 'Sign in again to upload.'

const UPLOAD_FAILED = 'Could not upload the file. Try again.'

const READ_FAILED = 'Could not load the stored text.'

/** A chapter is written as UTF-8 text, which is what `storage.rules` admits it as. */
const TEXT_CONTENT_TYPE = 'text/plain; charset=utf-8'

export const useContentFiles = () => {
  const { $firebaseStorage: storage } = useNuxtApp()
  const { user } = useAuth()

  /** Uploads a picked image or clip as it is, and hands back the URL to store on the row. */
  function uploadAsset(file: File): Promise<string> {
    return upload(file, file.type || 'application/octet-stream', extensionOf(file.name))
  }

  /** Uploads a chapter body. The row keeps the URL; the words stay out of Firestore. */
  function uploadText(text: string): Promise<string> {
    return upload(new Blob([text], { type: TEXT_CONTENT_TYPE }), TEXT_CONTENT_TYPE, '.txt')
  }

  /**
   * The stored text back again. A plain `fetch` of the download URL — the token in
   * it is what authorises the read, exactly as it does for a cover drawn in an
   * `<img>`.
   */
  async function readText(url: string): Promise<string> {
    const response = await fetch(url).catch(() => null)

    if (!response?.ok) {
      throw new Error(READ_FAILED)
    }

    return response.text()
  }

  /** Drops an object we replaced or deleted. Quiet: a URL we did not upload is not ours to delete. */
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

  async function upload(body: Blob, contentType: string, extension: string): Promise<string> {
    const uid = user.value?.uid

    if (!uid) {
      throw new Error(SIGNED_OUT)
    }

    // Named at random rather than after the row: the row may not exist yet, and a
    // body replaced mid-edit must not overwrite the one still being read.
    const object = storageObject(storage, `content/${uid}/${crypto.randomUUID()}${extension}`)

    try {
      await uploadBytes(object, body, { contentType })

      return await getDownloadURL(object)
    } catch {
      throw new Error(UPLOAD_FAILED)
    }
  }

  return { uploadAsset, uploadText, readText, discard }
}

/** Kept on the stored object so a downloaded file still opens in the right thing. */
function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.')

  return dot > 0 ? filename.slice(dot).toLowerCase() : ''
}
