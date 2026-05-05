import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import type { NativeReadwiseDetectionResult } from '../../../lib/platform/nativeContract';

import { getRuntimeInvoke } from './runtimeInvoke';

export type RuntimeReadwiseDetectionResult = NativeReadwiseDetectionResult;

export function hasReadwiseReaderSetupRuntimeRepository() {
  return Boolean(getRuntimeInvoke());
}

export async function inspectReadwiseReaderSetupInRuntime(input: {
  articleDirectoryPath: string;
  fullDocumentDirectoryPath: string;
  highlightsHeading: string;
  highlightSeparator: string;
  newHighlightsHeading: string;
  noteKeyword: string;
  tagKeyword: string;
}): Promise<RuntimeReadwiseDetectionResult | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }
  return runtimeInvoke(NATIVE_COMMANDS.inspectReadwiseReaderSetup, input);
}
