/**
 * Splits raw document text into retrieval-sized fragments for embedding.
 *
 * Paragraph-aware: keeps whole paragraphs together up to `targetChars`
 * rather than cutting mid-sentence, and carries a short overlap into the
 * next chunk so a fact split across a paragraph boundary is still findable
 * from either side. A paragraph longer than `targetChars` on its own is
 * hard-split — otherwise one wall-of-text paragraph would become one
 * enormous, poorly-matching chunk.
 */
export interface TextChunk {
  index: number;
  text: string;
}

export interface ChunkOptions {
  /** ~500-800 tokens at a rough 4 chars/token English/Russian mix. */
  targetChars?: number;
  overlapChars?: number;
}

function hardSplit(paragraph: string, targetChars: number): string[] {
  const parts: string[] = [];
  for (let start = 0; start < paragraph.length; start += targetChars) {
    parts.push(paragraph.slice(start, start + targetChars));
  }
  return parts;
}

export function chunkText(
  text: string,
  options: ChunkOptions = {},
): TextChunk[] {
  const targetChars = options.targetChars ?? 2400;
  const overlapChars = options.overlapChars ?? 200;

  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)
    .flatMap((paragraph) =>
      paragraph.length > targetChars
        ? hardSplit(paragraph, targetChars)
        : [paragraph],
    );

  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    const candidate =
      current.length > 0 ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length <= targetChars || current.length === 0) {
      current = candidate;
      continue;
    }
    chunks.push(current);
    const overlap = current.slice(-overlapChars).trimStart();
    current = overlap.length > 0 ? `${overlap}\n\n${paragraph}` : paragraph;
  }
  if (current.length > 0) chunks.push(current);

  return chunks.map((chunkedText, index) => ({ index, text: chunkedText }));
}
