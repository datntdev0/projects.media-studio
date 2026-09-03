import type { WorkspaceNarrationChapter } from '@/shared/app-workspace-narration';
import type { ChapterRailTag } from './translationFormat';

export function narrationRailTagOf(chapter: WorkspaceNarrationChapter): ChapterRailTag {
  if (chapter.narrated) return { label: 'Ready', tagClass: 'tag-accent', open: true, tip: chapter.title };
  if (chapter.ready) return { label: 'Pending', tagClass: 'tag-neutral', open: true, tip: chapter.title };
  return { label: 'Blocked', tagClass: 'tag-outline', open: false, tip: 'No text to read yet — the chapter has to be translated before speech can be generated.' };
}

/** The header's count line — narrated chapters over the novel, with how many have nothing to read yet. */
export function narrationCountLabelOf(chapters: WorkspaceNarrationChapter[]): string {
  const narrated = chapters.filter((chapter) => chapter.narrated).length;
  const blocked = chapters.filter((chapter) => !chapter.ready).length;
  if (chapters.length === 0) return 'This novel has no chapters stored yet';
  return blocked === 0 ? `${narrated} / ${chapters.length} narrated` : `${narrated} / ${chapters.length} narrated · ${blocked} blocked — not translated yet`;
}
