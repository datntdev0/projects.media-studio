import { getQueueToken } from '@nestjs/bullmq';
import { ModuleRef } from '@nestjs/core';
import { allConsumerQueues, SCRAPING_CONTENT_QUEUE, ScrapingContentRequested, QUEUE_CONSUMERS, QueueMessage, QueueTopic } from './queue.messages';
import { QueueProducer, QueueSendOptions } from './queue.producer';

const TOPIC = QueueTopic.ScrapingContentRequested;

const PAYLOAD: ScrapingContentRequested = { jobId: 'job-1', itemId: 'item-1', contentId: 'chapter-1', crawler: 'truyenfull', sourceUrl: 'https://example.test/1', refetch: false, retry: 0 };

/**
 * A container holding one stub queue per registered name, resolved the way the
 * producer resolves the real ones — by token, so a change of token shows up here.
 *
 * Every queue exists up front rather than on first use, so a test can rig one
 * before the send and so an unused queue is a queue with no calls rather than a
 * missing entry.
 */
function fixture() {
  const stub = () => ({ add: jest.fn().mockResolvedValue(undefined), addBulk: jest.fn().mockResolvedValue(undefined) });
  const queues = new Map(allConsumerQueues().map((name) => [getQueueToken(name), stub()]));
  const moduleRef = {
    get: (token: string) => {
      const queue = queues.get(token);

      if (!queue) {
        throw new Error(`Nothing registered under ${token}`);
      }

      return queue;
    },
  } as unknown as ModuleRef;

  return { queue: (name: string) => queues.get(getQueueToken(name))!, queues, producer: new QueueProducer(moduleRef) };
}

/** What the queue was handed, or undefined if it was not used. `add(jobName, message)`. */
function sentTo(queue: { add: jest.Mock }): QueueMessage<ScrapingContentRequested> | undefined {
  return addCalls(queue)[0]?.[1];
}

/** What the job was called — the first argument of the same call. */
function jobNameOf(queue: { add: jest.Mock }): string | undefined {
  return addCalls(queue)[0]?.[0];
}

function addCalls(queue: { add: jest.Mock }): [string, QueueMessage<ScrapingContentRequested>, QueueSendOptions | undefined][] {
  return queue.add.mock.calls as [string, QueueMessage<ScrapingContentRequested>, QueueSendOptions | undefined][];
}

/** The jobs one `addBulk` was handed, or an empty list if it was never called. */
function bulkSentTo(queue: { addBulk: jest.Mock }): { name: string; data: QueueMessage<ScrapingContentRequested>; opts?: QueueSendOptions }[] {
  return (queue.addBulk.mock.calls as [{ name: string; data: QueueMessage<ScrapingContentRequested>; opts?: QueueSendOptions }[]][])[0]?.[0] ?? [];
}

describe('QueueProducer', () => {
  it('adds the message to every queue subscribed to the topic', async () => {
    const { queue, producer } = fixture();

    await producer.send(TOPIC, PAYLOAD);

    // Read from the registry rather than named here: a second consumer of this
    // topic is then covered by the test that already exists.
    QUEUE_CONSUMERS[TOPIC].forEach((name) => expect(sentTo(queue(name))?.payload).toEqual(PAYLOAD));
  });

  it('sends one copy per consumer and no more', async () => {
    const { queues, producer } = fixture();

    await producer.send(TOPIC, PAYLOAD);

    const sent = [...queues.values()].filter((each) => each.add.mock.calls.length > 0);

    expect(sent).toHaveLength(QUEUE_CONSUMERS[TOPIC].length);
    sent.forEach((each) => expect(each.add).toHaveBeenCalledTimes(1));
  });

  it('stamps the envelope with the topic and when it was sent', async () => {
    const { queue, producer } = fixture();

    await producer.send(TOPIC, PAYLOAD);
    const message = sentTo(queue(SCRAPING_CONTENT_QUEUE));

    expect(message?.topic).toBe(TOPIC);
    // An instant rather than a fixed value: what matters is that it parses.
    expect(Number.isNaN(Date.parse(message?.sentAt ?? ''))).toBe(false);
  });

  it('names the job after the topic, so the queue is readable in Redis', async () => {
    const { queue, producer } = fixture();

    await producer.send(TOPIC, PAYLOAD);

    // The name alone: what follows it is the message and the per-send options, and
    // neither is what this is about.
    expect(jobNameOf(queue(SCRAPING_CONTENT_QUEUE))).toBe(TOPIC);
  });

  it('passes the caller\'s attempts through to the queue', async () => {
    const { queue, producer } = fixture();

    await producer.send(TOPIC, PAYLOAD, { attempts: 2 });

    expect(addCalls(queue(SCRAPING_CONTENT_QUEUE))[0]?.[2]).toEqual({ attempts: 2 });
  });

  it('fails the send when a queue will not take the message', async () => {
    const { queue, producer } = fixture();

    queue(SCRAPING_CONTENT_QUEUE).add.mockRejectedValue(new Error('redis is down'));

    await expect(producer.send(TOPIC, PAYLOAD)).rejects.toThrow(/redis is down/);
  });

  describe('sendMany', () => {
    const PAYLOADS: ScrapingContentRequested[] = [PAYLOAD, { ...PAYLOAD, contentId: 'chapter-2', sourceUrl: 'https://example.test/2' }];

    it('fans every payload over every queue subscribed to the topic', async () => {
      const { queue, producer } = fixture();

      await producer.sendMany(TOPIC, PAYLOADS);

      for (const name of QUEUE_CONSUMERS[TOPIC]) {
        // One `addBulk` per queue, carrying every payload — not one call per payload.
        expect(queue(name).addBulk).toHaveBeenCalledTimes(1);
        expect(bulkSentTo(queue(name)).map((job) => job.data.payload)).toEqual(PAYLOADS);
      }
    });

    it('stamps each job with the topic as its name and its envelope', async () => {
      const { queue, producer } = fixture();

      await producer.sendMany(TOPIC, PAYLOADS);
      const [first] = bulkSentTo(queue(SCRAPING_CONTENT_QUEUE));

      expect(first?.name).toBe(TOPIC);
      expect(first?.data.topic).toBe(TOPIC);
      expect(Number.isNaN(Date.parse(first?.data.sentAt ?? ''))).toBe(false);
    });

    it('puts the caller\'s attempts on every job', async () => {
      const { queue, producer } = fixture();

      await producer.sendMany(TOPIC, PAYLOADS, { attempts: 4 });

      bulkSentTo(queue(SCRAPING_CONTENT_QUEUE)).forEach((job) => expect(job.opts).toEqual({ attempts: 4 }));
    });

    it('touches no queue when there is nothing to send', async () => {
      const { queues, producer } = fixture();

      await producer.sendMany(TOPIC, []);

      [...queues.values()].forEach((each) => expect(each.addBulk).not.toHaveBeenCalled());
    });

    it('fails the send when a queue will not take the batch', async () => {
      const { queue, producer } = fixture();

      queue(SCRAPING_CONTENT_QUEUE).addBulk.mockRejectedValue(new Error('redis is down'));

      await expect(producer.sendMany(TOPIC, PAYLOADS)).rejects.toThrow(/redis is down/);
    });
  });
});
