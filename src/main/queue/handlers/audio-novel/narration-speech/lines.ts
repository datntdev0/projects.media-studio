/**
 * Where a paragraph is cut into utterances: after sentence-ending punctuation,
 * with any closing quote or bracket kept on the sentence it closes. An ellipsis
 * counts as an end too, since the pause is what the reader would give it.
 */
const SENTENCE_BREAK = /(?<=[.!?…][”’"')\]»]?)\s+/u;

/**
 * The lines `speech.py` reads for a chapter, one utterance per line: the title
 * first, then every sentence of every paragraph. A line is one cue of the .srt
 * and one clip of the .wav, so sentences rather than paragraphs keep the cues
 * short enough to follow along with.
 */
export function narrationLinesOf(title: string, body: string): string[] {
  const sentences = body
    .split(/\r?\n/)
    .flatMap((paragraph) => paragraph.split(SENTENCE_BREAK))
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence !== '');

  const heading = title.trim();
  return heading === '' ? sentences : [heading, ...sentences];
}
