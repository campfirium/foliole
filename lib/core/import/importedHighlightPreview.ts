import type { NativeReadwiseDetectionSample } from '../../platform/nativeReadwiseContract.js';

import type { PreparedImportHighlightRecord } from './contract.js';

function selectPreviewHighlights<T>(items: T[]) {
  if (items.length <= 3) {
    return items;
  }
  return [items[0], items[1], items.at(-1)].filter((value): value is T => Boolean(value));
}

export function buildImportedHighlightPreview(input: { content: string; sourceName: string }) {
  void input;
  return {
    detectedHighlightCount: 0,
    samples: [] as NativeReadwiseDetectionSample[]
  };
}

export function buildImportedHighlightPreviewFromMatches(input: {
  content: string;
  matchedHighlights?: PreparedImportHighlightRecord[];
  unmatchedHighlights?: PreparedImportHighlightRecord[];
  sourceName: string;
}) {
  const highlights = [
    ...(input.matchedHighlights ?? []).map((highlight) => ({ highlight, matched: true })),
    ...(input.unmatchedHighlights ?? []).map((highlight) => ({ highlight, matched: false }))
  ];
  if (highlights.length > 0) {
    const samples: NativeReadwiseDetectionSample[] = selectPreviewHighlights(highlights).map(({ highlight, matched }) => ({
      excerpt: matched ? input.content.slice(0, 120) : '',
      highlightText: highlight.content,
      matched,
      sourceName: input.sourceName
    }));
    return {
      detectedHighlightCount: highlights.length,
      samples
    };
  }
  return buildImportedHighlightPreview(input);
}
