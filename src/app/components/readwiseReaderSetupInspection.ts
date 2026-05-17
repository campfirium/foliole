import type { ReadwiseReaderConfig } from '../../../lib/core/import/readwiseReaderSettings';
import type { NativeReadwiseDetectionSource } from '../../../lib/platform/nativeReadwiseContract';
import { definedProps } from '../../shared/lib/definedProps';
import {
  hasReadwiseReaderSetupRuntimeRepository,
  inspectReadwiseReaderSetupInRuntime,
  type RuntimeReadwiseDetectionResult
} from '../../shared/platform/appRuntimeCommandRepository';

export async function inspectReadwiseReaderSetup(input: {
  articleDirectoryPath: string;
  config: ReadwiseReaderConfig;
  fullDocumentDirectoryPath: string;
  sources?: NativeReadwiseDetectionSource[];
}): Promise<RuntimeReadwiseDetectionResult> {
  if (!hasReadwiseReaderSetupRuntimeRepository()) {
    return createUnavailableResult();
  }

  const result = await inspectReadwiseReaderSetupInRuntime({
    articleDirectoryPath: input.articleDirectoryPath,
    fullDocumentDirectoryPath: input.fullDocumentDirectoryPath,
    highlightsHeading: input.config.highlightsHeading,
    highlightSeparator: input.config.highlightSeparator,
    newHighlightsHeading: input.config.newHighlightsHeading,
    noteKeyword: input.config.noteKeyword,
    tagKeyword: input.config.tagKeyword,
    ...definedProps({ sources: input.sources })
  });
  return result ?? createUnavailableResult();
}

function createUnavailableResult(): RuntimeReadwiseDetectionResult {
  return {
    checkedSourceCount: 0,
    detectedHighlightCount: 0,
    highlightOnlySourceCount: 0,
    highlightedArticleCount: 0,
    matchedHighlightCount: 0,
    message: 'Readwise detection is only available in the desktop app.',
    sampleCount: 0,
    samples: [],
    success: false,
    totalArticleCount: 0,
    unparsedHighlightFileCount: 0
  };
}
