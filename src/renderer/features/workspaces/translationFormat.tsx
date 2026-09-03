import type { WorkspaceTranslationChapter } from '@/shared/app-workspace-translation';

interface BilingualProps {
  /** The original, shown muted above the translation. */
  original: string;
  translated: string;
  size?: number;
}

/** A table cell of the translation tables: the original over its rendering. */
export function Bilingual({ original, translated, size = 13 }: BilingualProps) {
  return (
    <>
      <div className="text-muted" style={{ fontSize: size - 1 }}>{original || '—'}</div>
      <div style={{ fontSize: size }}>{translated || '—'}</div>
    </>
  );
}

/** How far the step has got with one chapter, as its rail row says it. */
export interface ChapterRailTag {
  label: string;
  tagClass: string;
  /** Whether the chapter can be opened — a chapter that was never extracted has nothing to show. */
  open: boolean;
  tip: string;
}

export function chapterRailTagOf(chapter: WorkspaceTranslationChapter): ChapterRailTag {
  if (chapter.translated) return { label: 'Translated', tagClass: 'tag-accent', open: true, tip: chapter.title };
  if (chapter.extracted) return { label: 'Pending', tagClass: 'tag-neutral', open: true, tip: chapter.title };
  return { label: 'Blocked', tagClass: 'tag-outline', open: false, tip: 'Not extracted yet — analysis must succeed for this chapter before translation.' };
}

/** The header's count line — translated chapters over the novel, with how many are blocked. */
export function translationCountLabelOf(chapters: WorkspaceTranslationChapter[]): string {
  const translated = chapters.filter((chapter) => chapter.translated).length;
  const blocked = chapters.filter((chapter) => !chapter.extracted).length;
  if (chapters.length === 0) return 'This novel has no chapters stored yet';
  return blocked === 0 ? `${translated} / ${chapters.length} translated` : `${translated} / ${chapters.length} translated · ${blocked} blocked — not extracted yet`;
}
