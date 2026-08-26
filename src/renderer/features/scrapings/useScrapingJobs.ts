import { useCallback, useEffect, useState } from 'react';
import { ScrapingJobStatus, type ListScrapingJobsFilter, type ScrapingJob, type ScrapingJobState } from '../../../shared/app-scraping';
import type { AppLibraryType } from '../../../shared/app-library';

const ACTIVE_STATUSES = new Set([ScrapingJobStatus.Scheduled, ScrapingJobStatus.Queued, ScrapingJobStatus.Running]);
const POLL_MS = 2000;

export interface UseScrapingJobsResult {
  jobs: ScrapingJob[];
  loading: boolean;
  error: string | undefined;
  refresh(): Promise<void>;
  removeJob(id: string): Promise<void>;
  setJobStatus(id: string, status: ScrapingJobStatus): Promise<void>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Lists jobs matching the filter, and polls while any of them is still going — this app has no realtime push, so progress is read back on a timer. */
export function useScrapingJobs(state?: ScrapingJobState, libraryType?: AppLibraryType, libraryId?: string): UseScrapingJobsResult {
  const [jobs, setJobs] = useState<ScrapingJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);

  const load = useCallback(async () => {
    const filter: ListScrapingJobsFilter = { state, libraryType, libraryId };
    try {
      const list = await window.appScrapingApi.listJobs(filter);
      setJobs(list);
      setError(undefined);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [state, libraryType, libraryId]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  useEffect(() => {
    if (!jobs.some((job) => ACTIVE_STATUSES.has(job.status))) return;
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [jobs, load]);

  const removeJob = useCallback(
    async (id: string) => {
      await window.appScrapingApi.removeJob(id);
      await load();
    },
    [load],
  );

  const setJobStatus = useCallback(
    async (id: string, status: ScrapingJobStatus) => {
      await window.appScrapingApi.updateJobStatus(id, status);
      await load();
    },
    [load],
  );

  return { jobs, loading, error, refresh: load, removeJob, setJobStatus };
}
