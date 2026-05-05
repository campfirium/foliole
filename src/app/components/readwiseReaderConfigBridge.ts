import type { ReadwiseReaderConfig } from '../../../lib/core/import/readwiseReaderSettings';
import {
  hasAppRuntimeCommandRepository,
  inspectReadwiseReaderSetupInRuntime,
  type RuntimeReadwiseDetectionResult
} from '../../shared/platform/appRuntimeCommandRepository';

export async function inspectReadwiseReaderSetup(input: {
  articleDirectoryPath: string;
  config: ReadwiseReaderConfig;
  fullDocumentDirectoryPath: string;
}): Promise<RuntimeReadwiseDetectionResult> {
  if (!hasAppRuntimeCommandRepository()) {
    return {
      checkedSourceCount: 0,
      detectedHighlightCount: 0,
      matchedHighlightCount: 0,
      message: 'Readwise detection is only available in the desktop app.',
      sampleCount: 0,
      samples: [],
      success: false
    };
  }

  const result = await inspectReadwiseReaderSetupInRuntime({
    articleDirectoryPath: input.articleDirectoryPath,
    fullDocumentDirectoryPath: input.fullDocumentDirectoryPath,
    highlightsHeading: input.config.highlightsHeading,
    highlightSeparator: input.config.highlightSeparator,
    newHighlightsHeading: input.config.newHighlightsHeading,
    noteKeyword: input.config.noteKeyword,
    tagKeyword: input.config.tagKeyword
  });
  return result ?? {
    checkedSourceCount: 0,
    detectedHighlightCount: 0,
    matchedHighlightCount: 0,
    message: 'Readwise detection is only available in the desktop app.',
    sampleCount: 0,
    samples: [],
    success: false
  };
}
