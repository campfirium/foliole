import type { NativeReadwiseDetectionSample } from '../../platform/nativeReadwiseContract.js';

interface ParsedHighlightBlock {
  anchorId: string;
  from: number;
  text: string;
  to: number;
}

function selectPreviewHighlights<T>(items: T[]) {
  if (items.length <= 3) {
    return items;
  }
  return [items[0], items[1], items.at(-1)].filter((value): value is T => Boolean(value));
}

function collectAnchoredHighlightBlocks(content: string) {
  const tokenPattern = /<(\/?)highlight\s+id="([1-9]\d*)"\s*>/g;
  const plainParts: string[] = [];
  const active = new Map<string, { start: number }>();
  const blocks: ParsedHighlightBlock[] = [];
  let plainIndex = 0;
  let lastIndex = 0;

  for (const match of content.matchAll(tokenPattern)) {
    const token = match[0];
    const tokenIndex = match.index ?? 0;
    const textChunk = content.slice(lastIndex, tokenIndex);
    if (textChunk) {
      plainParts.push(textChunk);
      plainIndex += textChunk.length;
    }
    lastIndex = tokenIndex + token.length;

    const slash = match[1] === '/';
    const anchorId = match[2] ?? '';
    if (!slash) {
      active.set(anchorId, { start: plainIndex });
      continue;
    }
    const opened = active.get(anchorId);
    if (!opened || plainIndex <= opened.start) {
      active.delete(anchorId);
      continue;
    }
    const plainText = plainParts.join('');
    blocks.push({
      anchorId,
      from: opened.start,
      text: plainText.slice(opened.start, plainIndex),
      to: plainIndex
    });
    active.delete(anchorId);
  }

  const trailingText = content.slice(lastIndex);
  if (trailingText) {
    plainParts.push(trailingText);
  }

  return {
    blocks,
    plainText: plainParts.join('')
  };
}

export function buildImportedHighlightPreview(input: { content: string; sourceName: string }) {
  const { blocks, plainText } = collectAnchoredHighlightBlocks(input.content);
  const samples: NativeReadwiseDetectionSample[] = selectPreviewHighlights(blocks).map((block) => ({
    excerpt: plainText.slice(Math.max(0, block.from - 40), Math.min(plainText.length, block.to + 40)),
    highlightText: block.text,
    matched: true,
    sourceName: input.sourceName
  }));

  return {
    detectedHighlightCount: blocks.length,
    samples
  };
}
