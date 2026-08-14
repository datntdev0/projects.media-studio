import { Injectable, NotImplementedException } from '@nestjs/common';
import { ScrapingJobDto, ScrapingJobStartedDto } from './dto/scraping-job.dto';

/**
 * Work that outlives the request.
 *
 * A manager of its own rather than two more methods on `ScrapingManager`: that one
 * reads a source and caches the answer, and this one selects rows, marks them and
 * hands them to the queue.
 */
@Injectable()
export class ScrapingJobManager {
  start(input: ScrapingJobDto): Promise<ScrapingJobStartedDto> {
    throw new NotImplementedException(`Scraping \`${input.libraryId}\` is not wired to the queue yet`);
  }
}
