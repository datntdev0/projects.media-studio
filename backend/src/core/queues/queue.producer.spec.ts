import { getQueueToken } from '@nestjs/bullmq';
import { ModuleRef } from '@nestjs/core';
import { allConsumerQueues, QUEUE_CONSUMERS, QueueMessage, QueueTopic, SamplePinged, SAMPLE_AUDIT_QUEUE, SAMPLE_NOTIFY_QUEUE } from './queue.messages';
import { QueueProducer } from './queue.producer';

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
  const queues = new Map(allConsumerQueues().map((name) => [getQueueToken(name), { add: jest.fn().mockResolvedValue(undefined) }]));
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
  const calls = queue.add.mock.calls as [string, QueueMessage<SamplePinged>][];

  return calls[0]?.[1];
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

    expect(queue(SAMPLE_AUDIT_QUEUE).add).toHaveBeenCalledWith(QueueTopic.SamplePinged, expect.anything());
  });

  it('fails the send when a queue will not take the message', async () => {
    const { queue, producer } = fixture();

    queue(SAMPLE_AUDIT_QUEUE).add.mockRejectedValue(new Error('redis is down'));

    await expect(producer.send(QueueTopic.SamplePinged, PAYLOAD)).rejects.toThrow(/redis is down/);
  });
});
