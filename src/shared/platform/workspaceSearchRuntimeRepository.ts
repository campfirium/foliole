import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import type { NativeWorkspaceSearchResult } from '../../../lib/platform/nativeContract';

import { getRuntimeInvoke } from './bridge';

export type RuntimeWorkspaceSearchResult = NativeWorkspaceSearchResult;

export function hasWorkspaceSearchRuntimeRepository() {
  return Boolean(getRuntimeInvoke());
}

export async function searchWorkspaceInRuntime(query: string): Promise<RuntimeWorkspaceSearchResult[]> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return [];
  }
  return runtimeInvoke(NATIVE_COMMANDS.searchWorkspace, { query });
}
