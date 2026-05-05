import type { NativeReadwiseDetectionSample } from '../../platform/nativeReadwiseContract.js';

import type { PreparedImportHighlightRecord } from './contract.js';
import { extractImportedAnchorBlocks, stripImportedAnchorMarkup } from './importAnchorMarkup.js';

function selectPreviewHighlights<T>(items: T[]) {
  if (items.length <= 3) {
    return items;
  }
  return [items[0], items[1], items.at(-1)].filter((value): value is T => Boolean(value));
}

function collectAnchoredHighlightBlocks(content: string) {
  const anchorBlocks = extractImportedAnchorBlocks(content);
  const plainText = stripImportedAnchorMarkup(content);
  const rawToStrippedIndex: number[] = Array.from({ length: content.length + 1 }, () => 0);
  let rawCursor = 0;
  let strippedCursor = 0;

  for (const block of anchorBlocks) {
    while (rawCursor < block.openTagFrom) {
      rawToStrippedIndex[rawCursor] = strippedCursor;
      rawCursor += 1;
      strippedCursor += 1;
    }
    while (rawCursor < block.openTagTo) {
      rawToStrippedIndex[rawCursor] = strippedCursor;
      rawCursor += 1;
    }
    while (rawCursor < block.closeTagFrom) {
      rawToStrippedIndex[rawCursor] = strippedCursor;
      rawCursor += 1;
      strippedCursor += 1;
    }
    while (rawCursor < block.closeTagTo) {
      rawToStrippedIndex[rawCursor] = strippedCursor;
      rawCursor += 1;
    }
  }
  while (rawCursor < content.length) {
    rawToStrippedIndex[rawCursor] = strippedCursor;
    rawCursor += 1;
    strippedCursor += 1;
  }
  rawToStrippedIndex[content.length] = strippedCursor;

  const blocks = anchorBlocks
    .map((block) => ({
      from: rawToStrippedIndex[block.contentFrom] ?? 0,
      text: stripImportedAnchorMarkup(content.slice(block.contentFrom, block.contentTo)),
      to: rawToStrippedIndex[block.contentTo] ?? 0
    }))
    .filter((block) => block.text.trim().length > 0 && block.from < block.to);

  return {
    blocks,
    plainText
  };
}

export function buildImportedHighlightPreview(input: { content: string; sourceName: string }) {
  const { blocks, plainText } = collectAnchoredHighlightBlocks(input.content);
  if (blocks.length === 0) {
    return {
      detectedHighlightCount: 0,
      samples: [] as NativeReadwiseDetectionSample[]
    };
  }
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

export function buildImportedHighlightPreviewFromMatches(input: {
  content: string;
  matchedHighlights?: PreparedImportHighlightRecord[];
  sourceName: string;
}) {
  if ((input.matchedHighlights?.length ?? 0) > 0) {
    const samples: NativeReadwiseDetectionSample[] = selectPreviewHighlights(input.matchedHighlights ?? []).map((highlight) => ({
      excerpt: input.content.slice(0, 120),
      highlightText: highlight.content,
      matched: true,
      sourceName: input.sourceName
    }));
    return {
      detectedHighlightCount: input.matchedHighlights?.length ?? 0,
      samples
    };
  }
  return buildImportedHighlightPreview(input);
}
