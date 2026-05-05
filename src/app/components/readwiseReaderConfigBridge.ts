import type { ReadwiseReaderConfig } from '../../../lib/core/import/readwiseReaderSettings';
import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import type { NativeReadwiseDetectionResult } from '../../../lib/platform/nativeReadwiseContract';
import { getRuntimeInvoke } from '../../shared/platform/bridge';

export async function inspectReadwiseReaderSetup(input: {
  articleDirectoryPath: string;
  config: ReadwiseReaderConfig;
  fullDocumentDirectoryPath: string;
}): Promise<NativeReadwiseDetectionResult> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
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

  return runtimeInvoke(NATIVE_COMMANDS.inspectReadwiseReaderSetup, {
    articleDirectoryPath: input.articleDirectoryPath,
    fullDocumentDirectoryPath: input.fullDocumentDirectoryPath,
    highlightsHeading: input.config.highlightsHeading,
    highlightSeparator: input.config.highlightSeparator,
    newHighlightsHeading: input.config.newHighlightsHeading,
    noteKeyword: input.config.noteKeyword,
    tagKeyword: input.config.tagKeyword
  });
}
