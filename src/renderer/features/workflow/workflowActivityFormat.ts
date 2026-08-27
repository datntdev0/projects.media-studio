import { AppLibraryType } from '../../../shared/app-library';
import { ContentLanguage } from '../../../shared/app-library-content';
import {
  ActivityChapterScope,
  AppWorkflowActivityType,
  type AnalyzeConfig,
  type AppWorkflowActivity,
  type AppWorkflowActivityConfig,
  type ChapterSelection,
  type ProfilesConfig,
  type StoryboardConfig,
  type TranslateConfig,
  type TtsConfig,
} from '../../../shared/app-workflow-activity';
import { chaptersOf, rangeSummary } from '../../../shared/workflow-activity-format';

export { chaptersOf };

export interface ActivityTypeMeta {
  code: string;
  label: string;
  hint: string;
}

export const ACTIVITY_TYPE_META: Record<AppWorkflowActivityType, ActivityTypeMeta> = {
  [AppWorkflowActivityType.Analyze]: { code: 'SA', label: 'Semantic Analyze', hint: 'Builds the world bible — characters, glossary and timeline.' },
  [AppWorkflowActivityType.Translate]: { code: 'CT', label: 'Contextual Translation', hint: 'Translates chapters using the world bible as a glossary.' },
  [AppWorkflowActivityType.Profiles]: { code: 'CP', label: 'Character Profiles', hint: 'Turnaround art prompts for the world bible’s characters.' },
  [AppWorkflowActivityType.Storyboard]: { code: 'SB', label: 'Illustrative Storyboard', hint: 'Segments chapters into audio-synced illustration frames.' },
  [AppWorkflowActivityType.Tts]: { code: 'TS', label: 'Text-to-Speech', hint: 'Renders chapters into narration audio.' },
};

/** Which activity kinds a library type's palette offers — only novel libraries have chapters/world-bible content today. */
export const ACTIVITY_TYPES_BY_LIBRARY: Record<AppLibraryType, AppWorkflowActivityType[]> = {
  [AppLibraryType.Novel]: Object.values(AppWorkflowActivityType),
  [AppLibraryType.Image]: [],
  [AppLibraryType.Video]: [],
};

export const LANGUAGE_LABEL: Record<ContentLanguage, string> = {
  [ContentLanguage.Vietnamese]: 'Vietnamese',
  [ContentLanguage.English]: 'English',
  [ContentLanguage.Chinese]: 'Chinese',
};

export const ART_STYLES = ['2D Chinese Guofeng', '3D Chinese Traditional', 'Real People — Ancient Chinese', 'Real People — Modern City'];
export const VOICES = ['Narrator — Male, Warm', 'Narrator — Female, Bright', 'Narrator — Male, Deep'];
export const PACES = ['0.85×', '1.0×', '1.2×'];

export const CHAPTER_SCOPE_LABEL: Record<ActivityChapterScope, string> = {
  [ActivityChapterScope.All]: 'All',
  [ActivityChapterScope.Missing]: 'Missing output',
  [ActivityChapterScope.Range]: 'Range',
  [ActivityChapterScope.Picked]: 'Pick chapters',
};

function defaultChapters(): ChapterSelection {
  return { scope: ActivityChapterScope.All, rangeFrom: 1, rangeTo: 1, pickedContentIds: [] };
}

export function defaultConfigFor(type: AppWorkflowActivityType): AppWorkflowActivityConfig {
  switch (type) {
    case AppWorkflowActivityType.Analyze:
      return { chapters: defaultChapters() };
    case AppWorkflowActivityType.Translate:
      return { chapters: defaultChapters(), language: ContentLanguage.Vietnamese };
    case AppWorkflowActivityType.Profiles:
      return { style: ART_STYLES[0] };
    case AppWorkflowActivityType.Storyboard:
      return { chapters: defaultChapters(), style: ART_STYLES[0] };
    case AppWorkflowActivityType.Tts:
      return { chapters: defaultChapters(), voice: VOICES[0], pace: PACES[1], language: ContentLanguage.Vietnamese };
  }
}

export function configOf(activity: AppWorkflowActivity): AppWorkflowActivityConfig {
  return (activity.analyzeConfig ?? activity.translateConfig ?? activity.profilesConfig ?? activity.storyboardConfig ?? activity.ttsConfig)!;
}

export interface ActivityConfigFields {
  analyzeConfig: AnalyzeConfig | null;
  translateConfig: TranslateConfig | null;
  profilesConfig: ProfilesConfig | null;
  storyboardConfig: StoryboardConfig | null;
  ttsConfig: TtsConfig | null;
}

/** Splits a type-specific config into the five mutually-exclusive fields `AppWorkflowActivity` stores it under — mirrors the main process's row mapping. */
export function buildConfigFields(type: AppWorkflowActivityType, config: AppWorkflowActivityConfig): ActivityConfigFields {
  return {
    analyzeConfig: type === AppWorkflowActivityType.Analyze ? (config as AnalyzeConfig) : null,
    translateConfig: type === AppWorkflowActivityType.Translate ? (config as TranslateConfig) : null,
    profilesConfig: type === AppWorkflowActivityType.Profiles ? (config as ProfilesConfig) : null,
    storyboardConfig: type === AppWorkflowActivityType.Storyboard ? (config as StoryboardConfig) : null,
    ttsConfig: type === AppWorkflowActivityType.Tts ? (config as TtsConfig) : null,
  };
}

export function withChapters(activity: AppWorkflowActivity, chapters: ChapterSelection): AppWorkflowActivityConfig {
  switch (activity.type) {
    case AppWorkflowActivityType.Analyze:
      return { chapters };
    case AppWorkflowActivityType.Translate:
      return { chapters, language: activity.translateConfig!.language };
    case AppWorkflowActivityType.Storyboard:
      return { chapters, style: activity.storyboardConfig!.style };
    case AppWorkflowActivityType.Tts:
      return { chapters, voice: activity.ttsConfig!.voice, pace: activity.ttsConfig!.pace, language: activity.ttsConfig!.language };
    case AppWorkflowActivityType.Profiles:
      return activity.profilesConfig!;
  }
}

export function withLanguage(activity: AppWorkflowActivity, language: ContentLanguage): AppWorkflowActivityConfig {
  if (activity.type === AppWorkflowActivityType.Translate) return { ...activity.translateConfig!, language };
  if (activity.type === AppWorkflowActivityType.Tts) return { ...activity.ttsConfig!, language };
  return configOf(activity);
}

export function withStyle(activity: AppWorkflowActivity, style: string): AppWorkflowActivityConfig {
  if (activity.type === AppWorkflowActivityType.Profiles) return { ...activity.profilesConfig!, style };
  if (activity.type === AppWorkflowActivityType.Storyboard) return { ...activity.storyboardConfig!, style };
  return configOf(activity);
}

export function withVoice(activity: AppWorkflowActivity, voice: string): AppWorkflowActivityConfig {
  return activity.type === AppWorkflowActivityType.Tts ? { ...activity.ttsConfig!, voice } : configOf(activity);
}

export function withPace(activity: AppWorkflowActivity, pace: string): AppWorkflowActivityConfig {
  return activity.type === AppWorkflowActivityType.Tts ? { ...activity.ttsConfig!, pace } : configOf(activity);
}

export function summaryFor(activity: AppWorkflowActivity): string {
  switch (activity.type) {
    case AppWorkflowActivityType.Analyze:
      return rangeSummary(activity.analyzeConfig!.chapters);
    case AppWorkflowActivityType.Translate:
      return `${rangeSummary(activity.translateConfig!.chapters)} → ${LANGUAGE_LABEL[activity.translateConfig!.language]}`;
    case AppWorkflowActivityType.Profiles:
      return activity.profilesConfig!.style;
    case AppWorkflowActivityType.Storyboard:
      return `${rangeSummary(activity.storyboardConfig!.chapters)} · ${activity.storyboardConfig!.style}`;
    case AppWorkflowActivityType.Tts:
      return `${rangeSummary(activity.ttsConfig!.chapters)} · ${activity.ttsConfig!.voice} · ${LANGUAGE_LABEL[activity.ttsConfig!.language]}`;
  }
}
