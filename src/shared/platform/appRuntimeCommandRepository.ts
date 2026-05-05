import type { ImportManagerSettings } from '../../../lib/core/import/importManagerSettings';
import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import type {
  NativeReadwiseDetectionResult,
  NativeWorkspaceSearchResult
} from '../../../lib/platform/nativeContract';

import { getRuntimeInvoke } from './bridge';

export type RuntimeWorkspaceSearchResult = NativeWorkspaceSearchResult;
export type RuntimeReadwiseDetectionResult = NativeReadwiseDetectionResult;

export function hasAppRuntimeCommandRepository() {
  return Boolean(getRuntimeInvoke());
}

export async function searchWorkspaceInRuntime(query: string): Promise<RuntimeWorkspaceSearchResult[]> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return [];
  }
  return runtimeInvoke(NATIVE_COMMANDS.searchWorkspace, { query });
}

export async function loadImportManagerSettingsFromRuntime(): Promise<unknown | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }
  return runtimeInvoke(NATIVE_COMMANDS.loadImportManagerSettings);
}

export async function saveImportManagerSettingsToRuntime(settings: ImportManagerSettings): Promise<unknown | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }
  return runtimeInvoke(NATIVE_COMMANDS.saveImportManagerSettings, { settings });
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
