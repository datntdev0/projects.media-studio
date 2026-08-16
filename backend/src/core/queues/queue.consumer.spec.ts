import { Job } from 'bullmq';
import { QueueConsumer } from './queue.consumer';
import { ScrapingContentRequested, QueueMessage, QueueTopic } from './queue.messages';

const MESSAGE: QueueMessage<ScrapingContentRequested> = {
  topic: QueueTopic.ScrapingContentRequested,
  payload: { jobId: 'job-1', itemId: 'item-1', contentId: 'chapter-1', crawler: 'truyenfull', sourceUrl: 'https://example.test/1', refetch: false, retry: 0 },
  sentAt: '2026-08-14T00:00:00.000Z',
};

/** A consumer whose handler is whatever the test needs it to be. */
class TestConsumer extends QueueConsumer<ScrapingContentRequested> {
  constructor(private readonly handler: jest.Mock) {
    super();
  }

  protected handle(message: QueueMessage<ScrapingContentRequested>): Promise<void> {
    return this.handler(message) as Promise<void>;
  }
}

/** Only the two fields the base class reads — the rest of a Job is BullMQ's. */
function job(): Job<QueueMessage<ScrapingContentRequested>> {
  return { data: MESSAGE, attemptsMade: 0 } as Job<QueueMessage<ScrapingContentRequested>>;
}

describe('QueueConsumer', () => {
  it('opens the envelope and hands the message to the handler', async () => {
    const handler = jest.fn().mockResolvedValue(undefined);

    await new TestConsumer(handler).process(job());

    expect(handler).toHaveBeenCalledWith(MESSAGE);
  });

  it('rethrows what the handler throws, so BullMQ retries rather than marking it done', async () => {
    const handler = jest.fn().mockRejectedValue(new Error('the chapter could not be read'));

    await expect(new TestConsumer(handler).process(job())).rejects.toThrow(/the chapter could not be read/);
  });
});
