import { fullChaptersOf, submittedChaptersOf, workSubSteps, type WorkspaceStepContext, type WorkspaceStepHandler, type WorkspaceStepOutcome } from '@/main/helpers/workspace-step';
import { logger } from '@/main/helpers/logger';
import { runSpeechBatch, startSpeechBatch, type SpeechJob } from '@/main/helpers/speech-cli';
import { WorkspaceStepKey, type AppWorkspace } from '@/shared/app-workspace';
import { chapterAudioFile, hasChapterAudio, isChapterReady, requireNarrationSource } from './narration-speech';

/** The chapter's text as it is on disk, paired with the .wav to write — what `speech.py` is handed for it. */
function jobOf(workspace: AppWorkspace, chapterNo: number): SpeechJob {
  return { source: requireNarrationSource(workspace, chapterNo), target: chapterAudioFile(workspace, chapterNo) };
}

/**
 * Reads every chapter of the run that has text but no audio yet, in one batch so
 * the model loads once rather than once per chapter, then works the sub-steps in
 * order by waiting for each chapter's result as the script reports it. A chapter
 * that already has audio in this voice and pace is skipped — delete its .wav to read it afresh — and one
 * with nothing to read fails. A retry, which the batch has already answered for,
 * reads that chapter on its own.
 */
async function narrateChapters(context: WorkspaceStepContext): Promise<WorkspaceStepOutcome> {
  const { ws } = context;
  const chapters = submittedChaptersOf(context);
  const jobs: SpeechJob[] = [];
  const indexOf = new Map<number, number>();
  for (const chapterNo of chapters) {
    if (hasChapterAudio(ws, chapterNo) || !isChapterReady(ws, chapterNo)) continue;
    indexOf.set(chapterNo, jobs.length);
    jobs.push(jobOf(ws, chapterNo));
  }

  const batch = jobs.length > 0 ? startSpeechBatch(jobs, ws.speech) : undefined;
  try {
    return await workSubSteps(context, chapters, async (chapterNo) => {
      if (hasChapterAudio(ws, chapterNo)) {
        logger.debug(`[speech] chapter ${chapterNo} already has audio — skipped`);
        return;
      }
      const index = indexOf.get(chapterNo);
      if (batch && index !== undefined) {
        indexOf.delete(chapterNo);
        await batch.result(index);
        return;
      }
      await runSpeechBatch([jobOf(ws, chapterNo)], ws.speech);
    });
  } finally {
    batch?.close();
  }
}

/** Step 03 — turns each chapter's text into a .wav and a line-level .srt with `speech.py`. */
export const narrationSpeechHandler: WorkspaceStepHandler = {
  key: WorkspaceStepKey.NarrationSpeech,
  totalCount: (context) => fullChaptersOf(context),
  subStepsOf: (context) => submittedChaptersOf(context),
  run: narrateChapters,
};
