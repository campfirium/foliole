import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import type { NativeWorkspaceSearchResult } from '../../../lib/platform/nativeContract';

import { getElectronAPI } from './electronApi';
import { getRuntimeInvoke } from './runtimeInvoke';

export type RuntimeWorkspaceSearchResult = NativeWorkspaceSearchResult;
export type RuntimeWorkspaceSearchSnapshot = {
  aliasSpellings: Array<{ key: string; label: string }>;
  hasMore: boolean;
  results: RuntimeWorkspaceSearchResult[];
  revision: number;
  snapshotId: string;
};

export function hasWorkspaceSearchRuntimeRepository() {
  return Boolean(getRuntimeInvoke());
}

export async function searchWorkspaceInRuntime(query: string): Promise<RuntimeWorkspaceSearchSnapshot> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return { aliasSpellings: [], hasMore: false, results: [], revision: 0, snapshotId: '' };
  }
  return runtimeInvoke(NATIVE_COMMANDS.searchWorkspace, { query });
}

export async function loadWorkspaceSearchBatchInRuntime(snapshotId: string, offset: number, spelling: string | null = null) {
  return getRuntimeInvoke()?.(NATIVE_COMMANDS.loadWorkspaceSearchBatch, { offset, snapshotId, spelling })
    ?? { hasMore: false, results: [] };
}

export async function releaseWorkspaceSearchInRuntime(snapshotId: string) {
  if (snapshotId) await getRuntimeInvoke()?.(NATIVE_COMMANDS.releaseWorkspaceSearch, { snapshotId });
}

export function subscribeSearchAliasesChanged(handler: (revision: number) => void) {
  return getElectronAPI()?.onSearchAliasesChanged?.(handler) ?? (() => undefined);
}
