import { ScrapingJobStatus } from "../entities/scraping-job.entity";

export const MAX_ID = 128;

export const MAX_RANGE = 1024;

export const MAX_RETRIES = 3;

export const MAX_PAGE_SIZE = 100;

export const DEFAULT_PAGE_SIZE = 20;

export const REQUESTABLE_JOB_STATUSES = [ScrapingJobStatus.Queued, ScrapingJobStatus.Paused, ScrapingJobStatus.Stopped];
