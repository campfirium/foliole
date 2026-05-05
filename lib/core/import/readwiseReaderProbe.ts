import type { NativeReadwiseDetectionResult, NativeReadwiseDetectionSample } from '../../platform/nativeReadwiseContract.js';

import {
  extractReadwiseFullDocument,
  extractReadwiseSidecarHighlights,
  normalizeReadwiseText
} from './readwiseReaderParsing.js';

function createSample(sourceName: string, highlightText: string, fullDocument: string): NativeReadwiseDetectionSample {
  const normalizedHighlight = normalizeReadwiseText(highlightText);
  const normalizedDocument = normalizeReadwiseText(fullDocument);
  const matchIndex = normalizedHighlight ? normalizedDocument.indexOf(normalizedHighlight) : -1;
  const excerptStart = Math.max(0, matchIndex - 40);
  const excerptEnd = matchIndex >= 0 ? Math.min(normalizedDocument.length, matchIndex + normalizedHighlight.length + 40) : 0;

  return {
    excerpt: matchIndex >= 0 ? normalizedDocument.slice(excerptStart, excerptEnd) : '',
    highlightText: normalizedHighlight,
    matched: matchIndex >= 0,
    sourceName
  };
}

export function probeReadwiseArticleContent(input: {
  articleMarkdown: string;
  fullDocumentMarkdown: string;
  highlightsHeading: string;
  highlightSeparator: string;
  newHighlightsHeading: string;
  noteKeyword: string;
  sourceName: string;
  tagKeyword: string;
}): NativeReadwiseDetectionResult {
  const highlightBlocks = extractReadwiseSidecarHighlights(input.articleMarkdown, input).map((highlight) => highlight.text);
  const fullDocument = extractReadwiseFullDocument(input.fullDocumentMarkdown);
  const samples = highlightBlocks
    .map((block) => createSample(input.sourceName, block, fullDocument))
    .slice(0, 3);
  const matchedHighlightCount = samples.filter((sample) => sample.matched).length;

  if (samples.length === 0) {
    return {
      checkedSourceCount: 1,
      matchedHighlightCount: 0,
      message: 'No highlights were detected in the sampled article.',
      sampleCount: 0,
      samples: [],
      success: false
    };
  }

  return {
    checkedSourceCount: 1,
    matchedHighlightCount,
    message:
      matchedHighlightCount === samples.length
        ? 'Sampled highlights matched the full document.'
        : 'Some sampled highlights could not be matched back to the full document.',
    sampleCount: samples.length,
    samples,
    success: matchedHighlightCount === samples.length
  };
}
