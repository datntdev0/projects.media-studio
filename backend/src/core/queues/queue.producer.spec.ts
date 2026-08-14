import { getQueueToken } from '@nestjs/bullmq';
import { ModuleRef } from '@nestjs/core';
import { allConsumerQueues, QUEUE_CONSUMERS, QueueMessage, QueueTopic, SamplePinged, SAMPLE_AUDIT_QUEUE, SAMPLE_NOTIFY_QUEUE } from './queue.messages';
import { QueueProducer, QueueSendOptions } from './queue.producer';

const PAYLOAD: SamplePinged = { note: 'the service started', sentBy: 'SystemManager' };

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
function sentTo(queue: { add: jest.Mock }): QueueMessage<SamplePinged> | undefined {
  return addCalls(queue)[0]?.[1];
}

/** What the job was called — the first argument of the same call. */
function jobNameOf(queue: { add: jest.Mock }): string | undefined {
  return addCalls(queue)[0]?.[0];
}

function addCalls(queue: { add: jest.Mock }): [string, QueueMessage<SamplePinged>, QueueSendOptions | undefined][] {
  return queue.add.mock.calls as [string, QueueMessage<SamplePinged>, QueueSendOptions | undefined][];
}

/** The jobs one `addBulk` was handed, or an empty list if it was never called. */
function bulkSentTo(queue: { addBulk: jest.Mock }): { name: string; data: QueueMessage<SamplePinged>; opts?: QueueSendOptions }[] {
  return (queue.addBulk.mock.calls as [{ name: string; data: QueueMessage<SamplePinged>; opts?: QueueSendOptions }[]][])[0]?.[0] ?? [];
}

describe('QueueProducer', () => {
  it('adds the message to every queue subscribed to the topic', async () => {
    const { queue, producer } = fixture();

    await producer.send(QueueTopic.SamplePinged, PAYLOAD);

    expect(sentTo(queue(SAMPLE_AUDIT_QUEUE))?.payload).toEqual(PAYLOAD);
    expect(sentTo(queue(SAMPLE_NOTIFY_QUEUE))?.payload).toEqual(PAYLOAD);
  });

  it('sends one copy per consumer and no more', async () => {
    const { queues, producer } = fixture();

    await producer.send(QueueTopic.SamplePinged, PAYLOAD);

    const sent = [...queues.values()].filter((each) => each.add.mock.calls.length > 0);

    expect(sent).toHaveLength(QUEUE_CONSUMERS[QueueTopic.SamplePinged].length);
    sent.forEach((each) => expect(each.add).toHaveBeenCalledTimes(1));
  });

  it('stamps the envelope with the topic and when it was sent', async () => {
    const { queue, producer } = fixture();

    await producer.send(QueueTopic.SamplePinged, PAYLOAD);
    const message = sentTo(queue(SAMPLE_AUDIT_QUEUE));

    expect(message?.topic).toBe(QueueTopic.SamplePinged);
    // An instant rather than a fixed value: what matters is that it parses.
    expect(Number.isNaN(Date.parse(message?.sentAt ?? ''))).toBe(false);
  });

  it('names the job after the topic, so the queue is readable in Redis', async () => {
    const { queue, producer } = fixture();

    await producer.send(QueueTopic.SamplePinged, PAYLOAD);

    // The name alone: what follows it is the message and the per-send options, and
    // neither is what this is about.
    expect(jobNameOf(queue(SAMPLE_AUDIT_QUEUE))).toBe(QueueTopic.SamplePinged);
  });

  it('passes the caller\'s attempts through to the queue', async () => {
    const { queue, producer } = fixture();

    await producer.send(QueueTopic.SamplePinged, PAYLOAD, { attempts: 2 });

    expect(addCalls(queue(SAMPLE_AUDIT_QUEUE))[0]?.[2]).toEqual({ attempts: 2 });
  });

  it('fails the send when a queue will not take the message', async () => {
    const { queue, producer } = fixture();

    queue(SAMPLE_AUDIT_QUEUE).add.mockRejectedValue(new Error('redis is down'));

    await expect(producer.send(QueueTopic.SamplePinged, PAYLOAD)).rejects.toThrow(/redis is down/);
  });

  describe('sendMany', () => {
    const PAYLOADS: SamplePinged[] = [PAYLOAD, { note: 'and again', sentBy: 'SystemManager' }];

    it('fans every payload over every queue subscribed to the topic', async () => {
      const { queue, producer } = fixture();

      await producer.sendMany(QueueTopic.SamplePinged, PAYLOADS);

      for (const name of [SAMPLE_AUDIT_QUEUE, SAMPLE_NOTIFY_QUEUE]) {
        // One `addBulk` per queue, carrying every payload — not one call per payload.
        expect(queue(name).addBulk).toHaveBeenCalledTimes(1);
        expect(bulkSentTo(queue(name)).map((job) => job.data.payload)).toEqual(PAYLOADS);
      }
    });

    it('stamps each job with the topic as its name and its envelope', async () => {
      const { queue, producer } = fixture();

      await producer.sendMany(QueueTopic.SamplePinged, PAYLOADS);
      const [first] = bulkSentTo(queue(SAMPLE_AUDIT_QUEUE));

      expect(first?.name).toBe(QueueTopic.SamplePinged);
      expect(first?.data.topic).toBe(QueueTopic.SamplePinged);
      expect(Number.isNaN(Date.parse(first?.data.sentAt ?? ''))).toBe(false);
    });

    it('puts the caller\'s attempts on every job', async () => {
      const { queue, producer } = fixture();

      await producer.sendMany(QueueTopic.SamplePinged, PAYLOADS, { attempts: 4 });

      bulkSentTo(queue(SAMPLE_AUDIT_QUEUE)).forEach((job) => expect(job.opts).toEqual({ attempts: 4 }));
    });

    it('touches no queue when there is nothing to send', async () => {
      const { queues, producer } = fixture();

      await producer.sendMany(QueueTopic.SamplePinged, []);

      [...queues.values()].forEach((each) => expect(each.addBulk).not.toHaveBeenCalled());
    });

    it('fails the send when a queue will not take the batch', async () => {
      const { queue, producer } = fixture();

      queue(SAMPLE_NOTIFY_QUEUE).addBulk.mockRejectedValue(new Error('redis is down'));

      await expect(producer.sendMany(QueueTopic.SamplePinged, PAYLOADS)).rejects.toThrow(/redis is down/);
    });
  });
});
