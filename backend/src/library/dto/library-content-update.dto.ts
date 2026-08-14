import { CreateLibraryContentDto } from './library-content-create.dto';

/**
 * The row's whole writable representation, which is why the route is a `PUT`:
 * **an omitted optional field is cleared**, not left alone. Clearing a chapter's
 * `contentUrl` — a reset back to a placeholder — has to be expressible, and with
 * `PATCH` an absent key and an intentional erasure would look identical.
 *
 * Nothing to add to the creation body: `type` is the parent's and `status`
 * follows from `contentUrl`, so neither was ever a client's to send. The one
 * field that does not clear is `index`, because a chapter has no "no number"
 * state — see `LibraryContentManager`.
 */
export class UpdateLibraryContentDto extends CreateLibraryContentDto {}
