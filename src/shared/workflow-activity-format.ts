// Pure helpers over an activity's chapter selection — shared by the main
// process (recording run history) and the renderer (the canvas builder),
// since neither depends on process-specific APIs.

import { ActivityChapterScope, AppWorkflowActivityType, type AppWorkflowActivity, type ChapterSelection } from './app-workflow-activity';
import { ContentLanguage } from './app-library-content';

/** The voices the worker's TTS engine (see src/worker/app/tts.py) actually serves — the single source of truth the Tts activity's config is validated against, both for the Input tab's picker and before a run is sent to the worker. */
export const VOICES = ['Mỹ Duyên', 'Ngọc Huyền'];
export const PACES = ['0.85×', '1.0×', '1.2×'];

/** Export Video only ever narrates from Vietnamese narration (see src/worker/app/export.py, which reads chapters from the `tts/vietnamese/` folder) — there is no language picker for it. */
export const EXPORT_VIDEO_LANGUAGE = ContentLanguage.Vietnamese;

/** The `chapters` selection, for every type except Profiles (which has none). */
export function chaptersOf(activity: AppWorkflowActivity): ChapterSelection | undefined {
  switch (activity.type) {
    case AppWorkflowActivityType.Analyze:
      return activity.analyzeConfig!.chapters;
    case AppWorkflowActivityType.Translate:
      return activity.translateConfig!.chapters;
    case AppWorkflowActivityType.Storyboard:
      return activity.storyboardConfig!.chapters;
    case AppWorkflowActivityType.Tts:
      return activity.ttsConfig!.chapters;
    case AppWorkflowActivityType.ExportVideo:
      return activity.exportVideoConfig!.chapters;
    case AppWorkflowActivityType.Profiles:
      return undefined;
  }
}

export function rangeSummary(chapters: ChapterSelection): string {
  if (chapters.scope === ActivityChapterScope.All) return 'All chapters';
  if (chapters.scope === ActivityChapterScope.Missing) return 'Missing output';
  if (chapters.scope === ActivityChapterScope.Range) return `Ch. ${chapters.rangeFrom}–${chapters.rangeTo}`;
  return `${chapters.pickedContentIds.length} chapter${chapters.pickedContentIds.length === 1 ? '' : 's'} picked`;
}

/** The short range description recorded against a run's history entry for this activity, if it operates on chapters at all. */
export function activityRangeSummary(activity: AppWorkflowActivity): string | null {
  const chapters = chaptersOf(activity);
  return chapters ? rangeSummary(chapters) : null;
}
