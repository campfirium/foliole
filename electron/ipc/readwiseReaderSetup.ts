import type { NativeReadwiseDetectionResult, NativeReadwiseDetectionSource } from '../../lib/platform/nativeReadwiseContract.js';

import { inspectReadwiseSources } from './readwiseReaderSetupScan.js';

function createEmptyResult(message: string): NativeReadwiseDetectionResult {
  return {
    checkedSourceCount: 0,
    detectedHighlightCount: 0,
    highlightOnlySourceCount: 0,
    highlightedArticleCount: 0,
    matchedHighlightCount: 0,
    message,
    sampleCount: 0,
    samples: [],
    success: false,
    totalArticleCount: 0,
    unparsedHighlightFileCount: 0
  };
}

function resolveLegacyReadwiseSource(input: {
  articleDirectoryPath: string;
  fullDocumentDirectoryPath: string;
}): NativeReadwiseDetectionSource | null {
  const articleDirectoryPath = input.articleDirectoryPath.trim();
  const fullDocumentDirectoryPath = input.fullDocumentDirectoryPath.trim();
  if (!articleDirectoryPath || !fullDocumentDirectoryPath) {
    return null;
  }
  return { articleDirectoryPath, fullDocumentDirectoryPath, label: 'Articles' };
}

function resolveReadwiseDetectionSources(input: {
  articleDirectoryPath: string;
  fullDocumentDirectoryPath: string;
  sources?: NativeReadwiseDetectionSource[];
}) {
  const legacySource = resolveLegacyReadwiseSource(input);
  const sources = input.sources?.length ? input.sources : legacySource ? [legacySource] : [];
  const resolvedSources = sources
    .map((source) => ({
      articleDirectoryPath: source.articleDirectoryPath.trim(),
      fullDocumentDirectoryPath: source.fullDocumentDirectoryPath.trim(),
      label: source.label.trim() || 'Source'
    }))
    .filter((source) => source.articleDirectoryPath && source.fullDocumentDirectoryPath);
  return resolvedSources.length ? resolvedSources : null;
}

export async function inspectReadwiseReaderSetup(input: {
  articleDirectoryPath: string;
  fullDocumentDirectoryPath: string;
  highlightsHeading: string;
  highlightSeparator: string;
  newHighlightsHeading: string;
  noteKeyword: string;
  sources?: NativeReadwiseDetectionSource[];
  tagKeyword: string;
}): Promise<NativeReadwiseDetectionResult> {
  const sources = resolveReadwiseDetectionSources(input);
  if (!sources) {
    return createEmptyResult('Choose the Readwise category folders before checking setup.');
  }

  try {
    return await inspectReadwiseSources({ ...input, sources });
  } catch {
    return createEmptyResult('The selected Readwise folders could not be read.');
  }
}
