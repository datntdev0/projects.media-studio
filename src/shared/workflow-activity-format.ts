// Pure helpers over an activity's chapter selection — shared by the main
// process (recording run history) and the renderer (the canvas builder),
// since neither depends on process-specific APIs.

import { ActivityChapterScope, AppWorkflowActivityType, type AppWorkflowActivity, type ChapterSelection } from './app-workflow-activity';

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
