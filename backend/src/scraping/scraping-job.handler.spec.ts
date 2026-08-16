// The manager this consumer injects reaches the Admin SDK, where `firebase-admin/auth`
// pulls in an ESM-only dependency Jest cannot require. Nothing here talks to Firebase.
jest.mock('firebase-admin/auth', () => ({}));

import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QueueMessage, QueueTopic, ScrapingJobRequested } from '../core/queues/queue.messages';
import { LibraryItemType } from '../library/entities/library-item.entity';
import { ScrapingJob, ScrapingJobStatus } from './entities/scraping-job.entity';
import { ScrapingJobPublishConsumer } from './scraping-job.handler';
import { ScrapingJobManager } from './scraping-job.manager';
import { ScrapingJobRepository } from './scraping-job.repository';

const NOW = '2026-08-11T09:12:04.113Z';

const PAYLOAD: ScrapingJobRequested = { jobId: 'job-1' };

function record(status: ScrapingJobStatus): ScrapingJob {
  return {
    id: 'job-1',
    libraryId: 'novel-1',
    libraryType: LibraryItemType.Novel,
    libraryTitle: 'The Silent Cartographer',
    crawler: 'novel543',
    status,
    range: 'all',
    refetch: false,
    retry: 3,
    startAt: null,
    queuedAt: null,
    completedAt: null,
    total: 3,
    completed: 0,
    failed: 0,
    skipped: 0,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function fixture(job: ScrapingJob | null = record(ScrapingJobStatus.Queued)) {
  const manager = { publish: jest.fn().mockResolvedValue(undefined) };
  const jobs = { findById: jest.fn().mockResolvedValue(job) };
  const consumer = new ScrapingJobPublishConsumer(manager as unknown as ScrapingJobManager, jobs as unknown as ScrapingJobRepository);

  return { consumer, manager, jobs };
}

function message(): Job<QueueMessage<ScrapingJobRequested>> {
  const data: QueueMessage<ScrapingJobRequested> = { topic: QueueTopic.ScrapingJobRequested, payload: PAYLOAD, sentAt: NOW };

  return { data, attemptsMade: 0 } as Job<QueueMessage<ScrapingJobRequested>>;
}

describe('ScrapingJobPublishConsumer', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'debug').mockImplementation();
  });

  afterEach(() => jest.restoreAllMocks());

  it('hands the record the message named to the manager', async () => {
    const { consumer, manager, jobs } = fixture();

    await consumer.process(message());

    expect(jobs.findById).toHaveBeenCalledWith('job-1');
    expect(manager.publish).toHaveBeenCalledWith(record(ScrapingJobStatus.Queued));
  });

  it('is quiet about a job deleted between the send and the delivery', async () => {
    const { consumer, manager } = fixture(null);

    await expect(consumer.process(message())).resolves.toBeUndefined();
    expect(manager.publish).not.toHaveBeenCalled();
  });

  it.each([ScrapingJobStatus.Paused, ScrapingJobStatus.Stopped, ScrapingJobStatus.Completed])('publishes nothing of a %s job', async (status) => {
    const { consumer, manager } = fixture(record(status));

    await consumer.process(message());

    expect(manager.publish).not.toHaveBeenCalled();
  });
});
