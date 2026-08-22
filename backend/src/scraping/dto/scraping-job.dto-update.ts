import { ApiProperty } from "@nestjs/swagger";
import { IsIn } from "class-validator";
import { ScrapingJobStatus } from "../entities/scraping-job.entity";
import { REQUESTABLE_JOB_STATUSES } from "./scraping-job.constants";

/** The one field a client may move on a job. The other thirteen are the server's. */
export class UpdateScrapingJobStatusDto {
  @ApiProperty({ description: 'Where to take the job. A status it cannot reach from where it stands is a 400.', enum: REQUESTABLE_JOB_STATUSES })
  @IsIn(REQUESTABLE_JOB_STATUSES)
  status!: ScrapingJobStatus;
}