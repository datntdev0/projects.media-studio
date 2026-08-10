import { ApiPropertyOptional, IntersectionType } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { LibraryItemStatus } from '../entities/library-item.entity';
import { CreateLibraryItemDto } from './create-library-item.dto';

/**
 * The statuses a person owns. `scraping` and `failed` are the job runner's, and
 * part 1 has no runner — a request for either is refused rather than honoured
 * into a state nothing can produce.
 */
export const WRITABLE_STATUSES = [LibraryItemStatus.Draft, LibraryItemStatus.Ready];

/** The one field an update adds to a creation body. */
class WritableStatusDto {
  @ApiPropertyOptional({ description: 'Defaults to `draft` when left out, like every other omitted field.', enum: WRITABLE_STATUSES, enumName: 'WritableLibraryItemStatus' })
  @IsOptional()
  @IsIn(WRITABLE_STATUSES)
  status?: LibraryItemStatus;
}

/**
 * The item's whole writable representation, which is why the route is a `PUT`:
 * **an omitted optional field is cleared**, not left alone. With `PATCH` an absent
 * key and an intentional erasure would look identical, and clearing an author or
 * a cover has to be expressible.
 *
 * Because it is a whole representation it may carry `type` and `sourceMode`, so a
 * client that reads, edits and writes back needs no special handling. Both are
 * immutable, so a value that differs from the stored one is a `400` rather than a
 * silent no-op.
 */
export class UpdateLibraryItemDto extends IntersectionType(CreateLibraryItemDto, WritableStatusDto) {}
