import { NATIVE_COMMANDS } from '../../../../lib/platform/nativeCommands';
import type { NativeReadwiseManualImportResult, NativeReadwiseManualSearchResult } from '../../../../lib/platform/nativeReadwiseManualImportContract';
import { getRuntimeInvoke } from '../runtimeInvoke';

export async function prepareReadwiseManualSearchInRuntime(): Promise<NativeReadwiseManualSearchResult> {
  const invoke = getRuntimeInvoke();
  return invoke ? invoke(NATIVE_COMMANDS.prepareReadwiseManualSearch) : { status: 'unavailable', sources: [] };
}

export async function searchReadwiseManualSourcesInRuntime(query: string): Promise<NativeReadwiseManualSearchResult> {
  const invoke = getRuntimeInvoke();
  return invoke ? invoke(NATIVE_COMMANDS.searchReadwiseManualSources, { query }) : { status: 'unavailable', sources: [] };
}

export async function importReadwiseManualSourceInRuntime(id: string, reimport: boolean): Promise<NativeReadwiseManualImportResult> {
  const invoke = getRuntimeInvoke();
  if (!invoke) throw new Error('readwise_search_unavailable');
  return invoke(NATIVE_COMMANDS.importReadwiseManualSource, { id, reimport });
}
