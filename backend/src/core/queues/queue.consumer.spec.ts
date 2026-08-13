import { Job } from 'bullmq';
import { QueueConsumer } from './queue.consumer';
import { QueueMessage, QueueTopic, SamplePinged } from './queue.messages';

const MESSAGE: QueueMessage<SamplePinged> = {
  topic: QueueTopic.SamplePinged,
  payload: { note: 'the service started', sentBy: 'SystemManager' },
  sentAt: '2026-08-14T00:00:00.000Z',
};

/** A consumer whose handler is whatever the test needs it to be. */
class TestConsumer extends QueueConsumer<SamplePinged> {
  constructor(private readonly handler: jest.Mock) {
    super();
  }

  protected handle(message: QueueMessage<SamplePinged>): Promise<void> {
    return this.handler(message) as Promise<void>;
  }
}

/** Only the two fields the base class reads — the rest of a Job is BullMQ's. */
function job(): Job<QueueMessage<SamplePinged>> {
  return { data: MESSAGE, attemptsMade: 0 } as Job<QueueMessage<SamplePinged>>;
}

describe('QueueConsumer', () => {
  it('opens the envelope and hands the message to the handler', async () => {
    const handler = jest.fn().mockResolvedValue(undefined);

    await new TestConsumer(handler).process(job());

    expect(handler).toHaveBeenCalledWith(MESSAGE);
  });

  it('rethrows what the handler throws, so BullMQ retries rather than marking it done', async () => {
    const handler = jest.fn().mockRejectedValue(new Error('the notify failed'));

    await expect(new TestConsumer(handler).process(job())).rejects.toThrow(/the notify failed/);
  });
});
