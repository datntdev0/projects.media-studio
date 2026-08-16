// The scheduler injects the manager, which reaches the Admin SDK — where
// `firebase-admin/auth` pulls in an ESM-only dependency Jest cannot require. Nothing
// here talks to Firebase, so an empty module is enough.
jest.mock('firebase-admin/auth', () => ({}));

import { ScrapingJobManager } from './scraping-job.manager';
import { ScrapingJobScheduler } from './scraping-job.scheduler';

function fixture() {
  const jobs = { runDueToScheduledJobs: jest.fn().mockResolvedValue(undefined), sweep: jest.fn().mockResolvedValue(undefined) };
  const scheduler = new ScrapingJobScheduler(jobs as unknown as ScrapingJobManager);

  return { scheduler, jobs };
}

describe('ScrapingJobScheduler', () => {
  it('asks the manager for what is due', async () => {
    const { scheduler, jobs } = fixture();

    await scheduler.tick();

    expect(jobs.runDueToScheduledJobs).toHaveBeenCalled();
    expect(jobs.sweep).toHaveBeenCalled();
  });

  it('swallows what a tick throws, so the next one still runs', async () => {
    const { scheduler, jobs } = fixture();

    jobs.runDueToScheduledJobs.mockRejectedValue(new Error('Firestore is unreachable'));

    // Nothing awaits a tick: a rejection left alone is an unhandled one, and in Node
    // that is the whole process.
    await expect(scheduler.tick()).resolves.toBeUndefined();

    jobs.runDueToScheduledJobs.mockResolvedValue(undefined);
    await scheduler.tick();

    expect(jobs.runDueToScheduledJobs).toHaveBeenCalledTimes(2);
  });
});
