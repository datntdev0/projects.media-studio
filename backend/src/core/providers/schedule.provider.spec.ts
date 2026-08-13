import { SchedulerRegistry } from '@nestjs/schedule';
import { ScheduleProvider } from './schedule.provider';

const NAME = 'library:publish:novel543';

/** Far enough out that nothing here fires on its own, close enough to be a real booking. */
const LATER = 60_000;

function fixture() {
  const registry = new SchedulerRegistry();

  return { registry, schedule: new ScheduleProvider(registry) };
}

/** A time `ms` from now — every case here is relative to when it runs. */
function inMs(ms: number): Date {
  return new Date(Date.now() + ms);
}

describe('ScheduleProvider', () => {
  afterEach(() => {
    // A booking left behind holds a timer, and Jest would wait on it.
    jest.useRealTimers();
  });

  it('books the task under its name', () => {
    const { schedule } = fixture();

    schedule.runAt(NAME, inMs(LATER), () => Promise.resolve());

    expect(schedule.isScheduled(NAME)).toBe(true);
    schedule.cancel(NAME);
  });

  it('refuses a time that has passed', () => {
    const { schedule } = fixture();

    expect(() => schedule.runAt(NAME, inMs(-1), () => Promise.resolve())).toThrow(/has passed/);
    expect(schedule.isScheduled(NAME)).toBe(false);
  });

  it('refuses a date it cannot read', () => {
    const { schedule } = fixture();

    expect(() => schedule.runAt(NAME, new Date('not a date'), () => Promise.resolve())).toThrow(/usable date/);
    expect(schedule.isScheduled(NAME)).toBe(false);
  });

  it('replaces the booking when the same name is scheduled again', () => {
    const { registry, schedule } = fixture();

    schedule.runAt(NAME, inMs(LATER), () => Promise.resolve());
    schedule.runAt(NAME, inMs(LATER * 2), () => Promise.resolve());

    expect(registry.getCronJobs().size).toBe(1);
    schedule.cancel(NAME);
  });

  it('cancels a booking, and says so only when there was one', () => {
    const { schedule } = fixture();

    schedule.runAt(NAME, inMs(LATER), () => Promise.resolve());

    expect(schedule.cancel(NAME)).toBe(true);
    expect(schedule.cancel(NAME)).toBe(false);
    expect(schedule.isScheduled(NAME)).toBe(false);
  });

  it('runs the task at its time, and frees the name', async () => {
    jest.useFakeTimers();
    const { schedule } = fixture();
    const task = jest.fn(() => Promise.resolve());

    schedule.runAt(NAME, inMs(LATER), task);
    // The async form, so the task's own promise settles before the assertions.
    await jest.advanceTimersByTimeAsync(LATER);

    expect(task).toHaveBeenCalledTimes(1);
    expect(schedule.isScheduled(NAME)).toBe(false);
  });

  it('survives a task that rejects', async () => {
    jest.useFakeTimers();
    const { schedule } = fixture();

    schedule.runAt(NAME, inMs(LATER), () => Promise.reject(new Error('the publish failed')));

    await expect(jest.advanceTimersByTimeAsync(LATER)).resolves.toBeUndefined();
    expect(schedule.isScheduled(NAME)).toBe(false);
  });
});
